import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Divider,
  Icon,
} from '@chakra-ui/react';
import { CLUSTER_COLORS } from './DriverSelector';

/**
 * Scrollable stop list panel showing numbered stops grouped by driver.
 * Highlights on hover to sync with map.
 */
const StopsList = ({
  stops = [],
  clusters = [],
  selectedDrivers = [],
  drivers = [],
  sequencePositions = {},
  onHoverStop,
  highlightedStop,
}) => {
  // Build orderId → cluster index lookup
  const orderClusterMap = {};
  clusters.forEach((cluster) => {
    (cluster.stops || []).forEach((orderId) => {
      orderClusterMap[orderId] = cluster.clusterIndex;
    });
  });

  // Get stop details by orderId
  const getStop = (orderId) => stops.find((s) => s.orderId === orderId);

  // Get driver name by index
  const getDriverName = (idx) => {
    const driverId = selectedDrivers[idx];
    const driver = drivers.find((d) => d.driverId === driverId);
    return driver?.name || `Driver ${idx + 1}`;
  };

  // If clusters exist, show grouped by driver
  if (clusters.length > 0 && clusters.some(c => (c.stops || []).length > 0)) {
    return (
      <Box
        maxH="500px"
        overflowY="auto"
        borderWidth="1px"
        borderRadius="md"
        bg="white"
        p={3}
        css={{
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': { background: '#CBD5E0', borderRadius: '3px' },
        }}
      >
        {clusters.map((cluster, idx) => {
          const color = CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
          const clusterStops = (cluster.stops || [])
            .map((orderId) => ({
              ...getStop(orderId),
              orderId,
              seq: sequencePositions[orderId] || 0,
            }))
            .filter((s) => s.latitude) // only valid stops
            .sort((a, b) => a.seq - b.seq);

          if (clusterStops.length === 0) return null;

          return (
            <Box key={idx} mb={4}>
              <HStack mb={2} spacing={2}>
                <Box w="12px" h="12px" borderRadius="full" bg={color} flexShrink={0} />
                <Text fontSize="sm" fontWeight="bold">
                  {getDriverName(idx)}
                </Text>
                <Badge colorScheme="gray" fontSize="xs">
                  {clusterStops.length} stops
                </Badge>
              </HStack>

              <VStack align="stretch" spacing={1} pl={2}>
                {clusterStops.map((stop, stopIdx) => (
                  <HStack
                    key={stop.orderId}
                    spacing={2}
                    p={2}
                    borderRadius="md"
                    bg={highlightedStop === stop.orderId ? `${color}15` : 'gray.50'}
                    borderWidth="1px"
                    borderColor={highlightedStop === stop.orderId ? color : 'transparent'}
                    cursor="pointer"
                    _hover={{ bg: `${color}10`, borderColor: color }}
                    onMouseEnter={() => onHoverStop?.(stop.orderId)}
                    onMouseLeave={() => onHoverStop?.(null)}
                    transition="all 0.15s"
                  >
                    {/* Sequence number */}
                    <Box
                      w="24px"
                      h="24px"
                      borderRadius="full"
                      bg={color}
                      color="white"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      fontSize="xs"
                      fontWeight="bold"
                      flexShrink={0}
                    >
                      {stop.seq || stopIdx + 1}
                    </Box>

                    {/* Stop details */}
                    <Box flex={1} minW={0}>
                      <HStack spacing={1}>
                        <Text fontSize="xs" fontWeight="600" noOfLines={1}>
                          {stop.customerName || 'Unknown'}
                        </Text>
                        <Badge
                          fontSize="9px"
                          colorScheme={stop.orderType === 'pickup' ? 'orange' : 'blue'}
                          variant="subtle"
                        >
                          {stop.orderType === 'pickup' ? 'P' : 'D'}
                        </Badge>
                      </HStack>
                      <Text fontSize="xs" color="gray.600" noOfLines={1}>
                        {stop.address || 'No address'}
                      </Text>
                    </Box>
                  </HStack>
                ))}
              </VStack>

              {idx < clusters.length - 1 && <Divider mt={3} />}
            </Box>
          );
        })}
      </Box>
    );
  }

  // No clusters yet — show flat list of all stops
  return (
    <Box
      maxH="500px"
      overflowY="auto"
      borderWidth="1px"
      borderRadius="md"
      bg="white"
      p={3}
      css={{
        '&::-webkit-scrollbar': { width: '6px' },
        '&::-webkit-scrollbar-thumb': { background: '#CBD5E0', borderRadius: '3px' },
      }}
    >
      <Text fontSize="sm" fontWeight="bold" mb={2} color="gray.600">
        All Stops ({stops.length})
      </Text>
      <VStack align="stretch" spacing={1}>
        {stops.map((stop, idx) => (
          <HStack
            key={stop.orderId}
            spacing={2}
            p={2}
            borderRadius="md"
            bg={highlightedStop === stop.orderId ? 'blue.50' : 'gray.50'}
            borderWidth="1px"
            borderColor={highlightedStop === stop.orderId ? 'blue.300' : 'transparent'}
            cursor="pointer"
            _hover={{ bg: 'blue.50', borderColor: 'blue.200' }}
            onMouseEnter={() => onHoverStop?.(stop.orderId)}
            onMouseLeave={() => onHoverStop?.(null)}
            transition="all 0.15s"
          >
            {/* Number */}
            <Box
              w="24px"
              h="24px"
              borderRadius="full"
              bg="gray.400"
              color="white"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontSize="xs"
              fontWeight="bold"
              flexShrink={0}
            >
              {idx + 1}
            </Box>

            {/* Stop details */}
            <Box flex={1} minW={0}>
              <HStack spacing={1}>
                <Text fontSize="xs" fontWeight="600" noOfLines={1}>
                  {stop.customerName || 'Unknown'}
                </Text>
                <Badge
                  fontSize="9px"
                  colorScheme={stop.orderType === 'pickup' ? 'orange' : 'blue'}
                  variant="subtle"
                >
                  {stop.orderType === 'pickup' ? 'Pickup' : 'Delivery'}
                </Badge>
              </HStack>
              <Text fontSize="xs" color="gray.600" noOfLines={1}>
                {stop.address || 'No address'}
              </Text>
            </Box>
          </HStack>
        ))}
      </VStack>
    </Box>
  );
};

export default StopsList;
