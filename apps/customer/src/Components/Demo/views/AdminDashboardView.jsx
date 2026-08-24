import React, { useState, useMemo } from 'react';
import {
  Box,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Button,
  ButtonGroup,
  Heading,
  Text,
  Collapse,
  VStack,
  HStack,
  Divider,
  useColorModeValue,
} from '@chakra-ui/react';
import { format } from 'date-fns';
import { getDemoData, getCustomerById } from '../demoMockData';
import DemoHint from '../DemoHint';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending_pickup', label: 'Pending Pickup' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'ready_delivery', label: 'Ready for Delivery' },
  { value: 'completed', label: 'Completed' },
];

const STATUS_COLORS = {
  pending_pickup: 'orange',
  in_progress: 'blue',
  ready_delivery: 'purple',
  completed: 'green',
};

const STATUS_LABELS = {
  pending_pickup: 'Pending Pickup',
  in_progress: 'In Progress',
  ready_delivery: 'Ready for Delivery',
  completed: 'Completed',
};

/**
 * AdminDashboardView
 *
 * Displays an interactive admin dashboard with summary statistics,
 * filterable order list table, and expandable order details.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
const AdminDashboardView = () => {
  const { orders, summary } = getDemoData('adminDashboard');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  const cardBg = useColorModeValue('gray.50', 'gray.700');

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders;
    return orders.filter((order) => order.status === statusFilter);
  }, [orders, statusFilter]);

  const handleRowClick = (orderId) => {
    setExpandedOrderId((prev) => (prev === orderId ? null : orderId));
  };

  const formatCurrency = (amount) => `$${amount.toFixed(2)}`;

  const formatDate = (date) => {
    try {
      return format(new Date(date), 'MMM d, yyyy h:mm a');
    } catch {
      return 'N/A';
    }
  };

  return (
    <Box>
      {/* Summary Cards */}
      <Heading size="md" mb={4}>
        Order Management Dashboard
      </Heading>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
        <Box bg={cardBg} p={4} borderRadius="md" borderWidth="1px">
          <Stat>
            <StatLabel>Total Orders</StatLabel>
            <StatNumber>{summary.totalOrders}</StatNumber>
            <StatHelpText>This month</StatHelpText>
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="md" borderWidth="1px">
          <Stat>
            <StatLabel>Monthly Revenue</StatLabel>
            <StatNumber>{formatCurrency(summary.monthlyRevenue)}</StatNumber>
            <StatHelpText>Current period</StatHelpText>
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="md" borderWidth="1px">
          <Stat>
            <StatLabel>Average Order Value</StatLabel>
            <StatNumber>{formatCurrency(summary.averageOrderValue)}</StatNumber>
            <StatHelpText>Per order</StatHelpText>
          </Stat>
        </Box>
      </SimpleGrid>

      {/* Status Filter */}
      <Box mb={4}>
        <Text fontSize="sm" fontWeight="medium" mb={2}>
          Filter by Status:
          <DemoHint text="👆 Click to filter" />
        </Text>
        <ButtonGroup size="sm" isAttached variant="outline" flexWrap="wrap" spacing={0}>
          {STATUS_OPTIONS.map((option) => (
            <Button
              key={option.value}
              colorScheme={statusFilter === option.value ? 'blue' : 'gray'}
              variant={statusFilter === option.value ? 'solid' : 'outline'}
              onClick={() => setStatusFilter(option.value)}
              aria-pressed={statusFilter === option.value}
            >
              {option.label}
            </Button>
          ))}
        </ButtonGroup>
      </Box>

      {/* Orders Table */}
      <Box overflowX="auto" borderWidth="1px" borderRadius="md" position="relative">
        <DemoHint text="👆 Click any row to expand" position="absolute-top-right" />
        <Table variant="simple" size="sm">
          <Thead bg="gray.50">
            <Tr>
              <Th>Order ID</Th>
              <Th>Customer</Th>
              <Th>Status</Th>
              <Th>Service Type</Th>
              <Th isNumeric>Amount</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filteredOrders.map((order) => {
              const customer = getCustomerById(order.customerId);
              const isExpanded = expandedOrderId === order.id;

              return (
                <React.Fragment key={order.id}>
                  <Tr
                    onClick={() => handleRowClick(order.id)}
                    cursor="pointer"
                    _hover={{ bg: 'blue.50' }}
                    bg={isExpanded ? 'blue.50' : undefined}
                    role="row"
                    aria-expanded={isExpanded}
                  >
                    <Td fontWeight="medium">{order.id}</Td>
                    <Td>{customer ? customer.name : 'Unknown'}</Td>
                    <Td>
                      <Badge colorScheme={STATUS_COLORS[order.status] || 'gray'}>
                        {STATUS_LABELS[order.status] || order.status}
                      </Badge>
                    </Td>
                    <Td>{order.serviceType}</Td>
                    <Td isNumeric>{formatCurrency(order.amount)}</Td>
                  </Tr>
                  {/* Expandable Detail Row */}
                  <Tr>
                    <Td colSpan={5} p={0} borderBottom={isExpanded ? '1px solid' : 'none'} borderColor="gray.200">
                      <Collapse in={isExpanded} animateOpacity>
                        <Box p={4} bg="gray.50">
                          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                            {/* Item Breakdown */}
                            <Box>
                              <Text fontWeight="bold" fontSize="sm" mb={2}>
                                Item Breakdown
                              </Text>
                              <VStack align="stretch" spacing={1}>
                                {order.items.map((item, idx) => (
                                  <HStack key={idx} justify="space-between" fontSize="sm">
                                    <Text>
                                      {item.name} × {item.quantity}
                                    </Text>
                                    <Text>{formatCurrency(item.price)}</Text>
                                  </HStack>
                                ))}
                                <Divider />
                                <HStack justify="space-between" fontSize="sm" fontWeight="bold">
                                  <Text>Total</Text>
                                  <Text>{formatCurrency(order.amount)}</Text>
                                </HStack>
                              </VStack>
                            </Box>

                            {/* Timeline */}
                            <Box>
                              <Text fontWeight="bold" fontSize="sm" mb={2}>
                                Order Timeline
                              </Text>
                              <VStack align="stretch" spacing={2}>
                                {order.timeline.map((event, idx) => (
                                  <Box key={idx} fontSize="sm" pl={3} borderLeft="2px solid" borderColor="blue.300">
                                    <Text fontWeight="medium">{event.stage}</Text>
                                    <Text color="gray.500" fontSize="xs">
                                      {formatDate(event.timestamp)}
                                    </Text>
                                    <Text color="gray.600">{event.description}</Text>
                                  </Box>
                                ))}
                              </VStack>
                            </Box>
                          </SimpleGrid>
                        </Box>
                      </Collapse>
                    </Td>
                  </Tr>
                </React.Fragment>
              );
            })}
          </Tbody>
        </Table>
      </Box>

      {/* Noscript block for SEO/crawlers */}
      <noscript>
        <section>
          <h2>Admin Order Management Dashboard</h2>
          <p>
            The Smart Laundry Basket admin dashboard provides a complete overview of your laundry
            business operations. Track total orders, monthly revenue, and average order values at a
            glance. View and filter orders by status — Pending Pickup, In Progress, Ready for
            Delivery, and Completed. Drill into individual orders to see item breakdowns, pricing,
            and full order timelines from placement through delivery.
          </p>
          <ul>
            <li>Real-time order status tracking across all stages</li>
            <li>Revenue and performance summary cards</li>
            <li>Filterable order list by status</li>
            <li>Expandable order details with item breakdown and timeline</li>
            <li>Support for multiple service types: Wash &amp; Fold, Dry Cleaning, Press Only, and more</li>
          </ul>
        </section>
      </noscript>
    </Box>
  );
};

export default AdminDashboardView;
