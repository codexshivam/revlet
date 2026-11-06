import React from 'react';

type JsonLdProps = {
  data: Record<string, any>;
};

export function JsonLd({ data }: JsonLdProps) {
  // Sanitize '<' to prevent script breakout / XSS in serialized JSON
  const safeJson = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJson }}
    />
  );
}
