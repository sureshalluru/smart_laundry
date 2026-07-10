/**
 * FAQ utility functions — pure helpers for slug generation, SEO meta,
 * and JSON-LD structured data generation.
 */

/**
 * Generate a URL-safe slug from a question string.
 * - Lowercase
 * - Only a-z, 0-9, and hyphens
 * - No leading/trailing hyphens
 * - No consecutive hyphens
 * - Non-empty (falls back to 'faq' if input produces empty slug)
 * - Deterministic
 */
export function generateSlug(question) {
    if (!question || typeof question !== 'string') {
        return 'faq';
    }

    const slug = question
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // remove anything not a-z, 0-9, space, or hyphen
        .replace(/[\s-]+/g, '-')       // collapse spaces and hyphens into single hyphen
        .replace(/^-+/, '')            // trim leading hyphens
        .replace(/-+$/, '');           // trim trailing hyphens

    return slug || 'faq';
}

/**
 * Build the page title for a single FAQ page.
 * Format: "{question} | {tenantName}"
 */
export function buildFAQPageTitle(question, tenantName) {
    return `${question} | ${tenantName}`;
}

/**
 * Build a meta description from the resolved answer.
 * Returns the first maxLen characters of the answer.
 */
export function buildMetaDescription(resolvedAnswer, maxLen = 155) {
    if (!resolvedAnswer || typeof resolvedAnswer !== 'string') {
        return '';
    }
    return resolvedAnswer.substring(0, maxLen);
}

/**
 * Build JSON-LD structured data for a single FAQ page.
 * Conforms to FAQPage schema with one Question in mainEntity.
 */
export function buildSingleFAQJsonLd(question, answer) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
            {
                '@type': 'Question',
                name: question,
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: answer,
                },
            },
        ],
    };
}

/**
 * Build JSON-LD structured data for the FAQ index page.
 * Aggregates all FAQs into a single FAQPage schema block.
 * @param {Array<{question: string, answer: string}>} faqs
 */
export function buildIndexFAQJsonLd(faqs) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(({ question, answer }) => ({
            '@type': 'Question',
            name: question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: answer,
            },
        })),
    };
}

/**
 * Build the canonical URL for a FAQ detail page.
 * Format: "/{laundryId}/faq/{slug}"
 */
export function buildCanonicalUrl(laundryId, slug) {
    return `/${laundryId}/faq/${slug}`;
}
