import React, {useContext, useEffect, useRef, useState} from 'react';
import {
    Box,
    Button,
    Flex,
    Stack,
    Step,
    StepIndicator,
    StepSeparator,
    StepStatus,
    Stepper,
    StepTitle,
    FormControl, FormLabel, Input,
    useSteps, StepIcon, StepNumber, useToast, VStack, Image, Heading
} from "@chakra-ui/react";
import ServicePage from '../Components/LaundryPickup/ServicePage';
import PaymentPage from '../Components/LaundryPickup/PaymentPage';
import ReviewOrderPage from '../Components/LaundryPickup/ReviewOrderPage';
import PricingChoice from '../Components/LaundryPickup/PricingChoice';
import BagOrderPage from '../Components/LaundryPickup/BagOrderPage';
import BagReviewOrderPage from '../Components/LaundryPickup/BagReviewOrderPage';
import {useNavigate} from "react-router-dom";
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import axios from "axios";
import {LoadScriptNext, StandaloneSearchBox} from "@react-google-maps/api";
import LaundryPickupImage from "../images/laundry-pickup.svg";
import {formatISO, parseISO} from "date-fns";
import { toZonedTime, format } from 'date-fns-tz';
import {addDays} from 'date-fns';
import {LaundryContext} from "../Components/Contexts/LaundryContext";

