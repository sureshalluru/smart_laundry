import React, { useState, useMemo } from 'react';
import {
  Box,
  Heading,
  Text,
  SimpleGrid,
  HStack,
  VStack,
  Button,
  IconButton,
  Divider,
  Input,
  InputGroup,
  InputLeftElement,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  useColorModeValue,
} from '@chakra-ui/react';
import { getDemoData } from '../demoMockData';
import DemoHint from '../DemoHint';

/**
 * QuickPOSView
 *
 * Simulates the point-of-sale checkout interface used by counter staff
 * for walk-in customers: tap-to-order service grid, cart management,
 * payment selection, customer phone lookup, and receipt summary.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
const QuickPOSView = () => {
  const { services, paymentMethods } = getDemoData('quickPOS');

  const [cart, setCart] = useState({});
  const [selectedPayment, setSelectedPayment] = useState('PAY-01');
  const [phoneNumber, setPhoneNumber] = useState('');
  const { isOpen, onOpen, onClose } = useDisclosure();

  const cardBg = useColorModeValue('gray.50', 'gray.700');
  const tileBg = useColorModeValue('white', 'gray.600');
  const tileActiveBg = useColorModeValue('blue.50', 'blue.900');
  const paymentActiveBg = useColorModeValue('green.50', 'green.900');

  // Calculate running total
  const orderTotal = useMemo(() => {
    return Object.entries(cart).reduce((sum, [serviceId, qty]) => {
      const svc = services.find((s) => s.id === serviceId);
      if (svc && qty > 0) return sum + svc.price * qty;
      return sum;
    }, 0);
  }, [cart, services]);

  // Get cart items with service details
  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([serviceId, qty]) => {
        const svc = services.find((s) => s.id === serviceId);
        return svc ? { ...svc, quantity: qty } : null;
      })
      .filter(Boolean);
  }, [cart, services]);

  // Get selected payment method name
  const selectedPaymentName = useMemo(() => {
    const pm = paymentMethods.find((p) => p.id === selectedPayment);
    return pm ? pm.name : 'Card';
  }, [paymentMethods, selectedPayment]);

  // Tap a service tile → add to cart (or increment)
  const handleTileClick = (serviceId) => {
    setCart((prev) => ({ ...prev, [serviceId]: (prev[serviceId] || 0) + 1 }));
  };

  // Increase quantity
  const handleIncrease = (serviceId) => {
    setCart((prev) => ({ ...prev, [serviceId]: (prev[serviceId] || 0) + 1 }));
  };

  // Decrease quantity (remove if reaches 0)
  const handleDecrease = (serviceId) => {
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

  const handleCompleteOrder = () => {
    if (cartItems.length > 0) {
      onOpen();
    }
  };

  const generateOrderNumber = () => {
    return `POS-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  };

  return (
    <Box>
      <Heading size="md" mb={4}>
        Quick POS — Walk-In Checkout
      </Heading>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {/* Left Column: Service Grid + Payment */}
        <VStack align="stretch" spacing={6}>
          {/* Service Tiles Grid */}
          <Box>
            <Heading size="sm" mb={3}>
              Services
              <DemoHint text="👆 Tap to add to cart" />
            </Heading>
            <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3}>
              {services.map((svc) => (
                <Box
                  key={svc.id}
                  p={4}
                  borderWidth="1px"
                  borderRadius="md"
                  bg={getQuantity(svc.id) > 0 ? tileActiveBg : tileBg}
                  cursor="pointer"
                  textAlign="center"
                  transition="all 0.15s"
                  _hover={{ shadow: 'md', transform: 'translateY(-1px)' }}
                  onClick={() => handleTileClick(svc.id)}
                  role="button"
                  aria-label={`Add ${svc.name} to cart — $${svc.price.toFixed(2)}`}
                >
                  <Text fontSize="2xl" mb={1}>
                    {svc.icon}
                  </Text>
                  <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
                    {svc.name}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    ${svc.price.toFixed(2)}
                  </Text>
                  {getQuantity(svc.id) > 0 && (
                    <Badge colorScheme="blue" mt={1}>
                      ×{getQuantity(svc.id)}
                    </Badge>
                  )}
                </Box>
              ))}
            </SimpleGrid>
          </Box>

          {/* Payment Methods */}
          <Box>
            <Heading size="sm" mb={3}>
              Payment Method
            </Heading>
            <HStack spacing={3}>
              {paymentMethods.map((pm) => (
                <Button
                  key={pm.id}
                  size="sm"
                  variant={selectedPayment === pm.id ? 'solid' : 'outline'}
                  colorScheme={selectedPayment === pm.id ? 'green' : 'gray'}
                  bg={selectedPayment === pm.id ? paymentActiveBg : undefined}
                  onClick={() => setSelectedPayment(pm.id)}
                  leftIcon={<Text>{pm.icon}</Text>}
                  aria-pressed={selectedPayment === pm.id}
                >
                  {pm.name}
                </Button>
              ))}
            </HStack>
          </Box>

          {/* Customer Phone Lookup */}
          <Box>
            <Heading size="sm" mb={3}>
              Customer Lookup
            </Heading>
            <InputGroup size="sm">
              <InputLeftElement pointerEvents="none">
                <Text fontSize="sm">📱</Text>
              </InputLeftElement>
              <Input
                placeholder="Enter customer phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                aria-label="Customer phone number"
              />
            </InputGroup>
            {phoneNumber.length >= 10 && (
              <Text fontSize="xs" color="green.600" mt={1}>
                Customer found: Returning customer
              </Text>
            )}
          </Box>
        </VStack>

        {/* Right Column: Cart */}
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
            Cart
          </Heading>

          {cartItems.length === 0 ? (
            <Text fontSize="sm" color="gray.500">
              Tap a service tile to add items to the cart.
            </Text>
          ) : (
            <VStack align="stretch" spacing={2}>
              {cartItems.map((item) => (
                <HStack key={item.id} justify="space-between" fontSize="sm">
                  <Box flex="1">
                    <Text fontWeight="medium">
                      {item.icon} {item.name}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      ${item.price.toFixed(2)} each
                    </Text>
                  </Box>
                  <HStack spacing={1}>
                    <IconButton
                      size="xs"
                      aria-label={`Decrease ${item.name} quantity`}
                      onClick={() => handleDecrease(item.id)}
                      variant="outline"
                      colorScheme="red"
                    >
                      −
                    </IconButton>
                    <Text fontWeight="bold" minW="20px" textAlign="center">
                      {item.quantity}
                    </Text>
                    <IconButton
                      size="xs"
                      aria-label={`Increase ${item.name} quantity`}
                      onClick={() => handleIncrease(item.id)}
                      variant="outline"
                      colorScheme="green"
                    >
                      +
                    </IconButton>
                  </HStack>
                  <Text fontWeight="medium" minW="60px" textAlign="right">
                    ${(item.price * item.quantity).toFixed(2)}
                  </Text>
                </HStack>
              ))}

              <Divider />

              {/* Running Total */}
              <HStack justify="space-between" fontWeight="bold">
                <Text>Total</Text>
                <Text fontSize="lg">${orderTotal.toFixed(2)}</Text>
              </HStack>

              {/* Payment indicator */}
              <Text fontSize="xs" color="gray.500">
                Payment: {selectedPaymentName}
              </Text>

              {/* Complete Order Button */}
              <Button
                colorScheme="blue"
                size="md"
                mt={2}
                width="full"
                onClick={handleCompleteOrder}
              >
                Complete Order
              </Button>
            </VStack>
          )}
        </Box>
      </SimpleGrid>

      {/* Receipt Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader textAlign="center">🧾 Receipt</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between">
                <Text fontSize="sm" fontWeight="medium">Order #</Text>
                <Text fontSize="sm">{generateOrderNumber()}</Text>
              </HStack>
              <Divider />
              {cartItems.map((item) => (
                <HStack key={item.id} justify="space-between" fontSize="sm">
                  <Text>
                    {item.name} × {item.quantity}
                  </Text>
                  <Text>${(item.price * item.quantity).toFixed(2)}</Text>
                </HStack>
              ))}
              <Divider />
              <HStack justify="space-between" fontWeight="bold">
                <Text>Total</Text>
                <Text>${orderTotal.toFixed(2)}</Text>
              </HStack>
              <HStack justify="space-between" fontSize="sm">
                <Text color="gray.500">Payment</Text>
                <Text>{selectedPaymentName}</Text>
              </HStack>
              {phoneNumber && (
                <HStack justify="space-between" fontSize="sm">
                  <Text color="gray.500">Customer</Text>
                  <Text>{phoneNumber}</Text>
                </HStack>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={onClose} width="full">
              Done
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Noscript block for SEO/crawlers */}
      <noscript>
        <section>
          <h2>Quick POS — Point-of-Sale Checkout</h2>
          <p>
            Smart Laundry Basket's Quick POS system allows counter staff to process walk-in
            customer orders with a fast, tap-based interface. Services include Wash &amp; Fold,
            Dry Cleaning, Press Only, Comforter Cleaning, Alterations, and Stain Removal.
          </p>
          <ul>
            <li>Tap-to-add service grid with real-time cart management</li>
            <li>Quantity controls (plus/minus) for each cart item</li>
            <li>Running order total that updates instantly</li>
            <li>Payment method selection: Card, Cash, or Terminal</li>
            <li>Customer phone number lookup for returning customers</li>
            <li>Simulated receipt summary on order completion</li>
          </ul>
        </section>
      </noscript>
    </Box>
  );
};

export default QuickPOSView;
