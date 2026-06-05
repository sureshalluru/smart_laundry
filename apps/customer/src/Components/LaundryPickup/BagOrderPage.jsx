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
 * BagOrderPage — Per-Bag flow service/schedule page.
 * Customer selects number of bags and schedules pickup/dropoff.
 * Clean, mobile-first design with sky-blue theme.
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
}) {
    const [availablePickupSlots, setAvailablePickupSlots] = useState([]);
    const [availableDropoffSlots, setAvailableDropoffSlots] = useState([]);
    const [bagSize, setBagSize] = useState('regular'); // 'regular' (13-gal $30) or 'large' ($45)

    const pricePerBag = bagSize === 'large' ? 45 : bagPrice;
    const totalCost = (laundryBags * pricePerBag).toFixed(2);

    // Update parent's bagPrice when size changes
    useEffect(() => {
        if (setBagPrice) setBagPrice(pricePerBag);
    }, [bagSize, pricePerBag, setBagPrice]);

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

        const interval = parseInt(deliveryTimeInterval) || 120;
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

    // Initialize dates
    useEffect(() => {
        const tz = laundryTimeZone || 'America/New_York';
        if (!pickupDate) {
            const tomorrow = getDateInTimeZone(addDays(new Date(), 1), tz);
            setPickupDate(tomorrow);
        }
        if (!dropoffDate && pickupDate) {
            const drop = getDateInTimeZone(addDays(new Date(pickupDate + 'T12:00:00'), 2), tz);
            setDropoffDate(drop);
        }
        setPickupService('LaundryDriver');
        setDropoffService('LaundryDriver');
    }, [laundryTimeZone]);

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
            setAvailableDropoffSlots(slots);
            if (slots.length > 0 && !dropoffTime) {
                setDropoffTime(slots[0]);
            }
        }
    }, [dropoffDate, generateTimeSlots]);

    // Validate step
    useEffect(() => {
        const isValid = laundryBags >= 1 && pickupDate && pickupTime && dropoffDate && dropoffTime;
        setIsServiceStepValid(!!isValid);
    }, [laundryBags, pickupDate, pickupTime, dropoffDate, dropoffTime, setIsServiceStepValid]);

    // Get min dates
    const minPickupDate = getDateInTimeZone(addDays(new Date(), 1), laundryTimeZone || 'America/New_York');

    const handlePickupDateChange = (e) => {
        const newDate = e.target.value;
        setPickupDate(newDate);
        // Auto-set dropoff to pickup + 2 days
        const tz = laundryTimeZone || 'America/New_York';
        const drop = getDateInTimeZone(addDays(new Date(newDate + 'T12:00:00'), 2), tz);
        setDropoffDate(drop);
    };

    return (
        <VStack spacing={5} align="stretch" w="100%" maxW="500px" mx="auto" py={2}>
            {/* Bag selector card */}
            <Box
                bg="white"
                borderRadius="2xl"
                p={{ base: 5, md: 6 }}
                boxShadow="sm"
                border="1px solid"
                borderColor="gray.100"
            >
                <VStack spacing={4} align="stretch">
                    <Flex justify="space-between" align="center">
                        <HStack spacing={3}>
                            <Box bg="blue.50" borderRadius="lg" p={2}>
                                <Icon as={FaShoppingBag} color="blue.500" boxSize={5} />
                            </Box>
                            <VStack align="flex-start" spacing={0}>
                                <Heading size="sm" color="gray.800">
                                    Bag Size & Count
                                </Heading>
                                <Text fontSize="sm" color="gray.500">
                                    Select bag size and quantity
                                </Text>
                            </VStack>
                        </HStack>
                        <Badge colorScheme="blue" borderRadius="full" px={3} py={1} fontSize="sm">
                            ${totalCost}
                        </Badge>
                    </Flex>

                    {/* Bag size selector */}
                    <HStack spacing={3}>
                        <Box
                            as="button"
                            flex="1"
                            p={3}
                            borderRadius="xl"
                            border="2px solid"
                            borderColor={bagSize === 'regular' ? 'blue.400' : 'gray.200'}
                            bg={bagSize === 'regular' ? 'blue.50' : 'white'}
                            textAlign="center"
                            onClick={() => setBagSize('regular')}
                            transition="all 0.2s"
                        >
                            <Text fontWeight="700" fontSize="sm" color="gray.800">13-Gallon Bag</Text>
                            <Text fontSize="lg" fontWeight="800" color="blue.600">${bagPrice.toFixed(0)}</Text>
                            <Text fontSize="xs" color="gray.500">Standard trash bag size</Text>
                        </Box>
                        <Box
                            as="button"
                            flex="1"
                            p={3}
                            borderRadius="xl"
                            border="2px solid"
                            borderColor={bagSize === 'large' ? 'blue.400' : 'gray.200'}
                            bg={bagSize === 'large' ? 'blue.50' : 'white'}
                            textAlign="center"
                            onClick={() => setBagSize('large')}
                            transition="all 0.2s"
                        >
                            <Text fontWeight="700" fontSize="sm" color="gray.800">Larger Bag</Text>
                            <Text fontSize="lg" fontWeight="800" color="blue.600">$45</Text>
                            <Text fontSize="xs" color="gray.500">Bigger than 13-gallon</Text>
                        </Box>
                    </HStack>

                    {/* Bag counter */}
                    <Flex
                        align="center"
                        justify="center"
                        bg="gray.50"
                        borderRadius="xl"
                        p={4}
                    >
                        <IconButton
                            icon={<FaMinus />}
                            aria-label="Decrease bags"
                            size="md"
                            borderRadius="full"
                            colorScheme="blue"
                            variant="outline"
                            onClick={() => setLaundryBags(Math.max(1, laundryBags - 1))}
                            isDisabled={laundryBags <= 1}
                        />
                        <Text
                            fontSize="3xl"
                            fontWeight="bold"
                            mx={8}
                            color="gray.800"
                            minW="50px"
                            textAlign="center"
                        >
                            {laundryBags}
                        </Text>
                        <IconButton
                            icon={<FaPlus />}
                            aria-label="Increase bags"
                            size="md"
                            borderRadius="full"
                            colorScheme="blue"
                            variant="outline"
                            onClick={() => setLaundryBags(laundryBags + 1)}
                            isDisabled={laundryBags >= 20}
                        />
                    </Flex>
                </VStack>
            </Box>

            {/* Schedule section */}
            <Box
                bg="white"
                borderRadius="2xl"
                p={{ base: 5, md: 6 }}
                boxShadow="sm"
                border="1px solid"
                borderColor="gray.100"
            >
                <Heading size="sm" mb={4} color="gray.800">
                    Schedule Pickup & Dropoff
                </Heading>

                <VStack spacing={4} align="stretch">
                    {/* Pickup */}
                    <Box>
                        <Text fontSize="sm" fontWeight="600" color="blue.600" mb={2}>
                            Pickup
                        </Text>
                        <HStack spacing={3}>
                            <FormControl>
                                <FormLabel fontSize="xs" color="gray.500">Date</FormLabel>
                                <input
                                    type="date"
                                    value={pickupDate}
                                    min={minPickupDate}
                                    onChange={handlePickupDateChange}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #E2E8F0',
                                        fontSize: '14px',
                                    }}
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="xs" color="gray.500">Time</FormLabel>
                                <Select
                                    size="sm"
                                    borderRadius="lg"
                                    value={pickupTime}
                                    onChange={(e) => setPickupTime(e.target.value)}
                                >
                                    {availablePickupSlots.map((slot) => (
                                        <option key={slot} value={slot}>{slot}</option>
                                    ))}
                                </Select>
                            </FormControl>
                        </HStack>
                    </Box>

                    <Divider />

                    {/* Dropoff */}
                    <Box>
                        <Text fontSize="sm" fontWeight="600" color="blue.600" mb={2}>
                            Dropoff
                        </Text>
                        <HStack spacing={3}>
                            <FormControl>
                                <FormLabel fontSize="xs" color="gray.500">Date</FormLabel>
                                <input
                                    type="date"
                                    value={dropoffDate}
                                    min={pickupDate || minPickupDate}
                                    onChange={(e) => setDropoffDate(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #E2E8F0',
                                        fontSize: '14px',
                                    }}
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="xs" color="gray.500">Time</FormLabel>
                                <Select
                                    size="sm"
                                    borderRadius="lg"
                                    value={dropoffTime}
                                    onChange={(e) => setDropoffTime(e.target.value)}
                                >
                                    {availableDropoffSlots.map((slot) => (
                                        <option key={slot} value={slot}>{slot}</option>
                                    ))}
                                </Select>
                            </FormControl>
                        </HStack>
                    </Box>
                </VStack>
            </Box>

            {/* Special Instructions */}
            <Box
                bg="white"
                borderRadius="2xl"
                p={{ base: 5, md: 6 }}
                boxShadow="sm"
                border="1px solid"
                borderColor="gray.100"
            >
                <FormControl>
                    <FormLabel fontSize="sm" fontWeight="600" color="gray.700">
                        Special Instructions (optional)
                    </FormLabel>
                    <Textarea
                        value={specialInstructions}
                        onChange={(e) => setSpecialInstructions(e.target.value)}
                        placeholder="e.g. Separate whites and colors, use unscented detergent..."
                        size="sm"
                        borderRadius="lg"
                        rows={3}
                        resize="none"
                    />
                </FormControl>
            </Box>

            {/* Continue button */}
            <Button
                colorScheme="blue"
                size="lg"
                borderRadius="xl"
                w="100%"
                onClick={handleNextStep}
                isDisabled={!isServiceStepValid}
                boxShadow="md"
            >
                Continue to Payment
            </Button>
        </VStack>
    );
}
