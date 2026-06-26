import React, { useState, useEffect } from 'react';
import {
    Box, Container, Heading, Text, VStack, HStack, Button, Input, Textarea,
    FormControl, FormLabel, Switch, Select, SimpleGrid, Badge, Divider,
    useToast, Spinner, Flex, Stat, StatLabel, StatNumber, StatHelpText, Card, CardBody,
    Tabs, TabList, Tab, TabPanels, TabPanel
} from '@chakra-ui/react';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const EngagementPage = () => {
    const { laundryId } = useParams();
    const toast = useToast();
    const authToken = localStorage.getItem('idToken');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [stats, setStats] = useState(null);
    const [selectedBucket, setSelectedBucket] = useState(null); // 'abandoned' | 'dormant' | 'winback' | 'active'
    const [bucketCustomers, setBucketCustomers] = useState([]);
    const [loadingCustomers, setLoadingCustomers] = useState(false);
    const [sendingNotifyId, setSendingNotifyId] = useState(null);
    const [customerSearch, setCustomerSearch] = useState('');

    const [config, setConfig] = useState({
        isActive: true,
        abandonedEnabled: true,
        abandonedPromoCode: '',
        abandonedMessage: 'Hi {name}! You started scheduling your laundry with {laundry}. Complete your first order and get {promo}! 🧺',
        dormantEnabled: true,
        dormantPromoCode: '',
        dormantMessage: 'Hi {name}, we miss you at {laundry}! Come back and enjoy {promo} on your next order. 👋',
        winbackEnabled: true,
        winbackPromoCode: '',
        winbackMessage: "Hi {name}! It's been a while. {laundry} has a special deal for you: {promo}. We'd love to see you again! 🎉",
        holidayEnabled: true,
        holidayPromoCode: '',
        holidayMessage: 'Happy Holidays from {laundry}! 🎄 Treat yourself to clean laundry with {promo}. Limited time!',
        weeklyReminderWeeks: 4,
        monthlyReminderMonths: 6,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [configRes, statsRes] = await Promise.all([
                    axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/engagement/config`, {
                        params: { laundryId },
                        headers: { Authorization: `Bearer ${authToken}` }
                    }),
                    axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/engagement/stats`, {
                        params: { laundryId },
                        headers: { Authorization: `Bearer ${authToken}` }
                    })
                ]);

                const cfg = configRes.data?.body?.config;
                if (cfg) {
                    setConfig({
                        isActive: cfg.is_active ?? true,
                        abandonedEnabled: cfg.abandoned_enabled ?? true,
                        abandonedPromoCode: cfg.abandoned_promo_code || '',
                        abandonedMessage: cfg.abandoned_message || config.abandonedMessage,
                        dormantEnabled: cfg.dormant_enabled ?? true,
                        dormantPromoCode: cfg.dormant_promo_code || '',
                        dormantMessage: cfg.dormant_message || config.dormantMessage,
                        winbackEnabled: cfg.winback_enabled ?? true,
                        winbackPromoCode: cfg.winback_promo_code || '',
                        winbackMessage: cfg.winback_message || config.winbackMessage,
                        holidayEnabled: cfg.holiday_enabled ?? true,
                        holidayPromoCode: cfg.holiday_promo_code || '',
                        holidayMessage: cfg.holiday_message || config.holidayMessage,
                        weeklyReminderWeeks: cfg.weekly_reminder_weeks || 4,
                        monthlyReminderMonths: cfg.monthly_reminder_months || 6,
                    });
                }

                setStats(statsRes.data?.body?.stats);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [laundryId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.put(`${process.env.REACT_APP_AWS_API_URL}/api/engagement/config`, {
                laundryId, ...config
            }, { headers: { Authorization: `Bearer ${authToken}` } });
            toast({ title: 'Engagement config saved!', status: 'success', duration: 3000 });
        } catch (err) {
            toast({ title: 'Error saving', description: err.message, status: 'error', duration: 3000 });
        } finally {
            setSaving(false);
        }
    };

    const handleBucketClick = async (bucket) => {
        if (selectedBucket === bucket) { setSelectedBucket(null); setBucketCustomers([]); return; }
        setSelectedBucket(bucket);
        setLoadingCustomers(true);
        try {
            const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/engagement/customers`, {
                params: { laundryId, bucket },
                headers: { Authorization: `Bearer ${authToken}` }
            });
            setBucketCustomers(res.data?.body?.customers || []);
        } catch (err) {
            setBucketCustomers([]);
            toast({ title: 'Error loading customers', status: 'error', duration: 3000 });
        } finally {
            setLoadingCustomers(false);
        }
    };

    const handleNotifyCustomer = async (customerId, phone) => {
        if (!selectedBucket) return;
        setSendingNotifyId(customerId);
        try {
            await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/engagement/notify`, {
                laundryId, customerId, bucket: selectedBucket
            }, { headers: { Authorization: `Bearer ${authToken}` } });
            toast({ title: 'Reminder sent!', status: 'success', duration: 2000 });
            // Update the customer in the list to show they were just notified
            setBucketCustomers(prev => prev.map(c =>
                c.customerId === customerId
                    ? { ...c, lastNotified: new Date().toISOString().slice(0, 16).replace('T', ' '), timesNotified: (c.timesNotified || 0) + 1 }
                    : c
            ));
        } catch (err) {
            toast({ title: 'Failed to send', description: err.response?.data?.body?.message || err.message, status: 'error', duration: 3000 });
        } finally {
            setSendingNotifyId(null);
        }
    };

    if (loading) return <Flex justify="center" p={10}><Spinner size="xl" /></Flex>;

    return (
        <Container maxW="container.lg" py={6}>
            <VStack spacing={6} align="stretch">
                <Box>
                    <Heading size="lg" color="blue.700">Customer Engagement</Heading>
                    <Text color="gray.600" mt={1}>Automated reminders to bring customers back and grow revenue</Text>
                </Box>

                {/* Stats Overview — clickable to show customers */}
                {stats && (
                    <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                        <Card cursor="pointer" onClick={() => handleBucketClick('active')} border={selectedBucket === 'active' ? '2px solid' : 'none'} borderColor="green.400" _hover={{ shadow: 'md' }}><CardBody textAlign="center">
                            <Stat><StatLabel>Active (30d)</StatLabel><StatNumber color="green.500">{stats.active}</StatNumber><StatHelpText>Ordered recently</StatHelpText></Stat>
                        </CardBody></Card>
                        <Card cursor="pointer" onClick={() => handleBucketClick('abandoned')} border={selectedBucket === 'abandoned' ? '2px solid' : 'none'} borderColor="orange.400" _hover={{ shadow: 'md' }}><CardBody textAlign="center">
                            <Stat><StatLabel>Abandoned</StatLabel><StatNumber color="orange.500">{stats.abandoned}</StatNumber><StatHelpText>Never ordered</StatHelpText></Stat>
                        </CardBody></Card>
                        <Card cursor="pointer" onClick={() => handleBucketClick('dormant')} border={selectedBucket === 'dormant' ? '2px solid' : 'none'} borderColor="yellow.400" _hover={{ shadow: 'md' }}><CardBody textAlign="center">
                            <Stat><StatLabel>Dormant</StatLabel><StatNumber color="yellow.600">{stats.dormant}</StatNumber><StatHelpText>30-90 days inactive</StatHelpText></Stat>
                        </CardBody></Card>
                        <Card cursor="pointer" onClick={() => handleBucketClick('winback')} border={selectedBucket === 'winback' ? '2px solid' : 'none'} borderColor="red.400" _hover={{ shadow: 'md' }}><CardBody textAlign="center">
                            <Stat><StatLabel>Win-back</StatLabel><StatNumber color="red.500">{stats.winback}</StatNumber><StatHelpText>90+ days inactive</StatHelpText></Stat>
                        </CardBody></Card>
                    </SimpleGrid>
                )}

                {/* Customer list for selected bucket */}
                {selectedBucket && (
                    <Box bg="white" borderRadius="md" boxShadow="sm" p={4} border="1px solid" borderColor="gray.200">
                        <HStack justify="space-between" mb={3}>
                            <Text fontWeight="bold" fontSize="md" color="gray.700">
                                {selectedBucket === 'active' ? 'Active' : selectedBucket === 'abandoned' ? 'Abandoned' : selectedBucket === 'dormant' ? 'Dormant' : 'Win-back'} Customers
                            </Text>
                            <Badge colorScheme="blue">{bucketCustomers.length} shown</Badge>
                        </HStack>
                        <Input
                            placeholder="Search by name or phone..."
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            size="sm" mb={3} borderRadius="md"
                        />
                        {loadingCustomers ? (
                            <Flex justify="center" py={6}><Spinner /></Flex>
                        ) : bucketCustomers.length === 0 ? (
                            <Text color="gray.500" textAlign="center" py={4}>No customers in this bucket</Text>
                        ) : (
                            <VStack spacing={2} align="stretch" maxH="400px" overflowY="auto">
                                {bucketCustomers
                                    .filter(cust => {
                                        if (!customerSearch) return true;
                                        const q = customerSearch.toLowerCase();
                                        return (cust.name || '').toLowerCase().includes(q) || (cust.phone || '').includes(q);
                                    })
                                    .map((cust, idx) => (
                                    <HStack key={cust.customerId || idx} p={3} bg="gray.50" borderRadius="md" justify="space-between" flexWrap="wrap">
                                        <Box flex="1" minW="200px">
                                            <Text fontWeight="600" fontSize="sm">{cust.name}</Text>
                                            <Text fontSize="xs" color="gray.500">{cust.phone}</Text>
                                        </Box>
                                        <Box minW="140px">
                                            {cust.lastOrderDate && <Text fontSize="xs" color="gray.600">Last order: {cust.lastOrderDate}</Text>}
                                            {cust.registeredDate && <Text fontSize="xs" color="gray.600">Registered: {cust.registeredDate}</Text>}
                                            {cust.totalOrders && <Text fontSize="xs" color="green.600">Orders (30d): {cust.totalOrders}</Text>}
                                        </Box>
                                        <Box minW="160px" textAlign="right">
                                            {cust.lastNotified ? (
                                                <Text fontSize="xs" color="blue.600">Notified: {cust.lastNotified}</Text>
                                            ) : (
                                                <Text fontSize="xs" color="orange.500">Not yet notified</Text>
                                            )}
                                            {cust.timesNotified > 0 && (
                                                <Text fontSize="xs" color="gray.400">{cust.timesNotified} reminder{cust.timesNotified > 1 ? 's' : ''} sent</Text>
                                            )}
                                        </Box>
                                        {selectedBucket && (
                                            <Button size="xs" colorScheme="blue" variant="outline" ml={2}
                                                onClick={() => handleNotifyCustomer(cust.customerId, cust.phone)}
                                                isLoading={sendingNotifyId === cust.customerId}
                                            >
                                                Notify
                                            </Button>
                                        )}
                                    </HStack>
                                ))}
                            </VStack>
                        )}
                    </Box>
                )}

                {/* Master Toggle */}
                <HStack justify="space-between" bg="white" p={4} borderRadius="md" boxShadow="sm">
                    <Text fontWeight="bold">Enable Automated Engagement</Text>
                    <Switch isChecked={config.isActive} onChange={e => setConfig(p => ({ ...p, isActive: e.target.checked }))} colorScheme="green" size="lg" />
                </HStack>

                <Divider />

                <Tabs colorScheme="blue" variant="enclosed">
                    <TabList>
                        <Tab>🆕 Abandoned</Tab>
                        <Tab>😴 Dormant</Tab>
                        <Tab>👋 Win-back</Tab>
                        <Tab>🎄 Holidays</Tab>
                        <Tab>⚙️ Schedule</Tab>
                    </TabList>
                    <TabPanels>
                        {/* Abandoned */}
                        <TabPanel>
                            <VStack spacing={4} align="stretch">
                                <HStack justify="space-between">
                                    <Box><Text fontWeight="bold">Abandoned Journey Reminders</Text>
                                    <Text fontSize="sm" color="gray.500">For customers who registered but never placed an order</Text></Box>
                                    <Switch isChecked={config.abandonedEnabled} onChange={e => setConfig(p => ({ ...p, abandonedEnabled: e.target.checked }))} />
                                </HStack>
                                <FormControl><FormLabel>Promo Code (optional)</FormLabel>
                                    <Input placeholder="e.g. FIRST10" value={config.abandonedPromoCode} onChange={e => setConfig(p => ({ ...p, abandonedPromoCode: e.target.value }))} />
                                </FormControl>
                                <FormControl><FormLabel>Message Template</FormLabel>
                                    <Textarea value={config.abandonedMessage} onChange={e => setConfig(p => ({ ...p, abandonedMessage: e.target.value }))} rows={3} />
                                    <Text fontSize="xs" color="gray.400" mt={1}>Variables: {'{name}'}, {'{laundry}'}, {'{promo}'}</Text>
                                </FormControl>
                            </VStack>
                        </TabPanel>

                        {/* Dormant */}
                        <TabPanel>
                            <VStack spacing={4} align="stretch">
                                <HStack justify="space-between">
                                    <Box><Text fontWeight="bold">Dormant Customer Reminders</Text>
                                    <Text fontSize="sm" color="gray.500">For customers inactive for 30-90 days</Text></Box>
                                    <Switch isChecked={config.dormantEnabled} onChange={e => setConfig(p => ({ ...p, dormantEnabled: e.target.checked }))} />
                                </HStack>
                                <FormControl><FormLabel>Promo Code (optional)</FormLabel>
                                    <Input placeholder="e.g. COMEBACK15" value={config.dormantPromoCode} onChange={e => setConfig(p => ({ ...p, dormantPromoCode: e.target.value }))} />
                                </FormControl>
                                <FormControl><FormLabel>Message Template</FormLabel>
                                    <Textarea value={config.dormantMessage} onChange={e => setConfig(p => ({ ...p, dormantMessage: e.target.value }))} rows={3} />
                                    <Text fontSize="xs" color="gray.400" mt={1}>Variables: {'{name}'}, {'{laundry}'}, {'{promo}'}</Text>
                                </FormControl>
                            </VStack>
                        </TabPanel>

                        {/* Win-back */}
                        <TabPanel>
                            <VStack spacing={4} align="stretch">
                                <HStack justify="space-between">
                                    <Box><Text fontWeight="bold">Win-back Reminders</Text>
                                    <Text fontSize="sm" color="gray.500">For customers inactive 90+ days — sent every 60 days</Text></Box>
                                    <Switch isChecked={config.winbackEnabled} onChange={e => setConfig(p => ({ ...p, winbackEnabled: e.target.checked }))} />
                                </HStack>
                                <FormControl><FormLabel>Promo Code (optional)</FormLabel>
                                    <Input placeholder="e.g. MISSYOU20" value={config.winbackPromoCode} onChange={e => setConfig(p => ({ ...p, winbackPromoCode: e.target.value }))} />
                                </FormControl>
                                <FormControl><FormLabel>Message Template</FormLabel>
                                    <Textarea value={config.winbackMessage} onChange={e => setConfig(p => ({ ...p, winbackMessage: e.target.value }))} rows={3} />
                                    <Text fontSize="xs" color="gray.400" mt={1}>Variables: {'{name}'}, {'{laundry}'}, {'{promo}'}</Text>
                                </FormControl>
                            </VStack>
                        </TabPanel>

                        {/* Holidays */}
                        <TabPanel>
                            <VStack spacing={4} align="stretch">
                                <HStack justify="space-between">
                                    <Box><Text fontWeight="bold">Holiday / Special Day Reminders</Text>
                                    <Text fontSize="sm" color="gray.500">Sent on Thanksgiving, Christmas, New Year, July 4th, Mother's/Father's Day</Text></Box>
                                    <Switch isChecked={config.holidayEnabled} onChange={e => setConfig(p => ({ ...p, holidayEnabled: e.target.checked }))} />
                                </HStack>
                                <FormControl><FormLabel>Holiday Promo Code (optional)</FormLabel>
                                    <Input placeholder="e.g. HOLIDAY25" value={config.holidayPromoCode} onChange={e => setConfig(p => ({ ...p, holidayPromoCode: e.target.value }))} />
                                </FormControl>
                                <FormControl><FormLabel>Holiday Message Template</FormLabel>
                                    <Textarea value={config.holidayMessage} onChange={e => setConfig(p => ({ ...p, holidayMessage: e.target.value }))} rows={3} />
                                    <Text fontSize="xs" color="gray.400" mt={1}>Variables: {'{name}'}, {'{laundry}'}, {'{promo}'}</Text>
                                </FormControl>
                            </VStack>
                        </TabPanel>

                        {/* Schedule */}
                        <TabPanel>
                            <VStack spacing={4} align="stretch">
                                <Text fontWeight="bold">Reminder Frequency</Text>
                                <SimpleGrid columns={2} spacing={4}>
                                    <FormControl>
                                        <FormLabel>Weekly reminders for (weeks)</FormLabel>
                                        <Select value={config.weeklyReminderWeeks} onChange={e => setConfig(p => ({ ...p, weeklyReminderWeeks: Number(e.target.value) }))}>
                                            {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} weeks</option>)}
                                        </Select>
                                        <Text fontSize="xs" color="gray.400">For abandoned customers — send weekly for this many weeks</Text>
                                    </FormControl>
                                    <FormControl>
                                        <FormLabel>Monthly reminders for (months)</FormLabel>
                                        <Select value={config.monthlyReminderMonths} onChange={e => setConfig(p => ({ ...p, monthlyReminderMonths: Number(e.target.value) }))}>
                                            {[3, 4, 5, 6, 9, 12].map(n => <option key={n} value={n}>{n} months</option>)}
                                        </Select>
                                        <Text fontSize="xs" color="gray.400">After weekly phase ends, switch to monthly for this long</Text>
                                    </FormControl>
                                </SimpleGrid>
                            </VStack>
                        </TabPanel>
                    </TabPanels>
                </Tabs>

                <Button colorScheme="blue" size="lg" onClick={handleSave} isLoading={saving}>
                    Save Engagement Settings
                </Button>
            </VStack>
        </Container>
    );
};

export default EngagementPage;
