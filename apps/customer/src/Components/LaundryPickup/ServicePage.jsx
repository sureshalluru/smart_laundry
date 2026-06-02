import React, {useEffect, useCallback, useState, useRef} from 'react';
import {
    Stack,
    FormControl,
    FormLabel,
    Input,
    Button,
    VStack,
    Menu,
    MenuButton,
    MenuList,
    MenuItem,
    Textarea,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    NumberIncrementStepper,
    NumberDecrementStepper,
    Text,
    Select,
    useToast,
    IconButton,
    Box,
    Flex,
    RadioGroup,
    Radio,
    HStack
} from "@chakra-ui/react";
import {AddIcon, DeleteIcon, ChevronDownIcon} from "@chakra-ui/icons";
import {toZonedTime, format} from "date-fns-tz";
import {addDays} from "date-fns";
import axios from "axios";

export default function ServicePage({
                                        setIsServiceStepValid,
                                        handleNextStep,
                                        isServiceStepValid,
                                        services,
                                        setServices,
                                        pickupTime,
                                        pickupDate,
                                        dropoffTime,
                                        dropoffDate,
                                        setDropoffDate,
                                        setPickupTime,
                                        setPickupDate,
                                        setDropoffTime,
                                        specialInstructions,
                                        setSpecialInstructions,
                                        setSaveSpecialInstructions,
                                        frequency,
                                        setFrequency,
                                        laundryId,
                                        laundryServices,
                                        deliveryTimeSlots,
                                        deliveryTimeInterval,
                                        laundryFrequency,
                                        laundryTimeZone,
                                        promoCode,
                                        setPromoCode,
                                        laundryBags,
                                        setLaundryBags,
                                        frequencyPromotions,
                                        promoDescriptionMessage,
                                        setPromoDescriptionMessage,
                                        pickupService,
                                        setPickupService,
                                        dropoffService,
                                        setDropoffService,
                                        uberEnv,
                                        uberExists,
                                        setUberExists,
                                        laundryAddress,
                                        address,
                                        uberPickupFrequency,
                                        setUberPickupFrequency,
                                        uberDropoffFrequency,
                                        setUberDropoffFrequency
                                    }) {
    const toast = useToast(); // Toast Notifications
    const userAuthToken = localStorage.getItem('idToken');
    const initialSpecialInstructionsRef = useRef(specialInstructions);

    // Promo-related state
    const [localPromoCode, setLocalPromoCode] = useState(promoCode); // Local state for promo code
    const [isPromoValidating, setIsPromoValidating] = useState(false); // set state to validate the promo code
    const [isPromoValid, setIsPromoValid] = useState(!!promoCode);
    const [isFreqPromoApplied, setIsFreqPromoApplied] = useState(false);
    // const [pickupService, setPickupService] = useState("LaundryDriver");
    const [pickupEstimate, setPickupEstimate] = useState(null);
    const [dropoffEstimate, setDropoffEstimate] = useState(null);



    // Utility: Get current 2-hour slot like "14:00 - 16:00"
const getCurrent2HourSlot = () => {
  const timeZone = laundryTimeZone
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



// const todayDate = new Date().toISOString().split("T")[0];
const [pickupMode, setPickupMode] = useState("scheduled"); // 'instant' or 'scheduled'
const getTodayInLaundryTZ = () => {
  const timeZone = laundryTimeZone || '';
  const now = new Date();
  const zoned = toZonedTime(now, timeZone);
  return format(zoned, 'yyyy-MM-dd', { timeZone });
};



useEffect(() => {
  if (pickupMode === "instant") {
    const currentDate = getTodayInLaundryTZ();
    const instantTime = getCurrent2HourSlot();
    setPickupDate(currentDate);
    setPickupTime(instantTime);
    setPickupService("Uber");
    console.log("⚡ Instant mode set:", currentDate, instantTime);
  } else {
    setPickupService("LaundryDriver");
    const tomorrow = getDateInTimeZone(addDays(new Date(), 1), laundryTimeZone);
    setPickupDate(tomorrow);
  }
}, [pickupMode, laundryTimeZone]);


const isWithinHours = () => {
  const now = toZonedTime(new Date(), laundryTimeZone);
  const todayDay = format(now, 'EEEE', { timeZone: laundryTimeZone });

  const slot = deliveryTimeSlots.find((s) => s.day === todayDay);
  if (!slot) return false;

  const [startHour, startMinute] = slot.startTime.split(":").map(Number);
  const [endHour, endMinute] = slot.endTime.split(":").map(Number);

  const start = new Date(now);
  start.setHours(startHour, startMinute, 0, 0);

  const end = new Date(now);
  end.setHours(endHour, endMinute, 0, 0);

  return now >= start && now <= end;
};

const canDoInstantPickup = uberExists && isWithinHours();

    // Auto‐apply or clear frequency promos
    useEffect(() => {
        if (frequency) {
            const promo = frequencyPromotions.find((p) => p.frequency === frequency);
            if (promo) {
                setLocalPromoCode(promo.promoCode);
                setPromoCode(promo.promoCode);
                setPromoDescriptionMessage(`Promo Applied! ${promo.description}`);
                setIsPromoValid(true);
                setIsFreqPromoApplied(true);
            } else {
                setPromoDescriptionMessage(`You selected: ${frequency}`);
            }
        } else if (isFreqPromoApplied) {
            // user cleared a previously applied frequency
            setLocalPromoCode("");
            setPromoCode("");
            setPromoDescriptionMessage("");
            setIsPromoValid(false);
            setIsFreqPromoApplied(false);
        }
    }, [
        frequency,
        frequencyPromotions,
        isFreqPromoApplied,
        setPromoCode,
        setPromoDescriptionMessage,
    ]);

    // Validate  promo code API call
    const handleValidatePromo = async () => {
        try {
            setIsPromoValidating(true);
            const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/customer/validate-promo-code`, {
                params: {
                    laundryId: laundryId,
                    operation: 'validatePromoCode',
                    promoCode: localPromoCode,
                },
                headers: {
                    'x-api-key': userAuthToken,
                },
            });


            // Extract the response data
            const data = response.data;

            // Check if the promo code is valid
            if (data.body?.isValid) {
                setIsPromoValid(true);
                setPromoCode(localPromoCode); // Update the validated promo code in the parent state
                toast({
                    title: 'Promo Code Valid',
                    description: `Code "${localPromoCode}" is valid and applied.`,
                    status: 'success',
                    duration: 3000,
                    isClosable: true,
                });
            } else {
                setIsPromoValid(false);
                setLocalPromoCode('');             // clear the input field
                setPromoCode("");                  // clear parent promo
                setPromoDescriptionMessage("");    // clear any message
                toast({
                    title: 'Invalid Promo Code',
                    description: `Sorry, "${localPromoCode}" isn’t valid or has expired.`,
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

    // Switch back to edit mode
    const handleEditPromo = () => {
        setIsPromoValid(false);
        setPromoCode("");
        setPromoDescriptionMessage("");
    };
    // Promo Validation Next Step
    const onValidatePromoNextStep = () => {
        if (!frequency && localPromoCode && !isPromoValid) {
            toast({
                title: "Please Validate Promo",
                description: `You entered "${localPromoCode}" but haven’t Validated yet.`,
                status: "warning",
                duration: 4000,
                isClosable: true,
            });
            return;
        }
        handleNextStep();
    };
    // If user edits after validation, force re‐validate
    const onPromoChange = (e) => {
        const val = e.target.value;
        if (isPromoValid) {
            setIsPromoValid(false);
            setPromoCode("");
            setPromoDescriptionMessage("");
        }
        setLocalPromoCode(val);
    };

    // Function to calculate available time slots based on the selected date and time zone
    const getAvailableTimeSlots = useCallback(
        (selectedDate) => {
            const selectedDateLocal = toZonedTime(new Date(`${selectedDate}T00:00`), laundryTimeZone);
            const selectedDay = format(selectedDateLocal, 'EEEE', {timeZone: laundryTimeZone});
            const timeSlot = deliveryTimeSlots.find((slot) => slot.day === selectedDay);

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
        [deliveryTimeSlots, deliveryTimeInterval, laundryTimeZone]
    );

    // Function to format dates in the laundry's time zone
    const getDateInTimeZone = (date, timeZone) => {
        const zonedDate = toZonedTime(date, timeZone);
        return format(zonedDate, 'yyyy-MM-dd', {timeZone});
    };
    // useEffect to update pickupTime when pickupDate changes
    // useEffect(() => {
    //     if (pickupDate && deliveryTimeSlots.length > 0) {
    //         const availablePickupTimeSlots = getAvailableTimeSlots(pickupDate);

    //         // Only set default if current pickupTime is not in available time slots
    //         if (!pickupTime || !availablePickupTimeSlots.includes(pickupTime)) {
    //             if (availablePickupTimeSlots.length > 0) {
    //                 setPickupTime(availablePickupTimeSlots[0]); // Default to the first time slot
    //             } else {
    //                 setPickupTime(''); // No available time slots
    //             }
    //         }

    //         // Calculate minDropoffDate as one day after pickupDate
    //         const minDropoffDate = getDateInTimeZone(addDays(new Date(`${pickupDate}T00:00:00`), 1), laundryTimeZone);

    //         // Update dropoffDate to the next day after pickupDate if necessary
    //         if (!dropoffDate || new Date(dropoffDate) < new Date(minDropoffDate)) {
    //             setDropoffDate(minDropoffDate);
    //         }
    //     }
    // }, [
    //     pickupDate,
    //     deliveryTimeSlots,
    //     getAvailableTimeSlots,
    //     setPickupTime,
    //     pickupTime,
    //     dropoffDate,
    //     setDropoffDate,
    //     laundryTimeZone,
    // ]);

    useEffect(() => {
  if (pickupDate && deliveryTimeSlots.length > 0) {
    const availablePickupTimeSlots = getAvailableTimeSlots(pickupDate);

    // ✅ Use ref to prevent overriding instant time
    if (pickupModeRef.current !== "instant") {
      if (!pickupTime || !availablePickupTimeSlots.includes(pickupTime)) {
        if (availablePickupTimeSlots.length > 0) {
          setPickupTime(availablePickupTimeSlots[0]);
        } else {
          setPickupTime('');
        }
      }
    }

    const minDropoffDate = getDateInTimeZone(addDays(new Date(`${pickupDate}T00:00:00`), 1), laundryTimeZone);
    if (!dropoffDate || new Date(dropoffDate) < new Date(minDropoffDate)) {
      setDropoffDate(minDropoffDate);
    }
  }
}, [
  pickupDate,
  deliveryTimeSlots,
  getAvailableTimeSlots,
  setPickupTime,
  pickupTime,
  dropoffDate,
  setDropoffDate,
  laundryTimeZone,
]);


    // useEffect to update dropoffTime when dropoffDate changes
    useEffect(() => {
        if (dropoffDate && deliveryTimeSlots.length > 0) {
            const availableDropoffTimeSlots = getAvailableTimeSlots(dropoffDate);

            // Only set default if current dropoffTime is not in available time slots
            if (!dropoffTime || !availableDropoffTimeSlots.includes(dropoffTime)) {
                if (availableDropoffTimeSlots.length > 0) {
                    setDropoffTime(availableDropoffTimeSlots[0]); // Default to the first time slot
                } else {
                    setDropoffTime(''); // No available time slots
                }
            }
        }
    }, [
        dropoffDate,
        deliveryTimeSlots,
        getAvailableTimeSlots,
        setDropoffTime,
        laundryTimeZone,
        dropoffTime,
    ]);

    // Function to render the Input Box based on the weight and count
    const renderServiceInput = (service, index) => {
        const selectedService = laundryServices.find(
            (item) => item.serviceName === service.service
        );
        if (selectedService) {
            if (selectedService.inputWeight === true) {
                return (
                    <>
                        <FormLabel>Approx Weight (lbs)</FormLabel>
                        <NumberInput
                            placeholder="Enter weight in lbs"
                            value={service.count}
                            min={1}
                            max={50}
                            step={1}
                            onChange={(weightValue) =>
                                handleServiceChange(index, 'count', true, selectedService.price, weightValue)
                            }
                        >
                            <NumberInputField type="numeric"/>
                        </NumberInput>
                    </>
                );
            } else {
                return (
                    <>
                        <FormLabel>Count</FormLabel>
                        <NumberInput max={50} min={1} step={1} value={service.count} precision={0}
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
    const handleServiceChange = (index, field, inputWeight, price, value) => {
        const newServices = [...services];
        // Reset the count and cost when a new service is selected or overridden
        if (field === 'service') {
            newServices[index]['count'] = ''; // Reset count/weight
            newServices[index]['cost'] = ''; // Reset cost
            newServices[index]['basePrice'] = String(price);

        } else if (field === 'count') {
            // Update cost based on the updated count or weight
            newServices[index]['cost'] = String((parseFloat(price) * parseFloat(value)).toFixed(2));
        }

        // Update the specific field with the provided value
        newServices[index][field] = value;
        setServices(newServices);
    };


    const handleAddService = () => {
        setServices([...services, {service: '', count: '', cost: '', basePrice: ''}]);
    };

    const handleRemoveService = (index) => {
        const newServices = services.filter((_, i) => i !== index);
        setServices(newServices);
    };

    useEffect(() => {
  if (pickupDate && deliveryTimeSlots.length > 0) {
    const availablePickupTimeSlots = getAvailableTimeSlots(pickupDate);

    // ✅ Don't override instant time slot
    if (pickupMode !== "instant") {
      if (!pickupTime || !availablePickupTimeSlots.includes(pickupTime)) {
        if (availablePickupTimeSlots.length > 0) {
          setPickupTime(availablePickupTimeSlots[0]);
        } else {
          setPickupTime('');
        }
      }
    }

    const minDropoffDate = getDateInTimeZone(addDays(new Date(`${pickupDate}T00:00:00`), 1), laundryTimeZone);
    if (!dropoffDate || new Date(dropoffDate) < new Date(minDropoffDate)) {
      setDropoffDate(minDropoffDate);
    }
  }
}, [
  pickupDate,
  deliveryTimeSlots,
  getAvailableTimeSlots,
  setPickupTime,
  pickupTime,
  dropoffDate,
  setDropoffDate,
  laundryTimeZone,
  pickupMode, // <-- add this too
]);


useEffect(() => {
  if (pickupMode === "scheduled") {
    // Only set default if not already set (avoid overriding user's selection)
    if (!pickupService) setPickupService("LaundryDriver");
    if (!dropoffService) setDropoffService("LaundryDriver");
  }
}, [pickupMode, pickupService, dropoffService, setPickupService, setDropoffService]);

    useEffect(() => {
        const filledServices = services.filter((service) => service.service && service.count >= 1);
        const isFormValid =
            services.length > 0 &&
            filledServices.length === services.length &&
            pickupDate &&
            pickupTime &&
            dropoffDate &&
            dropoffTime;

        setIsServiceStepValid(isFormValid);
    }, [services, pickupDate, pickupTime, dropoffDate, dropoffTime, setIsServiceStepValid]);

    // Calculate the minimum date
    const today = new Date();
    const todayDate = getDateInTimeZone(addDays(today, 1), laundryTimeZone);
const pickupModeRef = useRef(pickupMode);

useEffect(() => {
  pickupModeRef.current = pickupMode;
}, [pickupMode]);


const fetchUberEstimate = async ({ type }) => {
//   console.log("[Uber DEBUG] Estimation triggered for:", type);
//   console.log("[Uber DEBUG] Pickup date/time:", pickupDate, pickupTime);
//   console.log("[Uber DEBUG] Laundry address:", laundryAddress);

  const idToken = localStorage.getItem("idToken");
  
  const pickupAddress = address; // customer address
  const dropoffAddress = laundryAddress; // laundry address

  const payload = {
    uberEnv: uberEnv,
    pickup_address: type === "pickup" ? pickupAddress : dropoffAddress,
    dropoff_address: type === "pickup" ? dropoffAddress : pickupAddress,
    pickup_phone: "+15125551234",
    dropoff_phone: "+15125551234",
    delivery_date: pickupDate,
    time_interval: pickupTime
  };

//   console.log("[Uber DEBUG] Final payload:", payload);
  const authToken = localStorage.getItem('idToken');
  try {
    const response = await fetch(
      `${process.env.REACT_APP_AWS_API_URL}/api/uber/uberQuoteEstimate?operation=get-uber-quote&laundryId=${laundryId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        //   'x-api-key': userAuthToken
        },
        body: JSON.stringify(payload)
      }
    );
    // console.log("[Uber DEBUG] API response:", response);
    // const result = await response.json();

    const result = await response.json();
    // console.log("[Uber DEBUG] API result:", result);

let parsedBody = result;
if (typeof result.body === "string") {
  try {
    parsedBody = JSON.parse(result.body);
  } catch (e) {
    console.error("🚨 Failed to parse result.body:", result.body);
  }
}

// console.log("[Uber DEBUG] Parsed estimate result:", parsedBody);

if (parsedBody.estimatedFeeCents) {
  const estimate = parsedBody.estimatedFeeCents / 100;
  if (type === "pickup") setPickupEstimate(estimate);
  else setDropoffEstimate(estimate);
} else {
  console.warn("🚫 No estimatedFeeCents in response:", parsedBody);
}
  } catch (error) {
    console.error("[Uber ERROR] Fetch failed:", error);
  }
};

