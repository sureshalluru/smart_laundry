import React, { useState, useEffect } from 'react';
import {
    Box, VStack, Heading, Text, Table, Thead, Tbody, Tr, Th, Td, Badge, Spinner, Flex,
} from '@chakra-ui/react';
import axios from 'axios';

export default function ZipInterestPage({ laundryId }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const authToken = localStorage.getItem('idToken');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/admin/zip-interest`,
                    { params: { laundryId }, headers: { Authorization: `Bearer ${authToken}` } }
                );
                if (res.data.body?.status === 'success') {
                    setData(res.data.body.data);
                }
            } catch (err) {
                console.error('Error fetching zip interest:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [laundryId, authToken]);

    return (
        <Box p={4}>
            <Heading size="md" mb={4}>Zip Code Demand (Unserved Areas)</Heading>
            <Text fontSize="sm" color="gray.500" mb={4}>
                Customers who tried to schedule a pickup but were in an unserved area.
            </Text>

            {loading ? (
                <Flex justify="center" py={8}><Spinner size="xl" /></Flex>
            ) : data.length === 0 ? (
                <Text color="gray.400" textAlign="center" py={8}>No requests yet.</Text>
            ) : (
                <Box overflowX="auto">
                    <Table variant="simple" size="sm">
                        <Thead bg="gray.100">
                            <Tr>
                                <Th>Zip Code</Th>
                                <Th>Requests</Th>
                                <Th>Emails</Th>
                                <Th>Phones</Th>
                                <Th>First Request</Th>
                                <Th>Latest</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {data.map((row) => (
                                <Tr key={row.zipCode}>
                                    <Td fontWeight="bold">{row.zipCode || 'Unknown'}</Td>
                                    <Td>
                                        <Badge colorScheme={row.requestCount >= 3 ? 'red' : row.requestCount >= 2 ? 'orange' : 'gray'}>
                                            {row.requestCount}
                                        </Badge>
                                    </Td>
                                    <Td fontSize="xs">{row.emails.join(', ') || '—'}</Td>
                                    <Td fontSize="xs">{row.phones.join(', ') || '—'}</Td>
                                    <Td fontSize="xs">{new Date(row.firstRequest).toLocaleDateString()}</Td>
                                    <Td fontSize="xs">{new Date(row.latestRequest).toLocaleDateString()}</Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
                </Box>
            )}
        </Box>
    );
}
