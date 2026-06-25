import React from 'react';
import {
  Box,
  Flex,
  Text,
  HStack,
  IconButton,
} from '@chakra-ui/react';
import { FaMinus, FaPlus } from 'react-icons/fa';

/**
 * PieceServiceRow — Row for per-piece services (inputWeight=false).
 *
 * Shows service name, price per piece, and +/- counter buttons.
 */
export default function PieceServiceRow({ service, cartItem, dispatch }) {
  const quantity = cartItem ? cartItem.quantity : 0;

  const handleIncrement = () => {
    if (cartItem) {
      dispatch({
        type: 'UPDATE_QUANTITY',
        serviceId: service.serviceId,
        quantity: quantity + 1,
      });
    } else {
      dispatch({
        type: 'ADD_ITEM',
        payload: {
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          categoryId: service.categoryId,
          categoryName: service.categoryName,
          price: parseFloat(service.price),
          inputWeight: false,
          quantity: 1,
        },
      });
    }
  };

  const handleDecrement = () => {
    if (!cartItem) return;
    const newQty = quantity - 1;
    if (newQty <= 0) {
      dispatch({
        type: 'UPDATE_QUANTITY',
        serviceId: service.serviceId,
        quantity: 0,
      });
    } else {
      dispatch({
        type: 'UPDATE_QUANTITY',
        serviceId: service.serviceId,
        quantity: newQty,
      });
    }
  };

  return (
    <Box
      p={3}
      borderRadius="xl"
      border="2px solid"
      borderColor={quantity > 0 ? 'blue.400' : 'gray.200'}
      bg={quantity > 0 ? 'blue.50' : 'white'}
      transition="all 0.2s"
    >
      <Flex justify="space-between" align="center">
        <Box flex="1">
          <Text fontWeight="700" fontSize="sm" color="gray.800">
            {service.serviceName}
          </Text>
          <Text fontSize="md" fontWeight="800" color="blue.600">
            ${parseFloat(service.price).toFixed(2)}/bag
          </Text>
          <Text fontSize="xs" color="gray.500" mt={1}>
            🛍️ Send in any bag (trash bag works!) — we'll return folded in a clean plastic bag
          </Text>
        </Box>
        <HStack spacing={2}>
          {quantity > 0 && (
            <IconButton
              icon={<FaMinus />}
              aria-label="Decrease"
              size="sm"
              borderRadius="full"
              colorScheme="blue"
              variant="outline"
              onClick={handleDecrement}
            />
          )}
          {quantity > 0 && (
            <Text fontWeight="bold" fontSize="lg" minW="24px" textAlign="center">
              {quantity}
            </Text>
          )}
          <IconButton
            icon={<FaPlus />}
            aria-label={quantity > 0 ? 'Increase' : 'Add'}
            size="sm"
            borderRadius="full"
            colorScheme="blue"
            variant={quantity > 0 ? 'outline' : 'solid'}
            onClick={handleIncrement}
          />
        </HStack>
      </Flex>
      {quantity > 0 && (
        <Text fontSize="xs" color="gray.500" mt={1} textAlign="right">
          {quantity} × ${parseFloat(service.price).toFixed(2)} = $
          {(quantity * parseFloat(service.price)).toFixed(2)}
        </Text>
      )}
    </Box>
  );
}
