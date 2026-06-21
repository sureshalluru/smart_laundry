import React, { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  HStack,
  Button,
  NumberInput,
  NumberInputField,
} from '@chakra-ui/react';

/**
 * WeightServiceRow — Row for per-pound services (inputWeight=true).
 *
 * Shows service name, price/lb, weight input, and Add/Update button.
 */
export default function WeightServiceRow({ service, cartItem, dispatch }) {
  const [weight, setWeight] = useState(cartItem ? String(cartItem.quantity) : '');

  const handleAdd = () => {
    const parsedWeight = parseFloat(weight);
    if (!parsedWeight || parsedWeight < 0.1) return;

    dispatch({
      type: 'ADD_ITEM',
      payload: {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        categoryId: service.categoryId,
        categoryName: service.categoryName,
        price: parseFloat(service.price),
        inputWeight: true,
        quantity: parsedWeight,
      },
    });
  };

  const handleUpdate = () => {
    const parsedWeight = parseFloat(weight);
    if (!parsedWeight || parsedWeight < 0.1) return;

    dispatch({
      type: 'UPDATE_QUANTITY',
      serviceId: service.serviceId,
      quantity: parsedWeight,
    });
  };

  return (
    <Box
      p={3}
      borderRadius="xl"
      border="2px solid"
      borderColor={cartItem ? 'blue.400' : 'gray.200'}
      bg={cartItem ? 'blue.50' : 'white'}
      transition="all 0.2s"
    >
      <Flex justify="space-between" align="center">
        <Box flex="1">
          <Text fontWeight="700" fontSize="sm" color="gray.800">
            {service.serviceName}
          </Text>
          <Text fontSize="md" fontWeight="800" color="blue.600">
            ${parseFloat(service.price).toFixed(2)}/lb
          </Text>
        </Box>
        <HStack spacing={2}>
          <NumberInput
            size="sm"
            maxW="80px"
            min={0.1}
            step={0.1}
            precision={1}
            value={weight}
            onChange={(val) => setWeight(val)}
          >
            <NumberInputField
              fontSize="sm"
              textAlign="center"
              placeholder="lbs"
            />
          </NumberInput>
          {cartItem ? (
            <Button
              size="sm"
              colorScheme="blue"
              borderRadius="full"
              variant="outline"
              onClick={handleUpdate}
            >
              Update
            </Button>
          ) : (
            <Button
              size="sm"
              colorScheme="blue"
              borderRadius="full"
              onClick={handleAdd}
            >
              Add
            </Button>
          )}
        </HStack>
      </Flex>
      {cartItem && (
        <Text fontSize="xs" color="gray.500" mt={1} textAlign="right">
          {cartItem.quantity} lbs × ${parseFloat(service.price).toFixed(2)} = $
          {(cartItem.quantity * parseFloat(service.price)).toFixed(2)}
        </Text>
      )}
    </Box>
  );
}
