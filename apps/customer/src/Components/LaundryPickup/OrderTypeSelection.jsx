import React from 'react';
import { Box, Flex, Text, Badge, HStack, VStack } from '@chakra-ui/react';

/**
 * OrderTypeSelection — Step 0 of the order flow.
 * Displays 3 card options for choosing the order type:
 * - One-Time Order
 * - Recurring Pickup (shown if laundryFrequency has items)
 * - Subscribe & Save (shown if there are per-bag services with inputWeight=false)
 *
 * Props:
 *   onSelect(orderType)      – callback with 'one-time', 'frequency', or 'subscribe-save'
 *   frequencyPromotions      – array of { frequency, promoCode, description }
 *   subscriptionDiscount     – number (percentage discount)
 *   laundryFrequency         – array of available frequency options
 *   themeColor               – string (Chakra color scheme)
 *   preSelectedType          – optional string for pre-highlighting
 *   laundryServices          – array of services (to check for per-bag services)
 */
export default function OrderTypeSelection({
    onSelect,
    frequencyPromotions = [],
    subscriptionDiscount = 0,
    laundryFrequency = [],
    themeColor = 'blue',
    preSelectedType = null,
    laundryServices = [],
}) {
    const hasFrequencyOptions = laundryFrequency && laundryFrequency.length > 0;
    const hasPerBagServices = laundryServices.some(
        (s) => s.inputWeight === false || s.inputWeight === 'false'
    );

    // Get savings description for recurring pickup — only from frequency promo codes
    const getRecurringSavings = () => {
        if (frequencyPromotions && frequencyPromotions.length > 0) {
            return frequencyPromotions[0].description || '';
        }
        return '';
    };

    // Get savings description for subscribe & save — only from subscription discount
    const getSubscribeSavings = () => {
        if (subscriptionDiscount > 0) {
            return `Save ${subscriptionDiscount}% every order!`;
        }
        return '';
    };

    const recurringSavings = getRecurringSavings();
    const subscribeSavings = getSubscribeSavings();

    const cardStyles = {
        bg: 'white',
        borderRadius: '2xl',
        border: '1px solid',
        borderColor: 'gray.200',
        boxShadow: 'sm',
        p: { base: 5, md: 6 },
        cursor: 'pointer',
        transition: 'all 0.2s',
        _hover: {
            boxShadow: 'md',
            borderColor: `${themeColor}.300`,
            transform: 'translateY(-2px)',
        },
    };

    return (
        <Box w="100%" maxW="500px" mx="auto" py={2}>
            <VStack spacing={4} align="stretch">
                <Text fontSize="md" fontWeight="bold" color="gray.800">
                    Choose Your Order Type
                </Text>

                {/* Card 1: One-Time Order */}
                <Box {...cardStyles} onClick={() => onSelect('one-time')}>
                    <HStack spacing={4} align="flex-start">
                        <Text fontSize="2xl">🧺</Text>
                        <VStack align="flex-start" spacing={1} flex={1}>
                            <Text fontWeight="700" fontSize="md" color="gray.800">
                                One-Time Order
                            </Text>
                            <Text fontSize="sm" color="gray.500">
                                Order once, pick your services
                            </Text>
                        </VStack>
                    </HStack>
                </Box>

                {/* Card 2: Recurring Pickup */}
                {hasFrequencyOptions && (
                    <Box {...cardStyles} onClick={() => onSelect('frequency')}>
                        <HStack spacing={4} align="flex-start">
                            <Text fontSize="2xl">🔄</Text>
                            <VStack align="flex-start" spacing={1} flex={1}>
                                <Flex align="center" wrap="wrap" gap={2}>
                                    <Text fontWeight="700" fontSize="md" color="gray.800">
                                        Recurring Pickup
                                    </Text>
                                    {preSelectedType === 'frequency' && (
                                        <Badge
                                            colorScheme={themeColor}
                                            borderRadius="full"
                                            px={2}
                                            py={0.5}
                                            fontSize="xs"
                                        >
                                            Recommended
                                        </Badge>
                                    )}
                                </Flex>
                                <Text fontSize="sm" color="gray.500">
                                    Auto-pickup on a schedule
                                </Text>
                                {recurringSavings && (
                                    <Badge
                                        colorScheme="green"
                                        borderRadius="full"
                                        px={2}
                                        py={0.5}
                                        fontSize="xs"
                                        mt={1}
                                    >
                                        {recurringSavings}
                                    </Badge>
                                )}
                            </VStack>
                        </HStack>
                    </Box>
                )}

                {/* Card 3: Subscribe & Save */}
                {hasPerBagServices && hasFrequencyOptions && (
                    <Box {...cardStyles} onClick={() => onSelect('subscribe-save')}>
                        <HStack spacing={4} align="flex-start">
                            <Text fontSize="2xl">💰</Text>
                            <VStack align="flex-start" spacing={1} flex={1}>
                                <Flex align="center" wrap="wrap" gap={2}>
                                    <Text fontWeight="700" fontSize="md" color="gray.800">
                                        Subscribe & Save
                                    </Text>
                                    {preSelectedType === 'subscribe-save' && (
                                        <Badge
                                            colorScheme={themeColor}
                                            borderRadius="full"
                                            px={2}
                                            py={0.5}
                                            fontSize="xs"
                                        >
                                            Recommended
                                        </Badge>
                                    )}
                                </Flex>
                                <Text fontSize="sm" color="gray.500">
                                    Fixed bag price, recurring pickup
                                </Text>
                                {subscribeSavings && (
                                    <Badge
                                        colorScheme="green"
                                        borderRadius="full"
                                        px={2}
                                        py={0.5}
                                        fontSize="xs"
                                        mt={1}
                                    >
                                        {subscribeSavings}
                                    </Badge>
                                )}
                            </VStack>
                        </HStack>
                    </Box>
                )}
            </VStack>
        </Box>
    );
}
