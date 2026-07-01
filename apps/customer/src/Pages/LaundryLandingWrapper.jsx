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
                        laundryLogo: infoRes.data.laundryLogo || "",
                        laundryAddress: infoRes.data.laundryAddress,
                        laundryTimeZone: infoRes.data.laundryTimeZone,
                        services: infoRes.data.laundryServices || [],
                        serviceCategories: infoRes.data.serviceCategories || [],
                        deliveryTimeSlots: infoRes.data.deliveryTimeSlots || [],
                        bagPrice: infoRes.data.bagPrice || 30,
                        siteContent: infoRes.data.siteContent || {},
                    });
                    // Set browser title dynamically
                    document.title = `${infoRes.data.laundryName} - Free Pickup and Delivery`;
                    // Set dynamic favicon from laundry logo
                    if (infoRes.data.laundryLogo) {
                        const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
                        link.rel = 'icon';
                        const logo = infoRes.data.laundryLogo;
                        if (logo.startsWith('http')) { link.href = logo; }
                        else if (logo.startsWith('data:')) { link.href = logo; }
                        else { link.href = `data:image/png;base64,${logo}`; }
                        document.head.appendChild(link);
                    } else {
                        // Generate letter favicon from laundry name
                        const name = infoRes.data.laundryName || 'L';
                        const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                        const sc = infoRes.data.siteContent || {};
                        const colors = { blue: '#3182CE', green: '#38A169', purple: '#805AD5', teal: '#319795', orange: '#DD6B20', red: '#E53E3E', pink: '#D53F8C', cyan: '#00B5D8' };
                        const bgColor = colors[sc.themeColor] || colors.blue;
                        const canvas = document.createElement('canvas');
                        canvas.width = 64; canvas.height = 64;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = bgColor;
                        ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#FFFFFF';
                        ctx.font = `bold ${initials.length > 1 ? '24' : '32'}px -apple-system, sans-serif`;
                        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(initials, 32, 34);
                        const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
                        link.rel = 'icon';
                        link.href = canvas.toDataURL('image/png');
                        document.head.appendChild(link);
                    }
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
