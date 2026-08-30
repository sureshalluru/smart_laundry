import React, {useEffect, useCallback, useRef, useState} from 'react';
import {
    Box,
    Button,
    FormControl,
    FormLabel,
    Input,
    VStack,
    Textarea,
    Select,
    Menu,
    MenuButton,
    MenuList,
    MenuItem,
    Text,
    IconButton,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    NumberIncrementStepper,
    NumberDecrementStepper,
    Heading,
    useToast,
    SimpleGrid,
    GridItem,
    useBreakpointValue,
    Flex,
    Stack
} from '@chakra-ui/react';
import {AddIcon, ChevronDownIcon, DeleteIcon} from '@chakra-ui/icons';
import {toZonedTime, format} from 'date-fns-tz';
import {LoadScriptNext, StandaloneSearchBox} from "@react-google-maps/api";
import axios from "axios";
import { roundToTwo } from '../../utils/decimalUtils';

export default function ServiceSelection({
                                             services,
                                             setServices,
                                             pickupTime,
                                             setPickupTime,
                                             dropoffTime,
                                             setDropoffTime,
                                             dropoffDate,
                                             setDropoffDate,
                                             pickupDate,
                                             setPickupDate,
                                             specialInstructions,
                                             setSpecialInstructions,
                                             initialSpecialInstructions,
                                             setSaveSpecialInstructions,
                                             laundryServices,
                                             minWeightActive,
                                             inStorePickupTimeSlots,
                                             deliveryTimeInterval,
                                             laundryTimeZone,
                                             laundryId,
                                             address,
                                             setAddress,
                                             isServiceStepValid,
                                             setIsServiceStepValid,
                                             handleNextStep,
                                             doorNumber,
                                             setDoorNumber,
                                             deliveryInstructions,
                                             setDeliveryInstructions,
                                             promoCode,
                                             setPromoCode,
                                             laundryBags,
                                             setLaundryBags,
                                             promoValidated,
                                             setPromoValidated,
                                             setDiscountPrice,
                                             setFinalTotalPrice,
                                             customerId,
                                             isPromoFieldDisabled,
                                             setIsPromoFieldDisabled,
                                         }) {
    // For Google Maps API
    const searchBoxRef = useRef(null);
    const googleApiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    const toast = useToast();
    const [localPromoCode, setLocalPromoCode] = useState(promoCode); // Local Admin state for promo code
    const prevServicesRef = useRef(JSON.stringify(services));     // snapshot to detect the changes in the services
    const [isPromoCodeValidating, setIsPromoCodeValidating] = useState(false);
    const [serviceSearchTerm, setServiceSearchTerm] = useState('');
    const authToken = localStorage.getItem('idToken');
    const isMobile = useBreakpointValue({base: true, md: false});
    // Responsive text sizes
    const headingSize = isMobile ? "lg" : "xl";
    const subHeadingSize = isMobile ? "md" : "lg";
    const textSize = isMobile ? "sm" : "md";
    const smallTextSize = isMobile ? "xs" : "sm";
    const buttonSize = isMobile ? "sm" : "md";

    // Responsive spacing
    const boxPadding = isMobile ? 3 : 4;
    const formSpacing = isMobile ? 2 : 3;
    const sectionSpacing = isMobile ? 4 : 6;

    useEffect(() => {
        // console.log("🔁 useEffect triggered for default Wash and Fold selection");
        // console.log("Current services:", services);
        // console.log("Available laundryServices:", laundryServices);

        const existingService = services[0];

        const defaultService = laundryServices.find(
            (s) => s.serviceName === "Wash and Fold"
        );

        // console.log("🔍 Default service fetched from laundryServices:", defaultService);

        if (!defaultService) {
            //   console.warn("⚠️ Wash and Fold service not found in laundryServices");
            return;
        }

        const defaultCount = 0;
        const basePrice = defaultService.price;
        const cost = roundToTwo(basePrice * defaultCount);


        const completeDefaultPayload = {
            service: defaultService.serviceName,
            count: defaultCount,
            cost,
            basePrice: basePrice.toString(),
            basePriceDisplay: defaultService.inputWeight
                ? `${basePrice}/lb`
                : `${basePrice}/piece`,
        };

        if (services.length === 0) {
            //   console.log("🧼 Setting default service:", completeDefaultPayload);
            setServices([completeDefaultPayload]);
            return;
        }

        const needsFix =
            existingService.service === "Wash and Fold" &&
            (!existingService.basePrice || !existingService.cost);

        if (needsFix) {
            // console.log("🛠 Fixing incomplete default service entry");
            setServices([completeDefaultPayload]);
        } else {
            // console.log("⏩ Default already valid, no action needed");
        }
    }, [laundryServices, services, setServices]);


    // Function to check the promo code validation
    const handleValidatePromo = async () => {
        const promo_validation_payload = {
            services: services.map(s => ({
                service: s.service,
                servicePrice: s.basePrice || 0,
                weightOrCount: s.count || 0,
            })),
            products: [],
        }
        setIsPromoCodeValidating(true);
        try {
            const response = await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/admin/store-promo-validation`,
                promo_validation_payload,
                {
                    params: {
                        laundryId: laundryId,
                        operation: 'validateStorePromoCode',
                        promoCode: localPromoCode,
                        customerId: customerId,
                    },
                    headers: {
                        'X-Amz-Date': laundryId,
                        'Authorization': `Bearer ${authToken}`

                    },
                });

            // Extract the response data
            const data = response.data;
            if (data.body?.valid) {
                setPromoValidated(true);
                setPromoCode(localPromoCode);
                setDiscountPrice(roundToTwo(data.body.discountedPrice));
                setFinalTotalPrice(roundToTwo(data.body.totalCost));
                setIsPromoFieldDisabled(true);
                toast({
                    title: "Promo Code Valid",
                    description: data.body.message || "Discount applied.",
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                });
            } else {
                // invalid code
                setPromoValidated(false);
                setDiscountPrice(0.00);
                setFinalTotalPrice(0.00);
                setPromoCode('');
                setLocalPromoCode('');
                setIsPromoFieldDisabled(false);
                toast({
                    title: "Invalid Promo Code",
                    description: "Promo code not applicable or inactive.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
            }

        } catch (error) {
            // Handle errors
            setPromoValidated(false);
            setDiscountPrice(0.00);
            setFinalTotalPrice(0.00);
            setIsPromoFieldDisabled(false);
            toast({
                title: "Error",
                description: "Failed to validate the promo code.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
        } finally {
            setIsPromoCodeValidating(false);
        }
    };
    // Function to calculate available time slots based on the selected date and time zone
    const getAvailableTimeSlots = useCallback(
        (selectedDate) => {
            const selectedDateLocal = toZonedTime(new Date(`${selectedDate}T00:00`), laundryTimeZone);
            const selectedDay = format(selectedDateLocal, 'EEEE', {timeZone: laundryTimeZone});
            const timeSlot = inStorePickupTimeSlots.find((slot) => slot.day === selectedDay);

            if (timeSlot) {
                const start = parseInt(timeSlot.startTime.split(':')[0], 10);
                const end = parseInt(timeSlot.endTime.split(':')[0], 10);
                const timeSlots = [];

                for (let time = start; time < end; time += deliveryTimeInterval) {
                    const startTimeFormatted = `${String(time).padStart(2, '0')}:00`; // convert the startTime timestamp form 9:00 to 09:00
                    const endTimeFormatted = `${String(time + deliveryTimeInterval).padStart(2, '0')}:00`; // convert the endTime timestamp from 9:00 to 09:00
                    timeSlots.push(`${startTimeFormatted} - ${endTimeFormatted}`);
                }

                return timeSlots;
            }
            return [];
        },
        [inStorePickupTimeSlots, deliveryTimeInterval, laundryTimeZone]
    );

    // Function to format dates in the laundry's time zone
    const getDateInTimeZone = (date, timeZone) => {
        const zonedDate = toZonedTime(date, timeZone);
        return format(zonedDate, 'yyyy-MM-dd', {timeZone});
    };


    // useEffect to update dropoffTime when dropoffDate changes
    useEffect(() => {
        if (dropoffDate && inStorePickupTimeSlots.length > 0) {
            const availableDropoffTimeSlots = getAvailableTimeSlots(dropoffDate);

            // Only set default if current dropoffTime is not in available time slots
            if (!dropoffTime || !availableDropoffTimeSlots.includes(dropoffTime)) {
                setDropoffTime(availableDropoffTimeSlots[0] || ''); // Default to the first time slot or empty if none
            }
        }
    }, [
        dropoffDate,
        inStorePickupTimeSlots,
        getAvailableTimeSlots,
        setDropoffTime,
        laundryTimeZone,
        dropoffTime,
    ]);
    // If the user changes the cart, then re-validate the coupon
    useEffect(() => {
        // Compare new services with old snapshot
        const prevServices = prevServicesRef.current;
        const currentServices = JSON.stringify(services);

        // Update ref for next comparison
        prevServicesRef.current = currentServices;

        // If we have a validated promo, let's see if the user truly changed the cart
        if (promoValidated && prevServices !== currentServices) {
            toast({
                title: "Cart changed",
                description: "Please re-validate your promo code.",
                status: "warning",
                duration: 3000,
                isClosable: true,
            });

            setPromoValidated(false);
            setDiscountPrice(0);
            setFinalTotalPrice(0);
            setIsPromoFieldDisabled(false);
            setPromoCode('');
            setLocalPromoCode('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [services]);

    // We also want an "Edit" button to allow changes to the code
    const handleEditPromo = () => {
        setIsPromoFieldDisabled(false);
        setPromoCode('');
        setLocalPromoCode('');
        setPromoValidated(false);
        setDiscountPrice(0.00);
        setFinalTotalPrice(0.00);
    };


    // Function to render the Input Box based on the weight and count
    const renderServiceInput = (service, index) => {
        const selectedService = laundryServices.find(
            (item) => item.serviceName === service.service
        );
        if (selectedService) {
            if (selectedService.inputWeight) {
                return (
                    <>
                        <FormLabel fontSize={smallTextSize}>Approx Weight (lbs)</FormLabel>
                        <NumberInput
                            placeholder="Enter weight in lbs"
                            value={service.count}
                            min={1}
                            step={1}
                            onChange={(weightValue) =>
                                handleServiceChange(index, 'count', true, selectedService.price, weightValue, selectedService.minBillableWeight)
                            }
                        >
                            <NumberInputField type="numeric"/>
                        </NumberInput>
                        {minWeightActive
                            && parseFloat(selectedService.minBillableWeight || 0) > 0
                            && parseFloat(service.count || 0) > 0
                            && parseFloat(service.count) < parseFloat(selectedService.minBillableWeight) && (
                            <Text fontSize="xs" color="orange.600" mt={1}>
                                Billed at the {selectedService.minBillableWeight} lb minimum
                                (entered {service.count} lb)
                            </Text>
                        )}
                    </>
                );
            } else {
                return (
                    <>
                        <FormLabel fontSize={smallTextSize}>Count</FormLabel>
                        <NumberInput min={1} step={1} value={service.count} precision={0}
                                     onChange={(valueNumber) => {
                                         handleServiceChange(index, 'count', false, selectedService.price, valueNumber);
                                     }}
                        >
                            <NumberInputField type="numeric"/>
                            <NumberInputStepper>
                                <NumberIncrementStepper/>
                                <NumberDecrementStepper
                                />
                            </NumberInputStepper>
                        </NumberInput>

                    </>
                );
            }
        }
        return null;
    };

    // Handle service changes
    // Handle service changes
    const handleServiceChange = (index, field, inputWeight, price, value, minBillableWeight = null) => {
        const newServices = [...services];

        // Reset the count and cost when a new service is selected or overridden
        if (field === 'service') {
            newServices[index]['count'] = ''; // Reset count/weight
            newServices[index]['cost'] = ''; // Reset cost
            newServices[index]['basePrice'] = String(price); // Set base price
            newServices[index]['basePriceDisplay'] = inputWeight ? `${price}/lb` : `${price}/piece`; // Set base price Display
            // Remember the service's minimum + weight-based flag for the floored
            // total preview (Phase 2). Actual weight entered is still preserved.
            newServices[index]['inputWeight'] = inputWeight;
            newServices[index]['minBillableWeight'] = minBillableWeight;

        } else if (field === 'count') {
            // Preview the FLOORED billed cost when the tenant's minimum applies to
            // in-store orders and this is a weight-based service under its minimum.
            // The count field still shows the actual weight the customer entered.
            const min = parseFloat(newServices[index]['minBillableWeight'] ?? minBillableWeight ?? 0) || 0;
            const isWeight = newServices[index]['inputWeight'] ?? inputWeight;
            const actual = parseFloat(value) || 0;
            const billed = (minWeightActive && isWeight && min > 0 && actual < min) ? min : actual;
            newServices[index]['cost'] = String(roundToTwo(price * billed));
        }

        // Update the specific field with the provided value
        newServices[index][field] = value;
        setServices(newServices);
    };


    const handleAddService = () => {
        setServices([...services, {service: '', count: '', cost: '', basePrice: '', basePriceDisplay: ''}]);
    };

    const handleRemoveService = (index) => {
        const newServices = services.filter((_, i) => i !== index);
        setServices(newServices);
    };

    // Validate that required fields are filled
    useEffect(() => {
        const filledServices = services.filter((service) => service.service && service.count >= 1);
        const isFormValid =
            services.length > 0 &&
            filledServices.length === services.length &&
            pickupDate &&
            pickupTime &&
            dropoffDate &&
            dropoffTime && laundryBags;

        setIsServiceStepValid(isFormValid);
    }, [services, pickupDate, pickupTime, dropoffDate, dropoffTime, setIsServiceStepValid, laundryBags]);

    // Calculate the minimum date
    const today = getDateInTimeZone(new Date(), laundryTimeZone);

    // Handle form submission
    const handleSubmit = (e) => {
        e.preventDefault();
        if (isServiceStepValid) {
            handleNextStep();
        } else {
            toast({
                title: 'Incomplete Information',
                description: 'Please fill out all required fields before proceeding.',
                status: 'error',
                duration: 3000,
                isClosable: true,
            });
        }
    };
    // Google Maps API to populate Address
    const handlePlacesChanged = () => {
        const places = searchBoxRef.current.getPlaces();
        if (places.length > 0) {
            const place = places[0];
            setAddress(place.formatted_address);
        }
    };

    return (
        <Box margin="auto" padding={{base: 4, md: 6}}>
            <Heading mb={sectionSpacing} fontSize={headingSize}>Select Services</Heading>
            <form onSubmit={handleSubmit}>
                <SimpleGrid columns={{base: 1, lg: 2}} spacing={{base: 4, md: 6, lg: 8}}>
                    {/* Left Column - Services and Admin Fields */}
                    <GridItem>
                        <VStack spacing={sectionSpacing} align="stretch">
                            <Box
                                borderWidth="1px"
                                borderRadius="lg"
                                p={boxPadding}
                                boxShadow="sm"
                            >
                                <VStack spacing={formSpacing} align="stretch">
                                    {services.map((service, index) => {
                                        const selectedService = laundryServices.find(
                                            (item) => item.serviceName === service.service
                                        );
                                        const priceLabel = selectedService
                                            ? selectedService.inputWeight
                                                ? `$${selectedService.price}/lb`
                                                : `$${selectedService.price}/piece`
                                            : '';

                                        return (
                                            <Box
                                                key={index}
                                                p={boxPadding}
                                                borderWidth="1px"
                                                borderRadius="lg"
                                                position="relative"
                                                _notLast={{mb: 2}}
                                            >
                                                <Flex justify="flex-end" position="absolute" top={2} right={2}
                                                      zIndex={1}>
                                                    <IconButton
                                                        size="xs"
                                                        aria-label="Remove Service"
                                                        icon={<DeleteIcon fontSize={smallTextSize}/>}
                                                        variant="ghost"
                                                        colorScheme="red"
                                                        onClick={() => handleRemoveService(index)}
                                                    />
                                                </Flex>

                                                <VStack spacing={formSpacing} align="stretch">
                                                    <FormControl id={`service-${index}`} isRequired>
                                                        <FormLabel fontSize={smallTextSize} fontWeight="semibold">Service</FormLabel>
                                                        <Stack direction={isMobile ? "column" : "row"} spacing={2} align={isMobile ? "stretch" : "center"}>
                                                            <Menu>
                                                                <MenuButton
                                                                    as={Button}
                                                                    rightIcon={<ChevronDownIcon/>}
                                                                    size={buttonSize}
                                                                    variant="outline"
                                                                    textAlign="left"
                                                                    width={isMobile ? "full" : "auto"}
                                                                >
                                                                    <Text isTruncated fontSize={textSize}>
                                                                        {service.service || "Select service"}
                                                                    </Text>
                                                                </MenuButton>

                                                                <MenuList maxH="300px" overflowY="auto" p={0}>
                                                                    <Box px={3} py={2} position="sticky" top="0"
                                                                         bg="white" zIndex="1">
                                                                        <Input
                                                                            placeholder="Search services"
                                                                            size={buttonSize}
                                                                            value={serviceSearchTerm}
                                                                            onChange={(e) => setServiceSearchTerm(e.target.value)}
                                                                            isRequired={false}
                                                                            name="search"
                                                                        />

                                                                    </Box>

                                                                    {/* Filtered List */}
                                                                    {laundryServices
                                                                        .filter((option) =>
                                                                            option.serviceName.toLowerCase().includes(serviceSearchTerm.toLowerCase())
                                                                        )
                                                                        .map((option, i) => (
                                                                            <MenuItem
                                                                                key={i}
                                                                                onClick={() =>
                                                                                    handleServiceChange(
                                                                                        index,
                                                                                        'service',
                                                                                        option.inputWeight,
                                                                                        option.price,
                                                                                        option.serviceName,
                                                                                        option.minBillableWeight
                                                                                    )
                                                                                }
                                                                                isDisabled={services.some((s) => s.service === option.serviceName)}
                                                                            >
                                                                                <Text flex="1" fontSize={textSize}>
                                                                                    {option.serviceName}
                                                                                </Text>
                                                                                <Text color="gray.500" fontSize={smallTextSize}>
                                                                                    {option.inputWeight ? `$${option.price}/lb` : `$${option.price}/piece`}
                                                                                </Text>
                                                                            </MenuItem>
                                                                        ))}

                                                                    {/* No Match */}
                                                                    {laundryServices.filter((option) =>
                                                                        option.serviceName.toLowerCase().includes(serviceSearchTerm.toLowerCase())
                                                                    ).length === 0 && (
                                                                        <Text px={4} py={2} color="gray.500" textAlign="center" fontSize={smallTextSize}>
                                                                            No matching services
                                                                        </Text>
                                                                    )}
                                                                </MenuList>
                                                            </Menu>

                                                            {priceLabel && (
                                                                <Text
                                                                    fontSize={smallTextSize}
                                                                    flexShrink={0}
                                                                    textAlign={isMobile ? "left" : "center"}
                                                                    width={isMobile ? "full" : "auto"}
                                                                >
                                                                    {priceLabel}
                                                                </Text>
                                                            )}
                                                        </Stack>
                                                    </FormControl>
                                                    <FormControl id={`value-${index}`} isRequired>
                                                        {renderServiceInput(service, index)}
                                                    </FormControl>
                                                </VStack>
                                            </Box>
                                        );
                                    })}

                                    <Button
                                        leftIcon={<AddIcon/>}
                                        variant="outline"
                                        colorScheme="blue"
                                        size={buttonSize}
                                        onClick={handleAddService}
                                        width="full"
                                        mt={2}
                                    >
                                        Add New Service
                                    </Button>
                                </VStack>
                            </Box>

                            <Box
                                borderWidth="1px"
                                borderRadius="lg"
                                p={boxPadding}
                                boxShadow="sm"
                            >
                                <VStack spacing={formSpacing} align="stretch">
                                    <FormControl id="laundryBags" isRequired>
                                        <FormLabel fontSize={smallTextSize} fontWeight="semibold">Laundry Bags</FormLabel>
                                        <NumberInput
                                            size={buttonSize}
                                            placeholder="Enter the laundry Bags"
                                            min={1}
                                            step={1}
                                            value={laundryBags}
                                            precision={0}
                                            onChange={(bags) => setLaundryBags(Number(bags))}
                                        >
                                            <NumberInputField fontSize={textSize}/>
                                            <NumberInputStepper>
                                                <NumberIncrementStepper/>
                                                <NumberDecrementStepper/>
                                            </NumberInputStepper>
                                        </NumberInput>
                                    </FormControl>

                                    <FormControl>
                                        <FormLabel fontSize={smallTextSize} fontWeight="semibold">Special Instructions</FormLabel>
                                        <Textarea
                                            size={buttonSize}
                                            placeholder="Enter any special instructions"
                                            value={specialInstructions}
                                            fontSize={textSize}
                                            onChange={(e) => {
                                                const newVal = e.target.value;
                                                setSpecialInstructions(newVal);
                                                if (newVal.trim() !== '' && newVal !== initialSpecialInstructions) {
                                                    setSaveSpecialInstructions(true);
                                                } else {
                                                    setSaveSpecialInstructions(false);
                                                }
                                            }}
                                        />
                                    </FormControl>

                                    <FormControl id="promoCode">
                                        <FormLabel fontSize={smallTextSize} fontWeight="semibold">Promotion</FormLabel>
                                        <Stack direction={isMobile ? "column" : "row"} spacing={2}>
                                            <Input
                                                size={buttonSize}
                                                placeholder="Enter promo code"
                                                value={localPromoCode}
                                                fontSize={textSize}
                                                onChange={(e) => setLocalPromoCode(e.target.value)}
                                                disabled={isPromoFieldDisabled}
                                            />
                                            {!isPromoFieldDisabled ? (
                                                <Button
                                                    size={buttonSize}
                                                    colorScheme="blue"
                                                    onClick={handleValidatePromo}
                                                    isLoading={isPromoCodeValidating}
                                                    flexShrink={0}
                                                    width={isMobile ? "full" : "auto"}
                                                >
                                                    Validate
                                                </Button>
                                            ) : (
                                                <Button
                                                    size={buttonSize}
                                                    colorScheme="yellow"
                                                    onClick={handleEditPromo}
                                                    flexShrink={0}
                                                    width={isMobile ? "full" : "auto"}
                                                >
                                                    Edit
                                                </Button>
                                            )}
                                        </Stack>
                                    </FormControl>
                                </VStack>
                            </Box>
                        </VStack>
                    </GridItem>

                    {/* Right Column - Delivery Information */}
                    <GridItem>
                        <VStack spacing={sectionSpacing} align="stretch">
                            <Box
                                borderWidth="1px"
                                borderRadius="lg"
                                p={boxPadding}
                                boxShadow="sm"
                            >
                                <Heading size={subHeadingSize} mb={3}>Delivery Information</Heading>

                                <Stack direction={isMobile ? "column" : "row"} spacing={formSpacing}>
                                    <FormControl id="pickupDate" isRequired>
                                        <FormLabel fontSize={smallTextSize} fontWeight="semibold">Received Date</FormLabel>
                                        <Input
                                            size={buttonSize}
                                            type="date"
                                            min={today}
                                            value={pickupDate}
                                            onChange={(e) => setPickupDate(e.target.value)}
                                        />
                                    </FormControl>
                                    <FormControl id="pickupTime" isRequired>
                                        <FormLabel fontSize={smallTextSize} fontWeight="semibold">Received Time</FormLabel>
                                        <Input
                                            size={buttonSize}
                                            type="time"
                                            value={pickupTime}
                                            onChange={(e) => setPickupTime(e.target.value)}
                                        />
                                    </FormControl>
                                </Stack>

                                <Stack direction={isMobile ? "column" : "row"} spacing={formSpacing} mt={3}>
                                    <FormControl id="dropoffDate" isRequired>
                                        <FormLabel fontSize={smallTextSize} fontWeight="semibold">Drop-off Date</FormLabel>
                                        <Input
                                            size={buttonSize}
                                            type="date"
                                            min={pickupDate}
                                            value={dropoffDate}
                                            onChange={(e) => setDropoffDate(e.target.value)}
                                        />
                                    </FormControl>

                                    <FormControl id="Expected PickUp Time Slot" isRequired>
                                        <FormLabel fontSize={smallTextSize} fontWeight="semibold">Drop-off Time Slot</FormLabel>
                                        <Select
                                            size={buttonSize}
                                            value={dropoffTime}
                                            placeholder="Select PickUp Time Slot"
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

                                <FormControl id="address" mt={3}>
                                    <FormLabel fontSize={smallTextSize} fontWeight="semibold">Address</FormLabel>
                                    <LoadScriptNext googleMapsApiKey={googleApiKey} libraries={['places']}>
                                        <StandaloneSearchBox
                                            onLoad={ref => (searchBoxRef.current = ref)}
                                            onPlacesChanged={handlePlacesChanged}
                                        >
                                            <Input
                                                size={buttonSize}
                                                type="text"
                                                placeholder="Enter your Address for Free Pickup"
                                                value={address}
                                                fontSize={textSize}
                                                onChange={(e) => setAddress(e.target.value)}
                                            />
                                        </StandaloneSearchBox>
                                    </LoadScriptNext>
                                </FormControl>
                                <FormControl id="doorNumber" mt={3}>
                                    <FormLabel fontSize={smallTextSize} fontWeight="semibold">Door Number</FormLabel>
                                    <Input
                                        size={buttonSize}
                                        type="text"
                                        placeholder="Enter Door Number"
                                        value={doorNumber}
                                        fontSize={textSize}
                                        onChange={(e) => setDoorNumber(e.target.value)}
                                    />
                                </FormControl>

                                <FormControl id="deliveryInstructions" mt={3}>
                                    <FormLabel fontSize={smallTextSize} fontWeight="semibold">Delivery Instructions</FormLabel>
                                    <Textarea
                                        size={buttonSize}
                                        placeholder="Enter Delivery Instructions"
                                        value={deliveryInstructions}
                                        fontSize={textSize}
                                        onChange={(e) => setDeliveryInstructions(e.target.value)}
                                    />
                                </FormControl>
                            </Box>
                            <Button
                                colorScheme="blue"
                                type="submit"
                                isDisabled={!isServiceStepValid}
                                size={buttonSize}
                                width="full"
                                fontSize={textSize}
                            >
                                Review Order & Payment
                            </Button>
                        </VStack>
                    </GridItem>
                </SimpleGrid>


            </form>
        </Box>
    );
}