useEffect(() => {
  if (pickupService === "Uber" && pickupDate && pickupTime) {
    fetchUberEstimate({ type: "pickup" });
  }
}, [pickupService, pickupDate, pickupTime]);

useEffect(() => {
  if (dropoffService === "Uber" && dropoffDate && dropoffTime) {
    fetchUberEstimate({ type: "dropoff" });
  }
}, [dropoffService, dropoffDate, dropoffTime]);

useEffect(() => {
  if (
    pickupMode === "instant" &&
    pickupService === "Uber" &&
    pickupDate &&
    pickupTime
  ) {
    fetchUberEstimate({ type: "pickup" });
  }
}, [pickupMode, pickupService, pickupDate, pickupTime]);

useEffect(() => {
  if (pickupMode === "scheduled") {
    // ❌ This won't reset if pickupService is already set to "Uber" from instant mode
    if (!pickupService) setPickupService("LaundryDriver");
    if (!dropoffService) setDropoffService("LaundryDriver");
  }
}, [pickupMode, pickupService, dropoffService, setPickupService, setDropoffService]);

    return (
        <Stack spacing={4} width="100%">
            {services.map((service, index) => {
                const selectedService = laundryServices.find(
                    (item) => item.serviceName === service.service
                );
                const priceLabel = selectedService
                    ? selectedService.inputWeight === 'true'
                        ? `$${selectedService.price}/lb`
                        : `$${selectedService.price}/piece`
                    : '';

                return (
                    <VStack key={index} spacing={2} align="stretch">
                        <FormControl id={`service-${index}`} isRequired>
                            <FormLabel>Service</FormLabel>
                            <Flex direction="row" align="center" wrap="nowrap" overflow="hidden">
                                <Box flex="1" minWidth="0" mr={2}>
                                    <Menu>
                                        <MenuButton
                                            as={Button}
                                            rightIcon={<ChevronDownIcon/>}
                                            // Ensuring the button text truncates instead of overflowing:
                                            overflow="hidden"
                                            fontSize={['md', 'lg']}
                                            textOverflow="ellipsis"
                                            whiteSpace="nowrap"
                                            maxW="100%"
                                        >
                                            {service.service || "Select a service"}
                                        </MenuButton>
                                        <MenuList zIndex={9999}>
                                            {laundryServices
                                                .map((option, i) => (
                                                    <MenuItem
                                                        key={i}
                                                        onClick={() =>
                                                            handleServiceChange(
                                                                index,
                                                                'service',
                                                                option.inputWeight,
                                                                option.price,
                                                                option.serviceName
                                                            )
                                                        }
                                                        isDisabled={services.some((s) => s.service === option.serviceName)}
                                                    >
                                                        <Box display="flex" justifyContent="space-between" width="100%">
                                                            <Text noOfLines={1}>{option.serviceName}</Text>
                                                            <Text color="gray.500" ml={2}>
                                                                {option.inputWeight ? `$${option.price}/lb` : `$${option.price}/piece`}
                                                            </Text>
                                                        </Box>
                                                    </MenuItem>
                                                ))}
                                        </MenuList>
                                    </Menu>
                                </Box>

                                {priceLabel && (
                                    <Text
                                        whiteSpace="nowrap"
                                        flexShrink={0}
                                        mr={2}
                                    >
                                        {priceLabel}
                                    </Text>
                                )}

                                <IconButton
                                    ml="auto"
                                    colorScheme="red"
                                    aria-label="Remove Service"
                                    icon={<DeleteIcon/>}
                                    fontSize={['md', 'lg']}
                                    onClick={() => handleRemoveService(index)}
                                    flexShrink={0}
                                />
                            </Flex>

                        </FormControl>

                        <FormControl id={`value-${index}`} isRequired>
                            {renderServiceInput(service, index)}
                        </FormControl>
                    </VStack>
                );
            })}

            <Flex direction="row" align="center" wrap="nowrap">
                <IconButton
                    colorScheme="green"
                    aria-label="Add Service"
                    icon={<AddIcon/>}
                    onClick={handleAddService}
                    mr={2}
                    fontSize={['md', 'lg']}
                />
                <Text fontSize={['md', 'lg']}>Add New Service</Text>
            </Flex>

            <Stack direction={{base: 'column', md: 'row'}} spacing={4} width="100%">
                <Box
  border="1px"
  borderColor="gray.200"
  borderRadius="md"
  p={3}
  shadow="sm"
  mb={4}
  width="100%"
>
  <Text fontSize={["xs", "md", "lg"]} fontWeight="semibold" mb={2}>
    Pickup Type
  </Text>

  <RadioGroup
    value={pickupMode}
    onChange={setPickupMode}
    colorScheme="blue"
  >
    <Stack direction={{ base: "column", md: "row" }} spacing={6}>
      {uberExists && (
        <Radio value="instant" isDisabled={!canDoInstantPickup} > 
            Instant Pickup – Powered by Uber<br />
            {pickupMode === "instant" && pickupEstimate && (
                <Text fontSize="sm" color="blue.600" mt={1}>
                    Estimated Uber Pickup Fee: ${pickupEstimate.toFixed(2)}
                </Text>
            )}

        </Radio>
        )}

      <Radio value="scheduled">Scheduled Pickup</Radio>
    </Stack>
  </RadioGroup>
</Box>


{pickupMode === "scheduled" && (
  <Stack direction={{ base: 'column', md: 'row' }} spacing={4} width="100%">
    <FormControl id="pickupDate" isRequired width="100%">
      <FormLabel fontSize={['md', 'lg']}>Pickup Date</FormLabel>
      <Input
        type="date"
        min={todayDate}
        value={pickupDate}
        onChange={(e) => {
          const newDate = e.target.value;
          setPickupDate(newDate || todayDate);
        }}
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
)}

      
            </Stack>
            {pickupMode === "scheduled" && (
            <Box
                border="1px"
                borderColor="gray.200"
                borderRadius="md"
                p={3}
                shadow="sm"
                mb={4}                 /* space below the radio row */
                width="100%"
            >
                <Text fontSize={["xs","md","lg"]} fontWeight="semibold" mb={2}>
                Choose Pickup Service
                </Text>

                <RadioGroup
                onChange={setPickupService}
                value={pickupService || "LaundryDriver"}
                colorScheme="blue"
                >
                <HStack spacing={6}>
                    {uberExists && <Radio value="Uber">Uber</Radio>}
                    <Radio value="LaundryDriver">Laundry&nbsp;Driver</Radio>
                </HStack>
                </RadioGroup>
                {/* {pickupService === "Uber" && (
                    <Text fontSize={["sm", "md"]} mt={3} color="blue.600" fontStyle="italic">
                        Uber charges will be added to your order upon driver allocation.
                    </Text>
                )} */}
                {pickupService === "Uber" && pickupEstimate && (
  <Text fontSize="sm" color="blue.600" mt={1}>
    🚕 Estimated Uber Pickup Fee: ${pickupEstimate.toFixed(2)}
  </Text>
)}
{pickupService === "LaundryDriver" && (
  <Text fontSize="sm" color="green.600" mt={1}>
    ✅ Free Pickup Service
  </Text>
)}


{/* {dropoffService === "Uber" && dropoffEstimate && (
  <Text fontSize="sm" color="blue.600" mt={1}>
    🚕 Estimated Uber Dropoff Fee: ${dropoffEstimate.toFixed(2)}
  </Text>
)} */}

            </Box>)}


            <Stack direction={{base: 'column', md: 'row'}} spacing={4} width="100%">
                <FormControl id="dropoffDate" isRequired width="100%">
                    <FormLabel fontSize={['md', 'lg']}>Drop-off Date</FormLabel>
                    <Input
                        type="date"
                        min={getDateInTimeZone(addDays(new Date(`${pickupDate}T00:00:00`), 1), laundryTimeZone)}
                        value={dropoffDate}
                        onChange={(e) => {
                            const newDate = e.target.value;
                            // Calculate minimum allowed dropoff date based on current pickupDate
                            const minDropoff = getDateInTimeZone(
                                addDays(new Date(`${pickupDate}T00:00:00`),
                                    1,
                                    laundryTimeZone
                                ));
                            // Reset to minDropoff if cleared
                            setDropoffDate(newDate || minDropoff);
                        }}
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
            <Box
                border="1px"
                borderColor="gray.200"
                borderRadius="md"
                p={3}
                shadow="sm"
                mb={4}                 /* space below the radio row */
                width="100%"
            >
                <Text fontSize={["xs","md","lg"]} fontWeight="semibold" mb={2}>
                Choose dropoff Service
                </Text>

                <RadioGroup
                onChange={setDropoffService}
                value={dropoffService || "LaundryDriver"}
                colorScheme="blue"
                >
                <HStack spacing={6}>
                    {uberExists && <Radio value="Uber">Uber</Radio>}
                    <Radio value="LaundryDriver">Laundry&nbsp;Driver</Radio>
                </HStack>
                </RadioGroup>
                {dropoffService === "Uber" && dropoffEstimate && (
                    <Text fontSize="sm" color="blue.600" mt={1}>
                        🚕 Estimated Uber Dropoff Fee: ${dropoffEstimate.toFixed(2)}
                    </Text>
                )}
                {dropoffService === "LaundryDriver" && (
                    <Text fontSize="sm" color="green.600" mt={1}>
                        ✅ Free Dropoff Service
                    </Text>
                )}

            </Box>


            <FormControl id="laundryBags" isRequired width="100%">
                <FormLabel fontSize={['md', 'lg']}>Laundry Bags</FormLabel>
                <NumberInput placeholder="Enter the laundry Bags" max={50} min={1} step={1} value={laundryBags}
                             precision={0}
                             onChange={(bags) => setLaundryBags(Number(bags))}
                >
                    <NumberInputField type="numeric"/>
                    <NumberInputStepper>
                        <NumberIncrementStepper/>
                        <NumberDecrementStepper
                        />
                    </NumberInputStepper>
                </NumberInput>
            </FormControl>
            <FormControl id="specialInstructions">
                <FormLabel fontSize={['md', 'lg']}>Special Instructions</FormLabel>
                <Textarea
                    placeholder="Specify any preferences like detergent type, folding style, or stain treatment."
                    value={specialInstructions}
                    onChange={(e) => {
                        const newVal = e.target.value;
                        setSpecialInstructions(newVal);
                        // If the new value is non-empty and different from the initial value, mark as changed.
                        if (newVal !== initialSpecialInstructionsRef.current && newVal.trim() !== "") {
                            setSaveSpecialInstructions(true);
                        } else {
                            setSaveSpecialInstructions(false);
                        }
                    }}
                />
            </FormControl>

            <FormControl id="frequency">
                <FormLabel fontSize={['md', 'lg']}>Frequency</FormLabel>
                <Select
                    placeholder="Select frequency"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                >
                    {laundryFrequency.map((option, i) => (
                        <option key={i} value={option}>
                            {option}
                        </option>
                    ))}
                </Select>
            </FormControl>

            {!frequency && (
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
                            minWidth={0} // Allows shrinking if needed
                        />

                        <Button
                            ml={2}
                            onClick={isPromoValid ? handleEditPromo : handleValidatePromo}
                            isLoading={isPromoValidating}
                            colorScheme={isPromoValid ? "yellow" : "blue"}
                            flexShrink={0}
                            size={['md', 'lg']}
                        >
                            {isPromoValid ? "Edit" : "Validate"}
                        </Button>
                    </Flex>
                </FormControl>

            )}

            {frequency && (
            <Box
                border="1px"
                borderColor="gray.200"
                borderRadius="md"
                p={3}
                shadow="sm"
                mb={4}
                width="100%"
            >
                <Text fontSize={["xs","md","lg"]} fontWeight="semibold" mb={2}>
                Frequency Order Uber Options
                </Text>

                <FormControl mb={2}>
                <FormLabel fontSize={['md', 'lg']}>Do you want Uber for Pickup Service?</FormLabel>
                <RadioGroup
                    onChange={(value) => setUberPickupFrequency(value === "yes")}
                    value={uberPickupFrequency ? "yes" : "no"}
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
                <FormLabel fontSize={['md', 'lg']}>Do you want Uber for Dropoff Service?</FormLabel>
                <RadioGroup
                    onChange={(value) => setUberDropoffFrequency(value === "yes")}
                    value={uberDropoffFrequency ? "yes" : "no"}
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

            {promoDescriptionMessage && (
                <Box
                    mt={2}
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


            <Button colorScheme="blue" onClick={onValidatePromoNextStep} isDisabled={!isServiceStepValid} width="100%"
                    size={['md', 'lg']}>
                Next: Payment
            </Button>
        </Stack>
    );
}
