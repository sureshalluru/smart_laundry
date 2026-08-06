import React, { useEffect, useState, useCallback } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Heading,
    IconButton,
    Button,
    Divider,
    FormControl,
    FormLabel,
    Select,
    Textarea,
    Flex,
    Icon,
    Badge,
} from '@chakra-ui/react';
import { FaShoppingBag, FaMinus, FaPlus } from 'react-icons/fa';
import { toZonedTime, format } from 'date-fns-tz';
import { addDays } from 'date-fns';

/**
 * BagOrderPage — Per-piece/flat-rate service selection + scheduling.
 * Shows all services as cards with individual +/- counters (multi-item cart).
 * Mobile-first design.
 */
export default function BagOrderPage({
    bagPrice,
    setBagPrice,
    laundryBags,
    setLaundryBags,
    pickupDate,
    setPickupDate,
    pickupTime,
    setPickupTime,
    dropoffDate,
    setDropoffDate,
    dropoffTime,
    setDropoffTime,
    specialInstructions,
    setSpecialInstructions,
    deliveryTimeSlots,
    deliveryTimeInterval,
    laundryTimeZone,
    setIsServiceStepValid,
    handleNextStep,
    isServiceStepValid,
    pickupService,
    setPickupService,
    dropoffService,
    setDropoffService,
    laundryServices = [],
    categoryName = '',
    subscriptionDiscount = 0,
    frequency,
    setFrequency,
    laundryFrequency = [],
}) {
    const [availablePickupSlots, setAvailablePickupSlots] = useState([]);
    const [availableDropoffSlots, setAvailableDropoffSlots] = useState([]);

    // Cart: { serviceName: quantity } for each service
    const [cart, setCart] = useState({});

    // Get per-piece services (non-weight-based)
    const perPieceServices = laundryServices.filter(s => !s.inputWeight || s.inputWeight === false || s.inputWeight === 'false');

    // Calculate totals from cart
    const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
    const totalCost = perPieceServices.reduce((sum, svc) => {
        const qty = cart[svc.serviceName] || 0;
        return sum + qty * parseFloat(svc.price || 0);
    }, 0).toFixed(2);

    // Update parent state when cart changes
    useEffect(() => {
        setLaundryBags(totalItems || 1);
        // Set bagPrice to average or first item price for backward compat
        if (totalItems > 0 && setBagPrice) {
            setBagPrice(parseFloat(totalCost) / totalItems);
        }
    }, [cart, totalItems, totalCost]);

    const updateCart = (serviceName, delta) => {
        setCart(prev => {
            const current = prev[serviceName] || 0;
            const newQty = Math.max(0, current + delta);
            if (newQty === 0) {
                const { [serviceName]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [serviceName]: newQty };
        });
    };

    // Utility: get date in laundry timezone
    const getDateInTimeZone = useCallback((date, timeZone) => {
        const zoned = toZonedTime(date, timeZone || 'America/New_York');
        return format(zoned, 'yyyy-MM-dd', { timeZone: timeZone || 'America/New_York' });
    }, []);

    // Generate time slots based on delivery intervals
    const generateTimeSlots = useCallback((date) => {
        if (!deliveryTimeSlots || !date) return [];
        const tz = laundryTimeZone || 'America/New_York';
        const dateObj = new Date(date + 'T12:00:00');
        const zonedDate = toZonedTime(dateObj, tz);
        const dayName = format(zonedDate, 'EEEE', { timeZone: tz });

        const daySlot = deliveryTimeSlots.find(
            (s) => s.day.toLowerCase() === dayName.toLowerCase()
        );
        if (!daySlot) return [];

        const intervalHours = parseInt(deliveryTimeInterval) || 2;
        const interval = intervalHours <= 10 ? intervalHours * 60 : intervalHours;
        const [startH, startM] = daySlot.startTime.split(':').map(Number);
        const [endH, endM] = daySlot.endTime.split(':').map(Number);
        const startMin = startH * 60 + (startM || 0);
        const endMin = endH * 60 + (endM || 0);

        const slots = [];
        for (let m = startMin; m + interval <= endMin; m += interval) {
            const sH = Math.floor(m / 60);
            const sM = m % 60;
            const eH = Math.floor((m + interval) / 60);
            const eM = (m + interval) % 60;
            const slotStr = `${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')} - ${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}`;
            slots.push(slotStr);
        }
        return slots;
    }, [deliveryTimeSlots, deliveryTimeInterval, laundryTimeZone]);

    // Determine if same-day pickup is available (before 1 PM in laundry timezone)
    const isSameDayAvailable = useCallback(() => {
        return new Date().getHours() < 13; // Before 1 PM local time
    }, []);

    // Initialize dates
    useEffect(() => {
        const tz = laundryTimeZone || 'America/Chicago';
        if (!pickupDate) {
            if (isSameDayAvailable()) {
                const today = new Date().toISOString().split('T')[0];
                setPickupDate(today);
            } else {
                const tomorrow = getDateInTimeZone(addDays(new Date(), 1), tz);
                setPickupDate(tomorrow);
            }
        }
        if (!dropoffDate && pickupDate) {
            let tryDate = addDays(new Date(pickupDate + 'T12:00:00'), 1);
            for (let i = 0; i < 7; i++) {
                const dateStr = getDateInTimeZone(tryDate, tz);
                const slots = generateTimeSlots(dateStr);
                if (slots.length > 0) {
                    setDropoffDate(dateStr);
                    break;
                }
                tryDate = addDays(tryDate, 1);
            }
        }
        setPickupService('LaundryDriver');
        setDropoffService('LaundryDriver');
    }, [laundryTimeZone, pickupDate, deliveryTimeSlots, generateTimeSlots, isSameDayAvailable]);

    // Generate slots when dates change
    useEffect(() => {
        if (pickupDate) {
            const slots = generateTimeSlots(pickupDate);
            setAvailablePickupSlots(slots);
            if (slots.length > 0 && !pickupTime) {
                setPickupTime(slots[0]);
            }
        }
    }, [pickupDate, generateTimeSlots]);

    useEffect(() => {
        if (dropoffDate) {
            const slots = generateTimeSlots(dropoffDate);
            setAvailableDropoffSlots(slots.length > 0 ? slots : availablePickupSlots);
            if (!dropoffTime) {
                const finalSlots = slots.length > 0 ? slots : availablePickupSlots;
                if (finalSlots.length > 0) setDropoffTime(finalSlots[0]);
            }
        } else if (availablePickupSlots.length > 0) {
            setAvailableDropoffSlots(availablePickupSlots);
            if (!dropoffTime) setDropoffTime(availablePickupSlots[0]);
        }
    }, [dropoffDate, generateTimeSlots, availablePickupSlots]);

    // Validate step — at least 1 item in cart + dates/times
    useEffect(() => {
        const isValid = totalItems >= 1 && pickupDate && pickupTime && dropoffDate && dropoffTime;
        setIsServiceStepValid(!!isValid);
    }, [totalItems, pickupDate, pickupTime, dropoffDate, dropoffTime, setIsServiceStepValid]);

    const minPickupDate = isSameDayAvailable()
        ? new Date().toISOString().split('T')[0]
        : getDateInTimeZone(addDays(new Date(), 1), laundryTimeZone || 'America/Chicago');

    const handlePickupDateChange = (e) => {
        const newDate = e.target.value;
        setPickupDate(newDate);
        const tz = laundryTimeZone || 'America/New_York';
        const drop = getDateInTimeZone(addDays(new Date(newDate + 'T12:00:00'), 2), tz);
        setDropoffDate(drop);
    };

    return (
        <VStack spacing={5} align="stretch" w="100%" maxW="500px" mx="auto" py={2}>
            {/* Services cart */}
            <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                <VStack spacing={4} align="stretch">
                    <Flex justify="space-between" align="center">
                        <HStack spacing={3}>
                            <Box bg="blue.50" borderRadius="lg" p={2}>
                                <Icon as={FaShoppingBag} color="blue.500" boxSize={5} />
                            </Box>
                            <VStack align="flex-start" spacing={0}>
                                <Heading size="sm" color="gray.800">
                                    {categoryName || 'Services'}
                                </Heading>
                                <Text fontSize="sm" color="gray.500">
                                    Add items to your order
                                </Text>
                            </VStack>
                        </HStack>
                        {totalItems > 0 && (
                            <Badge colorScheme="blue" borderRadius="full" px={3} py={1} fontSize="sm">
                                ${totalCost}
                            </Badge>
                        )}
                    </Flex>

                    {/* Service cards with +/- counters */}
                    <VStack spacing={2}>
                        {perPieceServices.map((svc) => {
                            const qty = cart[svc.serviceName] || 0;
                            return (
                                <Box
                                    key={svc.serviceName}
                                    w="100%"
                                    p={3}
                                    borderRadius="xl"
                                    border="2px solid"
                                    borderColor={qty > 0 ? 'blue.400' : 'gray.200'}
                                    bg={qty > 0 ? 'blue.50' : 'white'}
                                    transition="all 0.2s"
                                >
                                    <Flex justify="space-between" align="center">
                                        <Box flex="1">
                                            <Text fontWeight="700" fontSize="sm" color="gray.800">{svc.serviceName}</Text>
                                            {svc.description && <Text fontSize="xs" color="gray.500">{svc.description}</Text>}
                                            <Text fontSize="md" fontWeight="800" color="blue.600">${parseFloat(svc.price).toFixed(2)}</Text>
                                        </Box>
                                        <HStack spacing={2}>
                                            {qty > 0 && (
                                                <IconButton
                                                    icon={<FaMinus />}
                                                    aria-label="Decrease"
                                                    size="sm"
                                                    borderRadius="full"
                                                    colorScheme="blue"
                                                    variant="outline"
                                                    onClick={() => updateCart(svc.serviceName, -1)}
                                                />
                                            )}
                                            {qty > 0 && (
                                                <Text fontWeight="bold" fontSize="lg" minW="24px" textAlign="center">
                                                    {qty}
                                                </Text>
                                            )}
                                            <IconButton
                                                icon={<FaPlus />}
                                                aria-label="Add"
                                                size="sm"
                                                borderRadius="full"
                                                colorScheme="blue"
                                                variant={qty > 0 ? 'outline' : 'solid'}
                                                onClick={() => updateCart(svc.serviceName, 1)}
                                            />
                                        </HStack>
                                    </Flex>
                                </Box>
                            );
                        })}
                    </VStack>

                    {/* Cart summary */}
                    {totalItems > 0 && (
                        <Box bg="gray.50" borderRadius="lg" p={3}>
                            <Flex justify="space-between" align="center">
                                <Text fontSize="sm" color="gray.600">{totalItems} item{totalItems > 1 ? 's' : ''}</Text>
                                <Text fontSize="lg" fontWeight="800" color="gray.800">${totalCost}</Text>
                            </Flex>
                        </Box>
                    )}
                </VStack>
            </Box>

            {/* Subscribe & Save section — only show if discount configured */}
            {subscriptionDiscount > 0 && laundryFrequency.length > 0 && (
                <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor={frequency ? "green.300" : "gray.100"}>
                    <VStack spacing={3} align="stretch">
                        <Flex justify="space-between" align="center">
                            <HStack spacing={2}>
                                <Text fontSize="lg">📦</Text>
                                <VStack align="flex-start" spacing={0}>
                                    <Text fontWeight="700" fontSize="sm" color="gray.800">Subscribe & Save {subscriptionDiscount}%</Text>
                                    <Text fontSize="xs" color="gray.500">Auto-charge weekly, save on every order</Text>
                                </VStack>
                            </HStack>
                            {frequency && (
                                <Badge colorScheme="green" borderRadius="full" px={3} py={1} fontSize="xs">Active</Badge>
                            )}
                        </Flex>
                        <HStack spacing={2}>
                            {laundryFrequency.map((opt) => (
                                <Button
                                    key={opt}
                                    size="sm"
                                    borderRadius="full"
                                    variant={frequency === opt ? 'solid' : 'outline'}
                                    colorScheme={frequency === opt ? 'green' : 'gray'}
                                    onClick={() => setFrequency(frequency === opt ? null : opt)}
                                >
                                    {opt}
                                </Button>
                            ))}
                            {frequency && (
                                <Button size="sm" variant="ghost" colorScheme="red" onClick={() => setFrequency(null)}>
                                    Cancel
                                </Button>
                            )}
                        </HStack>
                        {frequency && (
                            <Box bg="green.50" borderRadius="md" p={2}>
                                <Text fontSize="xs" color="green.700">
                                    ✅ You'll save {subscriptionDiscount}% on every {frequency.toLowerCase()} order. Card charged automatically when order is processed.
                                </Text>
                            </Box>
                        )}
                    </VStack>
                </Box>
            )}

            {/* Schedule section */}
            <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                <Heading size="sm" mb={4} color="gray.800">Schedule Pickup & Dropoff</Heading>
                <VStack spacing={4} align="stretch">
                    <Box>
                        <Text fontSize="sm" fontWeight="600" color="blue.600" mb={2}>Pickup</Text>
                        <HStack spacing={3}>
                            <FormControl>
                                <FormLabel fontSize="xs" color="gray.500">Date</FormLabel>
                                <input type="date" value={pickupDate} min={minPickupDate} onChange={handlePickupDateChange}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px' }} />
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="xs" color="gray.500">Time</FormLabel>
                                <Select size="sm" borderRadius="lg" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)}>
                                    {availablePickupSlots.map((slot) => (<option key={slot} value={slot}>{slot}</option>))}
                                </Select>
                            </FormControl>
                        </HStack>
                    </Box>
                    <Divider />
                    <Box>
                        <Text fontSize="sm" fontWeight="600" color="blue.600" mb={2}>Dropoff</Text>
                        <HStack spacing={3}>
                            <FormControl>
                                <FormLabel fontSize="xs" color="gray.500">Date</FormLabel>
                                <input type="date" value={dropoffDate} min={pickupDate || minPickupDate} onChange={(e) => setDropoffDate(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px' }} />
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="xs" color="gray.500">Time</FormLabel>
                                <Select size="sm" borderRadius="lg" value={dropoffTime} onChange={(e) => setDropoffTime(e.target.value)}>
                                    {availableDropoffSlots.map((slot) => (<option key={slot} value={slot}>{slot}</option>))}
                                </Select>
                            </FormControl>
                        </HStack>
                    </Box>
                </VStack>
            </Box>

            {/* Special Instructions */}
            <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                <FormControl>
                    <FormLabel fontSize="sm" fontWeight="600" color="gray.700">Special Instructions (optional)</FormLabel>
                    <Textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)}
                        placeholder="e.g. Separate whites and colors, use unscented detergent..." size="sm" borderRadius="lg" rows={3} resize="none" />
                </FormControl>
            </Box>

            {/* Continue button */}
            <Button colorScheme="blue" size="lg" borderRadius="xl" w="100%" onClick={handleNextStep} isDisabled={!isServiceStepValid} boxShadow="md">
                Continue to Payment
            </Button>
        </VStack>
    );
}
