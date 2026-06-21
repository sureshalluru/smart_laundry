import {
  Box,
  VStack,
  HStack,
  Text,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';

/**
 * DiscrepancyAlert — Shows inline discrepancy alerts on the POS
 * when fold counts don't match intake counts.
 * Yellow for 1-item difference, red for 2+ items.
 */
function DiscrepancyAlert({ discrepancies }) {
  if (!discrepancies || discrepancies.length === 0) return null;

  return (
    <VStack spacing={2} align="stretch">
      {discrepancies.map((d, i) => {
        const absDiff = Math.abs(d.difference);
        const severity = absDiff >= 2 ? 'error' : 'warning';
        const label = d.difference < 0
          ? `missing ${absDiff}`
          : `extra ${absDiff}`;

        return (
          <Alert key={i} status={severity} borderRadius="md" size="sm" py={2}>
            <AlertIcon />
            <HStack justify="space-between" w="full">
              <Text fontSize="sm" fontWeight="medium">
                {d.category}
              </Text>
              <Text fontSize="sm">
                folded {d.foldCount} / received {d.intakeCount} — {label}
              </Text>
            </HStack>
          </Alert>
        );
      })}
    </VStack>
  );
}

export default DiscrepancyAlert;
