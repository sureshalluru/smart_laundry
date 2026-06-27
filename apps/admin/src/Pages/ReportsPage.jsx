import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Box, SimpleGrid, VStack, HStack, Text, Heading, Flex, Spinner,
    Table, Thead, Tbody, Tr, Th, Td, Stat, StatLabel, StatNumber,
    Tabs, TabList, TabPanels, Tab, TabPanel, Button, Input, useToast,
    Badge, Divider, Select, IconButton, Modal, ModalOverlay, ModalContent,
    ModalHeader, ModalBody, ModalFooter, ModalCloseButton, useDisclosure,
    FormControl, FormLabel, Textarea, NumberInput, NumberInputField,
} from '@chakra-ui/react';
import { FiDownload, FiDollarSign, FiUsers, FiPieChart, FiFileText, FiPlus, FiTrash2 } from 'react-icons/fi';
import axios from 'axios';

/* ─── Helper: format currency ─── */
const fmt = (val) => `$${(val || 0).toFixed(2)}`;
const pct = (val) => `${((val || 0) * 100).toFixed(2)}%`;

/* ─── Date presets ─── */
function getPresetDates(preset) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    switch (preset) {
        case 'thisMonth': {
            const start = new Date(year, month, 1);
            return { start: toISO(start), end: toISO(now) };
        }
        case 'lastMonth': {
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0);
            return { start: toISO(start), end: toISO(end) };
        }
        case 'thisQuarter': {
            const qStart = Math.floor(month / 3) * 3;
            const start = new Date(year, qStart, 1);
            return { start: toISO(start), end: toISO(now) };
        }
        case 'lastQuarter': {
            const qStart = Math.floor(month / 3) * 3 - 3;
            const start = new Date(year, qStart, 1);
            const end = new Date(year, qStart + 3, 0);
            return { start: toISO(start), end: toISO(end) };
        }
        case 'thisYear': {
            const start = new Date(year, 0, 1);
            return { start: toISO(start), end: toISO(now) };
        }
        default:
            return { start: '', end: '' };
    }
}

function toISO(date) {
    return date.toISOString().split('T')[0];
}

/* ─── CSV Export Helper ─── */
function downloadCSV(data, filename) {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','),
        ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* ─── Summary Card ─── */
function SummaryCard({ label, value, icon, color = "blue" }) {
    return (
        <Box bg="white" p={5} borderRadius="xl" boxShadow="sm" border="1px solid" borderColor="gray.100">
            <Stat>
                <HStack spacing={2} mb={1}>
                    <Box color={`${color}.500`}>{icon}</Box>
                    <StatLabel fontSize="xs" color="gray.500">{label}</StatLabel>
                </HStack>
                <StatNumber fontSize={{ base: 'lg', md: '2xl' }}>{value}</StatNumber>
            </Stat>
        </Box>
    );
}

/* ─── Sales Tax Tab ─── */
function SalesTaxPanel({ data, loading }) {
    if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;
    if (!data) return <Text color="gray.400" py={10} textAlign="center">Select a date range and click Apply</Text>;

    const exportData = [{
        'Gross Sales': data.grossSales,
        'Taxable Amount': data.taxableAmount,
        'Tax Collected': data.taxCollected,
        'Tax Rate': data.taxRate,
        'Order Count': data.orderCount,
        'Period': data.periodLabel,
    }];

    return (
        <VStack spacing={6} align="stretch">
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                <SummaryCard label="Gross Sales (All Orders)" value={fmt(data.grossSales)} icon={<FiDollarSign />} color="green" />
                <SummaryCard label="Taxable Amount" value={fmt(data.taxableAmount)} icon={<FiDollarSign />} color="blue" />
                <SummaryCard label="Tax Collected" value={fmt(data.taxCollected)} icon={<FiDollarSign />} color="red" />
                <SummaryCard label="Tax Rate" value={pct(data.taxRate)} icon={<FiPieChart />} color="purple" />
            </SimpleGrid>

            <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                <Flex justify="space-between" align="center" mb={4}>
                    <Text fontWeight="700">Sales Tax Summary</Text>
                    <Button size="sm" leftIcon={<FiDownload />} colorScheme="teal" variant="outline"
                        onClick={() => downloadCSV(exportData, 'sales_tax_report.csv')}>
                        Export CSV
                    </Button>
                </Flex>
                <Table size="sm" variant="simple">
                    <Thead>
                        <Tr>
                            <Th>Field</Th>
                            <Th isNumeric>Value</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        <Tr><Td>Period</Td><Td isNumeric>{data.periodLabel}</Td></Tr>
                        <Tr><Td>Total Orders</Td><Td isNumeric>{data.orderCount}</Td></Tr>
                        <Tr><Td>Gross Sales</Td><Td isNumeric>{fmt(data.grossSales)}</Td></Tr>
                        <Tr><Td>Taxable Amount</Td><Td isNumeric>{fmt(data.taxableAmount)}</Td></Tr>
                        <Tr><Td>Tax Rate</Td><Td isNumeric>{pct(data.taxRate)}</Td></Tr>
                        <Tr fontWeight="bold"><Td>Tax Collected</Td><Td isNumeric color="red.500">{fmt(data.taxCollected)}</Td></Tr>
                    </Tbody>
                </Table>
            </Box>
        </VStack>
    );
}

