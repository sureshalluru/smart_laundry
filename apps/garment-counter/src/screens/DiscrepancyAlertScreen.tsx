import { Fragment, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Image,
  SimpleGrid,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
  VStack,
} from '@chakra-ui/react';
import { useCounterStore } from '../store/counterStore';
import { isDiscrepancy } from '../lib/discrepancy';
import type { DetectionEvent } from '../types';

export interface DiscrepancyAlertScreenProps {
  /** Injected alarm trigger (defaults to the store's audio via onMount). */
  onMountAlarm?: () => void;
}

/** Small labelled strip of item photos for one wash phase + category. */
function PhotoStrip({
  label,
  items,
  ec2Url,
  emptyText,
}: {
  label: string;
  items: DetectionEvent[];
  ec2Url: string;
  emptyText: string;
}) {
  const base = ec2Url.replace(/\/+$/, '');
  return (
    <Box>
      <Text fontWeight="bold" mb={2}>
        {label} ({items.length})
      </Text>
      {items.length === 0 ? (
        <Text color="whiteAlpha.700">{emptyText}</Text>
      ) : (
        <SimpleGrid columns={{ base: 3, md: 5 }} spacing={2}>
          {items.map((item) => (
            <Image
              key={`${label}-${item.clothId}`}
              src={`${base}/${item.filePath.replace(/^\/+/, '')}`}
              alt={`${label} ${item.clothType} #${item.clothId}`}
              boxSize="72px"
              objectFit="cover"
              borderRadius="md"
              fallbackSrc="/favicon.svg"
            />
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}

/**
 * Full-screen red alert shown when the finalized After Wash count does not
 * match Before Wash. Lists per-category Before/After/diff, lets the employee
 * expand a row to visually compare the Before Wash vs After Wash photos for
 * that category (no tags/QR needed — the employee eyeballs what's missing),
 * provides a resolve action per discrepant category via `moveCloth`, reflects
 * `new_status`, and dismisses once all discrepancies are resolved.
 *
 * @remarks Requirements 5.1, 5.3, 5.4, 5.5, 5.6, 5.7.
 */
export default function DiscrepancyAlertScreen({
  onMountAlarm,
}: DiscrepancyAlertScreenProps) {
  const toast = useToast();
  const discrepancies = useCounterStore((s) => s.discrepancies);
  const moveCloth = useCounterStore((s) => s.moveCloth);
  const items = useCounterStore((s) => s.items);
  const beforeWashTallies = useCounterStore((s) => s.beforeWashTallies);
  const ec2Url = useCounterStore((s) => s.settings.ec2Url);
  const [resolving, setResolving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Play the alarm once when the alert appears (Req 5.3).
  useEffect(() => {
    onMountAlarm?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discrepantRows = discrepancies.filter(isDiscrepancy);

  const beforeItemsFor = (category: string): DetectionEvent[] =>
    beforeWashTallies?.get(category)?.items ?? [];
  const afterItemsFor = (category: string): DetectionEvent[] =>
    items.filter((i) => i.clothType === category);

  const handleResolve = async (category: string) => {
    // Pick any item currently in the mismatched category to move.
    const candidate = items.find((i) => i.clothType === category);
    if (!candidate) {
      toast({
        title: 'Nothing to move',
        description: `No item found in ${category} to reassign.`,
        status: 'info',
        duration: 3000,
      });
      return;
    }
    setResolving(category);
    try {
      await moveCloth(candidate.clothId, category);
    } catch {
      toast({
        title: 'Resolution failed',
        description: 'The discrepancy was not resolved. Try again.',
        status: 'error',
        duration: 4000,
      });
    } finally {
      setResolving(null);
    }
  };

  return (
    <Flex
      direction="column"
      h="100vh"
      bg="status.alert"
      color="white"
      p={8}
      gap={6}
      data-testid="discrepancy-alert"
    >
      <Heading size="2xl">⚠️ Count Mismatch</Heading>
      <Text fontSize="xl">
        The After Wash count does not match Before Wash. Tap a category to
        compare the photos and find what is missing, then resolve it.
      </Text>

      <Box bg="whiteAlpha.200" borderRadius="xl" p={4} flex={1} overflowY="auto">
        <TableContainer>
          <Table variant="unstyled" size="lg">
            <Thead>
              <Tr>
                <Th color="white" fontSize="lg">
                  Category
                </Th>
                <Th color="white" fontSize="lg" isNumeric>
                  Before
                </Th>
                <Th color="white" fontSize="lg" isNumeric>
                  After
                </Th>
                <Th color="white" fontSize="lg" isNumeric>
                  Diff
                </Th>
                <Th color="white" fontSize="lg">
                  Action
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {discrepantRows.map((row) => {
                const isOpen = expanded === row.category;
                return (
                  <Fragment key={row.category}>
                    <Tr
                      data-testid={`discrepancy-row-${row.category}`}
                      cursor="pointer"
                      onClick={() =>
                        setExpanded(isOpen ? null : row.category)
                      }
                    >
                      <Td fontSize="2xl" textTransform="capitalize">
                        {isOpen ? '▾ ' : '▸ '}
                        {row.category}
                      </Td>
                      <Td fontSize="2xl" isNumeric>
                        {row.beforeCount}
                      </Td>
                      <Td fontSize="2xl" isNumeric>
                        {row.afterCount}
                      </Td>
                      <Td fontSize="2xl" isNumeric fontWeight="bold">
                        {row.difference > 0 ? `+${row.difference}` : row.difference}
                      </Td>
                      <Td>
                        {row.isResolved ? (
                          <Text
                            fontWeight="bold"
                            data-testid={`resolved-${row.category}`}
                          >
                            ✓ Resolved
                          </Text>
                        ) : (
                          <Button
                            colorScheme="whiteAlpha"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleResolve(row.category);
                            }}
                            isLoading={resolving === row.category}
                          >
                            Resolve
                          </Button>
                        )}
                      </Td>
                    </Tr>
                    {isOpen && (
                      <Tr data-testid={`photo-compare-${row.category}`}>
                        <Td colSpan={5}>
                          <VStack
                            align="stretch"
                            spacing={4}
                            bg="whiteAlpha.100"
                            borderRadius="lg"
                            p={4}
                          >
                            <PhotoStrip
                              label="Before Wash"
                              items={beforeItemsFor(row.category)}
                              ec2Url={ec2Url}
                              emptyText="No Before Wash photos for this category."
                            />
                            <PhotoStrip
                              label="After Wash (so far)"
                              items={afterItemsFor(row.category)}
                              ec2Url={ec2Url}
                              emptyText="No After Wash items in this category yet."
                            />
                          </VStack>
                        </Td>
                      </Tr>
                    )}
                  </Fragment>
                );
              })}
            </Tbody>
          </Table>
        </TableContainer>
      </Box>

      <HStack justify="flex-end">
        <Text fontSize="lg">
          {discrepantRows.filter((r) => r.isResolved).length} of{' '}
          {discrepantRows.length} resolved
        </Text>
      </HStack>
    </Flex>
  );
}
