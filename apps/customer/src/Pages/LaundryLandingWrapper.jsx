import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Spinner, VStack, Text } from '@chakra-ui/react';
import axios from 'axios';
import SiteLandingPage from './SiteLandingPage';

/**
 * LaundryLandingWrapper — Fetches laundry config from API and renders
 * the multi-tenant landing page. Each laundry gets their own branded site.
 *
 * Route: /:laundryId/site
 */
export default function LaundryLandingWrapper() {
    const { laundryId } = useParams();
    const navigate = useNavigate();
    const [laundryConfig, setLaundryConfig] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchConfig() {
            try {
                // Get basic laundry info
                const infoRes = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/laundry/get-info`,
                    {
                        params: {
                            operation: 'getLaundryInfo',
                            laundryId,
                            isCustomer: true,
                        },
                    }
                );

                if (infoRes.data.status === 'success') {
                    setLaundryConfig({
                        laundryId,
                        laundryName: infoRes.data.laundryName,
                        laundryAddress: infoRes.data.laundryAddress,
                        laundryTimeZone: infoRes.data.laundryTimeZone,
                        services: infoRes.data.laundryServices || [],
                        deliveryTimeSlots: infoRes.data.deliveryTimeSlots || [],
                        bagPrice: infoRes.data.bagPrice || 30,
                        siteContent: infoRes.data.siteContent || {},
                    });
                    // Set browser title dynamically
                    document.title = `${infoRes.data.laundryName} - Free Pickup and Delivery`;
                } else {
                    navigate('/invalid');
                }
            } catch (err) {
                console.error('Error fetching laundry config:', err);
                navigate('/invalid');
            } finally {
                setLoading(false);
            }
        }
        fetchConfig();
    }, [laundryId, navigate]);

    if (loading) {
        return (
            <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" bg="#EBF8FF">
                <VStack spacing={3}>
                    <Spinner size="xl" color="blue.500" thickness="3px" />
                    <Text color="gray.500" fontSize="sm">Loading...</Text>
                </VStack>
            </Box>
        );
    }

    if (!laundryConfig) return null;

    return <SiteLandingPage laundryConfig={laundryConfig} />;
}