/* ─── Tips Tab ─── */
function TipsPanel({ data, loading }) {
    if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;
    if (!data) return <Text color="gray.400" py={10} textAlign="center">Select a date range and click Apply</Text>;

    const exportData = data.tipsByEmployee.map(emp => ({
        'Employee': emp.name,
        'Tips Earned': emp.tipsEarned,
        'Order Count': emp.orderCount,
    }));

    return (
        <VStack spacing={6} align="stretch">
            <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
                <SummaryCard label="Total Tips" value={fmt(data.totalTipsCollected)} icon={<FiDollarSign />} color="green" />
                <SummaryCard label="Cash Tips" value={fmt(data.tipsByMethod?.cash)} icon={<FiDollarSign />} color="teal" />
                <SummaryCard label="Card Tips" value={fmt(data.tipsByMethod?.card)} icon={<FiDollarSign />} color="blue" />
            </SimpleGrid>

            <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                <Flex justify="space-between" align="center" mb={4}>
                    <Text fontWeight="700">Tips by Employee</Text>
                    <Button size="sm" leftIcon={<FiDownload />} colorScheme="teal" variant="outline"
                        onClick={() => downloadCSV(exportData, 'tips_report.csv')}>
                        Export CSV
                    </Button>
                </Flex>
                <Table size="sm" variant="simple">
                    <Thead>
                        <Tr>
                            <Th>Employee</Th>
                            <Th isNumeric>Tips Earned</Th>
                            <Th isNumeric>Orders</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        {data.tipsByEmployee.map((emp, i) => (
                            <Tr key={i}>
                                <Td fontSize="sm">{emp.name}</Td>
                                <Td isNumeric fontSize="sm" color="green.500">{fmt(emp.tipsEarned)}</Td>
                                <Td isNumeric fontSize="sm">{emp.orderCount}</Td>
                            </Tr>
                        ))}
                        {data.tipsByEmployee.length === 0 && (
                            <Tr><Td colSpan={3}><Text fontSize="sm" color="gray.400">No tips data for this period</Text></Td></Tr>
                        )}
                    </Tbody>
                </Table>
            </Box>
        </VStack>
    );
}

