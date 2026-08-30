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
  const [weight, setWeight] = useState(cartItem ? cartItem.quantity : 1);

  // Minimum billable weight — only active when the tenant enabled it AND this
  // service has a positive minimum configured (Phase 2).
  const minWeight =
    service.minWeightEnabled &&
    service.minBillableWeight != null &&
    parseFloat(service.minBillableWeight) > 0
      ? parseFloat(service.minBillableWeight)
      : 0;
  const unitPrice = parseFloat(service.price);
  // The weight the customer is actually billed for (floored at the minimum).
  const billedWeight = minWeight > 0 ? Math.max(weight, minWeight) : weight;
  const isBelowMin = minWeight > 0 && weight > 0 && weight < minWeight;

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
        <VStack align="flex-end" spacing={0}>
          <Text fontSize="lg" fontWeight="800" color="blue.600">
            ${unitPrice.toFixed(2)}/lb
          </Text>
          {minWeight > 0 && (
            <Text fontSize="xs" color="gray.500" fontWeight="500">Min. {minWeight} lb</Text>
          )}
        </VStack>
      </Flex>

      {/* Clarification: customer doesn't need to weigh */}
      <Box bg="green.50" border="1px solid" borderColor="green.200" borderRadius="lg" px={3} py={2} mb={3}>
        <Text fontSize="xs" color="green.700" fontWeight="500">
          📋 No need to weigh at home! We'll weigh your laundry at the store and send a photo with the exact weight.
          {minWeight > 0
            ? ` A ${minWeight} lb minimum applies — orders under ${minWeight} lb are billed at ${minWeight} lb.`
            : " You'll only be charged for actual weight."}
        </Text>
      </Box>

      {/* Weight input with +/- buttons */}
      <Flex align="center" justify="center" gap={4} mb={3}>
        <IconButton
          icon={<Text fontSize="xl" fontWeight="bold">−</Text>}
          size="lg"
          variant="outline"
          borderRadius="xl"
          colorScheme="blue"
          onClick={() => decrement(1)}
          isDisabled={weight <= 0}
          aria-label="Decrease"
          minW="50px"
          h="50px"
        />

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
            fontSize="2xl"
            w="100px"
            h="54px"
            borderRadius="xl"
            border="2px solid"
            borderColor="blue.200"
            _focus={{ borderColor: 'blue.500' }}
          />
          <Text fontSize="xs" color="gray.500" mt={1}>estimated lbs</Text>
        </VStack>

        <IconButton
          icon={<Text fontSize="xl" fontWeight="bold">+</Text>}
          size="lg"
          variant="outline"
          borderRadius="xl"
          colorScheme="blue"
          onClick={() => increment(1)}
          aria-label="Increase"
          minW="50px"
          h="50px"
        />
      </Flex>

      {/* Cost preview + action button */}
      {weight > 0 && (
        <Flex justify="space-between" align="center">
          <VStack align="flex-start" spacing={0}>
            <Text fontSize="sm" color="gray.600" fontWeight="600">
              {billedWeight} lbs × ${unitPrice.toFixed(2)} =
              <Text as="span" color="blue.600" fontWeight="800">
                {' '}${(billedWeight * unitPrice).toFixed(2)}
              </Text>
            </Text>
            {isBelowMin && (
              <Text fontSize="xs" color="orange.600" fontWeight="500">
                Billed at the {minWeight} lb minimum (you entered {weight} lb)
              </Text>
            )}
          </VStack>

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
