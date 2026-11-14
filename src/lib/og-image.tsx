import { ImageResponse } from 'next/og';

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

interface OgImageOptions {
  eyebrow?: string;
  headline: string;
  subline: string;
}

const PILLARS = ['Business Email', 'DNS Management', 'Team Access'];

/**
 * Shared social preview card (Open Graph + X/Twitter) in Revlet's blue/black brand style.
 * Large, high-contrast headline so it stays legible as a small thumbnail in chats and feeds.
 */
export function renderOgImage({ eyebrow, headline, subline }: OgImageOptions) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(135deg, #020617 0%, #0B1B3F 55%, #1D4ED8 130%)',
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '40px', fontWeight: 800, letterSpacing: '-0.02em' }}>Revlet</span>
          {eyebrow ? (
            <span
              style={{
                fontSize: '22px',
                fontWeight: 600,
                color: '#BFDBFE',
                padding: '10px 22px',
                borderRadius: '9999px',
                border: '1px solid rgba(191, 219, 254, 0.35)',
              }}
            >
              {eyebrow}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '980px' }}>
          <div style={{ fontSize: '64px', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em' }}>
            {headline}
          </div>
          <div style={{ fontSize: '28px', lineHeight: 1.4, color: '#CBD5E1' }}>{subline}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '14px' }}>
            {PILLARS.map((pillar) => (
              <span
                key={pillar}
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: '#E2E8F0',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                }}
              >
                {pillar}
              </span>
            ))}
          </div>
          <span style={{ fontSize: '22px', color: '#93C5FD', fontWeight: 600 }}>app.revlet.me</span>
        </div>
      </div>
    ),
    { ...OG_IMAGE_SIZE }
  );
}
