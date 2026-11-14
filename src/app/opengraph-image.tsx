import { renderOgImage, OG_IMAGE_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';
import { SITE_TITLE } from '@/lib/seo';

export const alt = SITE_TITLE;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    headline: 'Business email, domains, and team access — in one place.',
    subline: 'Professional email on your own domain, simple DNS management, and secure access for your whole team.',
  });
}
