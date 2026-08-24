import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  Heading,
  HStack,
  List,
  ListItem,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react';
import { EC2Service, type TransactionSummary } from '../services/ec2Service';
import { useCounterStore } from '../store/counterStore';
import type { DetectionEvent } from '../types';
import { aggregateTallies } from '../lib/tally';

export interface HistoryScreenProps {
  onBack?: () => void;
  /** Injectable EC2 client factory for testing. */
  makeEc2?: (baseUrl: string) => Pick<
    EC2Service,
    'getTransactionHistory' | 'getTransactionItems'
  >;
}

/**
 * Read-only transaction history for the current operator, with a per-session
 * detail view showing the per-category counts.
 *
 * @remarks Requirement 11.3.
 */
export default function HistoryScreen({ onBack, makeEc2 }: HistoryScreenProps) {
  const settings = useCounterStore((s) => s.settings);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TransactionSummary | null>(null);
  const [detailItems, setDetailItems] = useState<DetectionEvent[] | null>(null);

  const ec2Factory =
    makeEc2 ?? ((baseUrl: string) => new EC2Service({ baseUrl }));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ec2Factory(settings.ec2Url)
      .getTransactionHistory(settings.operatorName)
      .then((rows) => {
        if (!cancelled) setTransactions(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load history. Check the cloud connection.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.ec2Url, settings.operatorName]);

  const openDetail = async (tx: TransactionSummary) => {
    setSelected(tx);
    setDetailItems(null);
    try {
      const items = await ec2Factory(settings.ec2Url).getTransactionItems(tx.uniqId);
      setDetailItems(items);
    } catch {
      setDetailItems([]);
    }
  };

  return (
    <Box maxW="900px" mx="auto" p={8}>
      <HStack justify="space-between" mb={6}>
        <Heading size="xl">History</Heading>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
        )}
      </HStack>

      {loading && <Spinner size="xl" />}
      {error && <Text color="status.disconnected">{error}</Text>}

      {!loading && !error && transactions.length === 0 && (
        <Text color="gray.400" fontSize="xl">
          No past sessions for {settings.operatorName || 'this operator'}.
        </Text>
      )}

      {!selected ? (
        <List spacing={3} data-testid="transaction-list">
          {transactions.map((tx) => (
            <ListItem
              key={tx.uniqId}
              bg="surface.raised"
              borderRadius="lg"
              p={4}
              cursor="pointer"
              onClick={() => openDetail(tx)}
              data-testid={`transaction-${tx.uniqId}`}
            >
              <HStack justify="space-between">
                <VStack align="start" spacing={1}>
                  <Text fontSize="xl" fontWeight="bold">
                    Order {tx.transId}
                  </Text>
                  <Text color="gray.400">{tx.date}</Text>
                </VStack>
                <Badge
                  fontSize="md"
                  colorScheme={tx.type === 'Before Wash' ? 'teal' : 'purple'}
                >
                  {tx.type}
                </Badge>
              </HStack>
            </ListItem>
          ))}
        </List>
      ) : (
        <Box>
          <Button variant="ghost" mb={4} onClick={() => setSelected(null)}>
            ← Back to list
          </Button>
          <Heading size="lg" mb={2}>
            Order {selected.transId}
          </Heading>
          <Text color="gray.400" mb={4}>
            {selected.type} · {selected.date}
          </Text>
          <Divider mb={4} />
          {detailItems === null ? (
            <Spinner />
          ) : (
            <List spacing={2} data-testid="detail-counts">
              {[...aggregateTallies(detailItems).values()].map((tally) => (
                <ListItem key={tally.category}>
                  <Text fontSize="xl" textTransform="capitalize">
                    {tally.category}: <strong>{tally.count}</strong>
                  </Text>
                </ListItem>
              ))}
              {detailItems.length === 0 && (
                <Text color="gray.400">No items recorded for this session.</Text>
              )}
            </List>
          )}
        </Box>
      )}
    </Box>
  );
}