/* ─── Revenue Tab ─── */
function RevenuePanel({ data, loading }) {
    if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;
    if (!data) return <Text color="gray.400" py={10} textAlign="center">Select a date range and click Apply</Text>;

    const exportData = data.revenueByService.map(svc => ({
        'Service': svc.service,
        'Revenue': svc.revenue,
        'Orders': svc.orders,
    }));

    return (
        <VStack spacing={6} align="stretch">
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                <SummaryCard label="Total Revenue" value={fmt(data.totalRevenue)} icon={<FiDollarSign />} color="green" />
                <SummaryCard label="Cash Revenue" value={fmt(data.cashRevenue)} icon={<FiDollarSign />} color="teal" />
                <SummaryCard label="Card Revenue" value={fmt(data.cardRevenue)} icon={<FiDollarSign />} color="blue" />
                <SummaryCard label="Pay Later" value={fmt(data.payLaterRevenue)} icon={<FiDollarSign />} color="orange" />
            </SimpleGrid>

            {/* Revenue by Type */}
            <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                <Text fontWeight="700" mb={4}>Revenue by Order Type</Text>
                <SimpleGrid columns={3} spacing={4}>
                    <Box textAlign="center" p={3} bg="blue.50" borderRadius="lg">
                        <Text fontSize="xl" fontWeight="700" color="blue.600">{fmt(data.revenueByType?.online)}</Text>
                        <Text fontSize="xs" color="gray.500">Online</Text>
                    </Box>
                    <Box textAlign="center" p={3} bg="green.50" borderRadius="lg">
                        <Text fontSize="xl" fontWeight="700" color="green.600">{fmt(data.revenueByType?.instore)}</Text>
                        <Text fontSize="xs" color="gray.500">In-Store</Text>
                    </Box>
                    <Box textAlign="center" p={3} bg="purple.50" borderRadius="lg">
                        <Text fontSize="xl" fontWeight="700" color="purple.600">{fmt(data.revenueByType?.commercial)}</Text>
                        <Text fontSize="xs" color="gray.500">Commercial</Text>
                    </Box>
                </SimpleGrid>
            </Box>

            {/* Revenue by Service */}
            <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                <Flex justify="space-between" align="center" mb={4}>
                    <Text fontWeight="700">Revenue by Service</Text>
                    <Button size="sm" leftIcon={<FiDownload />} colorScheme="teal" variant="outline"
                        onClick={() => downloadCSV(exportData, 'revenue_report.csv')}>
                        Export CSV
                    </Button>
                </Flex>
                <Table size="sm" variant="simple">
                    <Thead>
                        <Tr>
                            <Th>Service</Th>
                            <Th isNumeric>Revenue</Th>
                            <Th isNumeric>Orders</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        {data.revenueByService.map((svc, i) => (
                            <Tr key={i}>
                                <Td fontSize="sm">{svc.service}</Td>
                                <Td isNumeric fontSize="sm" color="green.500">{fmt(svc.revenue)}</Td>
                                <Td isNumeric fontSize="sm">{svc.orders}</Td>
                            </Tr>
                        ))}
                        {data.revenueByService.length === 0 && (
                            <Tr><Td colSpan={3}><Text fontSize="sm" color="gray.400">No revenue data for this period</Text></Td></Tr>
                        )}
                    </Tbody>
                </Table>
            </Box>
        </VStack>
    );
}

/* ─── Comptroller Tab ─── */
function ComptrollerPanel({ data, loading }) {
    if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;
    if (!data) return <Text color="gray.400" py={10} textAlign="center">Select a date range and click Apply</Text>;

    const exportData = [{
        'Reporting Period': data.reportingPeriod,
        'Gross Receipts': data.grossReceipts,
        'Taxable Receipts': data.taxableReceipts,
        'Sales Tax Collected': data.salesTaxCollected,
        'Tax Rate': data.taxRate,
        'Total Orders': data.totalOrders,
        'Exempt Sales': data.exemptSales,
    }];

    return (
        <VStack spacing={6} align="stretch">
            <Box bg="blue.50" border="1px solid" borderColor="blue.200" borderRadius="lg" p={4}>
                <HStack spacing={2} mb={1}>
                    <FiFileText color="#3182CE" />
                    <Text fontWeight="600" color="blue.700">State Comptroller Filing Report</Text>
                </HStack>
                <Text fontSize="sm" color="blue.600">
                    Reporting Period: {data.reportingPeriod}
                </Text>
            </Box>

            <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
                <SummaryCard label="Gross Receipts" value={fmt(data.grossReceipts)} icon={<FiDollarSign />} color="green" />
                <SummaryCard label="Taxable Receipts" value={fmt(data.taxableReceipts)} icon={<FiDollarSign />} color="blue" />
                <SummaryCard label="Sales Tax Collected" value={fmt(data.salesTaxCollected)} icon={<FiDollarSign />} color="red" />
            </SimpleGrid>

            <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                <Flex justify="space-between" align="center" mb={4}>
                    <Text fontWeight="700">Comptroller Report Details</Text>
                    <Button size="sm" leftIcon={<FiDownload />} colorScheme="teal" variant="outline"
                        onClick={() => downloadCSV(exportData, 'comptroller_report.csv')}>
                        Export CSV
                    </Button>
                </Flex>
                <Table size="sm" variant="simple">
                    <Thead>
                        <Tr>
                            <Th>Field</Th>
                            <Th isNumeric>Value</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        <Tr><Td>Reporting Period</Td><Td isNumeric>{data.reportingPeriod}</Td></Tr>
                        <Tr><Td>Gross Receipts</Td><Td isNumeric>{fmt(data.grossReceipts)}</Td></Tr>
                        <Tr><Td>Exempt Sales</Td><Td isNumeric>{fmt(data.exemptSales)}</Td></Tr>
                        <Tr><Td>Taxable Receipts</Td><Td isNumeric>{fmt(data.taxableReceipts)}</Td></Tr>
                        <Tr><Td>Tax Rate</Td><Td isNumeric>{pct(data.taxRate)}</Td></Tr>
                        <Tr fontWeight="bold"><Td>Sales Tax Collected</Td><Td isNumeric color="red.500">{fmt(data.salesTaxCollected)}</Td></Tr>
                        <Tr><Td>Total Orders</Td><Td isNumeric>{data.totalOrders}</Td></Tr>
                    </Tbody>
                </Table>
            </Box>
        </VStack>
    );
}

