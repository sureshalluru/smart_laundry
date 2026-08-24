import { Badge, Box, Image, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import type { DetectionEvent } from '../types';
import { isLowConfidence } from '../lib/tally';

export interface DetectionGalleryProps {
  items: DetectionEvent[];
  ec2Url: string;
  /** Tap a thumbnail to correct that specific item. Disabled when omitted. */
  onSelect?: (detection: DetectionEvent) => void;
}

/**
 * A scrollable grid of every detected item so the employee has a clear visual
 * record of the whole session. Newest first. Low-confidence items are flagged,
 * corrected items are marked, and tapping any tile opens correction for that
 * item.
 *
 * @remarks Requirements 1.1, 1.5, 3.1 (correction on any item).
 */
export default function DetectionGallery({ items, ec2Url, onSelect }: DetectionGalleryProps) {
  if (items.length === 0) {
    return (
      <Box bg="surface.raised" borderRadius="xl" p={5} textAlign="center">
        <Text color="gray.400" fontSize="lg">
          Detected items will appear here.
        </Text>
      </Box>
    );
  }

  const base = ec2Url.replace(/\/+$/, '');
  // Newest first without mutating the source array.
  const ordered = [...items].reverse();

  return (
    <Box
      bg="surface.raised"
      borderRadius="xl"
      p={4}
      maxH="320px"
      overflowY="auto"
      data-testid="detection-gallery"
    >
      <SimpleGrid columns={{ base: 3, md: 5, lg: 6 }} spacing={3}>
        {ordered.map((item) => {
          const low = isLowConfidence(item);
          const src = `${base}/${item.filePath.replace(/^\/+/, '')}`;
          return (
            <VStack
              key={item.clothId}
              spacing={1}
              role={onSelect ? 'button' : undefined}
              onClick={onSelect ? () => onSelect(item) : undefined}
              data-testid={`gallery-item-${item.clothId}`}
              cursor={onSelect ? 'pointer' : 'default'}
            >
              <Box
                position="relative"
                borderWidth="3px"
                borderRadius="lg"
                borderColor={low ? 'status.warning' : 'surface.border'}
                overflow="hidden"
              >
                <Image
                  src={src}
                  alt={`Detected ${item.clothType} #${item.clothId}`}
                  boxSize="88px"
                  objectFit="cover"
                  fallbackSrc="/favicon.svg"
                />
                {item.isModified && (
                  <Badge
                    position="absolute"
                    top={1}
                    right={1}
                    fontSize="xs"
                    colorScheme="purple"
                  >
                    ✎
                  </Badge>
                )}
              </Box>
              <Text fontSize="sm" textTransform="capitalize" noOfLines={1}>
                {item.clothType}
              </Text>
              {item.confidence !== undefined && (
                <Text fontSize="xs" color={low ? 'orange.300' : 'gray.400'}>
                  {item.confidence}%
                </Text>
              )}
            </VStack>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}
