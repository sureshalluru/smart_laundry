import React from 'react';
import {
  Box,
  Flex,
  Text,
  Button,
  HStack,
} from '@chakra-ui/react';
import { getCartSubtotal, getCartItemCount } from './cartUtils';

/**
 * StickyCartBar — Fixed bottom bar showing cart summary and Continue button.
 *
 * Displays total items count, estimated subtotal, and a Continue button.
 * Continue is disabled when cart is empty.
 */
export default function StickyCartBar({ items, onContinue, themeColor, addonsTotal = 0 }) {
  const itemCount = getCartItemCount(items);
  const subtotal = getCartSubtotal(items) + (parseFloat(addonsTotal) || 0);
  const colorScheme = themeColor || 'blue';

  return (
    <Box
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      bg="white"
      borderTop="1px solid"
      borderColor="gray.200"
      boxShadow="0 -2px 10px rgba(0,0,0,0.08)"
      px={4}
      py={3}
      zIndex={100}
    >
      <Flex
        maxW="500px"
        mx="auto"
        justify="space-between"
        align="center"
      >
        <HStack spacing={3}>
          <Text fontSize="sm" color="gray.600">
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </Text>
          <Text fontSize="lg" fontWeight="800" color="gray.800">
            ${subtotal.toFixed(2)}
          </Text>
        </HStack>
        <Button
          colorScheme={colorScheme}
          size="md"
          borderRadius="full"
          onClick={onContinue}
          isDisabled={itemCount === 0}
          px={6}
        >
          Continue
        </Button>
      </Flex>
    </Box>
  );
}
