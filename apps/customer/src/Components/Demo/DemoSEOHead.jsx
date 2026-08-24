import React from 'react';
import { Helmet } from 'react-helmet-async';

const CANONICAL_PREFIX = 'https://smartlaundrybasket.ai';

/**
 * DemoSEOHead — renders per-view SEO meta tags for the interactive product demo.
 * Uses react-helmet-async to inject title, meta description, canonical URL,
 * Open Graph tags, Twitter Card tags, and JSON-LD SoftwareApplication schema.
 */
const DemoSEOHead = ({ title, description, path, viewName }) => {
  const canonicalUrl = `${CANONICAL_PREFIX}${path}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Smart Laundry Basket',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: description,
    featureList: viewName,
    url: canonicalUrl,
    offers: {
      '@type': 'Offer',
      price: '49',
      priceCurrency: 'USD',
      description: 'Free to self-host · $49/mo managed',
    },
  };

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content="website" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(jsonLd)}
      </script>
    </Helmet>
  );
};

export default DemoSEOHead;
