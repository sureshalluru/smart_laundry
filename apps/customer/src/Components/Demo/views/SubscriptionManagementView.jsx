import React, { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  VStack,
  HStack,
  Badge,
  SimpleGrid,
  Collapse,
  useColorModeValue,
  Divider,
} from '@chakra-ui/react';
import { format } from 'date-fns';
import { getDemoData, getCustomerById } from '../demoMockData';

/**
 * SubscriptionManagementView
 *
 * Displays a list of recurring subscription schedules with customer name,
 * frequency, service type, and next pickup date. Includes a calendar/schedule
 * visualization for upcoming pickups and clickable entries showing full details
 * (history + upcoming dates).
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
const SubscriptionManagementView = () => {
  const { schedules } = getDemoData('subscriptions');
  const [expandedId, setExpandedId] = useState(null);

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const hoverBg = useColorModeValue('gray.50', 'gray.650');
  const calendarBg = useColorModeValue('blue.50', 'blue.900');
  const calendarBorder = useColorModeValue('blue.200', 'blue.600');
  const metadataBg = useColorModeValue('gray.50', 'gray.600');

  const frequencyColors = {
    weekly: 'green',
    'bi-weekly': 'purple',
    monthly: 'orange',
  };

  const toggleExpanded = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <Box>
      <Heading size="md" mb={2}>
        Subscription Management
      </Heading>
      <Text fontSize="sm" color="gray.500" mb={6}>
        Manage recurring pickup schedules for your customers. Click any subscription to view full history and upcoming dates.
      </Text>

      {/* Calendar Visualization — Upcoming Pickups */}
      <Box
        mb={6}
        p={4}
        borderWidth="1px"
        borderColor={calendarBorder}
        borderRadius="md"
        bg={calendarBg}
      >
        <Text fontWeight="bold" fontSize="sm" mb={3}>
          📅 Upcoming Pickups Schedule
        </Text>
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing={3}>
          {getUpcomingPickups(schedules).map((pickup, idx) => (
            <Box
              key={`pickup-${idx}`}
              p={3}
              bg={cardBg}
              borderRadius="md"
              borderWidth="1px"
              borderColor={borderColor}
              borderLeftWidth="3px"
              borderLeftColor={`${frequencyColors[pickup.frequency]}.400`}
            >
              <Text fontSize="xs" fontWeight="bold" color="gray.500">
                {formatDate(pickup.date, 'EEE, MMM d')}
              </Text>
              <Text fontSize="sm" fontWeight="medium" mt={1}>
                {pickup.customerName}
              </Text>
              <HStack mt={1} spacing={2}>
                <Badge size="sm" colorScheme={frequencyColors[pickup.frequency]} fontSize="2xs">
                  {pickup.frequency}
                </Badge>
                <Text fontSize="xs" color="gray.500">
                  {pickup.serviceType}
                </Text>
              </HStack>
            </Box>
          ))}
        </SimpleGrid>
      </Box>

      {/* Subscription List */}
      <VStack align="stretch" spacing={3}>
        {schedules.map((schedule) => {
          const customer = getCustomerById(schedule.customerId);
          const isExpanded = expandedId === schedule.id;

          return (
            <Box
              key={schedule.id}
              borderWidth="1px"
              borderColor={borderColor}
              borderRadius="md"
              bg={cardBg}
              overflow="hidden"
              transition="all 0.2s"
              _hover={{ shadow: 'sm', bg: hoverBg }}
            >
              {/* Subscription Summary Row (clickable) */}
              <Box
                p={4}
                cursor="pointer"
                onClick={() => toggleExpanded(schedule.id)}
                role="button"
                aria-expanded={isExpanded}
                aria-label={`View details for ${customer?.name || schedule.customerId} subscription`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpanded(schedule.id);
                  }
                }}
              >
                <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3} alignItems="center">
                  {/* Customer Name */}
                  <Box>
                    <Text fontSize="xs" color="gray.500" fontWeight="bold">
                      Customer
                    </Text>
                    <Text fontWeight="medium" fontSize="sm">
                      {customer?.name || schedule.customerId}
                    </Text>
                  </Box>

                  {/* Frequency */}
                  <Box>
                    <Text fontSize="xs" color="gray.500" fontWeight="bold">
                      Frequency
                    </Text>
                    <Badge
                      colorScheme={frequencyColors[schedule.frequency]}
                      fontSize="xs"
                      mt={1}
                    >
                      {schedule.frequency}
                    </Badge>
                  </Box>

                  {/* Service Type */}
                  <Box>
                    <Text fontSize="xs" color="gray.500" fontWeight="bold">
                      Service
                    </Text>
                    <Text fontSize="sm">{schedule.serviceType}</Text>
                  </Box>

                  {/* Next Pickup Date */}
                  <Box>
                    <Text fontSize="xs" color="gray.500" fontWeight="bold">
                      Next Pickup
                    </Text>
                    <Text fontSize="sm" fontWeight="medium" color="blue.600">
                      {formatDate(schedule.nextPickupDate, 'EEE, MMM d')}
                    </Text>
                  </Box>
                </SimpleGrid>

                {/* Expand indicator */}
                <Text
                  fontSize="xs"
                  color="blue.500"
                  mt={2}
                  textAlign="right"
                >
                  {isExpanded ? '▲ Hide details' : '▼ Show details'}
                </Text>
              </Box>

              {/* Expanded Details */}
              <Collapse in={isExpanded} animateOpacity>
                <Box px={4} pb={4}>
                  <Divider mb={3} />
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                    {/* History */}
                    <Box>
                      <Text fontWeight="bold" fontSize="sm" mb={2} color="gray.600">
                        📋 Pickup History
                      </Text>
                      <VStack align="stretch" spacing={1}>
                        {schedule.history.length > 0 ? (
                          schedule.history.map((date, idx) => (
                            <HStack key={`hist-${idx}`} spacing={2}>
                              <Box w={2} h={2} borderRadius="full" bg="gray.400" />
                              <Text fontSize="sm">
                                {formatDate(date, 'EEEE, MMM d, yyyy')}
                              </Text>
                            </HStack>
                          ))
                        ) : (
                          <Text fontSize="sm" color="gray.400">
                            No history yet
                          </Text>
                        )}
                      </VStack>
                    </Box>

                    {/* Upcoming */}
                    <Box>
                      <Text fontWeight="bold" fontSize="sm" mb={2} color="gray.600">
                        📅 Upcoming Dates
                      </Text>
                      <VStack align="stretch" spacing={1}>
                        {schedule.upcomingDates.length > 0 ? (
                          schedule.upcomingDates.map((date, idx) => (
                            <HStack key={`upcoming-${idx}`} spacing={2}>
                              <Box w={2} h={2} borderRadius="full" bg="blue.400" />
                              <Text fontSize="sm" color="blue.700">
                                {formatDate(date, 'EEEE, MMM d, yyyy')}
                              </Text>
                            </HStack>
                          ))
                        ) : (
                          <Text fontSize="sm" color="gray.400">
                            No upcoming dates
                          </Text>
                        )}
                      </VStack>
                    </Box>
                  </SimpleGrid>

                  {/* Subscription Metadata */}
                  <Box mt={3} p={3} bg={metadataBg} borderRadius="md">
                    <HStack spacing={4} flexWrap="wrap">
                      <Text fontSize="xs" color="gray.500">
                        ID: {schedule.id}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        Total pickups: {schedule.history.length}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        Upcoming: {schedule.upcomingDates.length} scheduled
                      </Text>
                    </HStack>
                  </Box>
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </VStack>

      {/* Noscript block for SEO/crawlers */}
      <noscript>
        <section>
          <h2>Subscription Management</h2>
          <p>
            Smart Laundry Basket makes it easy to manage recurring laundry pickup schedules.
            Customers can subscribe for weekly, bi-weekly, or monthly service with automatic
            scheduling and reminders. The subscription management view shows upcoming pickups,
            pickup history, and full schedule details for each customer.
          </p>
          <ul>
            <li>Recurring pickup schedules with weekly, bi-weekly, and monthly frequencies</li>
            <li>Calendar visualization showing all upcoming pickups</li>
            <li>Full pickup history for each subscription</li>
            <li>Customer name, service type, and next pickup date at a glance</li>
            <li>Easy-to-manage subscription details with expandable entries</li>
          </ul>
        </section>
      </noscript>
    </Box>
  );
};

/**
 * Collects all upcoming pickups across schedules, sorted by date.
 * @param {Array} schedules
 * @returns {Array<{ date: Date, customerName: string, frequency: string, serviceType: string }>}
 */
function getUpcomingPickups(schedules) {
  const pickups = [];

  for (const schedule of schedules) {
    const customer = getCustomerById(schedule.customerId);
    for (const date of schedule.upcomingDates) {
      pickups.push({
        date,
        customerName: customer?.name || schedule.customerId,
        frequency: schedule.frequency,
        serviceType: schedule.serviceType,
      });
    }
  }

  pickups.sort((a, b) => new Date(a.date) - new Date(b.date));
  return pickups;
}

/**
 * Formats a date for display, with fallback for invalid dates.
 * @param {Date|string|number} date
 * @param {string} formatStr
 * @returns {string}
 */
function formatDate(date, formatStr) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    return format(d, formatStr);
  } catch {
    return '';
  }
}

export default SubscriptionManagementView;