/* ─── Expenses Tab ─── */
function ExpensesPanel({ data, loading, laundryId, headers, onRefresh }) {
    const { isOpen, onOpen, onClose } = useDisclosure();
    const todayStr = new Date().toISOString().split('T')[0];
    const [newExpense, setNewExpense] = useState({ category: '', amount: '', expenseDate: todayStr, description: '' });
    const [categories, setCategories] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [isCustomCategory, setIsCustomCategory] = useState(false);
    const [customCategory, setCustomCategory] = useState('');
    const toast = useToast();
    const baseUrl = process.env.REACT_APP_AWS_API_URL;

    useEffect(() => {
        if (laundryId) {
            axios.get(`${baseUrl}/api/admin/financial-reports/expense-categories`, { params: { laundryId }, headers })
                .then(res => { if (res.data.status === 'success') setCategories(res.data.data.categories); })
                .catch(() => {});
        }
    }, [laundryId]);

    const handleAdd = async () => {
        const category = isCustomCategory ? customCategory.trim() : newExpense.category;
        if (!category || !newExpense.amount || parseFloat(newExpense.amount) <= 0) {
            toast({ title: 'Enter category and amount', status: 'warning', duration: 2000 });
            return;
        }
        setSubmitting(true);
        try {
            await axios.post(`${baseUrl}/api/admin/financial-reports/expenses?laundryId=${laundryId}`, {
                category: category,
                amount: parseFloat(newExpense.amount),
                expenseDate: newExpense.expenseDate || todayStr,
                description: newExpense.description,
            }, { headers });
            toast({ title: 'Expense added', status: 'success', duration: 2000 });
            setNewExpense({ category: '', amount: '', expenseDate: todayStr, description: '' });
            setIsCustomCategory(false);
            setCustomCategory('');
            onClose();
            onRefresh();
            // Refresh categories list
            axios.get(`${baseUrl}/api/admin/financial-reports/expense-categories`, { params: { laundryId }, headers })
                .then(res => { if (res.data.status === 'success') setCategories(res.data.data.categories); })
                .catch(() => {});
        } catch (err) {
            toast({ title: 'Failed to add expense', status: 'error', duration: 2000 });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (expenseId) => {
        if (!window.confirm('Delete this expense?')) return;
        try {
            await axios.delete(`${baseUrl}/api/admin/financial-reports/expenses`, { params: { laundryId, expenseId }, headers });
            toast({ title: 'Expense deleted', status: 'success', duration: 2000 });
            onRefresh();
        } catch (err) {
            toast({ title: 'Failed to delete', status: 'error', duration: 2000 });
        }
    };

    if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;
    if (!data) return <Text color="gray.400" py={10} textAlign="center">Select a date range and click Apply</Text>;

    const exportData = (data.expenses || []).map(exp => ({
        'Date': exp.expenseDate,
        'Category': exp.category,
        'Amount': exp.amount,
        'Description': exp.description,
    }));

    return (
        <VStack spacing={6} align="stretch">
            {/* Summary Cards */}
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                <SummaryCard label="Total Expenses" value={fmt(data.totalExpenses)} icon={<FiDollarSign />} color="red" />
                {(data.summary || []).slice(0, 3).map((s, i) => (
                    <SummaryCard key={i} label={s.category} value={fmt(s.total)} icon={<FiPieChart />}
                        color={['orange', 'purple', 'teal'][i]} />
                ))}
            </SimpleGrid>

            {/* Category Breakdown */}
            {data.summary && data.summary.length > 0 && (
                <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                    <Text fontWeight="700" mb={3}>Expenses by Category</Text>
                    <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3}>
                        {data.summary.map((s, i) => (
                            <Box key={i} p={3} bg="gray.50" borderRadius="lg" border="1px solid" borderColor="gray.100">
                                <Text fontSize="sm" fontWeight="600">{s.category}</Text>
                                <Text fontSize="lg" fontWeight="700" color="red.500">${fmt(s.total)}</Text>
                                <Text fontSize="xs" color="gray.400">{s.count} entries</Text>
                            </Box>
                        ))}
                    </SimpleGrid>
                </Box>
            )}

            {/* Expense List */}
            <Box bg="white" p={5} borderRadius="xl" boxShadow="sm">
                <Flex justify="space-between" align="center" mb={4}>
                    <Text fontWeight="700">Expense Entries</Text>
                    <HStack>
                        <Button size="sm" leftIcon={<FiDownload />} colorScheme="teal" variant="outline"
                            onClick={() => downloadCSV(exportData, 'expenses_report.csv')}
                            isDisabled={!data.expenses || data.expenses.length === 0}>
                            Export CSV
                        </Button>
                        <Button size="sm" leftIcon={<FiPlus />} colorScheme="blue" onClick={onOpen}>
                            Add Expense
                        </Button>
                    </HStack>
                </Flex>
                <Table size="sm" variant="simple">
                    <Thead>
                        <Tr>
                            <Th>Date</Th>
                            <Th>Category</Th>
                            <Th isNumeric>Amount</Th>
                            <Th>Description</Th>
                            <Th w="40px"></Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        {(data.expenses || []).map((exp) => (
                            <Tr key={exp.expenseId}>
                                <Td fontSize="sm">{exp.expenseDate}</Td>
                                <Td fontSize="sm"><Badge colorScheme="orange" variant="subtle">{exp.category}</Badge></Td>
                                <Td isNumeric fontSize="sm" color="red.500" fontWeight="600">${fmt(exp.amount)}</Td>
                                <Td fontSize="sm" color="gray.600" maxW="200px" isTruncated>{exp.description}</Td>
                                <Td>
                                    <IconButton icon={<FiTrash2 />} size="xs" variant="ghost" colorScheme="red"
                                        onClick={() => handleDelete(exp.expenseId)} aria-label="Delete" />
                                </Td>
                            </Tr>
                        ))}
                        {(!data.expenses || data.expenses.length === 0) && (
                            <Tr><Td colSpan={5}><Text fontSize="sm" color="gray.400" textAlign="center">No expenses recorded for this period</Text></Td></Tr>
                        )}
                    </Tbody>
                </Table>
            </Box>

            {/* Add Expense Modal */}
            <Modal isOpen={isOpen} onClose={onClose} size="md">
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Add Expense</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <VStack spacing={4}>
                            <FormControl isRequired>
                                <FormLabel fontSize="sm">Category</FormLabel>
                                {isCustomCategory ? (
                                    <HStack>
                                        <Input size="sm" placeholder="Enter new category name" value={customCategory}
                                            onChange={(e) => setCustomCategory(e.target.value)} autoFocus />
                                        <Button size="sm" variant="ghost" onClick={() => { setIsCustomCategory(false); setCustomCategory(''); }}>
                                            Cancel
                                        </Button>
                                    </HStack>
                                ) : (
                                    <Select placeholder="Select category" size="sm" value={newExpense.category}
                                        onChange={(e) => {
                                            if (e.target.value === '__new__') {
                                                setIsCustomCategory(true);
                                                setNewExpense({ ...newExpense, category: '' });
                                            } else {
                                                setNewExpense({ ...newExpense, category: e.target.value });
                                            }
                                        }}>
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        <option value="__new__">+ Add New Category</option>
                                    </Select>
                                )}
                            </FormControl>
                            <FormControl isRequired>
                                <FormLabel fontSize="sm">Amount ($)</FormLabel>
                                <NumberInput min={0.01} precision={2} size="sm">
                                    <NumberInputField placeholder="0.00" value={newExpense.amount}
                                        onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} />
                                </NumberInput>
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="sm">Date</FormLabel>
                                <Input type="date" size="sm" value={newExpense.expenseDate}
                                    onChange={(e) => setNewExpense({ ...newExpense, expenseDate: e.target.value })} />
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="sm">Description (optional)</FormLabel>
                                <Textarea size="sm" placeholder="e.g. 5 gallons Tide detergent" rows={2}
                                    value={newExpense.description}
                                    onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })} />
                            </FormControl>
                        </VStack>
                    </ModalBody>
                    <ModalFooter>
                        <Button size="sm" mr={3} onClick={onClose}>Cancel</Button>
                        <Button size="sm" colorScheme="blue" onClick={handleAdd} isLoading={submitting}>Add Expense</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </VStack>
    );
}

