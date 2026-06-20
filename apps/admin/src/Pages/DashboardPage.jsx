import React, { useState, useEffect } from 'react';
import {
    Box, SimpleGrid, VStack, HStack, Text, Heading, Flex, Badge, Spinner,
    Table, Thead, Tbody, Tr, Th, Td, Stat, StatLabel, StatNumber, StatHelpText,
    StatArrow, Progress, Divider, Select, Input, Button, useToast,
} from '@chakra-ui/react';
import { FiDollarSign, FiShoppingBag, FiUsers, FiTrendingUp, FiDownload } from 'react-icons/fi';
import axios from 'axios';

export default function DashboardPage({ laundryId }) {
    const [summary, setSummary] = useState(null);
    const [topServices, setTopServices] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [topCustomers, setTopCustomers] = useState([]);
    const [breakdown, setBreakdown] = useState(null);
    const [loading, setLoading] = useState(true);
    const authToken = localStorage.getItem('idToken');
    const headers = { Authorization: `Bearer ${authToken}` };

    // Export loading states
    const [exportingCustomers, setExportingCustomers] = useState(false);
    const [exportingOrders, setExportingOrders] = useState(false);
    const [exportingReports, setExportingReports] = useState(false);
    const toast = useToast();

    const downloadCSV = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleExportCustomers = async () => {
        setExportingCustomers(true);
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/export/customers`,
                { params: { laundryId }, headers, responseType: 'blob' }
            );
            downloadCSV(new Blob([res.data], { type: 'text/csv' }), `customers_${laundryId}.csv`);
            toast({ title: 'Customers CSV downloaded', status: 'success', duration: 2000 });
        } catch (err) {
            console.error('Export customers error:', err);
            toast({ title: 'Export failed', description: 'Could not export customers.', status: 'error', duration: 3000 });
        } finally {
            setExportingCustomers(false);
        }
    };

    const handleExportOrders = async () => {
        setExportingOrders(true);
        try {
            const params = { laundryId };
            if (startDate && endDate) {
                params.startDate = startDate;
                params.endDate = endDate;
            }
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/export/orders`,
                { params, headers, responseType: 'blob' }
            );
            downloadCSV(new Blob([res.data], { type: 'text/csv' }), `orders_${laundryId}.csv`);
            toast({ title: 'Orders CSV downloaded', status: 'success', duration: 2000 });
        } catch (err) {
            console.error('Export orders error:', err);
            toast({ title: 'Export failed', description: 'Could not export orders.', status: 'error', duration: 3000 });
        } finally {
            setExportingOrders(false);
        }
    };

    const handleExportReports = async () => {
        setExportingReports(true);
        try {
            const params = { laundryId };
            if (startDate && endDate) {
                params.startDate = startDate;
                params.endDate = endDate;
            }
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/export/reports`,
                { params, headers, responseType: 'blob' }
            );
            downloadCSV(new Blob([res.data], { type: 'text/csv' }), `report_${laundryId}.csv`);
            toast({ title: 'Report CSV downloaded', status: 'success', duration: 2000 });
        } catch (err) {
            console.error('Export report error:', err);
            toast({ title: 'Export failed', description: 'Could not export report.', status: 'error', duration: 3000 });
        } finally {
            setExportingReports(false);
        }
    };

    // Filters
    const [period, setPeriod] = useState('30'); // days
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const fetchDashboard = async (days) => {
        setLoading(true);
        try {
            const params = { laundryId };
            if (startDate && endDate) {
                params.startDate = startDate;
                params.endDate = endDate;
            } else {
                params.days = days || period;
            }

            const [sumRes, svcRes, empRes, custRes, brkRes] = await Promise.all([
                axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/dashboard/summary`, { params: { laundryId, days: days || period }, headers }),
                axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/dashboard/top-services`, { params, headers }),
                axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/dashboard/employee-performance`, { params, headers }),
                axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/dashboard/top-customers`, { params: { laundryId }, headers }),
                axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/dashboard/order-breakdown`, { params, headers }),
            ]);
            if (sumRes.data.status === 'success') setSummary(sumRes.data.data);
            if (svcRes.data.status === 'success') setTopServices(svcRes.data.data);
            if (empRes.data.status === 'success') setEmployees(empRes.data.data);
            if (custRes.data.status === 'success') setTopCustomers(custRes.data.data);
            if (brkRes.data.status === 'success') setBreakdown(brkRes.data.data);
        } catch (err) {
            console.error('Dashboard error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboard(period);
    }, [laundryId]);

    const handlePeriodChange = (val) => {
        setPeriod(val);
        setStartDate('');
        setEndDate('');
        fetchDashboard(val);
    };

    const handleCustomDateApply = () => {
        if (startDate && endDate) fetchDashboard();
    };

    if (loading) return <Flex justify="center" align="center" minH="60vh"><Spinner size="xl" color="blue.500" /></Flex>;

    const rev = summary?.revenue || {};
    const ord = summary?.orders || {};
    const cust = summary?.customers || {};

    return (
        <Box p={{ base: 3, md: 6 }}>
            <Flex justify="space-between" align="center" mb={4} flexWrap="wrap" gap={3}>
                <Heading size="lg">Dashboard</Heading>
                <HStack spacing={3} flexWrap="wrap">
                    <Select size="sm" value={period} onChange={(e) => handlePeriodChange(e.target.value)} maxW="140px" bg="white">
                        <option value="7">Last 7 days</option>
                        <option value="30">Last 30 days</option>
                        <option value="90">Last 90 days</option>
                        <option value="365">Last year</option>
                        <option value="custom">Custom</option>
                    </Select>
                    {period === 'custom' && (
                        <HStack spacing={2}>
                            <Input type="date" size="sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} maxW="150px" bg="white" />
                            <Input type="date" size="sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} maxW="150px" bg="white" />
                            <Button size="sm" colorScheme="blue" onClick={handleCustomDateApply} isDisabled={!startDate || !endDate}>
                                Apply
                            </Button>
                        </HStack>
                    )}
                </HStack>
            </Flex>

            {/* Export Buttons */}
            <Flex mb={4} gap={3} flexWrap="wrap">
                <Button
                    size="sm"
                    leftIcon={<FiDownload />}
                    colorScheme="teal"
                    variant="outline"
                    onClick={handleExportCustomers}
                    isLoading={exportingCustomers}
                    loadingText="Exporting..."
                >
                    Export Customers
                </Button>
                <Button
                    size="sm"
                    leftIcon={<FiDownload />}
                    colorScheme="blue"
                    variant="outline"
                    onClick={handleExportOrders}
                    isLoading={exportingOrders}
                    loadingText="Exporting..."
                >
                    Export Orders
                </Button>
                <Button
                    size="sm"
                    leftIcon={<FiDownload />}
                    colorScheme="purple"
                    variant="outline"
                    onClick={handleExportReports}
                    isLoading={exportingReports}
                    loadingText="Exporting..."
                >
                    Export Report
                </Button>
            </Flex>

            {/* KPI Cards */}
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
                <Box bg="white" p={4} borderRadius="xl" boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Stat>
                        <StatLabel fontSize="xs" color="gray.500">Today's Revenue</StatLabel>
                        <StatNumber fontSize={{ base: 'lg', md: '2xl' }}>${rev.today?.toFixed(2)}</StatNumber>
                        <StatHelpText fontSize="xs">
                            <StatArrow type={rev.growth >= 0 ? 'increase' : 'decrease'} />
                            {Math.abs(rev.growth)}% vs last month
                        </StatHelpText>
                    </Stat>
                </Box>
                <Box bg="white" p={4} borderRadius="xl" boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Stat>
                        <StatLabel fontSize="xs" color="gray.500">Monthly Revenue</StatLabel>
                        <StatNumber fontSize={{ base: 'lg', md: '2xl' }}>${rev.month?.toFixed(2)}</StatNumber>
                        <StatHelpText fontSize="xs">Week: ${rev.week?.toFixed(2)}</StatHelpText>
                    </Stat>
                </Box>
                <Box bg="white" p={4} borderRadius="xl" boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Stat>
                        <StatLabel fontSize="xs" color="gray.500">Orders ({period === "custom" ? "Custom Range" : `Last ${period} days`})</StatLabel>
                        <StatNumber fontSize={{ base: 'lg', md: '2xl' }}>{ord.month}</StatNumber>
                        <StatHelpText fontSize="xs">Today: {ord.today} | Active: {ord.active}</StatHelpText>
                    </Stat>
                </Box>
                <Box bg="white" p={4} borderRadius="xl" boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Stat>
                        <StatLabel fontSize="xs" color="gray.500">Customers</StatLabel>
                        <StatNumber fontSize={{ base: 'lg', md: '2xl' }}>{cust.total}</StatNumber>
                        <StatHelpText fontSize="xs">+{cust.newThisMonth} new this month</StatHelpText>
                    </Stat>
                </Box>
            </SimpleGrid>

            {/* Alerts */}
            {ord.unpaid > 0 && (
                <Box bg="red.50" border="1px solid" borderColor="red.200" borderRadius="lg" p={3} mb={6}>
                    <Text fontSize="sm" color="red.600" fontWeight="600">
                        ⚠️ {ord.unpaid} active order{ord.unpaid > 1 ? 's' : ''} with unpaid balance
                    </Text>
                </Box>
            )}

            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                {/* Order Breakdown */}
                <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                    <Text fontWeight="700" mb={4}>Order Breakdown ({period === "custom" ? "Custom Range" : `Last ${period} days`})</Text>
                    <SimpleGrid columns={3} spacing={3}>
                        <Box textAlign="center" p={3} bg="blue.50" borderRadius="lg">
                            <Text fontSize="2xl" fontWeight="700" color="blue.600">{breakdown?.byType?.Online || 0}</Text>
                            <Text fontSize="xs" color="gray.500">Online</Text>
                        </Box>
                        <Box textAlign="center" p={3} bg="green.50" borderRadius="lg">
                            <Text fontSize="2xl" fontWeight="700" color="green.600">{breakdown?.byType?.InStore || 0}</Text>
                            <Text fontSize="xs" color="gray.500">In-Store</Text>
                        </Box>
                        <Box textAlign="center" p={3} bg="purple.50" borderRadius="lg">
                            <Text fontSize="2xl" fontWeight="700" color="purple.600">{breakdown?.byType?.Commercial || 0}</Text>
                            <Text fontSize="xs" color="gray.500">Commercial</Text>
                        </Box>
                    </SimpleGrid>
                    <Divider my={4} />
                    <Text fontSize="sm" fontWeight="600" mb={2}>Payment Status</Text>
                    <HStack spacing={3}>
                        <Badge colorScheme="green" px={3} py={1}>{breakdown?.byPayment?.Paid || 0} Paid</Badge>
                        <Badge colorScheme="red" px={3} py={1}>{breakdown?.byPayment?.Unpaid || 0} Unpaid</Badge>
                    </HStack>
                </Box>

                {/* Top Services */}
                <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                    <Text fontWeight="700" mb={4}>Top Services ({period === "custom" ? "Custom Range" : `Last ${period} days`})</Text>
                    <VStack spacing={3} align="stretch">
                        {topServices.slice(0, 5).map((svc, i) => (
                            <Flex key={i} justify="space-between" align="center">
                                <VStack align="flex-start" spacing={0}>
                                    <Text fontSize="sm" fontWeight="500">{svc.service}</Text>
                                    <Text fontSize="xs" color="gray.400">{svc.orders} orders</Text>
                                </VStack>
                                <Text fontSize="sm" fontWeight="700" color="green.600">${svc.revenue.toFixed(2)}</Text>
                            </Flex>
                        ))}
                        {topServices.length === 0 && <Text fontSize="sm" color="gray.400">No data yet</Text>}
                    </VStack>
                </Box>

                {/* Employee Performance */}
                <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                    <Text fontWeight="700" mb={4}>Employee Performance ({period === "custom" ? "Custom Range" : `Last ${period} days`})</Text>
                    <Table size="sm" variant="simple">
                        <Thead>
                            <Tr><Th>Employee</Th><Th isNumeric>Orders</Th><Th isNumeric>Tips</Th></Tr>
                        </Thead>
                        <Tbody>
                            {employees.map((emp, i) => (
                                <Tr key={i}>
                                    <Td fontSize="sm">{emp.name}</Td>
                                    <Td isNumeric fontSize="sm">{emp.ordersProcessed}</Td>
                                    <Td isNumeric fontSize="sm" color="green.500">${emp.tipsEarned.toFixed(2)}</Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
                    {employees.length === 0 && <Text fontSize="sm" color="gray.400" mt={2}>No data yet</Text>}
                </Box>

                {/* Top Customers */}
                <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                    <Text fontWeight="700" mb={4}>Top Customers (All Time)</Text>
                    <Table size="sm" variant="simple">
                        <Thead>
                            <Tr><Th>Customer</Th><Th isNumeric>Orders</Th><Th isNumeric>Spent</Th></Tr>
                        </Thead>
                        <Tbody>
                            {topCustomers.slice(0, 8).map((c, i) => (
                                <Tr key={i}>
                                    <Td fontSize="sm">{c.name || c.phone}</Td>
                                    <Td isNumeric fontSize="sm">{c.totalOrders}</Td>
                                    <Td isNumeric fontSize="sm" color="blue.500">${c.totalSpent.toFixed(2)}</Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
                    {topCustomers.length === 0 && <Text fontSize="sm" color="gray.400" mt={2}>No data yet</Text>}
                </Box>
            </SimpleGrid>
        </Box>
    );
}
