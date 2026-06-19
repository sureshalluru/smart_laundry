import React from 'react';
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
    Input,
} from '@chakra-ui/react';
import {
    FaShoppingBag,
    FaCalendarAlt,
    FaClock,
    FaTruck,
} from 'react-icons/fa';
import { format, parse } from 'date-fns';

/**
 * BagReviewOrderPage — Review step for per-bag orders.
 * Clean, card-based layout with sky-blue theme.
 */
export default function BagReviewOrderPage({
    laundryBags,
    bagPrice,
    pickupDate,
    pickupTime,
    dropoffDate,
    dropoffTime,
    isPlaceOrderEnabled,
    handlePlaceOrder,
    orderProcessing,
    setActiveStep,
    tip,
    setTip,
    pickupService,
    dropoffService,
    taxRate = 0,
}) {
    const totalCost = (laundryBags * bagPrice).toFixed(2);
    const { tipOption, customTip } = tip;

    // Tip handlers (same logic as original)
    const handleSelectTip = (option) => {
        let tipPercentage = 0;
        let tipTypeValue = 'noTip';
        let newTipAmount = '0.00';

        if (option === '5' || option === '10' || option === '15') {
            tipPercentage = parseInt(option, 10);
            tipTypeValue = 'percentage';
            newTipAmount = ((tipPercentage / 100) * parseFloat(totalCost)).toFixed(2);
        } else if (option === 'custom') {
            tipTypeValue = 'custom';
            newTipAmount = tip.customTip || '0.00';
        }

        setTip((prev) => ({
            ...prev,
            tipOption: option,
            tipType: tipTypeValue,
            tipAmount: newTipAmount,
            tipPercentage: tipPercentage,
            tipReceivedId: '',
            tipMethod: 'Card',
            customTip: option === 'custom' ? prev.customTip : '',
        }));
    };

    const handleCustomTipChange = (e) => {
        let value = e.target.value.replace(/[^0-9.]/g, '');
        setTip((prev) => ({
            ...prev,
            customTip: value,
            tipAmount: value || '0.00',
        }));
    };

    const handleCustomTipBlur = () => {
        setTip((prev) => ({
            ...prev,
            customTip: prev.customTip ? parseFloat(prev.customTip).toFixed(2) : '',
            tipAmount: prev.customTip ? parseFloat(prev.customTip).toFixed(2) : '0.00',
        }));
    };

    // Format dates
    const formattedPickupDate = pickupDate
        ? format(parse(pickupDate, 'yyyy-MM-dd', new Date()), 'MMMM d, yyyy')
        : '';
    const formattedDropoffDate = dropoffDate
        ? format(parse(dropoffDate, 'yyyy-MM-dd', new Date()), 'MMMM d, yyyy')
        : '';

    // Calculate grand total
    const tipAmount = parseFloat(tip.tipAmount || '0');
    const grandTotal = (parseFloat(totalCost) + tipAmount).toFixed(2);

    return (
        <VStack spacing={4} align="stretch" w="100%" maxW="500px" mx="auto" py={2}>
            <Heading size={{ base: 'md', md: 'lg' }} textAlign="center" color="gray.800">
                Review Your Order
            </Heading>

            {/* Order summary card */}
            <Box
                bg="white"
                borderRadius="2xl"
                p={{ base: 5, md: 6 }}
                boxShadow="sm"
                border="1px solid"
                borderColor="gray.100"
            >
                <Flex justify="space-between" align="center" mb={3}>
                    <HStack spacing={3}>
                        <Box bg="blue.50" borderRadius="lg" p={2}>
                            <Icon as={FaShoppingBag} color="blue.500" boxSize={5} />
                        </Box>
                        <VStack align="flex-start" spacing={0}>
                            <Text fontWeight="bold" color="gray.800">Per Bag Service</Text>
                            <Text fontSize="sm" color="gray.500">
                                {laundryBags} bag{laundryBags > 1 ? 's' : ''} × ${bagPrice.toFixed(2)}
                            </Text>
                        </VStack>
                    </HStack>
                    <Text fontWeight="bold" fontSize="lg" color="blue.600">
                        ${totalCost}
                    </Text>
                </Flex>

                <Button
                    size="xs"
                    variant="ghost"
                    colorScheme="blue"
                    onClick={() => setActiveStep(1)}
                >
                    Edit
                </Button>
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

            {/* Tip section */}
            <Box
                bg="white"
                borderRadius="2xl"
                p={{ base: 5, md: 6 }}
                boxShadow="sm"
                border="1px solid"
                borderColor="gray.100"
            >
                <Text fontSize="sm" fontWeight="bold" color="gray.700" mb={3}>
                    Add a Tip
                </Text>
                <HStack spacing={2} wrap="wrap" mb={tipOption === 'custom' ? 3 : 0}>
                    {['5', '10', '15', 'custom', 'noTip'].map((opt) => (
                        <Button
                            key={opt}
                            size="sm"
                            borderRadius="full"
                            variant={tipOption === opt ? 'solid' : 'outline'}
                            colorScheme={tipOption === opt ? 'blue' : 'gray'}
                            onClick={() => handleSelectTip(opt)}
                        >
                            {opt === 'custom' ? 'Custom' : opt === 'noTip' ? 'No Tip' : `${opt}%`}
                        </Button>
                    ))}
                </HStack>
                {tipOption === 'custom' && (
                    <Input
                        type="text"
                        placeholder="Enter tip amount"
                        value={customTip}
                        onChange={handleCustomTipChange}
                        onBlur={handleCustomTipBlur}
                        size="sm"
                        borderRadius="lg"
                        maxW="160px"
                    />
                )}
            </Box>

            {/* Total */}
            <Box
                bg="blue.50"
                borderRadius="2xl"
                p={4}
                border="1px solid"
                borderColor="blue.100"
            >
                <Flex justify="space-between" align="center">
                    <Text fontWeight="600" color="gray.700">Subtotal</Text>
                    <Text color="gray.700">${totalCost}</Text>
                </Flex>
                {taxRate > 0 && (
                    <Flex justify="space-between" align="center" mt={1}>
                        <Text fontSize="sm" color="gray.500">Sales Tax ({taxRate}%)</Text>
                        <Text fontSize="sm" color="gray.500">${(parseFloat(totalCost) * taxRate / 100).toFixed(2)}</Text>
                    </Flex>
                )}
                {tipAmount > 0 && (
                    <Flex justify="space-between" align="center" mt={1}>
                        <Text fontSize="sm" color="gray.500">Tip</Text>
                        <Text fontSize="sm" color="gray.500">${tipAmount.toFixed(2)}</Text>
                    </Flex>
                )}
                <Divider my={2} borderColor="blue.200" />
                <Flex justify="space-between" align="center">
                    <Text fontWeight="bold" fontSize="lg" color="gray.800">Total</Text>
                    <Text fontWeight="bold" fontSize="lg" color="blue.600">${(parseFloat(totalCost) + (taxRate > 0 ? parseFloat(totalCost) * taxRate / 100 : 0) + tipAmount).toFixed(2)}</Text>
                </Flex>
            </Box>

            {/* Place Order */}
            <Button
                colorScheme="blue"
                size="lg"
                borderRadius="xl"
                w="100%"
                onClick={handlePlaceOrder}
                isDisabled={!isPlaceOrderEnabled}
                isLoading={orderProcessing}
                loadingText="Placing Order..."
                boxShadow="lg"
            >
                Place Order — ${(parseFloat(totalCost) + (taxRate > 0 ? parseFloat(totalCost) * taxRate / 100 : 0) + tipAmount).toFixed(2)}
            </Button>
        </VStack>
    );
}
