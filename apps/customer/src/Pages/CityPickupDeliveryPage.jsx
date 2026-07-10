import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
    Box, Container, Heading, Text, HStack, Link, Button,
    Skeleton, SkeletonText, Alert, AlertIcon, Badge, SimpleGrid,
    List, ListItem, ListIcon, Divider
} from '@chakra-ui/react';
import { CheckCircleIcon, ArrowBackIcon } from '@chakra-ui/icons';
import axios from 'axios';
import FAQHead from '../Components/FAQ/FAQHead';
import TenantHeader from '../Components/FAQ/TenantHeader';

const CityPickupDeliveryPage = () => {
    const { laundryId, citySlug } = useParams();
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

            {/* Hero Section — inspired by SpinZone style */}
            <Box mb={8} textAlign="center">
                <Heading as="h1" size="xl" mb={4} color="blue.700" lineHeight="shorter">
                    Pick Up & Delivery Laundry Service in {pageData.city}, {pageData.state}
                </Heading>
                <Text fontSize="xl" color="gray.600" fontWeight="medium" mb={6}>
                    Remove the chore of laundry from your life!
                </Text>
                <Button
                    as={RouterLink}
                    to={`/${laundryId}/site`}
                    colorScheme="blue"
                    size="lg"
                    borderRadius="full"
                    px={10}
                    fontSize="lg"
                    boxShadow="md"
                >
                    Schedule A Free Pickup
                </Button>
            </Box>

            {/* Narrative How It Works — conversational tone like SpinZone */}
            <Box mb={10} bg="gray.50" p={{ base: 5, md: 8 }} borderRadius="xl">
                <Heading as="h2" size="md" mb={4} color="gray.800">
                    How It Works
                </Heading>
                <Text fontSize="md" color="gray.700" lineHeight="tall" mb={4}>
                    Clean clothes are now just a "Click" away with {pageData.laundryName}'s Wash & Fold 
                    Pick Up & Delivery Service in {pageData.city}! Don't have enough time to wash, dry, 
                    and fold that mountain of dirty laundry? We can make it disappear and reappear as 
                    fresh, clean, folded laundry.
                </Text>
                <Text fontSize="md" color="gray.700" lineHeight="tall" mb={4}>
                    To schedule a free laundry pick up, just click "Schedule A Pickup" above. Choose a 
                    pick up time that's convenient for you. Once scheduled, you'll receive a text letting 
                    you know when our driver is on the way. Have your laundry on the front porch or at 
                    the side-door ready for pick up.
                </Text>
                <Text fontSize="md" color="gray.700" lineHeight="tall">
                    Our attendants then work their cleaning magic with your laundry. Upon completion, 
                    your laundry will be fresh, clean, and neatly folded. The final step: we place your 
                    clean laundry back on the van for delivery right to your door. You'll be notified 
                    when the driver is en route. Getting your clothes clean has never been easier!
                </Text>
            </Box>

            {/* Key Details — bullet style like SpinZone */}
            <Box mb={10}>
                <Heading as="h2" size="md" mb={4} color="gray.800">
                    Pickup & Delivery Details
                </Heading>
                <List spacing={3} fontSize="md">
                    <ListItem>
                        <ListIcon as={CheckCircleIcon} color="green.500" />
                        <strong>Free pickup and delivery</strong> — No service charge or added delivery fee. It really is FREE.
                    </ListItem>
                    {pageData.washFoldPrice && (
                        <ListItem>
                            <ListIcon as={CheckCircleIcon} color="green.500" />
                            <strong>Pricing:</strong> {pageData.washFoldPrice} per pound. Some larger items like comforters have separate pricing.
                        </ListItem>
                    )}
                    {pageData.deliveryHours && (
                        <ListItem>
                            <ListIcon as={CheckCircleIcon} color="green.500" />
                            <strong>Pickup & delivery hours:</strong> {pageData.deliveryHours}
                        </ListItem>
                    )}
                    <ListItem>
                        <ListIcon as={CheckCircleIcon} color="green.500" />
                        You <strong>don't need to be home</strong> during pickups and drop-offs — just tell us where to leave your laundry.
                    </ListItem>
                    <ListItem>
                        <ListIcon as={CheckCircleIcon} color="green.500" />
                        Payments are processed through our <strong>safe, secure website</strong>.
                    </ListItem>
                    <ListItem>
                        <ListIcon as={CheckCircleIcon} color="green.500" />
                        <strong>24-hour turnaround</strong> available.
                    </ListItem>
                    <ListItem>
                        <ListIcon as={CheckCircleIcon} color="green.500" />
                        Have special care instructions? Use the <strong>special instructions</strong> field when scheduling to customize your service.
                    </ListItem>
                </List>
            </Box>

            {/* Service Area + Pricing Grid */}
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} mb={10}>
                {/* Pricing */}
                {pageData.pricing && pageData.pricing.length > 0 && (
                    <Box bg="blue.50" p={5} borderRadius="lg">
                        <Heading as="h3" size="sm" mb={3} color="blue.700">
                            Services & Pricing
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
                    <Heading as="h3" size="sm" mb={3} color="gray.700">
                        Now Servicing {pageData.city} & Surrounding Areas
                    </Heading>
                    <Text fontSize="sm" color="gray.600" mb={3}>
                        We serve the following zip codes in {pageData.city}, {pageData.state}:
                    </Text>
                    <HStack flexWrap="wrap" spacing={2}>
                        {pageData.zipCodes.map(zip => (
                            <Badge key={zip} colorScheme="blue" fontSize="sm" px={2} py={1} borderRadius="md">
                                {zip}
                            </Badge>
                        ))}
                    </HStack>
                    {pageData.phone && (
                        <Text mt={3} fontSize="sm" color="gray.600">
                            Questions? Call us: <Link href={`tel:${pageData.phone}`} color="blue.600" fontWeight="bold">{pageData.phone}</Link>
                        </Text>
                    )}
                </Box>
            </SimpleGrid>

            {/* Bottom CTA */}
            <Box textAlign="center" mb={8} py={6} bg="blue.50" borderRadius="xl">
                <Text fontSize="lg" fontWeight="bold" color="blue.700" mb={3}>
                    Ready to get started?
                </Text>
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
