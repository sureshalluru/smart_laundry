import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
    Box, Container, Heading, Text, HStack, Link, Button,
    Skeleton, SkeletonText, Alert, AlertIcon
} from '@chakra-ui/react';
import { ArrowBackIcon } from '@chakra-ui/icons';
import axios from 'axios';
import { LaundryContext } from '../Components/Contexts/LaundryContext';
import FAQHead from '../Components/FAQ/FAQHead';
import TenantHeader from '../Components/FAQ/TenantHeader';
import {
    buildFAQPageTitle,
    buildMetaDescription,
    buildCanonicalUrl,
    buildSingleFAQJsonLd,
} from '../utils/faqUtils';

const FAQDetailPage = () => {
    const { laundryId, slug } = useParams();
    const { laundryData } = useContext(LaundryContext);
    const [faq, setFaq] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [error, setError] = useState(null);

    const tenantName = laundryData?.laundryName || '';

    useEffect(() => {
        async function fetchFAQ() {
            try {
                const response = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/faq/${laundryId}/${slug}`
                );
                setFaq(response.data);
            } catch (err) {
                if (err.response && err.response.status === 404) {
                    setNotFound(true);
                } else {
                    console.error('Error fetching FAQ:', err);
                    setError('Unable to load this FAQ. Please try again later.');
                }
            } finally {
                setLoading(false);
            }
        }
        fetchFAQ();
    }, [laundryId, slug]);

    if (loading) {
        return (
            <Container maxW="800px" py={10}>
                <Skeleton height="20px" width="120px" mb={6} />
                <Skeleton height="36px" mb={4} />
                <SkeletonText noOfLines={6} spacing={3} />
            </Container>
        );
    }

    if (notFound) {
        return (
            <Container maxW="800px" py={10}>
                <Alert status="warning" borderRadius="md" mb={6}>
                    <AlertIcon />
                    FAQ not found
                </Alert>
                <Link as={RouterLink} to={`/${laundryId}/faq`} color="blue.600">
                    <ArrowBackIcon mr={1} /> Back to all FAQs
                </Link>
            </Container>
        );
    }

    if (error) {
        return (
            <Container maxW="800px" py={10}>
                <Alert status="error" borderRadius="md">
                    <AlertIcon />
                    {error}
                </Alert>
            </Container>
        );
    }

    const pageTitle = buildFAQPageTitle(faq.question, tenantName);
    const metaDescription = buildMetaDescription(faq.answer);
    const canonicalUrl = buildCanonicalUrl(laundryId, slug);
    const jsonLd = buildSingleFAQJsonLd(faq.question, faq.answer);

    return (
        <>
        <TenantHeader />
        <Container maxW="800px" py={10}>
            <FAQHead
                title={pageTitle}
                description={metaDescription}
                canonicalUrl={canonicalUrl}
                jsonLd={jsonLd}
            />

            {/* Back to index link */}
            <Link
                as={RouterLink}
                to={`/${laundryId}/faq`}
                color="blue.600"
                fontSize="sm"
                mb={6}
                display="inline-flex"
                alignItems="center"
                _hover={{ textDecoration: 'underline' }}
            >
                <ArrowBackIcon mr={1} /> All FAQs
            </Link>

            {/* Question heading */}
            <Heading as="h1" size="lg" mt={4} mb={6}>
                {faq.question}
            </Heading>

            {/* Answer body */}
            <Box
                fontSize="md"
                color="gray.700"
                lineHeight="tall"
                mb={8}
                whiteSpace="pre-wrap"
            >
                {faq.answer}
            </Box>

            {/* Navigation: adjacent FAQs */}
            {(faq.adjacentFaqs?.prev || faq.adjacentFaqs?.next) && (
                <HStack spacing={4} justify="space-between" mt={6} mb={6} flexWrap="wrap">
                    {faq.adjacentFaqs.prev ? (
                        <Link
                            as={RouterLink}
                            to={`/${laundryId}/faq/${faq.adjacentFaqs.prev.slug}`}
                            color="blue.600"
                            fontSize="sm"
                            _hover={{ textDecoration: 'underline' }}
                        >
                            ← {faq.adjacentFaqs.prev.question}
                        </Link>
                    ) : <Box />}
                    {faq.adjacentFaqs.next ? (
                        <Link
                            as={RouterLink}
                            to={`/${laundryId}/faq/${faq.adjacentFaqs.next.slug}`}
                            color="blue.600"
                            fontSize="sm"
                            textAlign="right"
                            _hover={{ textDecoration: 'underline' }}
                        >
                            {faq.adjacentFaqs.next.question} →
                        </Link>
                    ) : <Box />}
                </HStack>
            )}

            {/* CTA Section */}
            <Box mt={8} py={6} bg="blue.50" borderRadius="xl" textAlign="center">
                <Text fontSize="md" fontWeight="bold" color="blue.700" mb={2}>
                    Ready to get started with {tenantName}?
                </Text>
                <Text fontSize="sm" color="gray.600" mb={4}>
                    Free pickup and delivery — we handle the laundry so you don't have to.
                </Text>
                <Button
                    as={RouterLink}
                    to={`/${laundryId}/site`}
                    colorScheme="blue"
                    size="lg"
                    borderRadius="full"
                    px={8}
                >
                    Schedule Free Pickup
                </Button>
            </Box>

            {/* Internal cross-links for SEO */}
            <Box mt={6}>
                <HStack spacing={4} flexWrap="wrap" justify="center">
                    <Link as={RouterLink} to={`/${laundryId}/faq`} color="blue.600" fontSize="sm">
                        All FAQs
                    </Link>
                    <Text color="gray.300">|</Text>
                    <Link as={RouterLink} to={`/${laundryId}/site`} color="blue.600" fontSize="sm">
                        Home
                    </Link>
                </HStack>
            </Box>
        </Container>
        </>
    );
};

export default FAQDetailPage;
