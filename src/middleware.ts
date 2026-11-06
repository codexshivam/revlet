import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Revlet Platform Edge Security Middleware
 * Blocks unauthorized environment, config, dotfile, and exploit probe requests.
 */

// Patterns of sensitive files and common malicious scanning probes
const BLOCKED_PATTERNS = [
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/\.svn/i,
  /^\/\.hg/i,
  /^\/\.aws/i,
  /^\/\.ssh/i,
  /^\/\.DS_Store/i,
  /\.(env|key|pem|crt|cer|p12|pfx|bak|config|conf|sql|sqlite|db|log|yml|yaml|ini|sh|bash)$/i,
  /(wp-admin|wp-login|xmlrpc|phpmyadmin|phpinfo|eval-stdin|solr|actuator|cgi-bin)/i,
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Prevent Directory Traversal attempts
  if (pathname.includes('..') || pathname.includes('%2e%2e')) {
    return new NextResponse('Access Denied: Malformed Path', { status: 400 });
  }

  // 2. Block access to sensitive configuration files and scanners
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(pathname)) {
      return new NextResponse('Forbidden: Access to configuration or system resources is strictly prohibited.', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
