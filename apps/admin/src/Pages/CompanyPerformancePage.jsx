import React, { useState, useEffect } from 'react';
import {
    Box, Heading, Text, Spinner, Table, Thead, Tbody, Tr, Th, Td,
    Alert, AlertIcon, SimpleGrid, Stat, StatLabel, StatNumber, Badge,
} from '@chakra-ui/react';
import { useCompanyAuth } from '../Context/CompanyAuthContext';
import axios from 'axios';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export default function CompanyPerformancePage() {
    const { companyToken } = useCompanyAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPerformance = async () => {
            if (!companyToken) return;
            setLoading(true);
            setError(null);
            try {
                const response = await axios.get(`${API_URL}/api/company/reports/performance`, {
                    headers: { Authorization: `Bearer ${companyToken}` },
                });
                setData(response.data?.data || response.data);
            } catch (err) {
                setError(err.response?.data?.detail || err.message || 'Failed to load performance data');
            } finally {
                setLoading(false);
            }
        };
        fetchPerformance();
    }, [companyToken]);

    if (loading) {
        return (
            <Box textAlign="center" py={20}>
                <Spinner size="xl" thickness="4px" color="purple.500" />
                <Text mt={4} color="gray.500">Loading performance data...</Text>
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

    const locations = data?.locations || [];
    const topEmployees = data?.topEmployees || [];

    return (
        <Box>
            <Heading size="lg" mb={6} color="purple.700">Performance Comparison</Heading>

            {/* Per-Location Stats */}
            <Heading size="md" mb={4}>Location Stats</Heading>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={8}>
                {locations.map((loc) => (
                    <Box key={loc.laundryId} p={4} bg="gray.50" borderRadius="lg" border="1px solid" borderColor="gray.200">
                        <Text fontWeight="bold" mb={2}>{loc.laundryName}</Text>
                        <SimpleGrid columns={2} spacing={2}>
                            <Stat size="sm">
                                <StatLabel fontSize="xs">Avg Processing Time</StatLabel>
                                <StatNumber fontSize="sm">{loc.avgProcessingTime || 'N/A'}</StatNumber>
                            </Stat>
                            <Stat size="sm">
                                <StatLabel fontSize="xs">Employees</StatLabel>
                                <StatNumber fontSize="sm">{loc.employeeCount || 0}</StatNumber>
                            </Stat>
                        </SimpleGrid>
                    </Box>
                ))}
                {locations.length === 0 && (
                    <Text color="gray.400">No location data available</Text>
                )}
            </SimpleGrid>

            {/* Top Employees Ranking */}
            <Heading size="md" mb={4}>Top Employees (by Orders Completed)</Heading>
            <Box overflowX="auto">
                <Table variant="simple" size="sm">
                    <Thead>
                        <Tr>
                            <Th>Rank</Th>
                            <Th>Employee</Th>
                            <Th>Location</Th>
                            <Th isNumeric>Orders Completed</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        {topEmployees.map((emp, idx) => (
                            <Tr key={emp.employeeId || idx}>
                                <Td>
                                    {idx < 3 ? (
                                        <Badge colorScheme={idx === 0 ? 'yellow' : idx === 1 ? 'gray' : 'orange'}>
                                            #{idx + 1}
                                        </Badge>
                                    ) : (
                                        `#${idx + 1}`
                                    )}
                                </Td>
                                <Td>{emp.employeeName || emp.employeeId}</Td>
                                <Td>{emp.laundryName}</Td>
                                <Td isNumeric>{emp.ordersCompleted}</Td>
                            </Tr>
                        ))}
                        {topEmployees.length === 0 && (
                            <Tr><Td colSpan={4} textAlign="center" color="gray.400">No employee data available</Td></Tr>
                        )}
                    </Tbody>
                </Table>
            </Box>
        </Box>
    );
}
