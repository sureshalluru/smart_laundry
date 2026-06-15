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

    if (loading) return <Flex justify="center" p={10}><Spinner size="xl" /></Flex>;

    return (
        <Container maxW="container.lg" py={6}>
            <VStack spacing={6} align="stretch">
                <Box>
                    <Heading size="lg" color="blue.700">Customer Engagement</Heading>
                    <Text color="gray.600" mt={1}>Automated reminders to bring customers back and grow revenue</Text>
                </Box>

                {/* Stats Overview */}
                {stats && (
                    <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                        <Card><CardBody textAlign="center">
                            <Stat><StatLabel>Active (30d)</StatLabel><StatNumber color="green.500">{stats.active}</StatNumber><StatHelpText>Ordered recently</StatHelpText></Stat>
                        </CardBody></Card>
                        <Card><CardBody textAlign="center">
                            <Stat><StatLabel>Abandoned</StatLabel><StatNumber color="orange.500">{stats.abandoned}</StatNumber><StatHelpText>Never ordered</StatHelpText></Stat>
                        </CardBody></Card>
                        <Card><CardBody textAlign="center">
                            <Stat><StatLabel>Dormant</StatLabel><StatNumber color="yellow.600">{stats.dormant}</StatNumber><StatHelpText>30-90 days inactive</StatHelpText></Stat>
                        </CardBody></Card>
                        <Card><CardBody textAlign="center">
                            <Stat><StatLabel>Win-back</StatLabel><StatNumber color="red.500">{stats.winback}</StatNumber><StatHelpText>90+ days inactive</StatHelpText></Stat>
                        </CardBody></Card>
                    </SimpleGrid>
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
