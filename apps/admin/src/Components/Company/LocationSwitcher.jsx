import React, { useState, useEffect } from 'react';
import {
    Box, VStack, Text, Button, Spinner, Badge, HStack, Divider,
} from '@chakra-ui/react';
import { FiMapPin, FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useCompanyAuth } from '../../Context/CompanyAuthContext';
import axios from 'axios';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export default function LocationSwitcher() {
    const navigate = useNavigate();
    const { companyToken, companyUser } = useCompanyAuth();
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLocations = async () => {
            if (!companyToken) return;
            setLoading(true);
            try {
                const response = await axios.get(`${API_URL}/api/company/locations`, {
                    headers: { Authorization: `Bearer ${companyToken}` },
                });
                const data = response.data?.data?.locations || response.data?.locations || [];
                setLocations(data);
            } catch (err) {
                console.error('Failed to fetch locations:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchLocations();
    }, [companyToken]);

    const handleLocationClick = (laundryId) => {
        // Store company token as the active auth token so existing admin pages work
        const stored = localStorage.getItem('companyToken');
        if (stored) {
            const parsed = JSON.parse(stored);
            // Set the company token as the idToken so existing admin routes use it
            localStorage.setItem('auth', JSON.stringify({
                accessToken: parsed.accessToken,
                user: { laundryId: String(laundryId) },
            }));
            localStorage.setItem('idToken', parsed.accessToken);
            axios.defaults.headers.common['Authorization'] = `Bearer ${parsed.accessToken}`;
        }
        navigate(`/${laundryId}/admin`);
    };

    const handleBackToDashboard = () => {
        if (companyUser?.company_id) {
            navigate(`/company/${companyUser.company_id}/dashboard`);
        }
    };

    if (loading) {
        return (
            <Box p={4} textAlign="center">
                <Spinner size="sm" />
                <Text fontSize="xs" mt={2}>Loading locations...</Text>
            </Box>
        );
    }

    return (
        <Box>
            <Text fontSize="xs" fontWeight="bold" color="gray.500" px={4} mb={2} textTransform="uppercase">
                Locations
            </Text>
            <VStack spacing={1} align="stretch" px={2}>
                {locations.map((loc) => (
                    <Button
                        key={loc.laundryId}
                        variant="ghost"
                        justifyContent="flex-start"
                        size="sm"
                        w="full"
                        onClick={() => handleLocationClick(loc.laundryId)}
                        leftIcon={<FiMapPin />}
                        _hover={{ bg: 'purple.50' }}
                    >
                        <HStack flex={1} justify="space-between" w="full">
                            <Text fontSize="sm" isTruncated>{loc.laundryName}</Text>
                            {loc.activeOrders > 0 && (
                                <Badge colorScheme="green" fontSize="xs">{loc.activeOrders}</Badge>
                            )}
                        </HStack>
                    </Button>
                ))}
            </VStack>
            <Divider my={3} />
            <Box px={2}>
                <Button
                    variant="ghost"
                    size="sm"
                    w="full"
                    justifyContent="flex-start"
                    leftIcon={<FiArrowLeft />}
                    colorScheme="purple"
                    onClick={handleBackToDashboard}
                >
                    Back to Dashboard
                </Button>
            </Box>
        </Box>
    );
}
