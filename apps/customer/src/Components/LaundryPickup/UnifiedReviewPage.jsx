import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Box,
  VStack,
  HStack,
  Text,
  Heading,
  Button,
  Divider,
  Icon,
  Flex,
  IconButton,
  Badge,
  Input,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import {
  FaCalendarAlt,
  FaClock,
  FaTruck,
  FaEdit,
} from 'react-icons/fa';
import { format, parse } from 'date-fns';
import { getCartSubtotal, getAddonsTotal, getBilledWeight, billedQuantity } from './cartUtils';

/**
 * UnifiedReviewPage — Review step for the unified cart order flow.
 *
 * Displays all cart items (per-pound and per-piece) with line totals,
 * a grand total breakdown (subtotal, discount, tax, tip), schedule summary,
 * and action buttons (delete item, edit services, place order).
 */
export default function UnifiedReviewPage({
  cart,
  dispatch,
  laundryId,
  address,
  dropoffService,
  pickupDate,
  pickupTime,
  dropoffDate,
  dropoffTime,
  tip,
  setTip,
  taxRate = 0,
  promoCode,
  promoDescriptionMessage,
  frequency,
  subscriptionDiscount = 0,
  selectedAddons = [],
  onPlaceOrder,
  onEdit,
  orderProcessing,
}) {
  const items = cart.items || [];
  // Subtotal = services/products + selected add-ons (per-pound priced on the
  // order's billed weight). Must match handlePlaceOrder so what the customer
  // sees equals what is charged (Phase 2c).
  const billedWeight = getBilledWeight(items);
  const addonsTotal = getAddonsTotal(selectedAddons, billedWeight);
  const subtotal = getCartSubtotal(items) + addonsTotal;

  // Discount: subscription discount is a percentage of subtotal
  const discountAmount = subscriptionDiscount > 0
    ? subtotal * (subscriptionDiscount / 100)
    : 0;

  // Tax computed on (subtotal - discount)
  const taxableAmount = subtotal - discountAmount;
  const tax = taxRate > 0 ? taxableAmount * (taxRate / 100) : 0;

  // Tip. For a percentage tip, compute the dollar amount from the (post-discount)
  // taxable subtotal — there is no tip selector on this screen, so a default/
  // preset percentage would otherwise be stored as $0 and left out of the total.
  const tipAmount = tip?.tipType === 'percentage'
    ? Math.round(taxableAmount * ((parseFloat(tip?.tipPercentage) || 0) / 100) * 100) / 100
    : (parseFloat(tip?.tipAmount || '0') || 0);

  // Keep the shared tip state in sync so the placed order (handlePlaceOrder)
  // sends the computed dollar amount, not a stale $0.
  useEffect(() => {
    if (tip?.tipType === 'percentage') {
      const computed = (Math.round(taxableAmount * ((parseFloat(tip?.tipPercentage) || 0) / 100) * 100) / 100).toFixed(2);
      if (computed !== (tip?.tipAmount ?? '').toString() && typeof setTip === 'function') {
        setTip((prev) => ({ ...prev, tipAmount: computed }));
      }
    }
  }, [tip?.tipType, tip?.tipPercentage, taxableAmount, tip?.tipAmount, setTip]);

  // Delivery fee (Phase 3). Quoted from the server so the customer sees the fee
  // as its own line before paying. The server is authoritative — it recomputes
  // the same fee at order create. When the tenant is on mode 'none' (or the
  // dropoff leg is Uber, which prices itself) the quote returns applies:false
  // and nothing is shown. Fails silently to $0 so it never blocks the flow.
  const [deliveryFeeInfo, setDeliveryFeeInfo] = useState({ applies: false, fee: 0, distanceMi: null });
  useEffect(() => {
    if (!laundryId) return;
    let active = true;
    const base = process.env.REACT_APP_AWS_API_URL || '';
    axios.get(`${base}/api/customer/quote-delivery-fee`, {
      params: { laundryId, address: address || '', dropoffService: dropoffService || 'LaundryDriver' },
    }).then((res) => {
      const d = res?.data || {};
      if (active) {
        setDeliveryFeeInfo({
          applies: !!d.applies,
          fee: parseFloat(d.fee || 0) || 0,
          distanceMi: d.distanceMi != null ? parseFloat(d.distanceMi) : null,
        });
      }
    }).catch(() => {
      if (active) setDeliveryFeeInfo({ applies: false, fee: 0, distanceMi: null });
    });
    return () => { active = false; };
  }, [laundryId, address, dropoffService]);

  const deliveryFee = deliveryFeeInfo.applies ? (deliveryFeeInfo.fee || 0) : 0;

  // Grand total (delivery fee folded in after tax + tip, matching the server).
  const grandTotal = taxableAmount + tax + tipAmount + deliveryFee;

  // Check if any per-pound items exist
  const hasPerPoundItems = items.some(item => item.inputWeight === true);

  // Format dates for display
  const formattedPickupDate = pickupDate
    ? format(parse(pickupDate, 'yyyy-MM-dd', new Date()), 'MMMM d, yyyy')
    : '';
  const formattedDropoffDate = dropoffDate
    ? format(parse(dropoffDate, 'yyyy-MM-dd', new Date()), 'MMMM d, yyyy')
    : '';

  const handleRemoveItem = (serviceId) => {
    dispatch({ type: 'REMOVE_ITEM', serviceId });
  };

  return (
    <VStack spacing={4} align="stretch" w="100%" maxW="500px" mx="auto" py={2}>
      <Heading size={{ base: 'md', md: 'lg' }} textAlign="center" color="gray.800">
        Review Your Order
      </Heading>

      {/* Items card */}
      <Box
        bg="white"
        borderRadius="2xl"
        p={{ base: 5, md: 6 }}
        boxShadow="sm"
        border="1px solid"
        borderColor="gray.100"
      >
        <Flex justify="space-between" align="center" mb={4}>
          <Heading size="sm" color="gray.700">
            Order Items
          </Heading>
          <Button
            size="xs"
            variant="ghost"
            colorScheme="blue"
            leftIcon={<Icon as={FaEdit} />}
            onClick={onEdit}
            aria-label="Edit Services"
          >
            Edit Services
          </Button>
        </Flex>

        {items.length === 0 ? (
          <Text fontSize="sm" color="gray.500" textAlign="center" py={4}>
            Your cart is empty.
          </Text>
        ) : (
          <VStack spacing={3} align="stretch" divider={<Divider />}>
            {items.map((item) => {
              const billedQty = billedQuantity(item);
              const lineTotal = billedQty * item.price;
              const wasFloored = item.inputWeight && billedQty > (item.quantity || 0);
              return (
                <Flex key={item.serviceId} justify="space-between" align="center">
                  <VStack align="flex-start" spacing={0} flex="1">
                    <Text fontWeight="600" fontSize="sm" color="gray.800">
                      {item.serviceName}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {item.inputWeight
                        ? `${billedQty} lbs × $${item.price.toFixed(2)}/lb = $${lineTotal.toFixed(2)}`
                        : `${item.quantity} × $${item.price.toFixed(2)} = $${lineTotal.toFixed(2)}`}
                    </Text>
                    {wasFloored && (
                      <Text fontSize="xs" color="orange.600">
                        Billed at {billedQty} lb minimum (you entered {item.quantity} lb)
                      </Text>
                    )}
                  </VStack>
                  <HStack spacing={2}>
                    <Text fontWeight="bold" fontSize="sm" color="blue.600">
                      ${lineTotal.toFixed(2)}
                    </Text>
                    <IconButton
                      icon={<CloseIcon />}
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      aria-label={`Remove ${item.serviceName}`}
                      onClick={() => handleRemoveItem(item.serviceId)}
                    />
                  </HStack>
                </Flex>
              );
            })}
          </VStack>
        )}
      </Box>

      {/* Schedule card */}
      <Box
        bg="white"
        borderRadius="2xl"
        p={{ base: 5, md: 6 }}
        boxShadow="sm"
        border="1px solid"
        borderColor="gray.100"
      >
        <Heading size="sm" mb={3} color="gray.700">Schedule</Heading>
        <VStack spacing={3} align="stretch">
          {/* Pickup */}
          <Flex justify="space-between" align="center">
            <HStack spacing={2}>
              <Icon as={FaCalendarAlt} color="blue.400" boxSize={4} />
              <Text fontSize="sm" fontWeight="600">Pickup</Text>
            </HStack>
            <VStack align="flex-end" spacing={0}>
              <Text fontSize="sm" color="gray.700">{formattedPickupDate}</Text>
              <HStack spacing={1}>
                <Icon as={FaClock} color="gray.400" boxSize={3} />
                <Text fontSize="xs" color="gray.500">{pickupTime}</Text>
              </HStack>
            </VStack>
          </Flex>

          <Divider />

          {/* Dropoff */}
          <Flex justify="space-between" align="center">
            <HStack spacing={2}>
              <Icon as={FaTruck} color="blue.400" boxSize={4} />
              <Text fontSize="sm" fontWeight="600">Dropoff</Text>
            </HStack>
            <VStack align="flex-end" spacing={0}>
              <Text fontSize="sm" color="gray.700">{formattedDropoffDate}</Text>
              <HStack spacing={1}>
                <Icon as={FaClock} color="gray.400" boxSize={3} />
                <Text fontSize="xs" color="gray.500">{dropoffTime}</Text>
              </HStack>
            </VStack>
          </Flex>
        </VStack>
      </Box>

      {/* Frequency / Promo info */}
      {(frequency || promoCode) && (
        <Box
          bg="white"
          borderRadius="2xl"
          p={{ base: 5, md: 6 }}
          boxShadow="sm"
          border="1px solid"
          borderColor="gray.100"
        >
          {frequency && (
            <HStack spacing={2} mb={promoCode ? 2 : 0}>
              <Text fontSize="sm" fontWeight="600" color="gray.700">Frequency:</Text>
              <Badge colorScheme="purple" borderRadius="full" px={2}>
                {frequency}
              </Badge>
            </HStack>
          )}
          {promoCode && (
            <VStack spacing={1} align="flex-start">
              <HStack spacing={2}>
                <Text fontSize="sm" fontWeight="600" color="gray.700">Promo:</Text>
                <Badge colorScheme="green" borderRadius="full" px={2}>
                  {promoCode}
                </Badge>
              </HStack>
              {promoDescriptionMessage && (
                <Text fontSize="xs" color="green.600">{promoDescriptionMessage}</Text>
              )}
              <Text fontSize="xs" color="gray.500" fontStyle="italic">
                * Discount will be applied after your laundry is delivered
              </Text>
            </VStack>
          )}
        </Box>
      )}

      {/* Selected add-ons (Phase 2c) */}
      {selectedAddons.length > 0 && (
        <Box
          bg="gray.50"
          borderRadius="xl"
          p={3}
          border="1px solid"
          borderColor="gray.100"
        >
          <Text fontWeight="600" fontSize="sm" color="gray.700" mb={1}>Add-Ons</Text>
          {selectedAddons.map((a) => {
            const unit = parseFloat(a.unitPrice) || 0;
            const qty = a.pricingBasis === 'per_pound' ? billedWeight : (parseFloat(a.quantity) || 0);
            const amount = unit * qty;
            return (
              <Flex key={a.addonId} justify="space-between" align="center" fontSize="sm" color="gray.600">
                <Text>
                  {a.addonName}
                  {a.pricingBasis === 'per_pound'
                    ? ` (${billedWeight} lb × $${unit.toFixed(2)})`
                    : ` (×${qty})`}
                </Text>
                <Text>${amount.toFixed(2)}</Text>
              </Flex>
            );
          })}
        </Box>
      )}

      {/* Tip selector — customer can choose a preset percentage or a custom amount */}
      <Box
        bg="white"
        borderRadius="2xl"
        p={4}
        border="1px solid"
        borderColor="gray.200"
      >
        <Text fontWeight="600" color="gray.700" mb={2}>Add a tip</Text>
        <Wrap spacing={2}>
          {[5, 10, 15, 20, 25].map((pct) => {
            const isSelected = tip?.tipType === 'percentage'
              && parseFloat(tip?.tipPercentage) === pct;
            return (
              <WrapItem key={pct}>
                <Button
                  size="sm"
                  borderRadius="lg"
                  variant={isSelected ? 'solid' : 'outline'}
                  colorScheme="blue"
                  onClick={() => setTip((prev) => ({
                    ...prev,
                    tipType: 'percentage',
                    tipPercentage: pct,
                    // tipAmount recomputed by the effect above from the taxable subtotal
                  }))}
                >
                  {pct}%
                </Button>
              </WrapItem>
            );
          })}
          <WrapItem>
            <Button
              size="sm"
              borderRadius="lg"
              variant={tip?.tipType === 'custom' ? 'solid' : 'outline'}
              colorScheme="blue"
              onClick={() => setTip((prev) => ({
                ...prev,
                tipType: 'custom',
                tipPercentage: 0,
                tipAmount: prev?.tipType === 'custom' ? prev.tipAmount : '',
              }))}
            >
              Custom
            </Button>
          </WrapItem>
          <WrapItem>
            <Button
              size="sm"
              borderRadius="lg"
              variant={tip?.tipType === 'noTip' ? 'solid' : 'outline'}
              colorScheme="gray"
              onClick={() => setTip((prev) => ({
                ...prev,
                tipType: 'noTip',
                tipPercentage: 0,
                tipAmount: '0.00',
              }))}
            >
              No Tip
            </Button>
          </WrapItem>
        </Wrap>

        {tip?.tipType === 'custom' && (
          <HStack mt={3} maxW="200px">
            <Text color="gray.600">$</Text>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={tip?.tipAmount ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setTip((prev) => ({ ...prev, tipType: 'custom', tipPercentage: 0, tipAmount: v }));
              }}
              size="sm"
              borderRadius="lg"
            />
          </HStack>
        )}
      </Box>

      {/* Grand total section */}
      <Box
        bg="blue.50"
        borderRadius="2xl"
        p={4}
        border="1px solid"
        borderColor="blue.100"
      >
        <Flex justify="space-between" align="center">
          <Text fontWeight="600" color="gray.700">Subtotal</Text>
          <Text color="gray.700">${subtotal.toFixed(2)}</Text>
        </Flex>

        {discountAmount > 0 && (
          <Flex justify="space-between" align="center" mt={1}>
            <Text fontSize="sm" color="green.600" fontWeight="600">
              Discount ({subscriptionDiscount}%)
            </Text>
            <Text fontSize="sm" color="green.600" fontWeight="600">
              -${discountAmount.toFixed(2)}
            </Text>
          </Flex>
        )}

        {tax > 0 && (
          <Flex justify="space-between" align="center" mt={1}>
            <Text fontSize="sm" color="gray.500">Tax ({taxRate}%)</Text>
            <Text fontSize="sm" color="gray.500">${tax.toFixed(2)}</Text>
          </Flex>
        )}

        {tipAmount > 0 && (
          <Flex justify="space-between" align="center" mt={1}>
            <Text fontSize="sm" color="gray.500">
              Tip{tip?.tipType === 'percentage' && tip?.tipPercentage ? ` (${tip.tipPercentage}%)` : ''}
            </Text>
            <Text fontSize="sm" color="gray.500">${tipAmount.toFixed(2)}</Text>
          </Flex>
        )}

        {deliveryFee > 0 && (
          <Flex justify="space-between" align="center" mt={1}>
            <Text fontSize="sm" color="gray.500">
              Delivery fee{deliveryFeeInfo.distanceMi != null ? ` (${deliveryFeeInfo.distanceMi.toFixed(1)} mi)` : ''}
            </Text>
            <Text fontSize="sm" color="gray.500">${deliveryFee.toFixed(2)}</Text>
          </Flex>
        )}

        <Divider my={2} borderColor="blue.200" />

        <Flex justify="space-between" align="center">
          <Text fontWeight="bold" fontSize="lg" color="gray.800">Grand Total</Text>
          <Text fontWeight="bold" fontSize="lg" color="blue.600">
            ${grandTotal.toFixed(2)}
          </Text>
        </Flex>
      </Box>

      {/* Per-pound disclaimer */}
      {hasPerPoundItems && (
        <Text fontSize="xs" fontStyle="italic" color="gray.500" px={2}>
          * final price based on actual weight
        </Text>
      )}

      {/* Place Order button */}
      <Button
        colorScheme="blue"
        size="lg"
        borderRadius="xl"
        w="100%"
        onClick={onPlaceOrder}
        isDisabled={items.length === 0}
        isLoading={orderProcessing}
        loadingText="Placing Order..."
        boxShadow="lg"
      >
        Place Order — ${grandTotal.toFixed(2)}
      </Button>
    </VStack>
  );
}
