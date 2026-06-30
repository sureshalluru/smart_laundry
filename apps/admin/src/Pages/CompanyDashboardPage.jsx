import React, { useState, useEffect } from 'react';
import {
    Box, Heading, Text, Spinner, SimpleGrid, Stat, StatLabel, StatNumber,
    Table, Thead, Tbody, Tr, Th, Td, Input, HStack, FormControl, FormLabel,
    Button, Alert, AlertIcon,
} from '@chakra-ui/react';
import { useCompanyAuth } from '../Context/CompanyAuthContext';
import axios from 'axios';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

// Default date range: last 30 days
function getDefaultDates() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
    };
}

export default function CompanyDashboardPage() {
    const { companyToken } = useCompanyAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dates, setDates] = useState(getDefaultDates);

    const fetchDashboard = async () => {
        if (!companyToken) return;
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`${API_URL}/api/company/dashboard`, {
                headers: { Authorization: `Bearer ${companyToken}` },
                params: { start_date: dates.startDate, end_date: dates.endDate },
            });
            setData(response.data?.data || response.data);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboard();
    }, [companyToken]);

    const handleFilter = () => {
        fetchDashboard();
    };

    if (loading) {
        return (
            <Box textAlign="center" py={20}>
                <Spinner size="xl" thickness="4px" color="purple.500" />
                <Text mt={4} color="gray.500">Loading dashboard...</Text>
            </Box>
        );
    }

    if (error) {
        return (
            <Alert status="error" borderRadius="md">
                <AlertIcon />
                {error}
            </Alert>
        );
    }

    const totalRevenue = data?.totalRevenue || 0;
    const totalOrders = data?.totalOrders || 0;
    const locations = data?.locations || [];

    return (
        <Box>
            <Heading size="lg" mb={6} color="purple.700">Company Dashboard</Heading>

            {/* Date Range Filter */}
            <HStack spacing={4} mb={6} flexWrap="wrap">
                <FormControl w="auto">
                    <FormLabel fontSize="sm">Start Date</FormLabel>
                    <Input
                        type="date"
                        size="sm"
                        value={dates.startDate}
                        onChange={(e) => setDates(d => ({ ...d, startDate: e.target.value }))}
                    />
                </FormControl>
                <FormControl w="auto">
                    <FormLabel fontSize="sm">End Date</FormLabel>
                    <Input
                        type="date"
                        size="sm"
                        value={dates.endDate}
                        onChange={(e) => setDates(d => ({ ...d, endDate: e.target.value }))}
                    />
                </FormControl>
                <Button colorScheme="purple" size="sm" mt={6} onClick={handleFilter}>
                    Apply
                </Button>
            </HStack>

            {/* Summary Stats */}
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} mb={8}>
                <Stat p={4} bg="purple.50" borderRadius="lg">
                    <StatLabel>Total Revenue</StatLabel>
                    <StatNumber color="purple.700">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</StatNumber>
                </Stat>
                <Stat p={4} bg="blue.50" borderRadius="lg">
                    <StatLabel>Total Orders</StatLabel>
                    <StatNumber color="blue.700">{totalOrders.toLocaleString()}</StatNumber>
                </Stat>
                <Stat p={4} bg="green.50" borderRadius="lg">
                    <StatLabel>Locations</StatLabel>
                    <StatNumber color="green.700">{locations.length}</StatNumber>
                </Stat>
            </SimpleGrid>

            {/* Per-Location Breakdown */}
            <Heading size="md" mb={4}>Per-Location Revenue</Heading>
            <Box overflowX="auto">
                <Table variant="simple" size="sm">
                    <Thead>
                        <Tr>
                            <Th>Location</Th>
                            <Th isNumeric>Revenue</Th>
                            <Th isNumeric>Orders</Th>
                            <Th isNumeric>Active Orders</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        {locations.map((loc) => (
                            <Tr key={loc.laundryId}>
                                <Td>{loc.laundryName}</Td>
                                <Td isNumeric>${(loc.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Td>
                                <Td isNumeric>{loc.orderCount || 0}</Td>
                                <Td isNumeric>{loc.activeOrders || 0}</Td>
                            </Tr>
                        ))}
                        {locations.length === 0 && (
                            <Tr><Td colSpan={4} textAlign="center" color="gray.400">No locations found</Td></Tr>
                        )}
                    </Tbody>
                </Table>
            </Box>
        </Box>
    );
}
