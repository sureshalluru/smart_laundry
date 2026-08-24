import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';
import { EC2Service, type OrderSummary } from '../services/ec2Service';
import { useCounterStore } from '../store/counterStore';

export interface OrdersDashboardScreenProps {
  onBack?: () => void;
  /** Injectable EC2 factory for testing. */
  makeEc2?: (baseUrl: string) => Pick<EC2Service, 'getOrdersSummary'>;
}

/** Status label for one order's before/after progress. */
function statusBadge(o: OrderSummary) {
  if (o.hasBefore && o.hasAfter) {
    return o.mismatch
      ? { label: 'Mismatch', color: 'red' }
      : { label: 'Matched', color: 'green' };
  }
  if (o.hasBefore) return { label: 'Awaiting After Wash', color: 'yellow' };
  return { label: 'In progress', color: 'gray' };
}

/**
 * Dashboard listing every order with its Before Wash and After Wash totals and
 * a clear match / mismatch indicator, so a manager can scan the day's orders
 * and spot which ones need attention.
 */
export default function OrdersDashboardScreen({
  onBack,
  makeEc2,
}: OrdersDashboardScreenProps) {
  const ec2Url = useCounterStore((s) => s.settings.ec2Url);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ec2Factory = makeEc2 ?? ((baseUrl: string) => new EC2Service({ baseUrl }));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ec2Factory(ec2Url)
      .getOrdersSummary()
      .then((rows) => {
        if (!cancelled) setOrders(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the dashboard. Check the cloud connection.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ec2Url]);

  const mismatchCount = orders.filter((o) => o.mismatch).length;

  return (
    <Box maxW="1000px" mx="auto" p={8}>
      <HStack justify="space-between" mb={4}>
        <Heading size="xl">Orders Dashboard</Heading>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
        )}
      </HStack>

      {mismatchCount > 0 && (
        <Box bg="status.alert" color="white" borderRadius="md" p={3} mb={4}>
          <Text fontSize="lg" fontWeight="bold">
            {mismatchCount} order{mismatchCount === 1 ? '' : 's'} with a count mismatch
          </Text>
        </Box>
      )}

      {loading && <Spinner size="xl" />}
      {error && <Text color="status.disconnected">{error}</Text>}

      {!loading && !error && orders.length === 0 && (
        <Text color="gray.400" fontSize="xl">
          No orders yet.
        </Text>
      )}

      {orders.length > 0 && (
        <TableContainer bg="surface.raised" borderRadius="xl" p={2}>
          <Table variant="simple" size="lg" data-testid="orders-table">
            <Thead>
              <Tr>
                <Th>Order</Th>
                <Th isNumeric>Before Wash</Th>
                <Th isNumeric>After Wash</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {orders.map((o) => {
                const badge = statusBadge(o);
                return (
                  <Tr key={o.transId} data-testid={`order-row-${o.transId}`}>
                    <Td fontSize="xl" fontWeight="bold">
                      {o.transId}
                    </Td>
                    <Td isNumeric fontSize="xl">
                      {o.hasBefore ? o.beforeTotal : '—'}
                    </Td>
                    <Td isNumeric fontSize="xl">
                      {o.hasAfter ? o.afterTotal : '—'}
                    </Td>
                    <Td>
                      <Badge
                        fontSize="md"
                        px={3}
                        py={1}
                        borderRadius="md"
                        colorScheme={badge.color}
                        data-testid={`order-status-${o.transId}`}
                      >
                        {badge.label}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
