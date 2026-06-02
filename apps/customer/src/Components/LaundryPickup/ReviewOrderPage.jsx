import React from 'react';
import {
    Text,
    Button,
    Divider,
    Stack,
    Flex,
    Icon,
    VStack,
    IconButton,
    Box, HStack, GridItem, Grid, Input
} from "@chakra-ui/react";
import {
    FaTshirt,
    FaWeightHanging,
    FaCalendarAlt,
    FaClock,
    FaShoppingBag,
    FaTags,
    FaTag,
    FaSyncAlt,
    FaCar
} from 'react-icons/fa';
import { EditIcon } from '@chakra-ui/icons';
import { format, parse } from 'date-fns';

export default function ReviewOrderPage({
                                            services,
                                            pickupDate,
                                            pickupTime,
                                            dropoffDate,
                                            dropoffTime,
                                            isPlaceOrderEnabled,
                                            handlePlaceOrder,
                                            orderProcessing,
                                            setActiveStep,
                                            laundryBags,
                                            promoCode,
                                            frequency,
                                            tip,
                                            setTip,
                                            promoDescriptionMessage,
                                            pickupService,
                                            dropoffService,
                                            uberPickupFrequency,
                                            uberDropoffFrequency
                                        }) {

    // Destructure properties from tip
    const { tipOption, customTip } = tip;
    // Handler for selecting a tip button
    const handleSelectTip = (option) => {
        let tipPercentage = 0;
        let tipTypeValue = 'noTip';
        let newTipAmount = '0.00';

        if (option === '5' || option === '10' || option === '15') {
            tipPercentage = parseInt(option, 10);
            tipTypeValue = 'percentage';
        } else if (option === 'custom') {
            tipTypeValue = 'custom';
            newTipAmount = tip.customTip || '0.00';
        }

        setTip((prevTip) => ({
            ...prevTip,
            tipOption: option,
            tipType: tipTypeValue,
            tipAmount: newTipAmount,
            tipPercentage: tipPercentage,
            tipReceivedId: '',
            tipMethod: 'Card',
            customTip: option === 'custom' ? prevTip.customTip : '', // Reset if not custom
        }));
    };


    // Handler for updating the custom tip text
    const handleCustomTipChange = (e) => {
        let value = e.target.value.replace(/[^0-9.]/g, ''); // Allow only numbers and decimal

        setTip((prevTip) => ({
            ...prevTip,
            customTip: value,
            tipAmount: value || '0.00', // Ensure tipAmount updates dynamically
        }));
    };

    // Handler for formatting custom tip on blur (when user finishes input)
    const handleCustomTipBlur = () => {
        setTip((prevTip) => ({
            ...prevTip,
            customTip: prevTip.customTip ? parseFloat(prevTip.customTip).toFixed(2) : '',
            tipAmount: prevTip.customTip ? parseFloat(prevTip.customTip).toFixed(2) : '0.00',
        }));
    };




    // Parse the dates as local dates
    const localPickupDate = parse(pickupDate, 'yyyy-MM-dd', new Date());
    const localDropoffDate = parse(dropoffDate, 'yyyy-MM-dd', new Date());

    // Format dates
    const formattedPickupDate = format(localPickupDate, 'MMMM d');
    const formattedDropoffDate = format(localDropoffDate, 'MMMM d');

    // Function to handle editing services
    const handleEditService = () => {
        setActiveStep(0); // Go to ServicePage (Step 0) when edit icon is clicked
    };


    return (
        <VStack spacing={2} align="flex-start" width="100%">
            <Text
                fontSize={['lg','xl']}
                fontWeight="bold"
                mb={2}
                textAlign="center"
                width="100%"
            >
                Review Your Order Details
            </Text>

            <Divider />

            {/* Services Section */}
            <VStack  align="flex-start" width="100%">
                <Flex justify="space-between" align="center" width="100%" wrap="wrap">
                    <Text fontSize={['md','lg']} fontWeight="bold">Services</Text>
                    <IconButton
                        icon={<EditIcon />}
                        aria-label="Edit Services"
                        colorScheme="blue"
                        variant="ghost"
                        onClick={handleEditService}
                    />
                </Flex>

                <Stack spacing={2} width="100%">
                    {services.map((service, index) => (
                        <Box
                            key={index}
                            border="1px"
                            borderColor="gray.200"
                            borderRadius="md"
                            p={[2,3]}
                            shadow="sm"
                        >
                            <Stack direction={{ base: 'column', md: 'row' }} spacing={[2,4]} align="flex-start" wrap="wrap">
                                <Flex align="center" wrap="wrap">
                                    <Icon as={FaTshirt} boxSize={[4,5]} color="green.500" mr={2} />
                                    <Text fontSize={{ base: "sm", md: "md" }} flexShrink={0}>
                                        {service.service}
                                    </Text>
                                </Flex>

                                <Flex align="center" wrap="wrap">
                                    <Icon as={FaWeightHanging} boxSize={[4,5]} color="purple.500" mr={2} />
                                    <Text fontSize={{ base: "sm", md: "md" }}>Count/Weight: {service.count}</Text>
                                </Flex>
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            </VStack>

            <Divider my={[2,4]}/>

            {/* Pickup and Dropoff Section */}
            <HStack spacing={[2,4,6]} align="flex-start" width="100%">
                {/* Pickup Container */}
                <Box
                    border="1px"
                    borderColor="gray.200"
                    borderRadius="md"
                    p={3}
                    shadow="sm"
                    width="100%"
                >
                    <Text fontSize={['xs','md','lg']}  fontWeight="semibold" mb={2}>
                        Pickup Date & Time
                    </Text>
                    <Stack direction={{ base: "column", md: "row" }} spacing={4} wrap="wrap" align="flex-start">
                        <Flex align="center" gap={2}>
                            <Icon  as={FaCalendarAlt} boxSize={[4,5]} color="blue.500" />
                            <Text fontSize={['sm','md','lg']}>{formattedPickupDate}</Text>
                        </Flex>
                        <Flex align="center" gap={2}>
                            <Icon  as={FaClock} boxSize={[4,5]} color="blue.500" />
                            <Text fontSize={['sm','md','lg']}>{pickupTime}</Text>
                        </Flex>
                        <Flex align="center" gap={2}>
                            <Icon as={FaCar} boxSize={[4, 5]} color="blue.500" />
                            <Text fontSize={['sm','md','lg']}>{pickupService}</Text>
                        </Flex>
                        
                    </Stack>
                </Box>

                {/* Drop off Container */}
                <Box
                    border="1px"
                    borderColor="gray.200"
                    borderRadius="md"
                    p={3}
                    shadow="sm"
                    width="100%"
                >
                    <Text fontSize={['xs','md','lg']} fontWeight="semibold" mb={2}>
                        Dropoff Date & Time
                    </Text>
                    <Stack direction={{ base: "column", md: "row" }} spacing={4} wrap="wrap" align="flex-start">
                        <Flex align="center" gap={2}>
                            <Icon  as={FaCalendarAlt} boxSize={[4,5]} color="blue.500" />
                            <Text fontSize={['sm','md','lg']} >{formattedDropoffDate}</Text>
                        </Flex>
                        <Flex align="center" gap={2}>
                            <Icon  as={FaClock} boxSize={[4,5]} color="blue.500" />
                            <Text fontSize={['sm','md','lg']} >{dropoffTime}</Text>
                        </Flex>
                        <Flex align="center" gap={2}>
                            <Icon as={FaCar} boxSize={[4, 5]} color="blue.500" />
                            <Text fontSize={['sm','md','lg']}>{dropoffService}</Text>
                        </Flex>
                    </Stack>
                </Box>
            </HStack>

            <Divider my={[2,4]}/>

            {/* Laundry Miscellaneous Section */}
            <Grid
                templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} // 1 column on small screens, 3 columns on larger screens
                gap={2}
                width="100%"
            >
                {/* Laundry Bags */}
                <GridItem>
                    <Box
                        border="1px"
                        borderColor="gray.200"
                        borderRadius="md"
                        p={3}
                        shadow="sm"
                        textAlign="center"
                        minHeight="100px" // Ensure consistent height for all boxes
                    >
                        <Text fontSize={['sm','md','lg']} fontWeight="semibold" mb={2}>
                            Laundry Bags
                        </Text>
                        <Flex align="center" justifyContent="center" gap={2}>
                            <Icon  as={FaShoppingBag} boxSize={[4,5]} color="teal.500" />
                            <Text fontSize={['sm','md','lg']}>{laundryBags}</Text>
                        </Flex>
                    </Box>
                </GridItem>

                {/* Conditionally Render Promo Code */}
                {!frequency && (
                    <GridItem>
                        <Box
                            border="1px"
                            borderColor="gray.200"
                            borderRadius="md"
                            p={3}
                            shadow="sm"
                            textAlign="center"
                            minHeight="100px" // Ensure consistent height for all boxes
                        >
                            <Text fontSize={['sm','md','lg']} fontWeight="semibold" mb={2}>
                                Promo Code
                            </Text>
                            <Flex align="center" justifyContent="center" gap={2}>
                                <Icon  as={FaTag} boxSize={[4,5]} color="orange.500" />
                                <Text fontSize={['sm','md','lg']}>
                                    {promoCode || "No Promo Code Applied"}
                                </Text>
                            </Flex>
                        </Box>
                    </GridItem>
                )}

                {/* Frequency Details */}
                <GridItem>
                    <Box
                        border="1px"
                        borderColor="gray.200"
                        borderRadius="md"
                        p={3}
                        shadow="sm"
                        textAlign="center"
                        minHeight="100px" // Ensure consistent height for all boxes
                    >
                        <Text fontSize={['sm','md','lg']} fontWeight="semibold" mb={2}>
                            Order Frequency
                        </Text>
                        <Flex align="center" justifyContent="center" gap={2}>
                            <Icon  as={FaSyncAlt} boxSize={[4,5]} color="orange.500" />
                            <Text fontSize={['sm','md','lg']}>
                                {frequency || "Not Opted"}
                            </Text>
                        </Flex>
                        {/* Uber Pickup & Dropoff Frequency */}
                        {frequency && (uberPickupFrequency || uberDropoffFrequency) && (
                            <VStack spacing={0} mt={1}>
                                <Text fontSize={['xs','sm']} color="gray.600">
                                    Uber Pickup: {uberPickupFrequency ? 'Yes' : 'No'}
                                </Text>
                                <Text fontSize={['xs','sm']} color="gray.600">
                                    Uber Dropoff: {uberDropoffFrequency ? 'Yes' : 'No'}
                                </Text>
                            </VStack>
                        )}
                    </Box>

                </GridItem>
                {frequency && promoDescriptionMessage && (
                    <GridItem>
                        <Box
                            border="1px"
                            borderColor="gray.200"
                            borderRadius="md"
                            p={3}
                            shadow="sm"
                            textAlign="center"
                            minHeight="100px"
                        >
                            <Flex align="center" justify="center" gap={3}>
                                <Icon as={FaTags} color="green.500" boxSize={6} />
                                <Text
                                    fontSize={['sm', 'md', 'lg']}
                                    fontWeight="semibold"
                                >
                                    {promoDescriptionMessage || ""}
                                </Text>
                            </Flex>
                        </Box>
                    </GridItem>
                )}

            </Grid>


            <Divider my={4} />
            <VStack spacing={2} align="flex-start" width="100%">
                <Text fontSize={['sm','md','lg']} fontWeight="bold" color="gray.700">
                    Tip
                </Text>
                <HStack spacing={2} wrap="wrap">

                    <Button size={['sm','md','lg']} variant={tipOption === '5' ? 'solid' : 'outline'} onClick={() => handleSelectTip('5')}>
                        5%
                    </Button>
                    <Button size={['sm','md','lg']} variant={tipOption === '10' ? 'solid' : 'outline'} onClick={() => handleSelectTip('10')}>
                        10%
                    </Button>
                    <Button size={['sm','md','lg']} variant={tipOption === '15' ? 'solid' : 'outline'} onClick={() => handleSelectTip('15')}>
                        15%
                    </Button>
                    <Button size={['sm','md','lg']} variant={tipOption === 'custom' ? 'solid' : 'outline'} onClick={() => handleSelectTip('custom')}>
                        Custom
                    </Button>
                    <Button size={['sm','md','lg']} variant={tipOption === 'noTip' ? 'solid' : 'outline'} onClick={() => handleSelectTip('noTip')}>
                        No Tip
                    </Button>
                </HStack>

                {tipOption === 'custom' && (
                    <Box pt={2}>
                        <Input
                            type="text"
                            placeholder="Enter tip amount"
                            value={customTip}
                            onChange={handleCustomTipChange}
                            onBlur={handleCustomTipBlur}
                            width={{ base: "100%", md: "200px" }}
                        />
                    </Box>
                )}

            </VStack>

            <Divider my={[2,4]} />

            {/* Place Order Button */}
            <Button
                colorScheme="green"
                width="100%"
                onClick={handlePlaceOrder}
                isDisabled={!isPlaceOrderEnabled}
                isLoading={orderProcessing}
                loadingText="Processing Order"
                mt={4}
            >
                Place Order
            </Button>
        </VStack>
    );
}
