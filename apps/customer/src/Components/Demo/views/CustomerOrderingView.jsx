import React, { useState, useMemo } from 'react';
import {
  Box,
  Heading,
  Text,
  SimpleGrid,
  HStack,
  VStack,
  Button,
  ButtonGroup,
  Badge,
  IconButton,
  Divider,
  Radio,
  RadioGroup,
  Stack,
  useColorModeValue,
} from '@chakra-ui/react';
import { format } from 'date-fns';
import { getDemoData } from '../demoMockData';

const FREQUENCY_OPTIONS = ['One-time', 'Weekly', 'Bi-Weekly', 'Monthly'];

/**
 * CustomerOrderingView
 *
 * Displays the customer ordering experience with both pricing models
 * (per-pound and per-bag/per-piece), service selection with quantity controls,
 * scheduling interface, order summary, and frequency options.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */
const CustomerOrderingView = () => {
  const { services, timeSlots } = getDemoData('customerOrdering');

  const [pricingModel, setPricingModel] = useState('per_pound');
  const [cart, setCart] = useState({});
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [frequency, setFrequency] = useState('One-time');

  const cardBg = useColorModeValue('gray.50', 'gray.700');
  const activeBg = useColorModeValue('blue.50', 'blue.900');

  // Filter services by the selected pricing model
  const filteredServices = useMemo(() => {
    return services.filter((svc) => svc.pricingModel === pricingModel);
  }, [services, pricingModel]);

  // Calculate order total
  const orderTotal = useMemo(() => {
    return Object.entries(cart).reduce((sum, [serviceId, qty]) => {
      const svc = services.find((s) => s.id === serviceId);
      if (svc && qty > 0) return sum + svc.price * qty;
      return sum;
    }, 0);
  }, [cart, services]);

  // Get items in cart with details
  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([serviceId, qty]) => {
        const svc = services.find((s) => s.id === serviceId);
        return svc ? { ...svc, quantity: qty } : null;
      })
      .filter(Boolean);
  }, [cart, services]);

  const handleAddQuantity = (serviceId) => {
    setCart((prev) => ({ ...prev, [serviceId]: (prev[serviceId] || 0) + 1 }));
  };

  const handleRemoveQuantity = (serviceId) => {
    setCart((prev) => {
      const current = prev[serviceId] || 0;
      if (current <= 1) {
        const { [serviceId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [serviceId]: current - 1 };
    });
  };

  const getQuantity = (serviceId) => cart[serviceId] || 0;

  const formatDate = (date) => {
    try {
      return format(new Date(date), 'EEE, MMM d');
    } catch {
      return 'N/A';
    }
  };

  return (
    <Box>
      <Heading size="md" mb={4}>
        Customer Ordering Experience
      </Heading>

      {/* Pricing Model Toggle */}
      <Box mb={6}>
        <Text fontSize="sm" fontWeight="medium" mb={2}>
          Pricing Model:
        </Text>
        <ButtonGroup size="sm" isAttached variant="outline">
          <Button
            colorScheme={pricingModel === 'per_pound' ? 'blue' : 'gray'}
            variant={pricingModel === 'per_pound' ? 'solid' : 'outline'}
            onClick={() => setPricingModel('per_pound')}
            aria-pressed={pricingModel === 'per_pound'}
          >
            Per Pound
          </Button>
          <Button
            colorScheme={pricingModel === 'per_bag' ? 'blue' : 'gray'}
            variant={pricingModel === 'per_bag' ? 'solid' : 'outline'}
            onClick={() => setPricingModel('per_bag')}
            aria-pressed={pricingModel === 'per_bag'}
          >
            Per Bag / Per Piece
          </Button>
        </ButtonGroup>
      </Box>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {/* Left Column: Service Selection & Scheduling */}
        <VStack align="stretch" spacing={6}>
          {/* Service Selection */}
          <Box>
            <Heading size="sm" mb={3}>
              Select Services
            </Heading>
            <VStack align="stretch" spacing={3}>
              {filteredServices.map((svc) => (
                <Box
                  key={svc.id}
                  p={3}
                  borderWidth="1px"
                  borderRadius="md"
                  bg={getQuantity(svc.id) > 0 ? activeBg : cardBg}
                >
                  <HStack justify="space-between">
                    <Box>
                      <Text fontWeight="medium">{svc.name}</Text>
                      <Text fontSize="sm" color="gray.500">
                        ${svc.price.toFixed(2)} {svc.unit}
                      </Text>
                    </Box>
                    <HStack spacing={2}>
                      <IconButton
                        size="xs"
                        aria-label={`Decrease ${svc.name} quantity`}
                        onClick={() => handleRemoveQuantity(svc.id)}
                        isDisabled={getQuantity(svc.id) === 0}
                        variant="outline"
                        colorScheme="red"
                      >
                        −
                      </IconButton>
                      <Text fontWeight="bold" minW="20px" textAlign="center">
                        {getQuantity(svc.id)}
                      </Text>
                      <IconButton
                        size="xs"
                        aria-label={`Increase ${svc.name} quantity`}
                        onClick={() => handleAddQuantity(svc.id)}
                        variant="outline"
                        colorScheme="green"
                      >
                        +
                      </IconButton>
                    </HStack>
                  </HStack>
                </Box>
              ))}
              {filteredServices.length === 0 && (
                <Text fontSize="sm" color="gray.500">
                  No services available for this pricing model.
                </Text>
              )}
            </VStack>
          </Box>

          {/* Scheduling Interface */}
          <Box>
            <Heading size="sm" mb={3}>
              Schedule Pickup & Delivery
            </Heading>

            {/* Pickup Date Selection */}
            <Text fontSize="sm" fontWeight="medium" mb={2}>
              Pickup Date:
            </Text>
            <HStack spacing={2} mb={4} flexWrap="wrap">
              {timeSlots.map((ts, idx) => (
                <Button
                  key={idx}
                  size="sm"
                  variant={selectedDateIndex === idx ? 'solid' : 'outline'}
                  colorScheme={selectedDateIndex === idx ? 'blue' : 'gray'}
                  onClick={() => {
                    setSelectedDateIndex(idx);
                    setSelectedSlot('');
                  }}
                >
                  {formatDate(ts.date)}
                </Button>
              ))}
            </HStack>

            {/* Time Slot Selection */}
            <Text fontSize="sm" fontWeight="medium" mb={2}>
              Time Slot:
            </Text>
            <HStack spacing={2} mb={4} flexWrap="wrap">
              {timeSlots[selectedDateIndex]?.slots.map((slot) => (
                <Button
                  key={slot}
                  size="sm"
                  variant={selectedSlot === slot ? 'solid' : 'outline'}
                  colorScheme={selectedSlot === slot ? 'teal' : 'gray'}
                  onClick={() => setSelectedSlot(slot)}
                >
                  {slot}
                </Button>
              ))}
            </HStack>

            {/* Delivery Date */}
            <Text fontSize="sm" fontWeight="medium" mb={1}>
              Estimated Delivery:
            </Text>
            <Text fontSize="sm" color="gray.600">
              {selectedDateIndex < timeSlots.length - 1
                ? formatDate(timeSlots[selectedDateIndex + 1]?.date)
                : formatDate(timeSlots[selectedDateIndex]?.date)}{' '}
              (next business day)
            </Text>
          </Box>

          {/* Frequency Options */}
          <Box>
            <Heading size="sm" mb={3}>
              Order Frequency
            </Heading>
            <RadioGroup value={frequency} onChange={setFrequency}>
              <Stack direction={{ base: 'column', sm: 'row' }} spacing={3}>
                {FREQUENCY_OPTIONS.map((opt) => (
                  <Radio key={opt} value={opt} colorScheme="blue">
                    {opt}
                  </Radio>
                ))}
              </Stack>
            </RadioGroup>
            {frequency !== 'One-time' && (
              <Text fontSize="xs" color="blue.600" mt={2}>
                Your order will repeat {frequency.toLowerCase()} with automatic scheduling.
              </Text>
            )}
          </Box>
        </VStack>

        {/* Right Column: Order Summary */}
        <Box
          p={4}
          borderWidth="1px"
          borderRadius="md"
          bg={cardBg}
          position={{ lg: 'sticky' }}
          top={{ lg: '80px' }}
          alignSelf="start"
        >
          <Heading size="sm" mb={3}>
            Order Summary
          </Heading>

          {cartItems.length === 0 ? (
            <Text fontSize="sm" color="gray.500">
              No services selected. Add items from the list to see your order summary.
            </Text>
          ) : (
            <VStack align="stretch" spacing={2}>
              {cartItems.map((item) => (
                <HStack key={item.id} justify="space-between" fontSize="sm">
                  <Box>
                    <Text fontWeight="medium">{item.name}</Text>
                    <Text fontSize="xs" color="gray.500">
                      {item.quantity} × ${item.price.toFixed(2)} {item.unit}
                    </Text>
                  </Box>
                  <Text fontWeight="medium">
                    ${(item.price * item.quantity).toFixed(2)}
                  </Text>
                </HStack>
              ))}

              <Divider />

              {/* Scheduling Summary */}
              {selectedSlot && (
                <Box fontSize="xs" color="gray.600">
                  <Text>Pickup: {formatDate(timeSlots[selectedDateIndex]?.date)} · {selectedSlot}</Text>
                  <Text>
                    Delivery:{' '}
                    {selectedDateIndex < timeSlots.length - 1
                      ? formatDate(timeSlots[selectedDateIndex + 1]?.date)
                      : formatDate(timeSlots[selectedDateIndex]?.date)}
                  </Text>
                </Box>
              )}

              {/* Frequency Badge */}
              {frequency !== 'One-time' && (
                <Badge colorScheme="blue" alignSelf="start">
                  Recurring: {frequency}
                </Badge>
              )}

              <Divider />

              {/* Total */}
              <HStack justify="space-between" fontWeight="bold">
                <Text>Estimated Total</Text>
                <Text fontSize="lg">${orderTotal.toFixed(2)}</Text>
              </HStack>

              <Button colorScheme="blue" size="sm" mt={2} width="full">
                Place Order
              </Button>
            </VStack>
          )}
        </Box>
      </SimpleGrid>

      {/* Noscript block for SEO/crawlers */}
      <noscript>
        <section>
          <h2>Customer Ordering Experience</h2>
          <p>
            Smart Laundry Basket offers a flexible ordering system supporting both per-pound
            (weight-based) pricing and per-bag/per-piece (flat-rate) service selection. Customers
            can browse available services, select quantities, choose pickup and delivery time
            slots, and set up recurring orders on a Weekly, Bi-Weekly, or Monthly frequency.
          </p>
          <ul>
            <li>Per-pound pricing for Wash &amp; Fold services</li>
            <li>Per-bag/per-piece pricing for Dry Cleaning, Press Only, Comforter Cleaning, and Delicates</li>
            <li>Flexible scheduling with available time slots</li>
            <li>Order summary with pricing breakdown and estimated total</li>
            <li>Recurring order options: One-time, Weekly, Bi-Weekly, Monthly</li>
            <li>Next-day delivery estimates</li>
          </ul>
        </section>
      </noscript>
    </Box>
  );
};

export default CustomerOrderingView;