export default function LaundryPickupPage({laundryId,customerId,customerPaymentId,setCustomerPaymentId, laundryTimeZone, setLaundryTimeZone, specialInstructions, setSpecialInstructions}) {
    // Pricing type: "per_bag" or "per_pound"
    const [pricingType, setPricingType] = useState(null); // null = not yet chosen
    const [bagPrice, setBagPrice] = useState(30.00);

    // Steps depend on pricing type
    const getSteps = () => {
        if (pricingType === 'per_bag') {
            return [
                {title: 'Pricing'},
                {title: 'Bags & Schedule'},
                {title: 'Payment'},
                {title: 'Review'},
            ];
        }
        return [
            {title: 'Pricing'},
            {title: 'Service'},
            {title: 'Payment'},
            {title: 'Review Order'},
        ];
    };
    const steps = getSteps();
    const { laundryData } = useContext(LaundryContext);
    const {activeStep, setActiveStep} = useSteps({index: 0});
    const [isPlaceOrderEnabled, setIsPlaceOrderEnabled] = useState(false);
    const [isServiceStepValid, setIsServiceStepValid] = useState(false);
    const [isPaymentStepValid,setIsPaymentStepValid] = useState(false);
    const navigate = useNavigate();
    const toast = useToast();
    const authToken = localStorage.getItem('idToken');
    const [isAddressValidating,setIsAddressValidating] = useState(false); // State to monitor the address validation
    // State Management for the Service Page
    const [services, setServices] = useState([]); // Start with empty array
    const [pickupDate, setPickupDate] = useState(''); // Set the pickup date
    const [pickupTime, setPickupTime] = useState(''); // set the pickup time
    const [dropoffDate, setDropoffDate] = useState(''); // set the drop off date
    const [dropoffTime, setDropoffTime] = useState(''); // set the drop off date
    const [frequency, setFrequency] = useState(null); // set the frequency
    const [promoCode, setPromoCode] = useState(''); // set the promo code
    const [laundryBags, setLaundryBags] = useState(1); // set the laundry Bags
    const [saveSpecialInstructions, setSaveSpecialInstructions] = useState(false); // set the save Special Instructions boolean flag
    const [frequencyPromotions, setFrequencyPromotions] = useState([]); // set the frequency descriptions and also the coupon values
    const [promoDescriptionMessage, setPromoDescriptionMessage] = useState(''); // set the promo notifications text
    // State management for the payment page
    const [existingPaymentMethods, setExistingPaymentMethods] = useState([]); // Store the payment methods of a customer
    // State management for the review order page
    const [orderProcessing, setOrderProcessing] = useState(false);
    const [tip, setTip] = useState({
        tipOption: '5',
        tipType: 'percentage',
        tipAmount: '0.00',
        tipPercentage: 5,
        tipReceivedId: '',
        tipMethod: 'Card',
        customTip: '',
    });

    // State variables for address validation
    const [address, setAddress] = useState(localStorage.getItem('customerAddress') || ''); // Store the user address
    const [addressInstructions,setAddressInstructions] = useState(''); // Store the address instructions
    const [doorNumber, setDoorNumber] = useState('');// Store the Address Door Number
    const [isAddressValidated, setIsAddressValidated] = useState(false); // Track if the address is validated

    // For Google Maps API
    const searchBoxRef = useRef(null);
    const googleApiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    // State variables for laundry info
    const [laundryServices, setLaundryServices] = useState([]); // set the laundry services information
    const [deliveryTimeSlots, setDeliveryTimeSlots] = useState([]); // set the delivery time slots information
    const [deliveryTimeInterval, setDeliveryTimeInterval] = useState(0); // set the delivery time interval to generate the slots
    const [laundryFrequency, setLaundryFrequency] = useState([]); // set the laundry frequency
    const [stripePromise, setStripePromise] = useState(null); // State to hold the Stripe promise
    const [defaultServiceInitialized, setDefaultServiceInitialized] = useState(false);
    const [pickupService, setPickupService] = useState("");
    const [dropoffService, setDropoffService] = useState("");
    const [uberExists, setUberExists] = useState(false);
    const [uberEnv, setUberEnv] = useState("");
    const [laundryAddress, setLaundryAddress] = useState('');
    const [uberPickupFrequency, setUberPickupFrequency] = useState(false);
    const [uberDropoffFrequency, setUberDropoffFrequency] = useState(false);

    // Function to format dates in the laundry's time zone
    const getDateInTimeZone = (date, timeZone) => {
        const zonedDate = toZonedTime(date, timeZone);
        return format(zonedDate, 'yyyy-MM-dd', { timeZone });
    };

    // Fetch laundry info when the page loads
    useEffect(() => {
        const fetchLaundryInfo = async () => {
            if (!authToken) {
                toast({
                    title: "Please Authenticate first",
                    description: "User not Logged In!",
                    status: "warning",
                    duration: 3000,
                    isClosable: true,
                });
                navigate(`/${laundryId}/login`);
            } else {
                try {
                    const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/get-info`, {
                        params: {
                            operation: 'getLaundryInfo',
                            laundryId: laundryId,
                            isCustomer: true
                        },
                        headers: {
                            'x-api-key': authToken,
                        },
                    });
                    if (response.data.status === 'success') {
                        setLaundryServices(response.data.laundryServices);
                        setDeliveryTimeSlots(response.data.deliveryTimeSlots);
                        setLaundryTimeZone(response.data.laundryTimeZone);
                        setDeliveryTimeInterval(parseInt(response.data.deliveryTimeInterval, 10));
                        setLaundryFrequency(response.data.frequencyInterval);
                        setFrequencyPromotions(response.data.frequencyPromotions || []);
                        setLaundryAddress(response.data.laundryAddress || '');
                        setUberEnv(response.data.uberEnv || '');
                        const env = response?.data?.uberEnv;
                        const creds = response?.data?.uberCredentials;
                        setUberExists(response.data?.uberCredentialsExist === true);
                        // Set bag price from API (configurable per laundry)
                        if (response.data.bagPrice) {
                            setBagPrice(parseFloat(response.data.bagPrice));
                        }

                        // Initialize Stripe with the fetched public key
                        if (laundryData?.stripePublicKey){
                            setStripePromise(loadStripe(laundryData?.stripePublicKey));

                        }
                        // if (response.data.stripePublicKey) {
                        //     setStripePromise(loadStripe(response.data.stripePublicKey));
                        // }
                    } else {
                        toast({
                            title: "Error fetching laundry info",
                            status: "error",
                            duration: 3000,
                            isClosable: true,
                        });
                    }
                } catch (error) {
                    toast({
                        title: "Error",
                        description: error.message,
                        status: "error",
                        duration: 3000,
                        isClosable: true,
                    });
                }
            }
        };
        fetchLaundryInfo();

    }, [toast, navigate, laundryId, authToken, setLaundryTimeZone]);

    // Initialize pickupDate and dropoffDate after laundryTimeZone is available
    useEffect(() => {
        if (laundryTimeZone && !pickupDate && !dropoffDate) {
            const today = new Date();
            const initialPickupDate = getDateInTimeZone(addDays(today,1), laundryTimeZone);
            const initialDropoffDate = getDateInTimeZone(addDays(today, 2), laundryTimeZone);
            setPickupDate(initialPickupDate);
            setDropoffDate(initialDropoffDate);
        }
    }, [laundryTimeZone,pickupDate,dropoffDate,isAddressValidated]);

    useEffect(() => {
        if (!defaultServiceInitialized && laundryServices.length > 0 && services.length === 0) {
            const firstService = laundryServices[0];
            // console.log(firstService);
            setServices([{
                service: firstService.serviceName,
                count: firstService.inputWeight? 10 : 1,
                cost: String((parseFloat(firstService.price) * parseFloat(10)).toFixed(2)),
                basePrice: String(firstService.price)
            }]);
            setDefaultServiceInitialized(true); // Mark as initialized
        }
    }, [laundryServices, services.length, defaultServiceInitialized]);


    // Proceed to the next step only if the current step is valid
    const handleNextStep = () => {
        if (activeStep === 0) {
            // Pricing choice step — handled by PricingChoice callback
            setActiveStep(1);
        } else if (activeStep === 1 && isServiceStepValid) {
            setActiveStep(2);
        } else if (activeStep === 2 && isPaymentStepValid) {
            setActiveStep(3);
            setIsPlaceOrderEnabled(true);
        }
    };

    // Handle pricing choice selection
    const handlePricingChoice = (type) => {
        setPricingType(type);
        setActiveStep(1);
    };

    // Order placement function
    const handlePlaceOrder = async () => {
        let payload;

        if (pricingType === 'per_bag') {
            // Per-bag order payload
            const bagTotal = Number(laundryBags * bagPrice).toFixed(2);
            if (!pickupDate || !pickupTime || !dropoffDate || !dropoffTime || laundryBags < 1) {
                toast({
                    title: "Error",
                    description: "Please fill in all required fields.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
                setOrderProcessing(false);
                return false;
            }
            if (!customerPaymentId) {
                toast({
                    title: "Payment Information Missing",
                    description: "Please add payment information before placing the order.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
                setOrderProcessing(false);
                return false;
            }
            const pickupDateUTC = formatISO(parseISO(pickupDate), { representation: 'date' });
            const dropoffDateUTC = formatISO(parseISO(dropoffDate), { representation: 'date' });

            payload = {
                operation: "placeOrder",
                pricingType: "per_bag",
                customerId: customerId,
                laundryId: laundryId,
                address: address,
                doorNumber: doorNumber,
                addressInstructions: addressInstructions,
                specialInstructions: specialInstructions,
                services: [],
                pickupDate: pickupDateUTC,
                pickupTimeInterval: pickupTime,
                dropoffDate: dropoffDateUTC,
                dropoffTimeInterval: dropoffTime,
                frequency: null,
                laundryBags: laundryBags,
                bagPrice: bagPrice,
                totalCost: bagTotal,
                subTotal: bagTotal,
                grandTotal: bagTotal,
                saveSpecialInstructions: saveSpecialInstructions,
                tip: {
                    tipAmount: tip.tipAmount,
                    tipPercentage: tip.tipPercentage,
                    tipType: tip.tipType,
                    tipMethod: tip.tipMethod,
                    tipReceiverId: tip.tipReceivedId,
                },
                coupon: '',
                pickupService: pickupService || 'LaundryDriver',
                dropoffService: dropoffService || 'LaundryDriver',
                customerPaymentId: customerPaymentId,
            };
        } else {
            // Per-pound order payload (existing logic)
            const filledServices = services.filter(service => service.service && service.count && service.cost);
            const total = Number(services.reduce((sum, service) => sum + parseFloat(service.cost || 0), 0)).toFixed(2);
            if (!filledServices.length || !pickupDate || !pickupTime || !dropoffDate || !dropoffTime || !laundryBags) {
                toast({
                    title: "Error",
                    description: "Please fill in all required fields and select at least one service.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
                setOrderProcessing(false);
                return false;
            }
            const pickupDateUTC = formatISO(parseISO(pickupDate), { representation: 'date' });
            const dropoffDateUTC = formatISO(parseISO(dropoffDate), { representation: 'date' });
            if (!customerPaymentId) {
                toast({
                    title: "Payment Information Missing",
                    description: "Please add payment information before placing the order.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
                setOrderProcessing(false);
                return false;
            }

            payload = {
                operation: pickupService === "Uber" || dropoffService === "Uber"
                    ? "uberPlaceOrder"
                    : "placeOrder",
                pricingType: "per_pound",
                customerId: customerId,
                laundryId: laundryId,
                address: address,
                doorNumber: doorNumber,
                addressInstructions: addressInstructions,
                specialInstructions: specialInstructions,
                services: filledServices.map(service => ({
                    serviceName: service.service,
                    weightOrCount: service.count,
                    servicePrice: service.basePrice,
                })),
                pickupDate: pickupDateUTC,
                pickupTimeInterval: pickupTime,
                dropoffDate: dropoffDateUTC,
                dropoffTimeInterval: dropoffTime,
                frequency: frequency,
                laundryBags: laundryBags,
                totalCost: total,
                subTotal: total,
                grandTotal: total,
                saveSpecialInstructions: saveSpecialInstructions,
                tip: {
                    tipAmount: tip.tipAmount,
                    tipPercentage: tip.tipPercentage,
                    tipType: tip.tipType,
                    tipMethod: tip.tipMethod,
                    tipReceiverId: tip.tipReceivedId,
                },
                coupon: promoCode,
                pickupService: pickupService,
                dropoffService: dropoffService,
                uberPickupFrequency: uberPickupFrequency,
                uberDropoffFrequency: uberDropoffFrequency,
                customerPaymentId: customerPaymentId,
            };
        }

        console.log("payload for placing the order:", payload);

        try {
            // Set order processing to true while the request is made
            setOrderProcessing(true);

            // Make API call to place the order
            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/customer/place-order`,
                payload,
                {
                    headers: {
                        'x-api-key': authToken,
                    },
                }
            );

            // Check for success status
            if (response.data.status === 'success') {
                toast({
                    title: "Order Confirmed",
                    description: "Your order has been placed successfully!",
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                });

                // Set order processing to false and navigate to success page
                setOrderProcessing(false);
                navigate(`/${laundryId}/user/order-success`);
                return true;
            } else {
                toast({
                    title: "Order Failed",
                    description: response.data.message || "Failed to place the order.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
                setOrderProcessing(false);  // Stop processing on failure
                return false;
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message || "Failed to place the order.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            setOrderProcessing(false);  // Stop processing on error
            return false;
        }
    };
    // Function to validate the address
    const validateAddress = async (addr) => {
        try {
            setIsAddressValidating(true);
            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/laundry/validate-address`,
                {
                    params: {
                        operation: 'validateAddress',
                        laundryId: laundryId,
                        address: addr,
                    },
                    headers: {
                        'x-api-key': process.env.REACT_APP_AWS_API_KEY,
                    },
                }
            );
            const data = response.data;
            if (data.status === 'success') {
                if (data.serviceable) {
                    setIsAddressValidated(true);
                    // Store the address in localStorage
                    localStorage.setItem('customerAddress', addr);
                } else {
                    // Address not serviceable, prompt user to enter address
                    toast({
                        title: "Address Not Serviceable",
                        description: "The entered address is not serviceable. Please enter a different address.",
                        status: "error",
                        duration: 5000,
                        isClosable: true,
                    });
                    setIsAddressValidated(false);
                }
            } else {
                toast({
                    title: "Error",
                    description: `Error: ${data.message}`,
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
                setIsAddressValidated(false);
            }
        } catch (error) {
            console.error('Error checking serviceability:', error);
            toast({
                title: "Error",
                description: 'An error occurred while checking the serviceability. Please try again.',
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            setIsAddressValidated(false);
        }
        finally {
            setIsAddressValidating(false);
        }
    };

    // Handle address submission
    const handleAddressSubmit = async (e) => {
        e.preventDefault();
        if (!address) {
            toast({
                title: "Error",
                description: "Please enter an address.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            return;
        }
        await validateAddress(address);
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
        <Box padding={[2,4,6]} bg="linear-gradient(180deg, #EBF8FF 0%, #F7FAFC 100%)" minHeight="100vh">
            <Stack spacing={[4,6,8]} maxWidth={["100%", "600px", "800px"]} margin="auto" px={[2, 4, 6]} py={[4, 6, 8]}>
                {!isAddressValidated ? (
                    // Address Input Form
                    <LoadScriptNext googleMapsApiKey={googleApiKey} libraries={['places']}>
                        <VStack as="form" onSubmit={handleAddressSubmit} spacing={0}>
                            {/* Hero banner with illustration */}
                            <Box
                                w="100%"
                                bg="linear-gradient(135deg, #EBF8FF 0%, #BEE3F8 100%)"
                                borderRadius="2xl"
                                pt={{ base: 6, md: 10 }}
                                pb={{ base: 4, md: 6 }}
                                px={4}
                                textAlign="center"
                                mb={6}
                            >
                                <Image
                                    src={LaundryPickupImage}
                                    alt="Free Laundry Pickup & Delivery"
                                    mx="auto"
                                    w={{ base: '260px', md: '340px' }}
                                    h={{ base: '180px', md: '220px' }}
                                    objectFit="contain"
                                />
                                <Heading size={{ base: 'md', md: 'lg' }} color="blue.700" mt={4}>
                                    Welcome to {laundryData?.laundryName}
                                </Heading>
                                <Box fontSize="sm" color="gray.500" mt={1}>
                                    Free pickup & delivery — enter your address to get started
                                </Box>
                            </Box>

                            {/* Form card */}
                            <Box
                                w="100%"
                                bg="white"
                                borderRadius="2xl"
                                boxShadow="sm"
                                border="1px solid"
                                borderColor="gray.100"
                                p={{ base: 5, md: 8 }}
                            >
                                <VStack spacing={5} align="stretch">
                                    <FormControl id="address" isRequired>
                                        <FormLabel fontSize="sm" fontWeight="600" color="gray.700">
                                            Pickup Address
                                        </FormLabel>
                                        <StandaloneSearchBox
                                            onLoad={ref => (searchBoxRef.current = ref)}
                                            onPlacesChanged={handlePlacesChanged}
                                        >
                                            <Input
                                                type="text"
                                                placeholder="Enter your address"
                                                value={address}
                                                size="lg"
                                                onChange={(e) => setAddress(e.target.value)}
                                            />
                                        </StandaloneSearchBox>
                                    </FormControl>
                                    <FormControl id="doorNumber">
                                        <FormLabel fontSize="sm" fontWeight="600" color="gray.700">
                                            Apartment or Unit Number
                                        </FormLabel>
                                        <Input
                                            type="text"
                                            placeholder="Apt, Suite, Unit (optional)"
                                            value={doorNumber}
                                            onChange={(e) => setDoorNumber(e.target.value)}
                                        />
                                    </FormControl>
                                    <FormControl id="addressInstructions">
                                        <FormLabel fontSize="sm" fontWeight="600" color="gray.700">
                                            Delivery Instructions
                                        </FormLabel>
                                        <Input
                                            type="text"
                                            placeholder="e.g. Leave at front door"
                                            value={addressInstructions}
                                            onChange={(e) => setAddressInstructions(e.target.value)}
                                        />
                                    </FormControl>
                                    <Button
                                        type="submit"
                                        colorScheme="blue"
                                        size="lg"
                                        borderRadius="xl"
                                        w="100%"
                                        isLoading={isAddressValidating}
                                        loadingText="Validating..."
                                        boxShadow="md"
                                    >
                                        Continue
                                    </Button>
                                </VStack>
                            </Box>
                        </VStack>
                    </LoadScriptNext>
                ) : (
                    // Existing Stepper Steps Code
                    <>
                        <Stepper index={activeStep} size="md" gap="0" colorScheme="blue">
                            {steps.map((step, index) => (
                                <Step key={index}>
                                    <StepIndicator>
                                        <StepStatus complete={<StepIcon />} incomplete={<StepNumber />} active={<StepNumber />} />
                                    </StepIndicator>
                                    <StepTitle fontSize={['xs','sm','md']}>{step.title}</StepTitle>
                                    {index !== steps.length - 1 && <StepSeparator />}
                                </Step>
                            ))}
                        </Stepper>

                        <Box bg="white" borderRadius="2xl" boxShadow="sm" border="1px solid" borderColor="gray.100" padding={[4,5,6]}>
                            {/* Step 0: Pricing Choice */}
                            {activeStep === 0 && (
                                <PricingChoice
                                    pricingType={pricingType}
                                    setPricingType={setPricingType}
                                    bagPrice={bagPrice}
                                    onContinue={handlePricingChoice}
                                />
                            )}

                            {/* Step 1: Service (per-pound) or Bags & Schedule (per-bag) */}
                            {activeStep === 1 && pricingType === 'per_bag' && (
                                <BagOrderPage
                                    bagPrice={bagPrice}
                                    laundryBags={laundryBags}
                                    setLaundryBags={setLaundryBags}
                                    pickupDate={pickupDate}
                                    setPickupDate={setPickupDate}
                                    pickupTime={pickupTime}
                                    setPickupTime={setPickupTime}
                                    dropoffDate={dropoffDate}
                                    setDropoffDate={setDropoffDate}
                                    dropoffTime={dropoffTime}
                                    setDropoffTime={setDropoffTime}
                                    specialInstructions={specialInstructions}
                                    setSpecialInstructions={setSpecialInstructions}
                                    deliveryTimeSlots={deliveryTimeSlots}
                                    deliveryTimeInterval={deliveryTimeInterval}
                                    laundryTimeZone={laundryTimeZone}
                                    setIsServiceStepValid={setIsServiceStepValid}
                                    handleNextStep={handleNextStep}
                                    isServiceStepValid={isServiceStepValid}
                                    pickupService={pickupService}
                                    setPickupService={setPickupService}
                                    dropoffService={dropoffService}
                                    setDropoffService={setDropoffService}
                                />
                            )}

                            {activeStep === 1 && pricingType === 'per_pound' && (
                                <ServicePage
                                    setIsServiceStepValid={setIsServiceStepValid}
                                    handleNextStep={handleNextStep}
                                    isServiceStepValid={isServiceStepValid}
                                    services={services}
                                    setServices={setServices}
                                    pickupDate={pickupDate}
                                    dropoffDate={dropoffDate}
                                    setPickupDate={setPickupDate}
                                    setDropoffDate={setDropoffDate}
                                    pickupTime={pickupTime}
                                    dropoffTime={dropoffTime}
                                    setPickupTime={setPickupTime}
                                    setDropoffTime={setDropoffTime}
                                    specialInstructions={specialInstructions}
                                    frequency={frequency}
                                    setFrequency={setFrequency}
                                    setSpecialInstructions={setSpecialInstructions}
                                    setSaveSpecialInstructions={setSaveSpecialInstructions}
                                    laundryId={laundryId}
                                    laundryServices={laundryServices}
                                    deliveryTimeSlots={deliveryTimeSlots}
                                    deliveryTimeInterval={deliveryTimeInterval}
                                    laundryFrequency={laundryFrequency}
                                    laundryTimeZone={laundryTimeZone}
                                    promoCode={promoCode}
                                    setPromoCode={setPromoCode}
                                    laundryBags={laundryBags}
                                    setLaundryBags={setLaundryBags}
                                    frequencyPromotions={frequencyPromotions}
                                    promoDescriptionMessage={promoDescriptionMessage}
                                    setPromoDescriptionMessage={setPromoDescriptionMessage}
                                    pickupService={pickupService}
                                    setPickupService={setPickupService}
                                    dropoffService={dropoffService}
                                    setDropoffService={setDropoffService}
                                    uberEnv={uberEnv}
                                    uberExists={uberExists}
                                    setUberExists={setUberExists}
                                    laundryAddress={laundryAddress}
                                    address={address}
                                    uberPickupFrequency={uberPickupFrequency}
                                    setUberPickupFrequency={setUberPickupFrequency}
                                    uberDropoffFrequency={uberDropoffFrequency}
                                    setUberDropoffFrequency={setUberDropoffFrequency}
                                />
                            )}

                            {/* Step 2: Payment */}
                            {activeStep === 2 && stripePromise && (
                                <Elements stripe={stripePromise}>
                                    <PaymentPage
                                        customerId={customerId}
                                        laundryId={laundryId}
                                        customerPaymentId={customerPaymentId}
                                        setCustomerPaymentId={setCustomerPaymentId}
                                        setIsPaymentStepValid={setIsPaymentStepValid}
                                        isPaymentStepValid={isPaymentStepValid}
                                        existingPaymentMethods={existingPaymentMethods}
                                        setExistingPaymentMethods={setExistingPaymentMethods}
                                        handleNextStep={handleNextStep}
                                    />
                                </Elements>
                            )}

                            {/* Step 3: Review Order */}
                            {activeStep === 3 && pricingType === 'per_bag' && (
                                <BagReviewOrderPage
                                    laundryBags={laundryBags}
                                    bagPrice={bagPrice}
                                    pickupDate={pickupDate}
                                    pickupTime={pickupTime}
                                    dropoffDate={dropoffDate}
                                    dropoffTime={dropoffTime}
                                    handlePlaceOrder={handlePlaceOrder}
                                    orderProcessing={orderProcessing}
                                    isPlaceOrderEnabled={isPlaceOrderEnabled}
                                    setActiveStep={setActiveStep}
                                    tip={tip}
                                    setTip={setTip}
                                    pickupService={pickupService}
                                    dropoffService={dropoffService}
                                />
                            )}

                            {activeStep === 3 && pricingType === 'per_pound' && (
                                <ReviewOrderPage
                                    services={services}
                                    pickupDate={pickupDate}
                                    pickupTime={pickupTime}
                                    dropoffDate={dropoffDate}
                                    dropoffTime={dropoffTime}
                                    handlePlaceOrder={handlePlaceOrder}
                                    orderProcessing={orderProcessing}
                                    isPlaceOrderEnabled={isPlaceOrderEnabled}
                                    setActiveStep={setActiveStep}
                                    laundryBags={laundryBags}
                                    promoCode={promoCode}
                                    frequency={frequency}
                                    tip={tip}
                                    setTip={setTip}
                                    promoDescriptionMessage={promoDescriptionMessage}
                                    pickupService={pickupService}
                                    dropoffService={dropoffService}
                                    uberPickupFrequency={uberPickupFrequency}
                                    uberDropoffFrequency={uberDropoffFrequency}
                                />
                            )}
                        </Box>

                        <Flex justify="space-between" mt={4}>
                            <Button
                                onClick={() => setActiveStep(activeStep - 1)}
                                isDisabled={activeStep === 0}
                                variant="ghost"
                                colorScheme="gray"
                            >
                                Previous
                            </Button>
                        </Flex>
                    </>
                )}
            </Stack>
        </Box>
    );
}
