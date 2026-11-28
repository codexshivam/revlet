interface TransferEnv {
  WEBMAIL_URL: string;
  STALWART_URL: string;
  STALWART_ADMIN_USER?: string;
  STALWART_ADMIN_TOKEN?: string;
  REVLET_MAIL_TRANSFER_SECRET?: string;
  UPLOAD_TICKETS: R2Bucket;
}

function decode(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
}

async function verifyTicket(token: string, secret: string) {
  if (token.length > 4096 || !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(token)) return null;
  try {
    const [claims, signature] = token.split('.');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('HMAC', key, decode(signature), encoder.encode(claims)))) return null;
    const ticket = JSON.parse(new TextDecoder().decode(decode(claims)));
    if (!Number.isSafeInteger(ticket.expires) || ticket.expires < Date.now() ||
        typeof ticket.name !== 'string' || !/^[a-zA-Z0-9._:-]{1,256}$/.test(ticket.accountId) ||
        !/^[0-9a-f-]{36}$/i.test(ticket.nonce)) return null;
    return ticket;
  } catch {
    return null;
  }
}

export async function handleMailTransfer(request: Request, env: TransferEnv) {
  const origin = new URL(env.WEBMAIL_URL).origin;
  const senderOrigin = request.headers.get('Origin');
  const cors = senderOrigin === origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'PUT, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    Vary: 'Origin',
  } : {};
  const json = (data: object, status: number) => Response.json(data, {
    status, headers: { ...cors, 'Cache-Control': 'no-store' },
  });
  if (request.method === 'OPTIONS') {
    return senderOrigin === origin ? new Response(null, { status: 204, headers: cors }) : json({ ok: false }, 403);
  }
  const secret = env.REVLET_MAIL_TRANSFER_SECRET;
  if (!secret || !env.STALWART_ADMIN_USER || !env.STALWART_ADMIN_TOKEN) {
    return json({ ok: false, error: 'Mail transfer is unavailable.' }, 503);
  }

  const upload = request.method === 'PUT';
  if ((upload && senderOrigin !== origin) || (!upload && request.method !== 'GET')) {
    return json({ ok: false, error: 'Invalid mail transfer request.' }, 403);
  }
  const url = new URL(request.url);
  const token = upload
    ? request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || ''
    : url.searchParams.get('ticket') || '';
  const ticket = await verifyTicket(token, secret);
  if (!ticket || ticket.operation !== (upload ? 'upload' : 'download')) {
    return json({ ok: false, error: 'Mail transfer authorization expired or invalid.' }, 403);
  }
  const provider = new URL(env.STALWART_URL);
  if (provider.protocol !== 'https:') return json({ ok: false }, 503);
  const auth = `Basic ${btoa(`${env.STALWART_ADMIN_USER}:${env.STALWART_ADMIN_TOKEN}`)}`;
  const segment = (value: string) => encodeURIComponent(value);
  if (upload) {
    if (!request.body || !Number.isSafeInteger(ticket.size) || ticket.size < 0 || ticket.size > 15 * 1024 * 1024 ||
        !/^[a-z0-9][a-z0-9.+_-]*\/[a-z0-9][a-z0-9.+_-]*$/i.test(ticket.type)) {
      return json({ ok: false, error: 'Invalid attachment length or format.' }, 400);
    }
    try {
      const used = await env.UPLOAD_TICKETS.put(`used/${ticket.nonce}`, '', { onlyIf: { etagDoesNotMatch: '*' } });
      if (!used) return json({ ok: false, error: 'This upload authorization has already been used.' }, 409);
      const body = new FixedLengthStream(ticket.size);
      const written = request.body.pipeTo(body.writable);
      provider.pathname = `/jmap/upload/${segment(ticket.accountId)}/`;
      const [response] = await Promise.all([
        fetch(provider, {
          method: 'POST', body: body.readable, redirect: 'error',
          signal: AbortSignal.timeout(90000), headers: { Authorization: auth, 'Content-Type': ticket.type },
        }), written,
      ]);
      if (!response.ok) return json({ ok: false, error: 'The mail server rejected the attachment.' }, 502);
      const result = await response.json() as { blobId?: string; size?: number };
      if (typeof result.blobId !== 'string' || result.size !== ticket.size) {
        return json({ ok: false, error: 'The mail server did not confirm the attachment.' }, 502);
      }
      return json({ ok: true, attachment: { blobId: result.blobId, size: result.size, name: ticket.name, type: ticket.type } }, 200);
    } catch {
      return json({ ok: false, error: 'Upload interrupted. Please retry.' }, 502);
    }
  }

  if (!/^[a-zA-Z0-9._:-]{1,256}$/.test(ticket.blobId)) return json({ ok: false }, 400);
  provider.pathname = `/jmap/download/${segment(ticket.accountId)}/${segment(ticket.blobId)}/${segment(ticket.name)}`;
  const type = ticket.type === 'message/rfc822' ? ticket.type : 'application/octet-stream';
  provider.searchParams.set('accept', type);
  try {
    const response = await fetch(provider, { redirect: 'error', signal: AbortSignal.timeout(90000), headers: { Authorization: auth } });
    if (!response.ok || !response.body) return json({ ok: false, error: 'Attachment unavailable.' }, response.status === 404 ? 404 : 502);
    return new Response(response.body, {
      headers: {
        ...cors,
        'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Disposition': `attachment; filename*=UTF-8''${segment(ticket.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
      },
    });
  } catch {
    return json({ ok: false, error: 'Attachment unavailable.' }, 502);
  }
}
