import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Divider,
  Image,
  SimpleGrid,
} from '@chakra-ui/react';

/**
 * ItemTrackingResults — Displays the intake or fold item counts on the POS.
 * Shows item counts AND the uploaded photos.
 * Shown after the mobile upload flow is confirmed.
 */
function ItemTrackingResults({ record, phase }) {
  if (!record) return null;

  const items = record.items || [];
  const photos = record.photoUrls || [];
  const confirmedAt = record.confirmedAt
    ? new Date(record.confirmedAt).toLocaleString()
    : null;

  return (
    <Box p={3} borderWidth="1px" borderRadius="md" bg="white">
      <VStack spacing={2} align="stretch">
        <HStack justify="space-between">
          <HStack>
            <Badge colorScheme={phase === 'intake' ? 'blue' : 'green'} fontSize="xs">
              {phase === 'intake' ? 'INTAKE' : 'FOLD'}
            </Badge>
            <Text fontSize="sm" fontWeight="bold">
              {phase === 'intake' ? 'Items Received' : 'Items Folded'}
            </Text>
          </HStack>
          {confirmedAt && (
            <Text fontSize="xs" color="gray.500">{confirmedAt}</Text>
          )}
        </HStack>

        <Divider />

        {/* Photos */}
        {photos.length > 0 && (
          <Box>
            <Text fontSize="xs" fontWeight="semibold" color="gray.600" mb={1}>Photos:</Text>
            <SimpleGrid columns={{ base: 2, md: 3 }} spacing={2}>
              {photos.map((url, i) => (
                <Image
                  key={i}
                  src={url}
                  borderRadius="md"
                  h="80px"
                  w="full"
                  objectFit="cover"
                  cursor="pointer"
                  onClick={() => window.open(url, '_blank')}
                  alt={`${phase} photo ${i + 1}`}
                />
              ))}
            </SimpleGrid>
          </Box>
        )}

        {/* Item counts table */}
        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th px={2} py={1}>Item</Th>
              <Th px={2} py={1} isNumeric>Count</Th>
            </Tr>
          </Thead>
          <Tbody>
            {items.map((item, i) => (
              <Tr key={i}>
                <Td px={2} py={1} fontSize="sm">{item.category}</Td>
                <Td px={2} py={1} fontSize="sm" isNumeric fontWeight="bold">{item.count}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>

        {record.employeeId && (
          <Text fontSize="xs" color="gray.400">
            Recorded by: {record.employeeId}
          </Text>
        )}
      </VStack>
    </Box>
  );
}

export default ItemTrackingResults;
