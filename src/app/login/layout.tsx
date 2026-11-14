import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';
import { buildPageMetadata, PAGE_SEO, SITE_URL, MARKETING_URL } from '@/lib/seo';

const page = PAGE_SEO.login;

export const metadata: Metadata = buildPageMetadata({ ...page, indexable: true });

const loginPageLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${SITE_URL}${page.path}#webpage`,
      url: `${SITE_URL}${page.path}`,
      name: page.ogTitle,
      description: page.description,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: { '@id': `${SITE_URL}/#application` },
      breadcrumb: { '@id': `${SITE_URL}${page.path}#breadcrumb` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${SITE_URL}${page.path}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Revlet', item: MARKETING_URL },
        { '@type': 'ListItem', position: 2, name: 'Sign In', item: `${SITE_URL}${page.path}` },
      ],
    },
  ],
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={loginPageLd} />
      {children}
    </>
  );
}
