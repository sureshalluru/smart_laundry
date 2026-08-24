import { Box, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import type { CategoryTally } from '../types';

export interface CategoryGridProps {
  tallies: Map<string, CategoryTally>;
  activeCategories: string[];
  beforeWashTallies?: Map<string, CategoryTally> | null;
  onCardTap?: (category: string) => void;
}

/**
 * Dynamic grid of category cards. Count numbers use the large `count` token
 * (>=48px, Req 1.4) and each category occupies a distinct visual zone (Req
 * 7.5). Layout columns scale with the number of active categories (Req 12.3).
 * In After Wash mode, the Before Wash count is shown alongside (Req 4.6).
 */
export default function CategoryGrid({
  tallies,
  activeCategories,
  beforeWashTallies,
  onCardTap,
}: CategoryGridProps) {
  const categories =
    activeCategories.length > 0 ? activeCategories : [...tallies.keys()];

  const columns = categories.length <= 2 ? 2 : categories.length <= 6 ? 3 : 4;

  return (
    <SimpleGrid columns={{ base: 2, md: columns }} spacing={4} data-testid="category-grid">
      {categories.map((category) => {
        const count = tallies.get(category)?.count ?? 0;
        const beforeCount = beforeWashTallies?.get(category)?.count;
        return (
          <Box
            key={category}
            bg="surface.raised"
            borderWidth="1px"
            borderColor="surface.border"
            borderRadius="xl"
            p={5}
            role={onCardTap ? 'button' : undefined}
            onClick={onCardTap ? () => onCardTap(category) : undefined}
            data-testid={`category-card-${category}`}
          >
            <VStack spacing={1}>
              <Text fontSize="xl" textTransform="capitalize" color="gray.300">
                {category}
              </Text>
              <Text fontSize="count" fontWeight="extrabold" lineHeight="1">
                {count}
              </Text>
              {beforeCount !== undefined && (
                <Text fontSize="lg" color="gray.400">
                  before: {beforeCount}
                </Text>
              )}
            </VStack>
          </Box>
        );
      })}
    </SimpleGrid>
  );
}
