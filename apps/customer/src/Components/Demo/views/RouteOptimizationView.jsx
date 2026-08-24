import React, { useState, useMemo } from 'react';
import {
  Box,
  Heading,
  Text,
  Badge,
  VStack,
  HStack,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  useColorModeValue,
} from '@chakra-ui/react';
import { getDemoData, getCustomerById } from '../demoMockData';

/**
 * RouteOptimizationView
 *
 * Displays a multi-driver route optimization panel with:
 * - Simplified map visualization with color-coded stops
 * - Driver selection cards with color indicators
 * - Ordered stop list for selected driver (sequence, address, time window, type)
 * - Route statistics: total stops, estimated drive time, total distance
 * - Visual distinction between pickup (green arrow up) and delivery (blue arrow down) stops
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */
const RouteOptimizationView = () => {
  const { drivers, stops } = getDemoData('routeOptimization');
  const [selectedDriverId, setSelectedDriverId] = useState(drivers[0]?.id || null);

  const cardBg = useColorModeValue('gray.50', 'gray.700');
  const mapBg = useColorModeValue('gray.100', 'gray.600');

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === selectedDriverId),
    [drivers, selectedDriverId]
  );

  const handleDriverClick = (driverId) => {
    setSelectedDriverId(driverId);
  };

  return (
    <Box>
      <Heading size="md" mb={4}>
        Multi-Driver Route Optimization
      </Heading>

      {/* Route Statistics */}
      {selectedDriver && (
        <SimpleGrid columns={{ base: 3 }} spacing={4} mb={4}>
          <Stat bg={cardBg} p={3} borderRadius="md" borderWidth="1px">
            <StatLabel fontSize="xs">Total Stops</StatLabel>
            <StatNumber fontSize="lg" data-testid="stat-total-stops">
              {selectedDriver.stops.length}
            </StatNumber>
            <StatHelpText fontSize="xs">{selectedDriver.name}</StatHelpText>
          </Stat>
          <Stat bg={cardBg} p={3} borderRadius="md" borderWidth="1px">
            <StatLabel fontSize="xs">Est. Drive Time</StatLabel>
            <StatNumber fontSize="lg">{selectedDriver.estimatedTime}</StatNumber>
            <StatHelpText fontSize="xs">Optimized route</StatHelpText>
          </Stat>
          <Stat bg={cardBg} p={3} borderRadius="md" borderWidth="1px">
            <StatLabel fontSize="xs">Total Distance</StatLabel>
            <StatNumber fontSize="lg">{selectedDriver.totalDistance}</StatNumber>
            <StatHelpText fontSize="xs">Round trip</StatHelpText>
          </Stat>
        </SimpleGrid>
      )}

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        {/* Driver List Panel */}
        <Box>
          <Text fontWeight="bold" fontSize="sm" mb={3}>
            Drivers ({drivers.length})
          </Text>
          <VStack align="stretch" spacing={2}>
            {drivers.map((driver) => (
              <Box
                key={driver.id}
                p={3}
                borderRadius="md"
                borderWidth="2px"
                borderColor={selectedDriverId === driver.id ? driver.color : 'gray.200'}
                bg={selectedDriverId === driver.id ? cardBg : 'white'}
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
                  <Badge
                    bg={driver.color}
                    color="white"
                    fontSize="xs"
                    borderRadius="full"
                    px={2}
                  >
                    {driver.stops.length} stops
                  </Badge>
                </HStack>
                <HStack mt={2} spacing={3} fontSize="xs" color="gray.500">
                  <Text>{driver.totalDistance}</Text>
                  <Text>•</Text>
                  <Text>{driver.estimatedTime}</Text>
                </HStack>
              </Box>
            ))}
          </VStack>
        </Box>

        {/* Map Visualization (Simplified) */}
        <Box>
          <Text fontWeight="bold" fontSize="sm" mb={3}>
            Route Map
          </Text>
          <Box
            bg={mapBg}
            borderRadius="md"
            p={4}
            minH="300px"
            position="relative"
            borderWidth="1px"
            borderColor="gray.200"
            overflow="hidden"
          >
            {/* Grid lines for map feel */}
            <Box
              position="absolute"
              inset={0}
              opacity={0.15}
              bgImage="linear-gradient(gray 1px, transparent 1px), linear-gradient(90deg, gray 1px, transparent 1px)"
              bgSize="40px 40px"
            />

            {/* Render all stops as positioned dots */}
            {drivers.map((driver) => {
              const isSelected = driver.id === selectedDriverId;
              return driver.stops.map((stop) => {
                // Normalize lat/lng to percentage position within map
                const top = ((30.29 - stop.lat) / 0.05) * 100;
                const left = ((stop.lng + 97.77) / 0.05) * 100;
                const clampedTop = Math.max(5, Math.min(90, top));
                const clampedLeft = Math.max(5, Math.min(90, left));

                return (
                  <Box
                    key={`${driver.id}-${stop.sequence}`}
                    position="absolute"
                    top={`${clampedTop}%`}
                    left={`${clampedLeft}%`}
                    transform="translate(-50%, -50%)"
                    transition="all 0.3s"
                    zIndex={isSelected ? 2 : 1}
                  >
                    <Box
                      w={isSelected ? 5 : 3}
                      h={isSelected ? 5 : 3}
                      borderRadius={stop.type === 'pickup' ? 'full' : 'sm'}
                      bg={isSelected ? driver.color : `${driver.color}60`}
                      border="2px solid"
                      borderColor={isSelected ? 'white' : 'transparent'}
                      boxShadow={isSelected ? 'md' : 'none'}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      {isSelected && (
                        <Text fontSize="8px" color="white" fontWeight="bold">
                          {stop.sequence}
                        </Text>
                      )}
                    </Box>
                    {isSelected && (
                      <Text
                        fontSize="8px"
                        color="gray.700"
                        textAlign="center"
                        mt="1px"
                        whiteSpace="nowrap"
                        fontWeight="bold"
                      >
                        {stop.type === 'pickup' ? '↑P' : '↓D'}
                      </Text>
                    )}
                  </Box>
                );
              });
            })}

            {/* Legend */}
            <Box position="absolute" bottom={2} right={2} bg="white" p={2} borderRadius="md" boxShadow="sm">
              <VStack align="start" spacing={1}>
                <HStack spacing={1}>
                  <Box w={2} h={2} borderRadius="full" bg="gray.500" />
                  <Text fontSize="8px">Pickup</Text>
                </HStack>
                <HStack spacing={1}>
                  <Box w={2} h={2} borderRadius="sm" bg="gray.500" />
                  <Text fontSize="8px">Delivery</Text>
                </HStack>
              </VStack>
            </Box>
          </Box>
        </Box>

        {/* Stop List for Selected Driver */}
        <Box>
          <Text fontWeight="bold" fontSize="sm" mb={3}>
            Stop Sequence{' '}
            {selectedDriver && (
              <Badge ml={1} colorScheme="blue" fontSize="xs">
                {selectedDriver.stops.length}
              </Badge>
            )}
          </Text>
          <VStack align="stretch" spacing={2}>
            {selectedDriver && selectedDriver.stops.length > 0 ? (
              selectedDriver.stops.map((stop) => {
                const customer = getCustomerById(stop.customerId);
                const isPickup = stop.type === 'pickup';

                return (
                  <Box
                    key={`${selectedDriver.id}-stop-${stop.sequence}`}
                    p={3}
                    borderWidth="1px"
                    borderRadius="md"
                    borderLeftWidth="3px"
                    borderLeftColor={selectedDriver.color}
                    bg="white"
                  >
                    <HStack justify="space-between" align="start">
                      <HStack spacing={2} align="start">
                        {/* Sequence Number */}
                        <Box
                          w={6}
                          h={6}
                          borderRadius="full"
                          bg={selectedDriver.color}
                          color="white"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          flexShrink={0}
                        >
                          <Text fontSize="xs" fontWeight="bold">
                            {stop.sequence}
                          </Text>
                        </Box>
                        <VStack align="start" spacing={0}>
                          <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
                            {stop.address}
                          </Text>
                          <Text fontSize="xs" color="gray.500">
                            {stop.timeWindow}
                          </Text>
                          {customer && (
                            <Text fontSize="xs" color="gray.400">
                              {customer.name}
                            </Text>
                          )}
                        </VStack>
                      </HStack>
                      {/* Type Badge */}
                      <Badge
                        colorScheme={isPickup ? 'green' : 'blue'}
                        fontSize="xs"
                        flexShrink={0}
                      >
                        {isPickup ? '↑ Pickup' : '↓ Delivery'}
                      </Badge>
                    </HStack>
                  </Box>
                );
              })
            ) : (
              <Text fontSize="sm" color="gray.500">
                Select a driver to view stops
              </Text>
            )}
          </VStack>
        </Box>
      </SimpleGrid>

      {/* Noscript block for SEO/crawlers */}
      <noscript>
        <section>
          <h2>Multi-Driver Route Optimization</h2>
          <p>
            The Smart Laundry Basket route optimization system enables efficient multi-driver
            delivery management. Visualize routes on an interactive map, assign stops to drivers
            with color-coded indicators, and track real-time statistics including total stops,
            estimated drive time, and total distance for each driver.
          </p>
          <ul>
            <li>Color-coded route visualization for multiple drivers</li>
            <li>Ordered stop sequences with address, time window, and stop type</li>
            <li>Visual distinction between pickup and delivery stops</li>
            <li>Route statistics: total stops, estimated drive time, total distance</li>
            <li>Click any driver to highlight their stops and view route details</li>
            <li>Support for at least 3 concurrent driver routes</li>
          </ul>
        </section>
      </noscript>
    </Box>
  );
};

export default RouteOptimizationView;
