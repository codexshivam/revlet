import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';
import { buildPageMetadata, PAGE_SEO, SITE_URL, MARKETING_URL } from '@/lib/seo';
import { SUPPORT_FAQS } from '@/lib/support-faqs';

const page = PAGE_SEO.support;

export const metadata: Metadata = buildPageMetadata({ ...page, indexable: true });

const supportPageLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': ['WebPage', 'FAQPage'],
      '@id': `${SITE_URL}${page.path}#webpage`,
      url: `${SITE_URL}${page.path}`,
      name: page.ogTitle,
      description: page.description,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: { '@id': `${SITE_URL}/#application` },
      breadcrumb: { '@id': `${SITE_URL}${page.path}#breadcrumb` },
      mainEntity: SUPPORT_FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${SITE_URL}${page.path}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Revlet', item: MARKETING_URL },
        { '@type': 'ListItem', position: 2, name: 'Help & Support', item: `${SITE_URL}${page.path}` },
      ],
    },
  ],
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={supportPageLd} />
      {children}
    </>
  );
}
