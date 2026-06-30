import React, { useState, useEffect } from 'react';
import {
    Box, Heading, Text, Spinner, Tabs, TabList, TabPanels, Tab, TabPanel,
    Table, Thead, Tbody, Tr, Th, Td, Input, HStack, FormControl, FormLabel,
    Button, Alert, AlertIcon, Stat, StatLabel, StatNumber, SimpleGrid,
} from '@chakra-ui/react';
import { useCompanyAuth } from '../Context/CompanyAuthContext';
import axios from 'axios';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

function getDefaultDates() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
    };
}

function formatCurrency(val) {
    return `$${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Revenue Tab Content
function RevenueSection({ data, loading }) {
    if (loading) return <Spinner size="md" />;
    if (!data) return <Text color="gray.400">No data</Text>;

    const locations = data.locations || [];
    return (
        <Box>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
                <Stat p={3} bg="purple.50" borderRadius="md">
                    <StatLabel>Total Revenue</StatLabel>
                    <StatNumber fontSize="lg">{formatCurrency(data.totalRevenue)}</StatNumber>
                </Stat>
                <Stat p={3} bg="blue.50" borderRadius="md">
                    <StatLabel>Total Orders</StatLabel>
                    <StatNumber fontSize="lg">{data.totalOrders || 0}</StatNumber>
                </Stat>
                <Stat p={3} bg="green.50" borderRadius="md">
                    <StatLabel>Avg Order Value</StatLabel>
                    <StatNumber fontSize="lg">{formatCurrency(data.averageOrderValue)}</StatNumber>
                </Stat>
            </SimpleGrid>
            <Table variant="simple" size="sm">
                <Thead>
                    <Tr>
                        <Th>Location</Th>
                        <Th isNumeric>Revenue</Th>
                        <Th isNumeric>Orders</Th>
                        <Th isNumeric>Avg Order Value</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {locations.map((loc) => (
                        <Tr key={loc.laundryId}>
                            <Td>{loc.laundryName}</Td>
                            <Td isNumeric>{formatCurrency(loc.revenue)}</Td>
                            <Td isNumeric>{loc.orderCount || 0}</Td>
                            <Td isNumeric>{formatCurrency(loc.averageOrderValue)}</Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
        </Box>
    );
}

// Tips Tab Content
function TipsSection({ data, loading }) {
    if (loading) return <Spinner size="md" />;
    if (!data) return <Text color="gray.400">No data</Text>;

    const employees = data.employees || [];
    return (
        <Box>
            <Stat p={3} bg="green.50" borderRadius="md" mb={6} display="inline-block">
                <StatLabel>Total Tips</StatLabel>
                <StatNumber fontSize="lg">{formatCurrency(data.totalTips)}</StatNumber>
            </Stat>
            <Table variant="simple" size="sm">
                <Thead>
                    <Tr>
                        <Th>Employee</Th>
                        <Th>Location</Th>
                        <Th isNumeric>Tips</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {employees.map((emp, idx) => (
                        <Tr key={idx}>
                            <Td>{emp.employeeName || emp.employeeId}</Td>
                            <Td>{emp.laundryName}</Td>
                            <Td isNumeric>{formatCurrency(emp.tips)}</Td>
                        </Tr>
                    ))}
                    {employees.length === 0 && (
                        <Tr><Td colSpan={3} textAlign="center" color="gray.400">No tip data</Td></Tr>
                    )}
                </Tbody>
            </Table>
        </Box>
    );
}

// Sales Tax Tab Content
function SalesTaxSection({ data, loading }) {
    if (loading) return <Spinner size="md" />;
    if (!data) return <Text color="gray.400">No data</Text>;

    const locations = data.locations || [];
    return (
        <Box>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={6}>
                <Stat p={3} bg="orange.50" borderRadius="md">
                    <StatLabel>Total Taxable Receipts</StatLabel>
                    <StatNumber fontSize="lg">{formatCurrency(data.totalTaxableReceipts)}</StatNumber>
                </Stat>
                <Stat p={3} bg="red.50" borderRadius="md">
                    <StatLabel>Total Tax Collected</StatLabel>
                    <StatNumber fontSize="lg">{formatCurrency(data.totalTaxCollected)}</StatNumber>
                </Stat>
            </SimpleGrid>
            <Table variant="simple" size="sm">
                <Thead>
                    <Tr>
                        <Th>Location</Th>
                        <Th isNumeric>Taxable Receipts</Th>
                        <Th isNumeric>Tax Collected</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {locations.map((loc) => (
                        <Tr key={loc.laundryId}>
                            <Td>{loc.laundryName}</Td>
                            <Td isNumeric>{formatCurrency(loc.taxableReceipts)}</Td>
                            <Td isNumeric>{formatCurrency(loc.taxCollected)}</Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
        </Box>
    );
}

export default function CompanyReportsPage() {
    const { companyToken } = useCompanyAuth();
    const [dates, setDates] = useState(getDefaultDates);
    const [revenueData, setRevenueData] = useState(null);
    const [tipsData, setTipsData] = useState(null);
    const [salesTaxData, setSalesTaxData] = useState(null);
    const [loadingRevenue, setLoadingRevenue] = useState(false);
    const [loadingTips, setLoadingTips] = useState(false);
    const [loadingSalesTax, setLoadingSalesTax] = useState(false);
    const [error, setError] = useState(null);

    const fetchAll = async () => {
        if (!companyToken) return;
        setError(null);
        const headers = { Authorization: `Bearer ${companyToken}` };
        const params = { start_date: dates.startDate, end_date: dates.endDate };

        // Fetch revenue
        setLoadingRevenue(true);
        try {
            const res = await axios.get(`${API_URL}/api/company/reports/revenue`, { headers, params });
            setRevenueData(res.data?.data || res.data);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load revenue report');
        } finally {
            setLoadingRevenue(false);
        }

        // Fetch tips
        setLoadingTips(true);
        try {
            const res = await axios.get(`${API_URL}/api/company/reports/tips`, { headers, params });
            setTipsData(res.data?.data || res.data);
        } catch (err) {
            console.error('Failed to load tips:', err);
        } finally {
            setLoadingTips(false);
        }

        // Fetch sales tax
        setLoadingSalesTax(true);
        try {
            const res = await axios.get(`${API_URL}/api/company/reports/sales-tax`, { headers, params });
            setSalesTaxData(res.data?.data || res.data);
        } catch (err) {
            console.error('Failed to load sales tax:', err);
        } finally {
            setLoadingSalesTax(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, [companyToken]);

    return (
        <Box>
            <Heading size="lg" mb={6} color="purple.700">Financial Reports</Heading>

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
                <Button colorScheme="purple" size="sm" mt={6} onClick={fetchAll}>
                    Apply
                </Button>
            </HStack>

            {error && (
                <Alert status="error" borderRadius="md" mb={4}>
                    <AlertIcon />
                    {error}
                </Alert>
            )}

            <Tabs colorScheme="purple" variant="enclosed">
                <TabList>
                    <Tab>Revenue</Tab>
                    <Tab>Tips</Tab>
                    <Tab>Sales Tax</Tab>
                </TabList>
                <TabPanels>
                    <TabPanel>
                        <RevenueSection data={revenueData} loading={loadingRevenue} />
                    </TabPanel>
                    <TabPanel>
                        <TipsSection data={tipsData} loading={loadingTips} />
                    </TabPanel>
                    <TabPanel>
                        <SalesTaxSection data={salesTaxData} loading={loadingSalesTax} />
                    </TabPanel>
                </TabPanels>
            </Tabs>
        </Box>
    );
}
