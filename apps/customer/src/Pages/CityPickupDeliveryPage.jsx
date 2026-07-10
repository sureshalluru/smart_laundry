import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
    Box, Container, Heading, Text, VStack, HStack, Link, Button,
    Skeleton, SkeletonText, Alert, AlertIcon, Badge, SimpleGrid,
    List, ListItem, ListIcon, Divider
} from '@chakra-ui/react';
import { CheckCircleIcon, ArrowBackIcon } from '@chakra-ui/icons';
import axios from 'axios';
import { LaundryContext } from '../Components/Contexts/LaundryContext';
import FAQHead from '../Components/FAQ/FAQHead';
import TenantHeader from '../Components/FAQ/TenantHeader';

const CityPickupDeliveryPage = () => {
    const { laundryId, citySlug } = useParams();
    const { laundryData } = useContext(LaundryContext);
    const [pageData, setPageData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchCityPage() {
            try {
                const response = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/city-pages/${laundryId}/${citySlug}`
                );
                setPageData(response.data);
            } catch (err) {
                if (err.response && err.response.status === 404) {
                    setNotFound(true);
                } else {
                    setError('Unable to load this page. Please try again later.');
                }
            } finally {
                setLoading(false);
            }
        }
        fetchCityPage();
    }, [laundryId, citySlug]);

    if (loading) {
        return (
            <Container maxW="900px" py={10}>
                <Skeleton height="40px" mb={4} />
                <Skeleton height="24px" mb={6} width="70%" />
                <SkeletonText noOfLines={8} spacing={4} />
            </Container>
        );
    }

    if (notFound) {
        return (
            <Container maxW="900px" py={10}>
                <Alert status="warning" borderRadius="md" mb={6}>
                    <AlertIcon />
                    This service area page was not found.
                </Alert>
                <Link as={RouterLink} to={`/${laundryId}/site`} color="blue.600">
                    ← Back to home
                </Link>
            </Container>
        );
    }

    if (error) {
        return (
            <Container maxW="900px" py={10}>
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
        <Container maxW="900px" py={10}>
            <FAQHead
                title={pageData.pageTitle}
                description={pageData.metaDescription}
                canonicalUrl={`/${laundryId}/pickup-delivery/${citySlug}`}
                jsonLd={pageData.jsonLd}
            />

            {/* Hero Section */}
            <Box mb={8}>
                <Heading as="h1" size="xl" mb={3} color="blue.700">
                    {pageData.heroHeadline}
                </Heading>
                <Text fontSize="lg" color="gray.600" lineHeight="tall">
                    {pageData.heroSubtext}
                </Text>
            </Box>

            {/* CTA Button */}
            <Box mb={8}>
                <Button
                    as={RouterLink}
                    to={`/${laundryId}/site`}
                    colorScheme="blue"
                    size="lg"
                    borderRadius="full"
                    px={8}
                >
                    Schedule Free Pickup in {pageData.city}
                </Button>
            </Box>

            {/* Main Content */}
            <Box mb={8}>
                <Text fontSize="md" color="gray.700" lineHeight="tall" whiteSpace="pre-wrap">
                    {pageData.bodyContent}
                </Text>
            </Box>

            {/* Pricing & Service Area Grid */}
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} mb={8}>
                {/* Pricing */}
                {pageData.pricing && pageData.pricing.length > 0 && (
                    <Box bg="blue.50" p={5} borderRadius="lg">
                        <Heading as="h2" size="sm" mb={3} color="blue.700">
                            Our Services & Pricing
                        </Heading>
                        <List spacing={2}>
                            {pageData.pricing.map((item, idx) => (
                                <ListItem key={idx} fontSize="sm">
                                    <ListIcon as={CheckCircleIcon} color="green.500" />
                                    {item.service} — {item.price}
                                </ListItem>
                            ))}
                        </List>
                    </Box>
                )}

                {/* Service Area */}
                <Box bg="gray.50" p={5} borderRadius="lg">
                    <Heading as="h2" size="sm" mb={3} color="gray.700">
                        Zip Codes We Serve in {pageData.city}
                    </Heading>
                    <HStack flexWrap="wrap" spacing={2}>
                        {pageData.zipCodes.map(zip => (
                            <Badge key={zip} colorScheme="blue" fontSize="sm" px={2} py={1} borderRadius="md">
                                {zip}
                            </Badge>
                        ))}
                    </HStack>
                    {pageData.phone && (
                        <Text mt={3} fontSize="sm" color="gray.600">
                            Call us: <Link href={`tel:${pageData.phone}`} color="blue.600" fontWeight="bold">{pageData.phone}</Link>
                        </Text>
                    )}
                </Box>
            </SimpleGrid>

            {/* How It Works */}
            <Box mb={8}>
                <Heading as="h2" size="md" mb={4} color="gray.800">
                    How Pickup & Delivery Works in {pageData.city}
                </Heading>
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                    <Box textAlign="center" p={4}>
                        <Text fontSize="2xl" mb={2}>📅</Text>
                        <Text fontWeight="bold" fontSize="sm">1. Schedule Pickup</Text>
                        <Text fontSize="xs" color="gray.600">Choose a time that works for you</Text>
                    </Box>
                    <Box textAlign="center" p={4}>
                        <Text fontSize="2xl" mb={2}>👕</Text>
                        <Text fontWeight="bold" fontSize="sm">2. We Pick Up & Wash</Text>
                        <Text fontSize="xs" color="gray.600">Leave your bag out, we handle the rest</Text>
                    </Box>
                    <Box textAlign="center" p={4}>
                        <Text fontSize="2xl" mb={2}>✨</Text>
                        <Text fontWeight="bold" fontSize="sm">3. Fresh Delivery</Text>
                        <Text fontSize="xs" color="gray.600">Clean, folded laundry at your door</Text>
                    </Box>
                </SimpleGrid>
            </Box>

            <Divider mb={6} />

            {/* Navigation: Adjacent cities */}
            {(pageData.adjacentCities?.prev || pageData.adjacentCities?.next) && (
                <HStack spacing={4} justify="space-between" mb={6} flexWrap="wrap">
                    {pageData.adjacentCities.prev ? (
                        <Link
                            as={RouterLink}
                            to={`/${laundryId}/pickup-delivery/${pageData.adjacentCities.prev.slug}`}
                            color="blue.600"
                            fontSize="sm"
                        >
                            ← Pickup & Delivery in {pageData.adjacentCities.prev.city}
                        </Link>
                    ) : <Box />}
                    {pageData.adjacentCities.next ? (
                        <Link
                            as={RouterLink}
                            to={`/${laundryId}/pickup-delivery/${pageData.adjacentCities.next.slug}`}
                            color="blue.600"
                            fontSize="sm"
                            textAlign="right"
                        >
                            Pickup & Delivery in {pageData.adjacentCities.next.city} →
                        </Link>
                    ) : <Box />}
                </HStack>
            )}

            {/* Back link */}
            <Link as={RouterLink} to={`/${laundryId}/site`} color="gray.500" fontSize="sm">
                <ArrowBackIcon mr={1} /> Back to {pageData.laundryName}
            </Link>
        </Container>
        </>
    );
};

export default CityPickupDeliveryPage;
