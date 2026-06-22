import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Checkbox,
  Badge,
} from '@chakra-ui/react';

export const CLUSTER_COLORS = [
  '#E53E3E', // red
  '#3182CE', // blue
  '#38A169', // green
  '#D69E2E', // gold
  '#805AD5', // purple
  '#DD6B20', // orange
];

/**
 * Multi-select panel with color-coded checkboxes for available drivers.
 * Props:
 *  - drivers: [{driverId, name}]
 *  - selectedDrivers: [driverId, ...]
 *  - onToggleDriver: (driverId) => void
 *  - stopCounts: {driverId: count} (optional, shown after clustering)
 */
const DriverSelector = ({ drivers, selectedDrivers, onToggleDriver, stopCounts = {} }) => {
  return (
    <Box
      p={4}
      borderWidth="1px"
      borderRadius="md"
      bg="gray.50"
      minW="220px"
    >
      <Text fontWeight="bold" mb={3} fontSize="sm">
        Available Drivers
      </Text>
      <VStack align="stretch" spacing={2}>
        {drivers.map((driver, idx) => {
          const isSelected = selectedDrivers.includes(driver.driverId);
          const colorIdx = selectedDrivers.indexOf(driver.driverId);
          const color = colorIdx >= 0 ? CLUSTER_COLORS[colorIdx % CLUSTER_COLORS.length] : 'gray';
          const count = stopCounts[driver.driverId];

          return (
            <HStack key={driver.driverId} spacing={2}>
              <Checkbox
                isChecked={isSelected}
                onChange={() => onToggleDriver(driver.driverId)}
                colorScheme="teal"
                size="sm"
              />
              {isSelected && (
                <Box w="12px" h="12px" borderRadius="full" bg={color} flexShrink={0} />
              )}
              <Text fontSize="sm" flex={1} noOfLines={1}>
                {driver.name}
              </Text>
              {count !== undefined && isSelected && (
                <Badge colorScheme="gray" fontSize="xs">
                  {count} stops
                </Badge>
              )}
            </HStack>
          );
        })}
        {drivers.length === 0 && (
          <Text fontSize="xs" color="gray.500">No drivers found</Text>
        )}
      </VStack>
    </Box>
  );
};

export default DriverSelector;
