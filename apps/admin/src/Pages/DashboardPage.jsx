import React, { useState, useEffect } from 'react';
import {
    Box, SimpleGrid, VStack, HStack, Text, Heading, Flex, Badge, Spinner,
    Table, Thead, Tbody, Tr, Th, Td, Stat, StatLabel, StatNumber, StatHelpText,
    StatArrow, Progress, Divider, Select, Input, Button, useToast,
} from '@chakra-ui/react';
import { FiDollarSign, FiShoppingBag, FiUsers, FiTrendingUp, FiDownload } from 'react-icons/fi';
import axios from 'axios';

/* ─── Donut Chart Component ─── */
function DonutChart({ segments }) {
    // segments: [{ value, color, label }]
    const total = segments.reduce((sum, s) => sum + (s.value || 0), 0);
    if (total === 0) {
        return (
            <svg viewBox="0 0 36 36" width="130" height="130">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E2E8F0" strokeWidth="3" />
                <text x="18" y="19" textAnchor="middle" fontSize="4" fill="#A0AEC0">No data</text>
            </svg>
        );
    }

    let offset = 25; // start from top (SVG circle starts at 3 o'clock, offset 25 = 12 o'clock)
    const circles = segments.map((seg, i) => {
        const pct = (seg.value / total) * 100;
        const circle = (
            <circle
                key={i}
                cx="18"
                cy="18"
                r="15.9"
                fill="none"
                stroke={seg.color}
                strokeWidth="3.5"
                strokeDasharray={`${pct} ${100 - pct}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
            />
        );
        offset += pct;
        return circle;
    });

    return (
        <svg viewBox="0 0 36 36" width="130" height="130">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E2E8F0" strokeWidth="3" />
            {circles}
            <text x="18" y="17" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#2D3748">{total}</text>
            <text x="18" y="21" textAnchor="middle" fontSize="2.5" fill="#718096">orders</text>
        </svg>
    );
}

/* ─── Horizontal Bar (relative width) ─── */
function HorizontalBar({ value, maxValue, color }) {
    const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 4) : 0;
    return (
        <Box w="100%" bg="gray.100" borderRadius="full" h="8px" overflow="hidden">
            <Box bg={color} h="100%" borderRadius="full" w={`${pct}%`} transition="width 0.3s ease" />
        </Box>
    );
}

/* ─── Revenue Trend Mini Bar Chart ─── */
function RevenueTrendBars({ today, week, month }) {
    const maxVal = Math.max(today || 0, week || 0, month || 0, 1);
    const bars = [
        { label: 'Today', value: today || 0, color: 'blue.400' },
        { label: 'Week', value: week || 0, color: 'teal.400' },
        { label: 'Month', value: month || 0, color: 'purple.400' },
    ];

    return (
        <HStack spacing={4} align="flex-end" h="100px" justify="center">
            {bars.map((bar, i) => {
                const heightPct = maxVal > 0 ? Math.max((bar.value / maxVal) * 100, 8) : 8;
                return (
                    <VStack key={i} spacing={1} align="center">
                        <Text fontSize="xs" fontWeight="600" color="gray.600">${bar.value.toFixed(0)}</Text>
                        <Box
                            w="36px"
                            h={`${heightPct}%`}
                            bg={bar.color}
                            borderRadius="md"
                            minH="8px"
                            transition="height 0.3s ease"
                        />
                        <Text fontSize="xs" color="gray.500">{bar.label}</Text>
                    </VStack>
                );
            })}
        </HStack>
    );
}

/* ─── Segmented Bar (Repeat vs New) ─── */
function SegmentedBar({ newCount, repeatCount }) {
    const total = (newCount || 0) + (repeatCount || 0);
    if (total === 0) {
        return (
            <VStack spacing={1} align="stretch">
                <Box w="100%" bg="gray.100" borderRadius="full" h="14px" />
                <Text fontSize="xs" color="gray.400" textAlign="center">No customer data</Text>
            </VStack>
        );
    }
    const newPct = (newCount / total) * 100;
    const repeatPct = (repeatCount / total) * 100;

    return (
        <VStack spacing={2} align="stretch">
            <Box w="100%" bg="gray.100" borderRadius="full" h="14px" overflow="hidden" display="flex">
                <Box bg="purple.400" h="100%" w={`${repeatPct}%`} transition="width 0.3s ease" />
                <Box bg="orange.400" h="100%" w={`${newPct}%`} transition="width 0.3s ease" />
            </Box>
            <HStack justify="space-between" fontSize="xs">
                <HStack spacing={1}>
                    <Box w="10px" h="10px" borderRadius="sm" bg="purple.400" />
                    <Text color="gray.600">Repeat: {repeatCount} ({repeatPct.toFixed(0)}%)</Text>
                </HStack>
                <HStack spacing={1}>
                    <Box w="10px" h="10px" borderRadius="sm" bg="orange.400" />
                    <Text color="gray.600">New: {newCount} ({newPct.toFixed(0)}%)</Text>
                </HStack>
            </HStack>
        </VStack>
    );
}

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

    // Computed values
    const avgOrderValue = ord.month > 0 ? (rev.month / ord.month) : 0;
    const repeatCustomers = Math.max((cust.total || 0) - (cust.newThisMonth || 0), 0);

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
            <SimpleGrid columns={{ base: 2, md: 5 }} spacing={4} mb={6}>
                <Box bg="white" p={4} borderRadius="xl" boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Stat>
                        <StatLabel fontSize="xs" color="gray.500">Today's Revenue</StatLabel>
                        <StatNumber fontSize={{ base: 'lg', md: '2xl' }}>${(rev.today || 0).toFixed(2)}</StatNumber>
                        <StatHelpText fontSize="xs">
                            <StatArrow type={(rev.growth || 0) >= 0 ? 'increase' : 'decrease'} />
                            {Math.abs(rev.growth || 0)}% vs last month
                        </StatHelpText>
                    </Stat>
                </Box>
                <Box bg="white" p={4} borderRadius="xl" boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Stat>
                        <StatLabel fontSize="xs" color="gray.500">Monthly Revenue</StatLabel>
                        <StatNumber fontSize={{ base: 'lg', md: '2xl' }}>${(rev.month || 0).toFixed(2)}</StatNumber>
                        <StatHelpText fontSize="xs">Week: ${(rev.week || 0).toFixed(2)}</StatHelpText>
                    </Stat>
                </Box>
                <Box bg="white" p={4} borderRadius="xl" boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Stat>
                        <StatLabel fontSize="xs" color="gray.500">Orders ({period === "custom" ? "Custom Range" : `Last ${period} days`})</StatLabel>
                        <StatNumber fontSize={{ base: 'lg', md: '2xl' }}>{ord.month || 0}</StatNumber>
                        <StatHelpText fontSize="xs">Today: {ord.today || 0} | Active: {ord.active || 0}</StatHelpText>
                    </Stat>
                </Box>
                <Box bg="white" p={4} borderRadius="xl" boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Stat>
                        <StatLabel fontSize="xs" color="gray.500">Customers</StatLabel>
                        <StatNumber fontSize={{ base: 'lg', md: '2xl' }}>{cust.total || 0}</StatNumber>
                        <StatHelpText fontSize="xs">+{cust.newThisMonth || 0} new this month</StatHelpText>
                    </Stat>
                </Box>
                <Box bg="white" p={4} borderRadius="xl" boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Stat>
                        <StatLabel fontSize="xs" color="gray.500">Avg Order Value</StatLabel>
                        <StatNumber fontSize={{ base: 'lg', md: '2xl' }}>${avgOrderValue.toFixed(2)}</StatNumber>
                        <StatHelpText fontSize="xs">Revenue ÷ Orders</StatHelpText>
                    </Stat>
                </Box>
            </SimpleGrid>

            {/* Alerts */}
            {(ord.unpaid || 0) > 0 && (
                <Box bg="red.50" border="1px solid" borderColor="red.200" borderRadius="lg" p={3} mb={6}>
                    <Text fontSize="sm" color="red.600" fontWeight="600">
                        ⚠️ {ord.unpaid} active order{ord.unpaid > 1 ? 's' : ''} with unpaid balance
                    </Text>
                </Box>
            )}

            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} mb={6}>
                {/* Order Breakdown with Donut Chart */}
                <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                    <Text fontWeight="700" mb={4}>Order Breakdown ({period === "custom" ? "Custom Range" : `Last ${period} days`})</Text>
                    <Flex align="center" justify="center" gap={6} flexWrap="wrap">
                        <DonutChart
                            segments={[
                                { value: breakdown?.byType?.Online || 0, color: '#3182CE', label: 'Online' },
                                { value: breakdown?.byType?.InStore || 0, color: '#38A169', label: 'In-Store' },
                                { value: breakdown?.byType?.Commercial || 0, color: '#805AD5', label: 'Commercial' },
                            ]}
                        />
                        <VStack spacing={2} align="flex-start">
                            <HStack spacing={2}>
                                <Box w="12px" h="12px" borderRadius="sm" bg="blue.500" />
                                <Text fontSize="sm">Online: <b>{breakdown?.byType?.Online || 0}</b></Text>
                            </HStack>
                            <HStack spacing={2}>
                                <Box w="12px" h="12px" borderRadius="sm" bg="green.500" />
                                <Text fontSize="sm">In-Store: <b>{breakdown?.byType?.InStore || 0}</b></Text>
                            </HStack>
                            <HStack spacing={2}>
                                <Box w="12px" h="12px" borderRadius="sm" bg="purple.500" />
                                <Text fontSize="sm">Commercial: <b>{breakdown?.byType?.Commercial || 0}</b></Text>
                            </HStack>
                        </VStack>
                    </Flex>
                    <Divider my={4} />
                    <Text fontSize="sm" fontWeight="600" mb={2}>Payment Status</Text>
                    <HStack spacing={3}>
                        <Badge colorScheme="green" px={3} py={1}>{breakdown?.byPayment?.Paid || 0} Paid</Badge>
                        <Badge colorScheme="red" px={3} py={1}>{breakdown?.byPayment?.Unpaid || 0} Unpaid</Badge>
                    </HStack>
                </Box>

                {/* Top Services with Horizontal Bars */}
                <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                    <Text fontWeight="700" mb={4}>Top Services ({period === "custom" ? "Custom Range" : `Last ${period} days`})</Text>
                    <VStack spacing={3} align="stretch">
                        {topServices.length > 0 ? (
                            (() => {
                                const maxRevenue = Math.max(...topServices.slice(0, 5).map(s => s.revenue || 0), 1);
                                return topServices.slice(0, 5).map((svc, i) => (
                                    <Box key={i}>
                                        <Flex justify="space-between" align="center" mb={1}>
                                            <VStack align="flex-start" spacing={0}>
                                                <Text fontSize="sm" fontWeight="500">{svc.service}</Text>
                                                <Text fontSize="xs" color="gray.400">{svc.orders} orders</Text>
                                            </VStack>
                                            <Text fontSize="sm" fontWeight="700" color="green.600">${svc.revenue.toFixed(2)}</Text>
                                        </Flex>
                                        <HorizontalBar value={svc.revenue} maxValue={maxRevenue} color="green.400" />
                                    </Box>
                                ));
                            })()
                        ) : (
                            <Text fontSize="sm" color="gray.400">No data yet</Text>
                        )}
                    </VStack>
                </Box>

                {/* Revenue Trend */}
                <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                    <Text fontWeight="700" mb={4}>Revenue Trend</Text>
                    <RevenueTrendBars
                        today={rev.today || 0}
                        week={rev.week || 0}
                        month={rev.month || 0}
                    />
                </Box>

                {/* Repeat vs New Customers */}
                <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                    <Text fontWeight="700" mb={4}>Repeat vs New Customers</Text>
                    <SegmentedBar
                        newCount={cust.newThisMonth || 0}
                        repeatCount={repeatCustomers}
                    />
                    <Divider my={3} />
                    <SimpleGrid columns={2} spacing={3}>
                        <Box textAlign="center" p={2} bg="purple.50" borderRadius="lg">
                            <Text fontSize="xl" fontWeight="700" color="purple.600">{repeatCustomers}</Text>
                            <Text fontSize="xs" color="gray.500">Repeat</Text>
                        </Box>
                        <Box textAlign="center" p={2} bg="orange.50" borderRadius="lg">
                            <Text fontSize="xl" fontWeight="700" color="orange.600">{cust.newThisMonth || 0}</Text>
                            <Text fontSize="xs" color="gray.500">New This Month</Text>
                        </Box>
                    </SimpleGrid>
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
