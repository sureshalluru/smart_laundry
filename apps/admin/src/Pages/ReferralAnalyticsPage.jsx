import React, { useState, useEffect } from 'react';
import {
    Box, Container, Heading, Text, VStack, HStack, Button, Input,
    FormControl, FormLabel, Select, SimpleGrid, Card, CardBody,
    useToast, Spinner, Stat, StatLabel, StatNumber, StatHelpText,
    Table, Thead, Tbody, Tr, Th, Td, TableContainer, Badge, Flex,
    Divider
} from '@chakra-ui/react';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const ReferralAnalyticsPage = () => {
    const { laundryId } = useParams();
    const toast = useToast();
    const authToken = localStorage.getItem('accessToken') || localStorage.getItem('idToken');

    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState(null);
    const [events, setEvents] = useState([]);
    const [eventsLoading, setEventsLoading] = useState(false);

    // Filter state
    const [statusFilter, setStatusFilter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        fetchAnalytics();
        fetchEvents();
    }, [laundryId]);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/referrals/analytics`,
                {
                    params: { laundryId },
                    headers: { Authorization: `Bearer ${authToken}` }
                }
            );
            setAnalytics(res.data);
        } catch (err) {
            toast({
                title: 'Error loading analytics',
                description: err.message,
                status: 'error',
                duration: 3000,
            });
        } finally {
            setLoading(false);
        }
    };

    const fetchEvents = async () => {
        setEventsLoading(true);
        try {
            const params = { laundryId };
            if (statusFilter) params.status = statusFilter;
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;

            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/referrals/events`,
                {
                    params,
                    headers: { Authorization: `Bearer ${authToken}` }
                }
            );
            setEvents(res.data?.events || []);
        } catch (err) {
            toast({
                title: 'Error loading events',
                description: err.message,
                status: 'error',
                duration: 3000,
            });
        } finally {
            setEventsLoading(false);
        }
    };

    const handleApplyFilters = () => {
        fetchEvents();
    };

    const handleClearFilters = () => {
        setStatusFilter('');
        setStartDate('');
        setEndDate('');
        // Fetch with cleared filters after state update
        setTimeout(() => fetchEvents(), 0);
    };

    const getStatusBadge = (status) => {
        const colorMap = {
            signed_up: 'blue',
            first_order_completed: 'green',
            rewarded: 'purple',
        };
        return (
            <Badge colorScheme={colorMap[status] || 'gray'} textTransform="capitalize">
                {status?.replace(/_/g, ' ') || 'Unknown'}
            </Badge>
        );
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minH="300px">
                <Spinner size="xl" />
            </Box>
        );
    }

    return (
        <Container maxW="container.xl" py={6}>
            <VStack spacing={6} align="stretch">
                <Heading size="lg">Referral Analytics</Heading>
                <Text color="gray.600">
                    Track your referral program performance and individual referral events.
                </Text>

                {/* Stats Overview */}
                <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 5 }} spacing={4}>
                    <Card>
                        <CardBody>
                            <Stat>
                                <StatLabel>Total Referrals</StatLabel>
                                <StatNumber>{analytics?.total_referrals ?? 0}</StatNumber>
                                <StatHelpText>All time</StatHelpText>
                            </Stat>
                        </CardBody>
                    </Card>
                    <Card>
                        <CardBody>
                            <Stat>
                                <StatLabel>This Month</StatLabel>
                                <StatNumber>{analytics?.referrals_this_month ?? 0}</StatNumber>
                                <StatHelpText>Current month</StatHelpText>
                            </Stat>
                        </CardBody>
                    </Card>
                    <Card>
                        <CardBody>
                            <Stat>
                                <StatLabel>Conversion Rate</StatLabel>
                                <StatNumber>{analytics?.conversion_rate ?? 0}%</StatNumber>
                                <StatHelpText>Sign-ups → Orders</StatHelpText>
                            </Stat>
                        </CardBody>
                    </Card>
                    <Card>
                        <CardBody>
                            <Stat>
                                <StatLabel>Total Rewards</StatLabel>
                                <StatNumber>${analytics?.total_rewards_issued ?? '0.00'}</StatNumber>
                                <StatHelpText>Issued</StatHelpText>
                            </Stat>
                        </CardBody>
                    </Card>
                    <Card>
                        <CardBody>
                            <Stat>
                                <StatLabel>Active Referrers</StatLabel>
                                <StatNumber>{analytics?.active_referrers ?? 0}</StatNumber>
                                <StatHelpText>This month</StatHelpText>
                            </Stat>
                        </CardBody>
                    </Card>
                </SimpleGrid>

                {/* Top Referrers Table */}
                {analytics?.top_referrers && analytics.top_referrers.length > 0 && (
                    <Card>
                        <CardBody>
                            <Heading size="sm" mb={4}>Top Referrers</Heading>
                            <TableContainer>
                                <Table size="sm" variant="simple">
                                    <Thead>
                                        <Tr>
                                            <Th>Rank</Th>
                                            <Th>Name</Th>
                                            <Th isNumeric>Referrals</Th>
                                            <Th isNumeric>Conversions</Th>
                                        </Tr>
                                    </Thead>
                                    <Tbody>
                                        {analytics.top_referrers.map((referrer, idx) => (
                                            <Tr key={idx}>
                                                <Td>{idx + 1}</Td>
                                                <Td>{referrer.name || 'Anonymous'}</Td>
                                                <Td isNumeric>{referrer.referral_count ?? 0}</Td>
                                                <Td isNumeric>{referrer.conversion_count ?? 0}</Td>
                                            </Tr>
                                        ))}
                                    </Tbody>
                                </Table>
                            </TableContainer>
                        </CardBody>
                    </Card>
                )}

                <Divider />

                {/* Event Filters */}
                <Card>
                    <CardBody>
                        <Heading size="sm" mb={4}>Referral Events</Heading>
                        <Flex
                            direction={{ base: 'column', md: 'row' }}
                            gap={3}
                            align={{ base: 'stretch', md: 'flex-end' }}
                            mb={4}
                        >
                            <FormControl maxW={{ md: '200px' }}>
                                <FormLabel fontSize="sm">Status</FormLabel>
                                <Select
                                    placeholder="All statuses"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    size="sm"
                                >
                                    <option value="signed_up">Signed Up</option>
                                    <option value="first_order_completed">First Order Completed</option>
                                    <option value="rewarded">Rewarded</option>
                                </Select>
                            </FormControl>
                            <FormControl maxW={{ md: '200px' }}>
                                <FormLabel fontSize="sm">Start Date</FormLabel>
                                <Input
                                    type="date"
                                    size="sm"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </FormControl>
                            <FormControl maxW={{ md: '200px' }}>
                                <FormLabel fontSize="sm">End Date</FormLabel>
                                <Input
                                    type="date"
                                    size="sm"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </FormControl>
                            <HStack>
                                <Button size="sm" colorScheme="teal" onClick={handleApplyFilters}>
                                    Apply
                                </Button>
                                <Button size="sm" variant="outline" onClick={handleClearFilters}>
                                    Clear
                                </Button>
                            </HStack>
                        </Flex>

                        {/* Events Table */}
                        {eventsLoading ? (
                            <Box textAlign="center" py={4}>
                                <Spinner />
                            </Box>
                        ) : events.length === 0 ? (
                            <Text color="gray.500" textAlign="center" py={4}>
                                No referral events found.
                            </Text>
                        ) : (
                            <TableContainer>
                                <Table size="sm" variant="simple">
                                    <Thead>
                                        <Tr>
                                            <Th>Date</Th>
                                            <Th>Referrer</Th>
                                            <Th>Referee</Th>
                                            <Th>Status</Th>
                                            <Th isNumeric>Referrer Reward</Th>
                                            <Th isNumeric>Referee Reward</Th>
                                        </Tr>
                                    </Thead>
                                    <Tbody>
                                        {events.map((event, idx) => (
                                            <Tr key={event.id || idx}>
                                                <Td>{event.created_at ? new Date(event.created_at).toLocaleDateString() : '-'}</Td>
                                                <Td>{event.referrer_name || '-'}</Td>
                                                <Td>{event.referee_name || '-'}</Td>
                                                <Td>{getStatusBadge(event.status)}</Td>
                                                <Td isNumeric>
                                                    {event.referrer_rewarded ? `$${event.referrer_reward_amount || '0'}` : '-'}
                                                </Td>
                                                <Td isNumeric>
                                                    {event.referee_rewarded ? `$${event.referee_reward_amount || '0'}` : '-'}
                                                </Td>
                                            </Tr>
                                        ))}
                                    </Tbody>
                                </Table>
                            </TableContainer>
                        )}
                    </CardBody>
                </Card>
            </VStack>
        </Container>
    );
};

export default ReferralAnalyticsPage;
