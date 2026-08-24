import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  List,
  ListItem,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { useCounterStore } from '../store/counterStore';

export interface SessionSummaryScreenProps {
  onDone?: () => void;
  onViewDashboard?: () => void;
}

/**
 * Post-session summary shown after End Session. Displays what was counted this
 * session (per category + total). For After Wash it also surfaces any mismatch
 * against Before Wash with a clear status badge.
 */
export default function SessionSummaryScreen({
  onDone,
  onViewDashboard,
}: SessionSummaryScreenProps) {
  const summary = useCounterStore((s) => s.lastSummary);
  const clearSummary = useCounterStore((s) => s.clearSummary);

  if (!summary) return null;

  const handleDone = () => {
    clearSummary();
    onDone?.();
  };

  return (
    <Box maxW="760px" mx="auto" p={8}>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between" wrap="wrap" gap={3}>
          <Heading size="xl">Session Summary</Heading>
          <HStack>
            <Badge fontSize="lg" px={3} py={1} colorScheme="blue" borderRadius="md">
              Order {summary.transId}
            </Badge>
            <Badge
              fontSize="lg"
              px={3}
              py={1}
              colorScheme={summary.mode === 'Before Wash' ? 'teal' : 'purple'}
              borderRadius="md"
            >
              {summary.mode}
            </Badge>
          </HStack>
        </HStack>

        {/* Status banner */}
        {summary.mode === 'After Wash' && (
          <Box
            borderRadius="lg"
            p={4}
            bg={summary.hasMismatch ? 'status.alert' : 'status.connected'}
            color="white"
            data-testid="summary-status"
          >
            <Text fontSize="xl" fontWeight="bold">
              {summary.hasMismatch
                ? '⚠️ Mismatch — counts do not reconcile with Before Wash'
                : '✓ All matched — After Wash reconciles with Before Wash'}
            </Text>
          </Box>
        )}

        {/* Per-category counts for this session */}
        <Box bg="surface.raised" borderRadius="xl" p={5}>
          <Text fontSize="lg" color="gray.300" mb={3}>
            Counted this session — total {summary.total}
          </Text>
          <List spacing={2}>
            {summary.perCategory.map((c) => (
              <ListItem key={c.category}>
                <Text fontSize="xl" textTransform="capitalize">
                  {c.category}: <strong>{c.count}</strong>
                </Text>
              </ListItem>
            ))}
            {summary.perCategory.length === 0 && (
              <Text color="gray.400">No items were counted.</Text>
            )}
          </List>
        </Box>

        {/* Mismatch breakdown for After Wash */}
        {summary.discrepancies.length > 0 && (
          <Box bg="surface.raised" borderRadius="xl" p={5}>
            <Text fontSize="lg" color="gray.300" mb={3}>
              Mismatched categories
            </Text>
            <Table variant="simple" size="md">
              <Thead>
                <Tr>
                  <Th>Category</Th>
                  <Th isNumeric>Before</Th>
                  <Th isNumeric>After</Th>
                  <Th isNumeric>Diff</Th>
                </Tr>
              </Thead>
              <Tbody>
                {summary.discrepancies.map((d) => (
                  <Tr key={d.category}>
                    <Td textTransform="capitalize">{d.category}</Td>
                    <Td isNumeric>{d.beforeCount}</Td>
                    <Td isNumeric>{d.afterCount}</Td>
                    <Td isNumeric fontWeight="bold">
                      {d.difference > 0 ? `+${d.difference}` : d.difference}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        <HStack justify="flex-end" spacing={3}>
          {onViewDashboard && (
            <Button variant="outline" size="lg" onClick={onViewDashboard}>
              Orders Dashboard
            </Button>
          )}
          <Button colorScheme="green" size="lg" onClick={handleDone}>
            Done
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}
