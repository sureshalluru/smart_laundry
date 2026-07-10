import React from 'react';
import { Helmet } from 'react-helmet-async';

/**
 * FAQHead — shared SEO head component for FAQ pages.
 * Renders <title>, meta description, canonical URL, and JSON-LD structured data.
 */
const FAQHead = ({ title, description, canonicalUrl, jsonLd }) => {
    return (
        <Helmet>
            {title && <title>{title}</title>}
            {description && <meta name="description" content={description} />}
            {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
            {jsonLd && (
                <script type="application/ld+json">
                    {JSON.stringify(jsonLd)}
                </script>
            )}
        </Helmet>
    );
};

export default FAQHead;
