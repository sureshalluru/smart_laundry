import React, {useContext, useEffect, useRef, useState, useReducer} from 'react';
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
    useSteps, StepIcon, StepNumber, useToast, VStack, Image, Heading, Text
} from "@chakra-ui/react";
import PaymentPage from '../Components/LaundryPickup/PaymentPage';
import UnifiedServicePage from '../Components/LaundryPickup/UnifiedServicePage';
import SchedulePage from '../Components/LaundryPickup/SchedulePage';
import UnifiedReviewPage from '../Components/LaundryPickup/UnifiedReviewPage';
import OrderTypeSelection from '../Components/LaundryPickup/OrderTypeSelection';
import cartReducer, { initialCartState } from '../Components/LaundryPickup/cartReducer';
import { buildOrderPayload, getCartSubtotal } from '../Components/LaundryPickup/cartUtils';
import {useNavigate} from "react-router-dom";
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import axios from "axios";
import {StandaloneSearchBox} from "@react-google-maps/api";
import LaundryPickupImage from "../images/laundry-pickup.svg";
import {formatISO, parseISO} from "date-fns";
import { toZonedTime, format } from 'date-fns-tz';
import {addDays} from 'date-fns';
import {LaundryContext} from "../Components/Contexts/LaundryContext";

export default function LaundryPickupPage({laundryId,customerId,customerPaymentId,setCustomerPaymentId, laundryTimeZone, setLaundryTimeZone, specialInstructions, setSpecialInstructions}) {
    // Fixed 5-step stepper (Order Type + Services + Schedule + Payment + Review)
    const steps = [
        { title: 'Order Type' },
        { title: 'Services' },
        { title: 'Schedule' },
        { title: 'Payment' },
        { title: 'Review' },
    ];

    // Order type state
    const [orderType, setOrderType] = useState(null); // 'one-time' | 'frequency' | 'subscribe-save'

    // Pre-selected order type from landing page navigation
    const [preSelectedType] = useState(() => {
        const saved = localStorage.getItem('selectedOrderType');
        if (saved) {
            localStorage.removeItem('selectedOrderType');
            return saved;
        }
        return null;
    });

    // Cart state via useReducer (Task 5.3)
    const [cart, dispatch] = useReducer(cartReducer, initialCartState);

    const { laundryData } = useContext(LaundryContext);
    const {activeStep, setActiveStep} = useSteps({index: 0});
    const [isPaymentStepValid,setIsPaymentStepValid] = useState(false);
    const navigate = useNavigate();
    const toast = useToast();
    const authToken = localStorage.getItem('idToken');
    const [isAddressValidating,setIsAddressValidating] = useState(false);

    // State Management for scheduling
    const [pickupDate, setPickupDate] = useState('');
    const [pickupTime, setPickupTime] = useState('');
    const [dropoffDate, setDropoffDate] = useState('');
    const [dropoffTime, setDropoffTime] = useState('');
    const [frequency, setFrequency] = useState(null);
    const [promoCode, setPromoCode] = useState('');
    const [laundryBags, setLaundryBags] = useState(1);
    const [saveSpecialInstructions, setSaveSpecialInstructions] = useState(false);
    const [frequencyPromotions, setFrequencyPromotions] = useState([]);
    const [promoDescriptionMessage, setPromoDescriptionMessage] = useState('');

    // State management for the payment page
    const [existingPaymentMethods, setExistingPaymentMethods] = useState([]);
    const [payByInvoice, setPayByInvoice] = useState(false);

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
    const [address, setAddress] = useState(localStorage.getItem('customerAddress') || '');
    const [addressInstructions,setAddressInstructions] = useState('');
    const [doorNumber, setDoorNumber] = useState('');
    const [isAddressValidated, setIsAddressValidated] = useState(!!localStorage.getItem('customerAddress'));

    // For Google Maps API
    const searchBoxRef = useRef(null);

    // State variables for laundry info
    const [laundryServices, setLaundryServices] = useState([]);
    const [serviceCategories, setServiceCategories] = useState([]);
    const [servicesLoaded, setServicesLoaded] = useState(false);
    const [deliveryTimeSlots, setDeliveryTimeSlots] = useState([]);
    const [deliveryTimeInterval, setDeliveryTimeInterval] = useState(0);
    const [laundryFrequency, setLaundryFrequency] = useState([]);
    const [stripePromise, setStripePromise] = useState(null);
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
                        setUberExists(response.data?.uberCredentialsExist === true);

                        // Store service categories
                        const cats = response.data.serviceCategories || [];
                        setServiceCategories(cats);

                        setServicesLoaded(true);

                        // Initialize Stripe with the fetched public key
                        if (laundryData?.stripePublicKey){
                            setStripePromise(loadStripe(laundryData?.stripePublicKey));
                        }
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

    // Task 5.5: Single-service auto-add logic (no auto-skip)
    // If only 1 service exists, auto-add it to cart but let customer stay on step 1
    // so they can optionally enter weight before continuing
    useEffect(() => {
        if (servicesLoaded && laundryServices.length === 1 && cart.items.length === 0 && orderType && activeStep === 1) {
            const singleService = laundryServices[0];
            const isWeight = singleService.inputWeight === true || singleService.inputWeight === 'true';
            dispatch({
                type: 'ADD_ITEM',
                payload: {
                    serviceId: singleService.serviceId || singleService.serviceName,
                    serviceName: singleService.serviceName,
                    categoryId: singleService.categoryId || 'uncategorized',
                    categoryName: singleService.categoryName || 'Uncategorized',
                    price: parseFloat(singleService.price),
                    inputWeight: isWeight,
                    quantity: isWeight ? 1 : 1,
                },
            });
            // Don't auto-advance — let customer see the service, enter weight, and click Continue
        }
    }, [servicesLoaded, laundryServices, cart.items.length, orderType, activeStep]);

    // Handle order type selection
    const handleOrderTypeSelect = (type) => {
        setOrderType(type);
        // Clear cart when changing order type (prevents stale items from wrong category)
        dispatch({ type: 'CLEAR_CART' });
        if (type === 'subscribe-save') {
            // Auto-set frequency to first available if not already set
            if (!frequency && laundryFrequency.length > 0) {
                setFrequency(laundryFrequency[0]);
            }
        } else if (type === 'one-time') {
            // Clear frequency for one-time orders
            setFrequency(null);
        }
        setActiveStep(1);
    };

    // Get filtered services based on order type
    const getFilteredServicesForOrderType = () => {
        if (orderType === 'subscribe-save') {
            return laundryServices.filter(s => s.inputWeight === false || s.inputWeight === 'false');
        }
        return laundryServices;
    };

    // Updated handlePlaceOrder using buildOrderPayload (Task 5.3)
    const handlePlaceOrder = async () => {
        if (cart.items.length === 0) {
            toast({ title: "Error", description: "Cart is empty.", status: "error", duration: 3000, isClosable: true });
            return false;
        }
        if (!pickupDate || !pickupTime || !dropoffDate || !dropoffTime) {
            toast({ title: "Error", description: "Please fill in all schedule fields.", status: "error", duration: 3000, isClosable: true });
            return false;
        }
        if (!customerPaymentId && !payByInvoice) {
            toast({ title: "Payment Information Missing", description: "Please add payment info.", status: "error", duration: 3000, isClosable: true });
            return false;
        }

        // Compute grand total
        const subtotal = getCartSubtotal(cart.items);
        const subscriptionDiscount = orderType === 'subscribe-save' ? (laundryData?.subscriptionDiscount || 0) : 0;
        const discountAmount = subscriptionDiscount > 0 ? subtotal * (subscriptionDiscount / 100) : 0;
        const taxableAmount = subtotal - discountAmount;
        const taxRate = laundryData?.taxRate || 0;
        const tax = taxRate > 0 ? taxableAmount * (taxRate / 100) : 0;
        const tipAmount = parseFloat(tip.tipAmount || '0') || 0;
        const grandTotal = taxableAmount + tax + tipAmount;

        const payload = buildOrderPayload(cart, {
            customerId,
            laundryId,
            address,
            doorNumber,
            addressInstructions,
            specialInstructions,
            pickupDate: formatISO(parseISO(pickupDate), { representation: 'date' }),
            pickupTimeInterval: pickupTime,
            dropoffDate: formatISO(parseISO(dropoffDate), { representation: 'date' }),
            dropoffTimeInterval: dropoffTime,
            frequency: frequency || null,
            laundryBags,
            grandTotal: grandTotal.toFixed(2),
            tip: {
                tipAmount: tip.tipAmount,
                tipPercentage: tip.tipPercentage,
                tipType: tip.tipType,
                tipMethod: tip.tipMethod,
                tipReceiverId: tip.tipReceivedId,
            },
            coupon: promoCode,
            pickupService: pickupService || 'LaundryDriver',
            dropoffService: dropoffService || 'LaundryDriver',
            customerPaymentId,
            payByInvoice,
        });

        // If using Uber, change operation
        if (pickupService === 'Uber' || dropoffService === 'Uber') {
            payload.operation = 'uberPlaceOrder';
        }
        payload.uberPickupFrequency = uberPickupFrequency;
        payload.uberDropoffFrequency = uberDropoffFrequency;
        payload.saveSpecialInstructions = saveSpecialInstructions;
        payload.autoCharge = !!frequency;

        try {
            setOrderProcessing(true);
            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/customer/place-order`,
                payload,
                { headers: { 'x-api-key': authToken } }
            );
            if (response.data.status === 'success') {
                toast({ title: "Order Confirmed", description: "Your order has been placed!", status: "success", duration: 3000, isClosable: true });
                setOrderProcessing(false);
                navigate(`/${laundryId}/user/order-success`);
                return true;
            } else {
                toast({ title: "Order Failed", description: response.data.message || "Failed.", status: "error", duration: 3000, isClosable: true });
                setOrderProcessing(false);
                return false;
            }
        } catch (error) {
            toast({ title: "Error", description: error.message || "Failed.", status: "error", duration: 3000, isClosable: true });
            setOrderProcessing(false);
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
                    localStorage.setItem('customerAddress', addr);
                } else {
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

    const themeGradient = (() => {
        const gradientMap = {
            blue: "linear-gradient(180deg, #EBF8FF 0%, #F7FAFC 100%)",
            green: "linear-gradient(180deg, #F0FFF4 0%, #F7FAFC 100%)",
            purple: "linear-gradient(180deg, #FAF5FF 0%, #F7FAFC 100%)",
            teal: "linear-gradient(180deg, #E6FFFA 0%, #F7FAFC 100%)",
            orange: "linear-gradient(180deg, #FFFAF0 0%, #F7FAFC 100%)",
            red: "linear-gradient(180deg, #FFF5F5 0%, #F7FAFC 100%)",
            pink: "linear-gradient(180deg, #FFF5F7 0%, #F7FAFC 100%)",
            cyan: "linear-gradient(180deg, #EDFDFD 0%, #F7FAFC 100%)",
        };
        return gradientMap[laundryData?.themeColor] || gradientMap.blue;
    })();
    const themeHeroBg = (() => {
        const heroMap = {
            blue: "linear-gradient(135deg, #EBF8FF 0%, #BEE3F8 100%)",
            green: "linear-gradient(135deg, #F0FFF4 0%, #C6F6D5 100%)",
            purple: "linear-gradient(135deg, #FAF5FF 0%, #D6BCFA 100%)",
            teal: "linear-gradient(135deg, #E6FFFA 0%, #81E6D9 100%)",
            orange: "linear-gradient(135deg, #FFFAF0 0%, #FBD38D 100%)",
            red: "linear-gradient(135deg, #FFF5F5 0%, #FEB2B2 100%)",
            pink: "linear-gradient(135deg, #FFF5F7 0%, #FBB6CE 100%)",
            cyan: "linear-gradient(135deg, #EDFDFD 0%, #9DECF9 100%)",
        };
        return heroMap[laundryData?.themeColor] || heroMap.blue;
    })();

    return (
        <Box padding={[2,4,6]} bg={themeGradient} minHeight="100vh">
            <Stack spacing={[4,6,8]} maxWidth={["100%", "600px", "800px"]} margin="auto" px={[2, 4, 6]} py={[4, 6, 8]}>
                {!isAddressValidated ? (
                    // Address Input Form
                        <VStack as="form" onSubmit={handleAddressSubmit} spacing={0}>
                            {/* Hero banner with illustration */}
                            <Box
                                w="100%"
                                bg={themeHeroBg}
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
                                    Free Pickup & Delivery
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
                                                autoComplete="off"
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
                ) : (
                    // Order Flow with 4-step stepper
                    <>
                        {/* Show current address with change option */}
                        {address && (
                            <Flex justify="space-between" align="center" bg="white" borderRadius="lg" px={4} py={2} mb={3} border="1px solid" borderColor="gray.100">
                                <Box>
                                    <Box fontSize="xs" color="gray.500">Pickup Address</Box>
                                    <Box fontSize="sm" fontWeight="500" color="gray.700" noOfLines={1}>{address}</Box>
                                </Box>
                                <Button size="xs" variant="ghost" colorScheme="blue" onClick={() => { setIsAddressValidated(false); localStorage.removeItem('customerAddress'); }}>
                                    Change
                                </Button>
                            </Flex>
                        )}
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
                            {/* Step 0: Order Type Selection */}
                            {activeStep === 0 && servicesLoaded && (
                                <OrderTypeSelection
                                    onSelect={handleOrderTypeSelect}
                                    frequencyPromotions={frequencyPromotions}
                                    subscriptionDiscount={laundryData?.subscriptionDiscount || 0}
                                    laundryFrequency={laundryFrequency}
                                    themeColor={laundryData?.themeColor || 'blue'}
                                    preSelectedType={preSelectedType}
                                    laundryServices={laundryServices}
                                />
                            )}

                            {/* Step 1: Unified Service Page */}
                            {activeStep === 1 && servicesLoaded && (
                                <UnifiedServicePage
                                    laundryServices={getFilteredServicesForOrderType()}
                                    serviceCategories={serviceCategories}
                                    cart={cart}
                                    dispatch={dispatch}
                                    onContinue={() => setActiveStep(2)}
                                    themeColor={laundryData?.themeColor || 'blue'}
                                />
                            )}

                            {/* Step 2: Schedule Page */}
                            {activeStep === 2 && (
                                <SchedulePage
                                    orderType={orderType}
                                    pickupDate={pickupDate} setPickupDate={setPickupDate}
                                    pickupTime={pickupTime} setPickupTime={setPickupTime}
                                    dropoffDate={dropoffDate} setDropoffDate={setDropoffDate}
                                    dropoffTime={dropoffTime} setDropoffTime={setDropoffTime}
                                    pickupService={pickupService} setPickupService={setPickupService}
                                    dropoffService={dropoffService} setDropoffService={setDropoffService}
                                    frequency={frequency} setFrequency={setFrequency}
                                    promoCode={promoCode} setPromoCode={setPromoCode}
                                    specialInstructions={specialInstructions} setSpecialInstructions={setSpecialInstructions}
                                    setSaveSpecialInstructions={setSaveSpecialInstructions}
                                    laundryBags={laundryBags} setLaundryBags={setLaundryBags}
                                    deliveryTimeSlots={deliveryTimeSlots}
                                    deliveryTimeInterval={deliveryTimeInterval}
                                    laundryTimeZone={laundryTimeZone}
                                    laundryFrequency={orderType === 'one-time' ? [] : laundryFrequency}
                                    frequencyPromotions={frequencyPromotions}
                                    promoDescriptionMessage={promoDescriptionMessage}
                                    setPromoDescriptionMessage={setPromoDescriptionMessage}
                                    uberEnv={uberEnv}
                                    uberExists={uberExists} setUberExists={setUberExists}
                                    laundryAddress={laundryAddress}
                                    address={address}
                                    uberPickupFrequency={uberPickupFrequency} setUberPickupFrequency={setUberPickupFrequency}
                                    uberDropoffFrequency={uberDropoffFrequency} setUberDropoffFrequency={setUberDropoffFrequency}
                                    laundryId={laundryId}
                                    onContinue={() => setActiveStep(3)}
                                    onBack={() => setActiveStep(1)}
                                />
                            )}

                            {/* Step 3: Payment */}
                            {activeStep === 3 && stripePromise && (
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
                                        handleNextStep={() => setActiveStep(4)}
                                        payByInvoice={payByInvoice}
                                        setPayByInvoice={setPayByInvoice}
                                    />
                                </Elements>
                            )}
                            {activeStep === 3 && !stripePromise && (
                                <Box p={6} textAlign="center">
                                    <Text fontSize="lg" fontWeight="bold" mb={2}>💵 Pay at Pickup</Text>
                                    <Text color="gray.600" mb={4}>
                                        This location accepts payment when your laundry is picked up or delivered. No card needed right now.
                                    </Text>
                                    <Button colorScheme="blue" onClick={() => { setIsPaymentStepValid(true); setPayByInvoice(true); setActiveStep(4); }}>
                                        Continue to Review
                                    </Button>
                                </Box>
                            )}

                            {/* Step 4: Review Order */}
                            {activeStep === 4 && (
                                <UnifiedReviewPage
                                    cart={cart}
                                    dispatch={dispatch}
                                    pickupDate={pickupDate}
                                    pickupTime={pickupTime}
                                    dropoffDate={dropoffDate}
                                    dropoffTime={dropoffTime}
                                    tip={tip}
                                    setTip={setTip}
                                    taxRate={laundryData?.taxRate || 0}
                                    promoCode={promoCode}
                                    promoDescriptionMessage={promoDescriptionMessage}
                                    frequency={frequency}
                                    subscriptionDiscount={orderType === 'subscribe-save' ? (laundryData?.subscriptionDiscount || 0) : 0}
                                    onPlaceOrder={handlePlaceOrder}
                                    onEdit={() => setActiveStep(1)}
                                    orderProcessing={orderProcessing}
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
