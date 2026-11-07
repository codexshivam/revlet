import { ImageResponse } from 'next/og';

export const alt = 'Revlet | Enterprise IT Management & Cloud Infrastructure Control Plane';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 80px',
          fontFamily: 'sans-serif',
          color: '#FFFFFF',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            marginBottom: '30px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontWeight: 900,
              fontSize: '32px',
            }}
          >
            R
          </div>
          <span
            style={{
              fontSize: '54px',
              fontWeight: 900,
              letterSpacing: '0.12em',
              color: '#FFFFFF',
            }}
          >
            REVLET
          </span>
        </div>
        <div
          style={{
            fontSize: '36px',
            fontWeight: 800,
            textAlign: 'center',
            color: '#F8FAFC',
            lineHeight: 1.25,
            maxWidth: '1000px',
            marginBottom: '20px',
          }}
        >
          Enterprise IT Management &amp; Cloud Infrastructure Control Plane
        </div>
        <div
          style={{
            fontSize: '20px',
            color: '#94A3B8',
            textAlign: 'center',
            maxWidth: '850px',
            lineHeight: 1.4,
            marginBottom: '40px',
          }}
        >
          Unified orchestration for Cloudflare DNS, Custom Email Routing, and Google Workspace for Education.
        </div>
        <div
          style={{
            display: 'flex',
            gap: '16px',
          }}
        >
          {['Cloudflare API v4', 'Google Workspace SDK', 'SPF/DKIM/DMARC', 'Zero-Trust Tenancy'].map(
            (tag) => (
              <div
                key={tag}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '9999px',
                  padding: '8px 20px',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#E2E8F0',
                }}
              >
                {tag}
              </div>
            )
          )}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
