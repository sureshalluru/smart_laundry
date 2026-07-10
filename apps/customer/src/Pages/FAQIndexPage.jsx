import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
    Box, Container, Heading, Text, VStack, Link,
    Skeleton, SkeletonText, Alert, AlertIcon
} from '@chakra-ui/react';
import axios from 'axios';
import { LaundryContext } from '../Components/Contexts/LaundryContext';
import FAQHead from '../Components/FAQ/FAQHead';
import TenantHeader from '../Components/FAQ/TenantHeader';
import { buildIndexFAQJsonLd } from '../utils/faqUtils';

const FAQIndexPage = () => {
    const { laundryId } = useParams();
    const { laundryData } = useContext(LaundryContext);
    const [faqData, setFaqData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const tenantName = laundryData?.laundryName || '';

    useEffect(() => {
        async function fetchFAQs() {
            try {
                const response = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/faq/${laundryId}`
                );
                setFaqData(response.data);
            } catch (err) {
                console.error('Error fetching FAQs:', err);
                setError('Unable to load FAQs. Please try again later.');
            } finally {
                setLoading(false);
            }
        }
        fetchFAQs();
    }, [laundryId]);

    // Build flat list of all FAQs for JSON-LD
    const allFaqs = faqData?.categories
        ? faqData.categories.flatMap(cat =>
            cat.faqs.map(faq => ({ question: faq.question, answer: faq.answer }))
        )
        : [];

    const metaDescription = tenantName
        ? `Frequently asked questions about ${tenantName}. Find answers about our services, pricing, hours, and more.`
        : 'Frequently asked questions about our laundry services.';

    if (loading) {
        return (
            <Container maxW="800px" py={10}>
                <Skeleton height="40px" mb={6} />
                <VStack spacing={6} align="stretch">
                    {[1, 2, 3].map(i => (
                        <Box key={i}>
                            <Skeleton height="24px" width="200px" mb={3} />
                            <SkeletonText noOfLines={4} spacing={3} />
                        </Box>
                    ))}
                </VStack>
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

    return (
        <>
        <TenantHeader />
        <Container maxW="800px" py={10}>
            <FAQHead
                title={`Frequently Asked Questions | ${tenantName}`}
                description={metaDescription}
                canonicalUrl={`/${laundryId}/faq`}
                jsonLd={allFaqs.length > 0 ? buildIndexFAQJsonLd(allFaqs) : null}
            />

            <Heading as="h1" size="xl" mb={8}>
                Frequently Asked Questions
            </Heading>

            {faqData?.categories?.length === 0 && (
                <Text color="gray.500">No FAQs available yet.</Text>
            )}

            <VStack spacing={8} align="stretch">
                {faqData?.categories?.map(category => (
                    <Box key={category.name}>
                        <Heading as="h2" size="md" mb={4} color="gray.700">
                            {category.name}
                        </Heading>
                        <VStack spacing={4} align="stretch" pl={2}>
                            {category.faqs.map(faq => (
                                <Box
                                    key={faq.slug}
                                    p={4}
                                    bg="gray.50"
                                    borderRadius="md"
                                    borderLeft="3px solid"
                                    borderLeftColor="blue.400"
                                >
                                    <Link
                                        as={RouterLink}
                                        to={`/${laundryId}/faq/${faq.slug}`}
                                        fontWeight="bold"
                                        fontSize="md"
                                        color="blue.700"
                                        _hover={{ textDecoration: 'underline' }}
                                        display="block"
                                        mb={2}
                                    >
                                        {faq.question}
                                    </Link>
                                    <Text fontSize="sm" color="gray.600" noOfLines={3}>
                                        {faq.answer}
                                    </Text>
                                </Box>
                            ))}
                        </VStack>
                    </Box>
                ))}
            </VStack>
        </Container>
        </>
    );
};

export default FAQIndexPage;
