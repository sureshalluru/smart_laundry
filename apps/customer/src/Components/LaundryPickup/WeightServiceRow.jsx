import { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  HStack,
  VStack,
  Button,
  IconButton,
  Input,
} from '@chakra-ui/react';

/**
 * WeightServiceRow — Row for per-pound services (inputWeight=true).
 *
 * Mobile-friendly layout with large tap targets and easy weight adjustment.
 * Shows service name, price/lb, +/- weight buttons, and Add/Remove.
 */
export default function WeightServiceRow({ service, cartItem, dispatch }) {
  const [weight, setWeight] = useState(cartItem ? cartItem.quantity : 0);

  const increment = (amount = 1) => {
    const newWeight = Math.round((weight + amount) * 10) / 10;
    setWeight(newWeight);
  };

  const decrement = (amount = 1) => {
    const newWeight = Math.max(0, Math.round((weight - amount) * 10) / 10);
    setWeight(newWeight);
  };

  const handleAdd = () => {
    if (weight < 0.1) return;
    dispatch({
      type: 'ADD_ITEM',
      payload: {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        categoryId: service.categoryId,
        categoryName: service.categoryName,
        price: parseFloat(service.price),
        inputWeight: true,
        quantity: weight,
      },
    });
  };

  const handleUpdate = () => {
    if (weight < 0.1) {
      // Remove from cart if set to 0
      dispatch({ type: 'REMOVE_ITEM', serviceId: service.serviceId });
      return;
    }
    dispatch({
      type: 'UPDATE_QUANTITY',
      serviceId: service.serviceId,
      quantity: weight,
    });
  };

  const handleRemove = () => {
    setWeight(0);
    dispatch({ type: 'REMOVE_ITEM', serviceId: service.serviceId });
  };

  return (
    <Box
      p={4}
      borderRadius="xl"
      border="2px solid"
      borderColor={cartItem ? 'blue.400' : 'gray.200'}
      bg={cartItem ? 'blue.50' : 'white'}
      transition="all 0.2s"
    >
      {/* Service name and price */}
      <Flex justify="space-between" align="center" mb={3}>
        <VStack align="flex-start" spacing={0}>
          <Text fontWeight="700" fontSize="md" color="gray.800">
            {service.serviceName}
          </Text>
          {service.description && service.description !== 'N/A' && (
            <Text fontSize="xs" color="gray.500">{service.description}</Text>
          )}
        </VStack>
        <Text fontSize="lg" fontWeight="800" color="blue.600">
          ${parseFloat(service.price).toFixed(2)}/lb
        </Text>
      </Flex>

      {/* Weight input with +/- buttons */}
      <Flex align="center" justify="center" gap={3} mb={3}>
        <HStack spacing={1}>
          <IconButton
            icon={<Text fontSize="lg" fontWeight="bold">−5</Text>}
            size="sm"
            variant="outline"
            borderRadius="full"
            colorScheme="gray"
            onClick={() => decrement(5)}
            isDisabled={weight <= 0}
            aria-label="Decrease 5"
          />
          <IconButton
            icon={<Text fontSize="xl" fontWeight="bold">−</Text>}
            size="md"
            variant="outline"
            borderRadius="full"
            colorScheme="blue"
            onClick={() => decrement(1)}
            isDisabled={weight <= 0}
            aria-label="Decrease 1"
          />
        </HStack>

        <VStack spacing={0}>
          <Input
            type="number"
            value={weight || ''}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setWeight(isNaN(val) ? 0 : Math.max(0, val));
            }}
            textAlign="center"
            fontWeight="800"
            fontSize="xl"
            w="90px"
            h="48px"
            borderRadius="xl"
            border="2px solid"
            borderColor="blue.200"
            _focus={{ borderColor: 'blue.500' }}
          />
          <Text fontSize="xs" color="gray.500" mt={1}>lbs</Text>
        </VStack>

        <HStack spacing={1}>
          <IconButton
            icon={<Text fontSize="xl" fontWeight="bold">+</Text>}
            size="md"
            variant="outline"
            borderRadius="full"
            colorScheme="blue"
            onClick={() => increment(1)}
            aria-label="Increase 1"
          />
          <IconButton
            icon={<Text fontSize="lg" fontWeight="bold">+5</Text>}
            size="sm"
            variant="outline"
            borderRadius="full"
            colorScheme="gray"
            onClick={() => increment(5)}
            aria-label="Increase 5"
          />
        </HStack>
      </Flex>

      {/* Cost preview + action button */}
      {weight > 0 && (
        <Flex justify="space-between" align="center">
          <Text fontSize="sm" color="gray.600" fontWeight="600">
            {weight} lbs × ${parseFloat(service.price).toFixed(2)} = 
            <Text as="span" color="blue.600" fontWeight="800">
              {' '}${(weight * parseFloat(service.price)).toFixed(2)}
            </Text>
          </Text>

          {cartItem ? (
            <HStack spacing={2}>
              <Button
                size="sm"
                colorScheme="blue"
                borderRadius="full"
                onClick={handleUpdate}
              >
                Update
              </Button>
              <Button
                size="sm"
                variant="ghost"
                colorScheme="red"
                borderRadius="full"
                onClick={handleRemove}
              >
                Remove
              </Button>
            </HStack>
          ) : (
            <Button
              size="sm"
              colorScheme="blue"
              borderRadius="full"
              onClick={handleAdd}
            >
              Add to Order
            </Button>
          )}
        </Flex>
      )}

      {weight === 0 && cartItem && (
        <Flex justify="flex-end">
          <Button
            size="sm"
            variant="ghost"
            colorScheme="red"
            borderRadius="full"
            onClick={handleRemove}
          >
            Remove from Order
          </Button>
        </Flex>
      )}
    </Box>
  );
}
