import { renderOgImage, OG_IMAGE_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';
import { PAGE_SEO } from '@/lib/seo';

const page = PAGE_SEO.support;

export const alt = page.ogTitle;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({ eyebrow: page.ogEyebrow, headline: page.ogHeadline, subline: page.ogDescription });
}
