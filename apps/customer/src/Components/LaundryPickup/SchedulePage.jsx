import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
    Stack,
    FormControl,
    FormLabel,
    Input,
    Button,
    Box,
    Text,
    Select,
    Textarea,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    NumberIncrementStepper,
    NumberDecrementStepper,
    Flex,
    HStack,
    VStack,
    RadioGroup,
    Radio,
    Badge,
    useToast,
} from '@chakra-ui/react';
import { toZonedTime, format } from 'date-fns-tz';
import { addDays } from 'date-fns';
import axios from 'axios';

/**
 * SchedulePage — Extracted scheduling step for the unified order flow.
 * Handles: pickup/dropoff dates & times, delivery method (Uber/Driver),
 * frequency (Subscribe & Save), promo code, special instructions, laundry bags.
 */
export default function SchedulePage({
    orderType,
    pickupDate,
    setPickupDate,
    pickupTime,
    setPickupTime,
    dropoffDate,
    setDropoffDate,
    dropoffTime,
    setDropoffTime,
    pickupService,
    setPickupService,
    dropoffService,
    setDropoffService,
    frequency,
    setFrequency,
    promoCode,
    setPromoCode,
    specialInstructions,
    setSpecialInstructions,
    setSaveSpecialInstructions,
    laundryBags,
    setLaundryBags,
    deliveryTimeSlots,
    deliveryTimeInterval,
    laundryTimeZone,
    laundryFrequency,
    frequencyPromotions,
    promoDescriptionMessage,
    setPromoDescriptionMessage,
    uberEnv,
    uberExists,
    setUberExists,
    laundryAddress,
    address,
    uberPickupFrequency,
    setUberPickupFrequency,
    uberDropoffFrequency,
    setUberDropoffFrequency,
    laundryId,
    onContinue,
    onBack,
}) {
    const toast = useToast();
    const userAuthToken = localStorage.getItem('idToken');
    const initialSpecialInstructionsRef = useRef(specialInstructions);

    // Promo-related state
    const [localPromoCode, setLocalPromoCode] = useState(promoCode || '');
    const [isPromoValidating, setIsPromoValidating] = useState(false);
    const [isPromoValid, setIsPromoValid] = useState(!!promoCode);
    const [isFreqPromoApplied, setIsFreqPromoApplied] = useState(false);

    // Uber estimate state
    const [pickupEstimate, setPickupEstimate] = useState(null);
    const [dropoffEstimate, setDropoffEstimate] = useState(null);

    // Pickup mode state
    const [pickupMode, setPickupMode] = useState('scheduled');
    const pickupModeRef = useRef(pickupMode);
    useEffect(() => { pickupModeRef.current = pickupMode; }, [pickupMode]);

    // ─── Utility Functions ───

    const getDateInTimeZone = (date, timeZone) => {
        const zonedDate = toZonedTime(date, timeZone || 'America/New_York');
        return format(zonedDate, 'yyyy-MM-dd', { timeZone: timeZone || 'America/New_York' });
    };

    const getTodayInLaundryTZ = () => {
        const timeZone = laundryTimeZone || 'America/New_York';
        const now = new Date();
        const zoned = toZonedTime(now, timeZone);
        return format(zoned, 'yyyy-MM-dd', { timeZone });
    };

    const getCurrent2HourSlot = () => {
        const timeZone = laundryTimeZone || 'America/New_York';
        const now = toZonedTime(new Date(), timeZone);
        const roundedMinutes = Math.ceil(now.getMinutes() / 5) * 5;
        now.setMinutes(roundedMinutes);
        now.setSeconds(0);
        now.setMilliseconds(0);
        const start = new Date(now);
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
        const startStr = format(start, 'HH:mm');
        const endStr = format(end, 'HH:mm');
        return `${startStr} - ${endStr}`;
    };

    const isWithinHours = () => {
        const now = toZonedTime(new Date(), laundryTimeZone || 'America/New_York');
        const todayDay = format(now, 'EEEE', { timeZone: laundryTimeZone || 'America/New_York' });
        const slot = deliveryTimeSlots.find((s) => s.day === todayDay);
        if (!slot) return false;
        const [startHour, startMinute] = slot.startTime.split(':').map(Number);
        const [endHour, endMinute] = slot.endTime.split(':').map(Number);
        const start = new Date(now);
        start.setHours(startHour, startMinute, 0, 0);
        const end = new Date(now);
        end.setHours(endHour, endMinute, 0, 0);
        return now >= start && now <= end;
    };

    const canDoInstantPickup = uberExists && isWithinHours();

    // ─── Time Slot Generation ───

    const getAvailableTimeSlots = useCallback(
        (selectedDate) => {
            if (!selectedDate || !deliveryTimeSlots) return [];
            const tz = laundryTimeZone || 'America/New_York';
            const selectedDateLocal = toZonedTime(new Date(`${selectedDate}T00:00`), tz);
            const selectedDay = format(selectedDateLocal, 'EEEE', { timeZone: tz });
            const timeSlot = deliveryTimeSlots.find((slot) => slot.day === selectedDay);

            if (timeSlot) {
                const start = parseInt(timeSlot.startTime.split(':')[0], 10);
                const end = parseInt(timeSlot.endTime.split(':')[0], 10);
                const timeSlots = [];
                for (let time = start; time < end; time += deliveryTimeInterval) {
                    const startTimeFormatted = `${String(time).padStart(2, '0')}:00`;
                    const endTimeFormatted = `${String(time + deliveryTimeInterval).padStart(2, '0')}:00`;
                    timeSlots.push(`${startTimeFormatted} - ${endTimeFormatted}`);
                }
                return timeSlots;
            }
            return [];
        },
        [deliveryTimeSlots, deliveryTimeInterval, laundryTimeZone]
    );

    // ─── Pickup Mode Effects ───

    useEffect(() => {
        if (pickupMode === 'instant') {
            const currentDate = getTodayInLaundryTZ();
            const instantTime = getCurrent2HourSlot();
            setPickupDate(currentDate);
            setPickupTime(instantTime);
            setPickupService('Uber');
        } else {
            if (!pickupService) setPickupService('LaundryDriver');
            const tz = laundryTimeZone || 'America/New_York';
            const tomorrow = getDateInTimeZone(addDays(new Date(), 1), tz);
            if (!pickupDate) setPickupDate(tomorrow);
        }
    }, [pickupMode, laundryTimeZone]);

    useEffect(() => {
        if (pickupMode === 'scheduled') {
            if (!pickupService) setPickupService('LaundryDriver');
            if (!dropoffService) setDropoffService('LaundryDriver');
        }
    }, [pickupMode, pickupService, dropoffService, setPickupService, setDropoffService]);

    // ─── Date/Time Auto-Selection Effects ───

    useEffect(() => {
        if (pickupDate && deliveryTimeSlots && deliveryTimeSlots.length > 0) {
            const availablePickupTimeSlots = getAvailableTimeSlots(pickupDate);
            if (pickupModeRef.current !== 'instant') {
                if (!pickupTime || !availablePickupTimeSlots.includes(pickupTime)) {
                    if (availablePickupTimeSlots.length > 0) {
                        setPickupTime(availablePickupTimeSlots[0]);
                    } else {
                        setPickupTime('');
                    }
                }
            }
            const tz = laundryTimeZone || 'America/New_York';
            const minDropoffDate = getDateInTimeZone(addDays(new Date(`${pickupDate}T00:00:00`), 1), tz);
            if (!dropoffDate || new Date(dropoffDate) < new Date(minDropoffDate)) {
                setDropoffDate(minDropoffDate);
            }
        }
    }, [pickupDate, deliveryTimeSlots, getAvailableTimeSlots, setPickupTime, pickupTime, dropoffDate, setDropoffDate, laundryTimeZone]);

    useEffect(() => {
        if (dropoffDate && deliveryTimeSlots && deliveryTimeSlots.length > 0) {
            const availableDropoffTimeSlots = getAvailableTimeSlots(dropoffDate);
            if (!dropoffTime || !availableDropoffTimeSlots.includes(dropoffTime)) {
                if (availableDropoffTimeSlots.length > 0) {
                    setDropoffTime(availableDropoffTimeSlots[0]);
                } else {
                    setDropoffTime('');
                }
            }
        }
    }, [dropoffDate, deliveryTimeSlots, getAvailableTimeSlots, setDropoffTime, dropoffTime, laundryTimeZone]);

    // ─── Frequency / Promo Auto-Apply ───

    useEffect(() => {
        if (frequency) {
            // Only auto-apply frequency promo codes for "Frequency" order type
            // Subscribe & Save uses subscriptionDiscount from system settings instead
            if (orderType !== 'subscribe-save') {
                const promo = frequencyPromotions
                    ? frequencyPromotions.find((p) => p.frequency === frequency)
                    : null;
                if (promo) {
                    setLocalPromoCode(promo.promoCode);
                    setPromoCode(promo.promoCode);
                    setPromoDescriptionMessage(`Promo Applied! ${promo.description}`);
                    setIsPromoValid(true);
                    setIsFreqPromoApplied(true);
                } else {
                    setPromoDescriptionMessage(`You selected: ${frequency}`);
                }
            } else {
                // Subscribe & Save: just note the frequency, no promo auto-apply
                setPromoDescriptionMessage('');
            }
        } else if (isFreqPromoApplied) {
            setLocalPromoCode('');
            setPromoCode('');
            setPromoDescriptionMessage('');
            setIsPromoValid(false);
            setIsFreqPromoApplied(false);
        }
    }, [frequency, frequencyPromotions, isFreqPromoApplied, setPromoCode, setPromoDescriptionMessage, orderType]);

    // ─── Promo Code Handlers ───

    const handleValidatePromo = async () => {
        try {
            setIsPromoValidating(true);
            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/customer/validate-promo-code`,
                {
                    params: {
                        laundryId: laundryId,
                        operation: 'validatePromoCode',
                        promoCode: localPromoCode,
                    },
                    headers: { 'x-api-key': userAuthToken },
                }
            );
            const data = response.data;
            if (data.body?.isValid) {
                setIsPromoValid(true);
                setPromoCode(localPromoCode);
                toast({
                    title: 'Promo Code Valid',
                    description: `Code "${localPromoCode}" is valid and applied.`,
                    status: 'success',
                    duration: 3000,
                    isClosable: true,
                });
            } else {
                setIsPromoValid(false);
                setLocalPromoCode('');
                setPromoCode('');
                setPromoDescriptionMessage('');
                toast({
                    title: 'Invalid Promo Code',
                    description: `Sorry, "${localPromoCode}" isn't valid or has expired.`,
                    status: 'error',
                    duration: 4000,
                    isClosable: true,
                });
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to validate the promo code. Please try again later.',
                status: 'error',
                duration: 3000,
                isClosable: true,
            });
        } finally {
            setIsPromoValidating(false);
        }
    };

    const handleEditPromo = () => {
        setIsPromoValid(false);
        setPromoCode('');
        setPromoDescriptionMessage('');
    };

    const onPromoChange = (e) => {
        const val = e.target.value;
        if (isPromoValid) {
            setIsPromoValid(false);
            setPromoCode('');
            setPromoDescriptionMessage('');
        }
        setLocalPromoCode(val);
    };

    // ─── Continue Handler (validates promo if entered but not validated) ───

    const handleContinue = () => {
        // Require frequency for recurring order types
        if ((orderType === 'frequency' || orderType === 'subscribe-save') && !frequency) {
            toast({
                title: 'Select a Frequency',
                description: 'Please choose how often you want pickup (Weekly, Bi-Weekly, or Monthly).',
                status: 'warning',
                duration: 4000,
                isClosable: true,
            });
            return;
        }
        if (!frequency && localPromoCode && !isPromoValid) {
            toast({
                title: 'Please Validate Promo',
                description: `You entered "${localPromoCode}" but haven't validated yet.`,
                status: 'warning',
                duration: 4000,
                isClosable: true,
            });
            return;
        }
        onContinue();
    };

    // ─── Uber Estimate Fetch ───

    const fetchUberEstimate = async ({ type }) => {
        const pickupAddress = address;
        const dropoffAddress = laundryAddress;
        const payload = {
            uberEnv: uberEnv,
            pickup_address: type === 'pickup' ? pickupAddress : dropoffAddress,
            dropoff_address: type === 'pickup' ? dropoffAddress : pickupAddress,
            pickup_phone: '+15125551234',
            dropoff_phone: '+15125551234',
            delivery_date: pickupDate,
            time_interval: pickupTime,
        };
        try {
            const response = await fetch(
                `${process.env.REACT_APP_AWS_API_URL}/api/uber/uberQuoteEstimate?operation=get-uber-quote&laundryId=${laundryId}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
            );
            const result = await response.json();
            let parsedBody = result;
            if (typeof result.body === 'string') {
                try { parsedBody = JSON.parse(result.body); } catch (e) { /* ignore */ }
            }
            if (parsedBody.estimatedFeeCents) {
                const estimate = parsedBody.estimatedFeeCents / 100;
                if (type === 'pickup') setPickupEstimate(estimate);
                else setDropoffEstimate(estimate);
            }
        } catch (error) {
            console.error('[Uber ERROR] Fetch failed:', error);
        }
    };

    useEffect(() => {
        if (pickupService === 'Uber' && pickupDate && pickupTime) fetchUberEstimate({ type: 'pickup' });
    }, [pickupService, pickupDate, pickupTime]);

    useEffect(() => {
        if (dropoffService === 'Uber' && dropoffDate && dropoffTime) fetchUberEstimate({ type: 'dropoff' });
    }, [dropoffService, dropoffDate, dropoffTime]);

    useEffect(() => {
        if (pickupMode === 'instant' && pickupService === 'Uber' && pickupDate && pickupTime) fetchUberEstimate({ type: 'pickup' });
    }, [pickupMode, pickupService, pickupDate, pickupTime]);

    // ─── Derived Values ───

    const tz = laundryTimeZone || 'America/New_York';
    const todayDate = getDateInTimeZone(addDays(new Date(), 1), tz);
    const isFormValid = pickupDate && pickupTime && dropoffDate && dropoffTime;

    // ─── Render ───

    return (
        <Stack spacing={5} width="100%" maxW="500px" mx="auto" py={2}>
            {/* ─── Pickup Type ─── */}
            {uberExists && (
                <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Text fontSize={['xs', 'md', 'lg']} fontWeight="semibold" mb={2}>
                        Pickup Type
                    </Text>
                    <RadioGroup value={pickupMode} onChange={setPickupMode} colorScheme="blue">
                        <Stack direction={{ base: 'column', md: 'row' }} spacing={6}>
                            <Radio value="instant" isDisabled={!canDoInstantPickup}>
                                Instant Pickup – Powered by Uber
                                {pickupMode === 'instant' && pickupEstimate && (
                                    <Text fontSize="sm" color="blue.600" mt={1}>
                                        Estimated Uber Pickup Fee: ${pickupEstimate.toFixed(2)}
                                    </Text>
                                )}
                            </Radio>
                            <Radio value="scheduled">Scheduled Pickup</Radio>
                        </Stack>
                    </RadioGroup>
                </Box>
            )}

            {/* ─── Pickup Date/Time (scheduled mode) ─── */}
            {pickupMode === 'scheduled' && (
                <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Text fontSize="sm" fontWeight="600" color="blue.600" mb={3}>
                        Pickup
                    </Text>
                    <Stack direction={{ base: 'column', md: 'row' }} spacing={4} width="100%">
                        <FormControl id="pickupDate" isRequired width="100%">
                            <FormLabel fontSize={['md', 'lg']}>Pickup Date</FormLabel>
                            <Input
                                type="date"
                                min={todayDate}
                                value={pickupDate}
                                onChange={(e) => setPickupDate(e.target.value || todayDate)}
                            />
                        </FormControl>
                        <FormControl id="pickupTime" isRequired width="100%">
                            <FormLabel fontSize={['md', 'lg']}>Pickup Time</FormLabel>
                            <Select
                                value={pickupTime}
                                placeholder="Select Pickup Time Slot"
                                onChange={(e) => setPickupTime(e.target.value)}
                            >
                                {getAvailableTimeSlots(pickupDate).map((timeSlot, index) => (
                                    <option key={index} value={timeSlot}>
                                        {timeSlot}
                                    </option>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>
                </Box>
            )}

            {/* ─── Pickup Service Choice ─── */}
            {pickupMode === 'scheduled' && (
                <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Text fontSize={['xs', 'md', 'lg']} fontWeight="semibold" mb={2}>
                        Choose Pickup Service
                    </Text>
                    <RadioGroup
                        onChange={setPickupService}
                        value={pickupService || 'LaundryDriver'}
                        colorScheme="blue"
                    >
                        <HStack spacing={6}>
                            {uberExists && <Radio value="Uber">Uber</Radio>}
                            <Radio value="LaundryDriver">Laundry&nbsp;Driver</Radio>
                        </HStack>
                    </RadioGroup>
                    {pickupService === 'Uber' && pickupEstimate && (
                        <Text fontSize="sm" color="blue.600" mt={1}>
                            🚕 Estimated Uber Pickup Fee: ${pickupEstimate.toFixed(2)}
                        </Text>
                    )}
                    {pickupService === 'LaundryDriver' && (
                        <Text fontSize="sm" color="green.600" mt={1}>
                            ✅ Free Pickup Service
                        </Text>
                    )}
                </Box>
            )}

            {/* ─── Dropoff Date/Time ─── */}
            <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                <Text fontSize="sm" fontWeight="600" color="blue.600" mb={3}>
                    Dropoff
                </Text>
                <Stack direction={{ base: 'column', md: 'row' }} spacing={4} width="100%">
                    <FormControl id="dropoffDate" isRequired width="100%">
                        <FormLabel fontSize={['md', 'lg']}>Drop-off Date</FormLabel>
                        <Input
                            type="date"
                            min={getDateInTimeZone(addDays(new Date(`${pickupDate}T00:00:00`), 1), tz)}
                            value={dropoffDate}
                            onChange={(e) =>
                                setDropoffDate(
                                    e.target.value ||
                                    getDateInTimeZone(addDays(new Date(`${pickupDate}T00:00:00`), 1), tz)
                                )
                            }
                        />
                    </FormControl>
                    <FormControl id="dropoffTime" isRequired width="100%">
                        <FormLabel fontSize={['md', 'lg']}>Drop-off Time</FormLabel>
                        <Select
                            value={dropoffTime}
                            placeholder="Select Drop-off Time Slot"
                            onChange={(e) => setDropoffTime(e.target.value)}
                        >
                            {getAvailableTimeSlots(dropoffDate).map((timeSlot, index) => (
                                <option key={index} value={timeSlot}>
                                    {timeSlot}
                                </option>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>
            </Box>

            {/* ─── Dropoff Service Choice ─── */}
            <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                <Text fontSize={['xs', 'md', 'lg']} fontWeight="semibold" mb={2}>
                    Choose Dropoff Service
                </Text>
                <RadioGroup
                    onChange={setDropoffService}
                    value={dropoffService || 'LaundryDriver'}
                    colorScheme="blue"
                >
                    <HStack spacing={6}>
                        {uberExists && <Radio value="Uber">Uber</Radio>}
                        <Radio value="LaundryDriver">Laundry&nbsp;Driver</Radio>
                    </HStack>
                </RadioGroup>
                {dropoffService === 'Uber' && dropoffEstimate && (
                    <Text fontSize="sm" color="blue.600" mt={1}>
                        🚕 Estimated Uber Dropoff Fee: ${dropoffEstimate.toFixed(2)}
                    </Text>
                )}
                {dropoffService === 'LaundryDriver' && (
                    <Text fontSize="sm" color="green.600" mt={1}>
                        ✅ Free Dropoff Service
                    </Text>
                )}
            </Box>

            {/* ─── Frequency Selection ─── */}
            {laundryFrequency && laundryFrequency.length > 0 && (
                <Box
                    bg="white"
                    borderRadius="2xl"
                    p={{ base: 5, md: 6 }}
                    boxShadow="sm"
                    border="1px solid"
                    borderColor={frequency ? 'green.300' : 'gray.100'}
                >
                    <VStack spacing={3} align="stretch">
                        <Flex justify="space-between" align="center">
                            <HStack spacing={2}>
                                <Text fontSize="lg">{orderType === 'subscribe-save' ? '💰' : '🔄'}</Text>
                                <VStack align="flex-start" spacing={0}>
                                    <Text fontWeight="700" fontSize="sm" color="gray.800">
                                        {orderType === 'subscribe-save' ? 'Subscribe & Save' : 'Select Frequency'}
                                    </Text>
                                    <Text fontSize="xs" color="gray.500">
                                        {orderType === 'subscribe-save'
                                            ? 'Fixed bag price, recurring pickup'
                                            : 'How often should we pick up your laundry?'}
                                    </Text>
                                </VStack>
                            </HStack>
                            {frequency && (
                                <Badge colorScheme="green" borderRadius="full" px={3} py={1} fontSize="xs">
                                    {frequency}
                                </Badge>
                            )}
                        </Flex>
                        <HStack spacing={2} flexWrap="wrap">
                            {laundryFrequency.map((opt) => (
                                <Button
                                    key={opt}
                                    size="sm"
                                    borderRadius="full"
                                    variant={frequency === opt ? 'solid' : 'outline'}
                                    colorScheme={frequency === opt ? 'green' : 'gray'}
                                    onClick={() => setFrequency(opt)}
                                >
                                    {opt}
                                </Button>
                            ))}
                        </HStack>
                        {!frequency && (
                            <Text fontSize="xs" color="red.500">
                                * Please select a frequency to continue
                            </Text>
                        )}
                        {frequency && frequencyPromotions && frequencyPromotions.find((p) => p.frequency === frequency) && (
                            <Box bg="green.50" borderRadius="md" p={2}>
                                <Text fontSize="xs" color="green.700">
                                    ✅ {frequencyPromotions.find((p) => p.frequency === frequency)?.description ||
                                        `You'll save on every ${frequency.toLowerCase()} order.`}
                                </Text>
                            </Box>
                        )}
                    </VStack>
                </Box>
            )}

            {/* ─── Frequency Uber Options ─── */}
            {frequency && uberExists && (
                <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Text fontSize={['xs', 'md', 'lg']} fontWeight="semibold" mb={2}>
                        Frequency Order Uber Options
                    </Text>
                    <FormControl mb={2}>
                        <FormLabel fontSize={['md', 'lg']}>
                            Do you want Uber for Pickup Service?
                        </FormLabel>
                        <RadioGroup
                            onChange={(value) => setUberPickupFrequency(value === 'yes')}
                            value={uberPickupFrequency ? 'yes' : 'no'}
                            colorScheme="blue"
                        >
                            <HStack spacing={6}>
                                <Radio value="yes">Yes</Radio>
                                <Radio value="no">No</Radio>
                            </HStack>
                        </RadioGroup>
                        {uberPickupFrequency && (
                            <Text mt={1} fontSize="sm" color="gray.600">
                                Charges will apply based on the pickup date and time of frequency order.
                            </Text>
                        )}
                    </FormControl>
                    <FormControl>
                        <FormLabel fontSize={['md', 'lg']}>
                            Do you want Uber for Dropoff Service?
                        </FormLabel>
                        <RadioGroup
                            onChange={(value) => setUberDropoffFrequency(value === 'yes')}
                            value={uberDropoffFrequency ? 'yes' : 'no'}
                            colorScheme="blue"
                        >
                            <HStack spacing={6}>
                                <Radio value="yes">Yes</Radio>
                                <Radio value="no">No</Radio>
                            </HStack>
                        </RadioGroup>
                        {uberDropoffFrequency && (
                            <Text mt={1} fontSize="sm" color="gray.600">
                                Charges will apply based on the pickup date and time of frequency order.
                            </Text>
                        )}
                    </FormControl>
                </Box>
            )}

            {/* ─── Promo Code ─── */}
            {!frequency && (
                <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <FormControl id="promoCode">
                        <FormLabel fontSize={['md', 'lg']}>Promotion</FormLabel>
                        <Flex direction="row" align="center" wrap="nowrap">
                            <Input
                                placeholder="Enter promo code"
                                value={localPromoCode}
                                onChange={onPromoChange}
                                isDisabled={isPromoValid}
                                flex="1"
                                mr={2}
                                minWidth={0}
                            />
                            <Button
                                ml={2}
                                onClick={isPromoValid ? handleEditPromo : handleValidatePromo}
                                isLoading={isPromoValidating}
                                colorScheme={isPromoValid ? 'yellow' : 'blue'}
                                flexShrink={0}
                                size={['md', 'lg']}
                            >
                                {isPromoValid ? 'Edit' : 'Validate'}
                            </Button>
                        </Flex>
                    </FormControl>
                </Box>
            )}

            {/* ─── Promo Description Banner ─── */}
            {promoDescriptionMessage && (
                <Box
                    p={3}
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor="blue.300"
                    bg="blue.50"
                    color="blue.700"
                    fontSize={['sm', 'md']}
                >
                    {promoDescriptionMessage}
                </Box>
            )}

            {/* ─── Special Instructions ─── */}
            <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                <FormControl id="specialInstructions">
                    <FormLabel fontSize={['md', 'lg']}>Special Instructions</FormLabel>
                    <Textarea
                        placeholder="Specify any preferences like detergent type, folding style, or stain treatment."
                        value={specialInstructions}
                        onChange={(e) => {
                            const newVal = e.target.value;
                            setSpecialInstructions(newVal);
                            if (setSaveSpecialInstructions) {
                                if (newVal !== initialSpecialInstructionsRef.current && newVal.trim() !== '') {
                                    setSaveSpecialInstructions(true);
                                } else {
                                    setSaveSpecialInstructions(false);
                                }
                            }
                        }}
                        size="sm"
                        borderRadius="lg"
                        rows={3}
                        resize="none"
                    />
                </FormControl>
            </Box>

            {/* ─── Laundry Bags ─── */}
            <Box bg="white" borderRadius="2xl" p={{ base: 5, md: 6 }} boxShadow="sm" border="1px solid" borderColor="gray.100">
                <FormControl id="laundryBags" isRequired width="100%">
                    <FormLabel fontSize={['md', 'lg']}>Laundry Bags</FormLabel>
                    <NumberInput
                        placeholder="Enter the laundry bags"
                        max={50}
                        min={1}
                        step={1}
                        value={laundryBags}
                        precision={0}
                        onChange={(bags) => setLaundryBags(Number(bags))}
                    >
                        <NumberInputField type="numeric" />
                        <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                        </NumberInputStepper>
                    </NumberInput>
                </FormControl>
            </Box>

            {/* ─── Navigation Buttons ─── */}
            <HStack spacing={4} width="100%">
                <Button
                    variant="outline"
                    colorScheme="gray"
                    onClick={onBack}
                    size={['md', 'lg']}
                    flex="1"
                >
                    Back
                </Button>
                <Button
                    colorScheme="blue"
                    onClick={handleContinue}
                    isDisabled={!isFormValid}
                    size={['md', 'lg']}
                    flex="2"
                >
                    Continue
                </Button>
            </HStack>
        </Stack>
    );
}
