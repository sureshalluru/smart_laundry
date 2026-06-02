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
import {useNavigate} from "react-router-dom";
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import axios from "axios";
import {LoadScriptNext, StandaloneSearchBox} from "@react-google-maps/api";
import AddressImage from "../images/address.png";
import {formatISO, parseISO} from "date-fns";
import { toZonedTime, format } from 'date-fns-tz';
import {addDays} from 'date-fns';
import {LaundryContext} from "../Components/Contexts/LaundryContext";

export default function LaundryPickupPage({laundryId,customerId,customerPaymentId,setCustomerPaymentId, laundryTimeZone, setLaundryTimeZone, specialInstructions, setSpecialInstructions}) {
    const steps = [
        {title: 'Service'},
        {title: 'Payment'},
        {title: 'Review Order'},
    ];
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
        if (activeStep === 0 && isServiceStepValid) {
            setActiveStep(activeStep + 1);
        } else if (activeStep === 1 && isPaymentStepValid) {
            setActiveStep(activeStep + 1);
            setIsPlaceOrderEnabled(true);
        }
    };

    // Order placement function
    const handlePlaceOrder = async () => {
        const filledServices = services.filter(service => service.service && service.count && service.cost);
        const total = Number(services.reduce((sum, service) => sum + parseFloat(service.cost || 0), 0)).toFixed(2);
        // Check if all required fields are filled
        if (!filledServices.length || !pickupDate || !pickupTime || !dropoffDate || !dropoffTime || !laundryBags) {
            toast({
                title: "Error",
                description: "Please fill in all required fields and select at least one service.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            setOrderProcessing(false);  // Stop processing on error
            return false;
        }
        // Convert pickupDate and drop offDate to UTC
        const pickupDateUTC = formatISO(parseISO(pickupDate), { representation: 'date' });
        const dropoffDateUTC = formatISO(parseISO(dropoffDate), { representation: 'date' });
        // Check if customerPaymentId is available
        if (!customerPaymentId) {
            toast({
                title: "Payment Information Missing",
                description: "Please add payment information before placing the order.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            setOrderProcessing(false);  // Stop processing on error
            return false;
        }

        // Create payload for the API call
        const payload = {
            // operation: pickupService === "Uber" ? "uberPlaceOrder" : "placeOrder",
            operation: pickupService === "Uber" || dropoffService === "Uber"
                ? "uberPlaceOrder"
                : "placeOrder",
            customerId: customerId,
            laundryId: laundryId,
            address: address,
            doorNumber: doorNumber,
            addressInstructions:addressInstructions,
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
            uberDropoffFrequency:uberDropoffFrequency
        };
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
        <Box padding={[2,4,6]} bg = "#AADDD9" minHeight="100vh">
            <Stack spacing={[4,6,8]}  maxWidth={["100%", "600px", "800px"]} margin="auto" px={[2, 4, 6]} py={[4, 6, 8]}>
                {!isAddressValidated ? (
                    // Address Input Form
                    <LoadScriptNext googleMapsApiKey={googleApiKey} libraries={['places']}>
                        <VStack as="form" onSubmit={handleAddressSubmit} spacing={[4,6]}>
                            <Image
                                src={AddressImage}
                                alt="Laundry Service"
                                borderRadius="lg"
                                objectFit="cover"
                                boxSize={["150px", "350px"]}
                            />
                            <Box textAlign="center" >
                                <Heading  size={['md','lg']} color="blue.600" mb={4}>
                                    Welcome to {laundryData?.laundryName}
                                </Heading>

                            </Box>

                            <FormControl id="address" isRequired>
                                <FormLabel fontSize={['md','lg']} >
                                    Enter your address for free pickup
                                </FormLabel>
                                <StandaloneSearchBox
                                    onLoad={ref => (searchBoxRef.current = ref)}
                                    onPlacesChanged={handlePlacesChanged}
                                >
                                    <Input
                                        type="text"
                                        placeholder="Enter your Address for Free Pickup"
                                        value={address}
                                        fontSize={['md','lg']}
                                        onChange={(e) => setAddress(e.target.value)}
                                    />
                                </StandaloneSearchBox>
                            </FormControl>
                            <FormControl id="doorNumber" >
                                <FormLabel fontSize={['md','lg']} >Apartment or Unit Number</FormLabel>
                                <Input
                                    type="text"
                                    placeholder="Apt or Unit Number"
                                    value={doorNumber}
                                    onChange={(e) => setDoorNumber(e.target.value)}
                                    fontSize={['md','lg']}
                                />
                            </FormControl>
                            <FormControl id="addressInstructions" >
                                <FormLabel fontSize={['md','lg']} >Delivery Instructions</FormLabel>
                                <Input
                                    type="text"
                                    placeholder="Delivery Instructions"
                                    value={addressInstructions}
                                    onChange={(e) => setAddressInstructions(e.target.value)}
                                    fontSize={['md','lg']}
                                />
                            </FormControl>
                            <Button type="submit" colorScheme="blue" isLoading={isAddressValidating} loadingText="Validating Address">Continue</Button>
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
                                    <StepTitle fontSize={['md','lg']}>{step.title}</StepTitle>
                                    {index !== steps.length - 1 && <StepSeparator />}
                                </Step>
                            ))}
                        </Stepper>

                        <Box border="1px" borderColor="gray.200" borderRadius="md" padding={[2,4,6]}>
                            {activeStep === 0 && (
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

                            {activeStep === 1 && stripePromise && (
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

                            {activeStep === 2 && (
                                <ReviewOrderPage
                                    services={services}
                                    pickupDate={pickupDate}
                                    pickupTime={pickupTime}
                                    dropoffDate={dropoffDate}
                                    dropoffTime={dropoffTime}
                                    handlePlaceOrder={handlePlaceOrder}
                                    orderProcessing={orderProcessing}
                                    isPlaceOrderEnabled={isPlaceOrderEnabled}
                                    setActiveStep ={setActiveStep}
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
                            <Button onClick={() => setActiveStep(activeStep - 1)} isDisabled={activeStep === 0}>
                                Previous
                            </Button>
                        </Flex>
                    </>
                )}
            </Stack>
        </Box>
    );
}
