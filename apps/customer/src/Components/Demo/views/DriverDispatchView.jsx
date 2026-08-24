import React, { useState, useMemo } from 'react';
import {
  Box,
  Heading,
  Text,
  Badge,
  VStack,
  HStack,
  SimpleGrid,
  Collapse,
  Divider,
  useColorModeValue,
} from '@chakra-ui/react';
import { getDemoData, getCustomerById } from '../demoMockData';

const STATUS_COLORS = {
  active: 'green',
  en_route: 'yellow',
  available: 'gray',
};

const STATUS_LABELS = {
  active: 'Active',
  en_route: 'En Route',
  available: 'Available',
};

/**
 * DriverDispatchView
 *
 * Displays an interactive driver dispatch panel showing drivers with
 * color-coded status badges, delivery assignments, a simplified visual
 * route representation, and clickable assignment details.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
const DriverDispatchView = () => {
  const { drivers, assignments } = getDemoData('driverDispatch');
  const [selectedDriverId, setSelectedDriverId] = useState(drivers[0]?.id || null);
  const [expandedAssignmentId, setExpandedAssignmentId] = useState(null);

  const cardBg = useColorModeValue('gray.50', 'gray.700');
  const routeBg = useColorModeValue('gray.100', 'gray.600');

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === selectedDriverId),
    [drivers, selectedDriverId]
  );

  const driverAssignments = useMemo(
    () => assignments.filter((a) => a.driverId === selectedDriverId),
    [assignments, selectedDriverId]
  );

  const handleDriverClick = (driverId) => {
    setSelectedDriverId(driverId);
    setExpandedAssignmentId(null);
  };

  const handleAssignmentClick = (assignmentId) => {
    setExpandedAssignmentId((prev) => (prev === assignmentId ? null : assignmentId));
  };

  return (
    <Box>
      <Heading size="md" mb={4}>
        Driver Dispatch & Logistics
      </Heading>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        {/* Driver List Panel */}
        <Box>
          <Text fontWeight="bold" fontSize="sm" mb={3}>
            Drivers
          </Text>
          <VStack align="stretch" spacing={2}>
            {drivers.map((driver) => (
              <Box
                key={driver.id}
                p={3}
                borderRadius="md"
                borderWidth="1px"
                borderColor={selectedDriverId === driver.id ? driver.color : 'gray.200'}
                bg={selectedDriverId === driver.id ? `${cardBg}` : 'white'}
                cursor="pointer"
                onClick={() => handleDriverClick(driver.id)}
                _hover={{ borderColor: driver.color }}
                transition="border-color 0.2s"
                role="button"
                aria-pressed={selectedDriverId === driver.id}
                aria-label={`Select driver ${driver.name}`}
              >
                <HStack justify="space-between">
                  <HStack spacing={2}>
                    <Box w={3} h={3} borderRadius="full" bg={driver.color} />
                    <Text fontWeight="medium" fontSize="sm">
                      {driver.name}
                    </Text>
                  </HStack>
                  <Badge colorScheme={STATUS_COLORS[driver.status]} fontSize="xs">
                    {STATUS_LABELS[driver.status]}
                  </Badge>
                </HStack>
                <Text fontSize="xs" color="gray.500" mt={1}>
                  {driver.assignmentCount} assignment{driver.assignmentCount !== 1 ? 's' : ''}
                </Text>
              </Box>
            ))}
          </VStack>
        </Box>

        {/* Route Visualization (Simplified) */}
        <Box>
          <Text fontWeight="bold" fontSize="sm" mb={3}>
            Route Map
          </Text>
          <Box
            bg={routeBg}
            borderRadius="md"
            p={4}
            minH="250px"
            position="relative"
            borderWidth="1px"
            borderColor="gray.200"
          >
            {selectedDriver && driverAssignments.length > 0 ? (
              <VStack spacing={0} align="stretch" h="100%" justify="center">
                {driverAssignments.map((assignment, idx) => (
                  <React.Fragment key={assignment.id}>
                    {/* Pickup Stop */}
                    <HStack spacing={3} py={2}>
                      <Box position="relative">
                        <Box
                          w={4}
                          h={4}
                          borderRadius="full"
                          bg={selectedDriver.color}
                          border="2px solid"
                          borderColor="white"
                          boxShadow="sm"
                        />
                      </Box>
                      <VStack align="start" spacing={0}>
                        <Text fontSize="xs" fontWeight="bold" color={selectedDriver.color}>
                          Pickup #{idx + 1}
                        </Text>
                        <Text fontSize="xs" color="gray.600" noOfLines={1}>
                          {assignment.pickupAddress}
                        </Text>
                      </VStack>
                    </HStack>

                    {/* Connecting Line */}
                    <Box ml="7px" borderLeft="2px dashed" borderColor={selectedDriver.color} h="20px" />

                    {/* Delivery Stop */}
                    <HStack spacing={3} py={2}>
                      <Box position="relative">
                        <Box
                          w={4}
                          h={4}
                          borderRadius="md"
                          bg="white"
                          border="2px solid"
                          borderColor={selectedDriver.color}
                          boxShadow="sm"
                        />
                      </Box>
                      <VStack align="start" spacing={0}>
                        <Text fontSize="xs" fontWeight="bold" color="gray.700">
                          Delivery #{idx + 1}
                        </Text>
                        <Text fontSize="xs" color="gray.600" noOfLines={1}>
                          {assignment.deliveryAddress}
                        </Text>
                      </VStack>
                    </HStack>

                    {/* Separator between assignments */}
                    {idx < driverAssignments.length - 1 && (
                      <Box ml="7px" borderLeft="2px dotted" borderColor="gray.400" h="16px" />
                    )}
                  </React.Fragment>
                ))}
              </VStack>
            ) : (
              <VStack justify="center" h="100%" minH="200px">
                <Text fontSize="sm" color="gray.500" textAlign="center">
                  {selectedDriver
                    ? 'No assignments for this driver'
                    : 'Select a driver to view route'}
                </Text>
              </VStack>
            )}
          </Box>
        </Box>

        {/* Assignment List */}
        <Box>
          <Text fontWeight="bold" fontSize="sm" mb={3}>
            Assignments{' '}
            {selectedDriver && (
              <Badge ml={1} colorScheme="blue" fontSize="xs">
                {driverAssignments.length}
              </Badge>
            )}
          </Text>
          <VStack align="stretch" spacing={2}>
            {driverAssignments.length > 0 ? (
              driverAssignments.map((assignment) => {
                const isExpanded = expandedAssignmentId === assignment.id;
                const customer = getCustomerById(assignment.customerId);

                return (
                  <Box
                    key={assignment.id}
                    borderWidth="1px"
                    borderRadius="md"
                    overflow="hidden"
                  >
                    <Box
                      p={3}
                      cursor="pointer"
                      onClick={() => handleAssignmentClick(assignment.id)}
                      _hover={{ bg: 'blue.50' }}
                      bg={isExpanded ? 'blue.50' : 'white'}
                      role="button"
                      aria-expanded={isExpanded}
                      aria-label={`Assignment ${assignment.id} details`}
                    >
                      <Text fontWeight="medium" fontSize="sm">
                        {customer ? customer.name : 'Unknown Customer'}
                      </Text>
                      <Text fontSize="xs" color="gray.500" mt={1}>
                        {assignment.timeWindow}
                      </Text>
                      <HStack mt={1} spacing={1}>
                        <Text fontSize="xs" color="gray.600" noOfLines={1}>
                          {assignment.pickupAddress}
                        </Text>
                        <Text fontSize="xs" color="gray.400">→</Text>
                        <Text fontSize="xs" color="gray.600" noOfLines={1}>
                          {assignment.deliveryAddress}
                        </Text>
                      </HStack>
                    </Box>

                    {/* Detail Panel */}
                    <Collapse in={isExpanded} animateOpacity>
                      <Box p={3} bg={cardBg} borderTop="1px solid" borderColor="gray.200">
                        <VStack align="stretch" spacing={2}>
                          <Box>
                            <Text fontSize="xs" fontWeight="bold" color="gray.500">
                              Customer Info
                            </Text>
                            {customer && (
                              <VStack align="stretch" spacing={0} mt={1}>
                                <Text fontSize="sm">{customer.name}</Text>
                                <Text fontSize="xs" color="gray.600">
                                  {customer.phone}
                                </Text>
                                <Text fontSize="xs" color="gray.600">
                                  {customer.email}
                                </Text>
                              </VStack>
                            )}
                          </Box>
                          <Divider />
                          <Box>
                            <Text fontSize="xs" fontWeight="bold" color="gray.500">
                              Order Contents
                            </Text>
                            <Text fontSize="sm" mt={1}>
                              {assignment.orderContents}
                            </Text>
                          </Box>
                          <Divider />
                          <Box>
                            <Text fontSize="xs" fontWeight="bold" color="gray.500">
                              Pickup
                            </Text>
                            <Text fontSize="sm">{assignment.pickupAddress}</Text>
                          </Box>
                          <Box>
                            <Text fontSize="xs" fontWeight="bold" color="gray.500">
                              Delivery
                            </Text>
                            <Text fontSize="sm">{assignment.deliveryAddress}</Text>
                          </Box>
                        </VStack>
                      </Box>
                    </Collapse>
                  </Box>
                );
              })
            ) : (
              <Text fontSize="sm" color="gray.500">
                No assignments for this driver
              </Text>
            )}
          </VStack>
        </Box>
      </SimpleGrid>

      {/* Noscript block for SEO/crawlers */}
      <noscript>
        <section>
          <h2>Driver Dispatch & Logistics</h2>
          <p>
            The Smart Laundry Basket driver dispatch system provides real-time visibility into
            your delivery fleet. View driver statuses (active, en route, available), manage
            delivery assignments, and track routes visually. Each assignment includes pickup and
            delivery addresses, time windows, and order contents. Expand assignments to view
            full customer contact details and order information.
          </p>
          <ul>
            <li>Real-time driver status indicators with color-coded badges</li>
            <li>Visual route representation with pickup and delivery stops</li>
            <li>Clickable assignments revealing customer info and order contents</li>
            <li>Support for multiple drivers with varying assignment loads</li>
            <li>Time window tracking for each pickup and delivery</li>
          </ul>
        </section>
      </noscript>
    </Box>
  );
};

export default DriverDispatchView;