/* ─── Main Reports Page ─── */
export default function ReportsPage({ laundryId }) {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [preset, setPreset] = useState('thisMonth');
    const [tabIndex, setTabIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const toast = useToast();

    // Report data
    const [salesTaxData, setSalesTaxData] = useState(null);
    const [tipsData, setTipsData] = useState(null);
    const [revenueData, setRevenueData] = useState(null);
    const [comptrollerData, setComptrollerData] = useState(null);
    const [expensesData, setExpensesData] = useState(null);

    const authToken = localStorage.getItem('idToken');
    const headers = useMemo(() => ({ Authorization: `Bearer ${authToken}` }), [authToken]);

    // Apply preset on mount and auto-fetch
    useEffect(() => {
        if (!startDate && !endDate) {
            const dates = getPresetDates('thisMonth');
            setStartDate(dates.start);
            setEndDate(dates.end);
        }
    }, []);

    const handlePresetChange = (value) => {
        setPreset(value);
        if (value !== 'custom') {
            const dates = getPresetDates(value);
            setStartDate(dates.start);
            setEndDate(dates.end);
        }
    };

    const fetchReports = async (overrideStart, overrideEnd) => {
        const sd = overrideStart || startDate;
        const ed = overrideEnd || endDate;
        if (!sd || !ed) {
            toast({ title: 'Please select a date range', status: 'warning', duration: 2000 });
            return;
        }
        setLoading(true);
        console.log('[REPORTS] Fetching reports:', { laundryId, startDate: sd, endDate: ed, baseUrl: process.env.REACT_APP_AWS_API_URL });
        try {
            const params = { laundryId, startDate: sd, endDate: ed };
            const baseUrl = process.env.REACT_APP_AWS_API_URL;

            const [taxRes, tipsRes, revRes, compRes, expRes] = await Promise.all([
                axios.get(`${baseUrl}/api/admin/financial-reports/sales-tax`, { params, headers }),
                axios.get(`${baseUrl}/api/admin/financial-reports/tips`, { params, headers }),
                axios.get(`${baseUrl}/api/admin/financial-reports/revenue-summary`, { params, headers }),
                axios.get(`${baseUrl}/api/admin/financial-reports/comptroller`, { params, headers }),
                axios.get(`${baseUrl}/api/admin/financial-reports/expenses`, { params, headers }),
            ]);

            console.log('[REPORTS] API responses:', { tax: taxRes.data, tips: tipsRes.data, rev: revRes.data, comp: compRes.data, exp: expRes.data });

            if (taxRes.data.status === 'success') setSalesTaxData(taxRes.data.data);
            if (tipsRes.data.status === 'success') setTipsData(tipsRes.data.data);
            if (revRes.data.status === 'success') setRevenueData(revRes.data.data);
            if (compRes.data.status === 'success') setComptrollerData(compRes.data.data);
            if (expRes.data.status === 'success') setExpensesData(expRes.data.data);
        } catch (err) {
            console.error('[REPORTS] Error:', err.response?.status, err.response?.data, err.message);
            toast({ title: 'Failed to load reports', description: err.message, status: 'error', duration: 3000 });
        } finally {
            setLoading(false);
        }
    };

    // Auto-fetch when dates change
    useEffect(() => {
        if (startDate && endDate && laundryId) {
            fetchReports(startDate, endDate);
        }
    }, [startDate, endDate, laundryId]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Box p={{ base: 3, md: 6 }}>
            {/* Header */}
            <Flex justify="space-between" align="center" mb={4} flexWrap="wrap" gap={3}>
                <Heading size="lg">Financial Reports</Heading>
            </Flex>

            {/* Date Range Controls */}
            <Box bg="white" p={4} borderRadius="xl" boxShadow="sm" mb={6} border="1px solid" borderColor="gray.100">
                <HStack spacing={3} flexWrap="wrap" align="flex-end">
                    <Box>
                        <Text fontSize="xs" color="gray.500" mb={1}>Quick Preset</Text>
                        <Select size="sm" value={preset} onChange={(e) => handlePresetChange(e.target.value)} maxW="160px" bg="white">
                            <option value="thisMonth">This Month</option>
                            <option value="lastMonth">Last Month</option>
                            <option value="thisQuarter">This Quarter</option>
                            <option value="lastQuarter">Last Quarter</option>
                            <option value="thisYear">This Year</option>
                            <option value="custom">Custom Range</option>
                        </Select>
                    </Box>
                    <Box>
                        <Text fontSize="xs" color="gray.500" mb={1}>Start Date</Text>
                        <Input
                            type="date"
                            size="sm"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setPreset('custom'); }}
                            maxW="160px"
                            bg="white"
                        />
                    </Box>
                    <Box>
                        <Text fontSize="xs" color="gray.500" mb={1}>End Date</Text>
                        <Input
                            type="date"
                            size="sm"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setPreset('custom'); }}
                            maxW="160px"
                            bg="white"
                        />
                    </Box>
                    <Button size="sm" colorScheme="blue" onClick={() => fetchReports(startDate, endDate)} isDisabled={!startDate || !endDate}>
                        Apply
                    </Button>
                </HStack>
            </Box>

            {/* Report Tabs */}
            <Tabs index={tabIndex} onChange={setTabIndex} variant="enclosed" colorScheme="blue">
                <TabList bg="white" borderRadius="xl" boxShadow="sm" p={1} border="1px solid" borderColor="gray.100">
                    <Tab fontSize="sm" fontWeight="500">Sales Tax</Tab>
                    <Tab fontSize="sm" fontWeight="500">Tips</Tab>
                    <Tab fontSize="sm" fontWeight="500">Revenue</Tab>
                    <Tab fontSize="sm" fontWeight="500">Expenses</Tab>
                    <Tab fontSize="sm" fontWeight="500">State Comptroller</Tab>
                </TabList>

                <TabPanels mt={4}>
                    <TabPanel p={0}>
                        <SalesTaxPanel data={salesTaxData} loading={loading} />
                    </TabPanel>
                    <TabPanel p={0}>
                        <TipsPanel data={tipsData} loading={loading} />
                    </TabPanel>
                    <TabPanel p={0}>
                        <RevenuePanel data={revenueData} loading={loading} />
                    </TabPanel>
                    <TabPanel p={0}>
                        <ExpensesPanel data={expensesData} loading={loading} laundryId={laundryId}
                            headers={headers} onRefresh={() => fetchReports(startDate, endDate)} />
                    </TabPanel>
                    <TabPanel p={0}>
                        <ComptrollerPanel data={comptrollerData} loading={loading} />
                    </TabPanel>
                </TabPanels>
            </Tabs>
        </Box>
    );
}
