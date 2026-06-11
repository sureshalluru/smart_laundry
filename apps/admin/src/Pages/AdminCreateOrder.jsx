import React, {useState, useEffect} from 'react';
import {
    Box,
    Button,
    Input,
    FormControl,
    FormLabel,
    useToast,
    Heading,
    Stepper,
    Step,
    StepIndicator,
    StepStatus,
    StepTitle,
    StepNumber,
    StepSeparator,
    useSteps, Checkbox, Stack, HStack, RadioGroup, Radio
} from '@chakra-ui/react';
import axios from 'axios';
import {useNavigate, useParams} from 'react-router-dom';
import { Elements } from '@stripe/react-stripe-js';
import {handlePhoneNumberCheck, initiateSignUp} from "../Services/aws/UserAuthenticationApiGateway";
import ServiceSelection from "../Components/AdminCreateOrder/ServiceSelection";
import {format, toZonedTime} from "date-fns-tz"; // Import the services page
import {addDays} from 'date-fns';
import PaymentSelection from "../Components/AdminCreateOrder/AdminPaymentSelection";
import {loadStripe} from "@stripe/stripe-js";



export default function AdminCreateOrder() {
    const {laundryId} = useParams();
    const steps = [
        {title: 'Phone Number'},
        {title: 'Service Selection'},
        {title: 'Payment Option'},
    ];
    const {activeStep, setActiveStep} = useSteps({index: 0});
    const [phoneNumber, setPhoneNumber] = useState('');
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [receivePhoneNotification, setReceivePhoneNotification] = useState(true); // By Default true
    const [isCustomerNotFound, setIsCustomerNotFound] = useState(false);
    const [customerId, setCustomerId] = useState('');
    // const [services, setServices] = useState([{service: '', count: '', cost: '', basePrice: ''}]);
    const [services, setServices] = useState([
        {
          service: "Wash and Fold",
          count: 25,
          cost: '', // assuming you know the price here
          basePrice: '',
        },
      ]);
    const [stripeTerminalExists, setStripeTerminalExists] = useState(false);
    const [pickupDate, setPickupDate] = useState('');
    const [pickupTime, setPickupTime] = useState('');
    const [dropoffDate, setDropoffDate] = useState('');
    const [dropoffTime, setDropoffTime] = useState('');
    const [specialInstructions, setSpecialInstructions] = useState('');
    const [initialSpecialInstructions, setInitialSpecialInstructions] = useState('');
    const [saveSpecialInstructions, setSaveSpecialInstructions] = useState(false);
    const [address, setAddress] = useState('');
    const [laundryServices, setLaundryServices] = useState([]); // set the laundry services information
    const [deliveryTimeSlots, setDeliveryTimeSlots] = useState([]); // set the delivery time slots information
    const [inStorePickupTimeSlots, setInStorePickupTimeSlots] = useState([]); // set the inStore pickup time slots information
    const [deliveryTimeInterval, setDeliveryTimeInterval] = useState(0); // set the delivery time interval to generate the slots
    const [laundryTimeZone, setLaundryTimeZone] = useState(''); // set the laundry time zone from the database
    const [doorNumber, setDoorNumber] = useState('');
    const [deliveryInstructions, setDeliveryInstructions] = useState('');
    const [isServiceStepValid, setIsServiceStepValid] = useState(false);
    const [promoCode, setPromoCode] = useState(''); // set the promo code
    const [laundryBags, setLaundryBags] = useState(1); // set the laundry Bags
    const toast = useToast();
    const navigate = useNavigate();
    const authToken = localStorage.getItem('idToken');
    const [isPhoneLoading, setIsPhoneLoading] = useState(false); // Phone Number Verification State
    const [isRegistrationLoading, setIsRegistrationLoading] = useState(false); // Customer Registration Loading State
    const [stripePromise, setStripePromise] = useState(null); // State to hold the Stripe promise
    // New states for coupon results
    const [promoValidated, setPromoValidated] = useState(false);
    const [discountPrice, setDiscountPrice] = useState(0);
    const [finalTotalPrice, setFinalTotalPrice] = useState(0);
    const [isPromoFieldDisabled, setIsPromoFieldDisabled] = useState(false);
    const [phoneSuggestions, setPhoneSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isCommercialOrder, setIsCommercialOrder] = useState(false);

    

    // Function to validate phone number
    const validatePhoneNumber = async () => {
        const digitsOnly = phoneNumber.replace(/\D/g, '');
        if (digitsOnly.length !== 10) {
            toast({
                title: "Invalid phone number",
                description: "Please enter a 10-digit US phone number (area code + number).",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            return;
        }
        setIsPhoneLoading(true);
        try {
            const modifiedPhoneNumber = `+1${digitsOnly}`; // TODO: Change this logic
            const response = await handlePhoneNumberCheck(modifiedPhoneNumber, laundryId);
            if (response.exists) {
                setCustomerId(response.customerId);
                setSpecialInstructions(response.specialInstructions);
                setInitialSpecialInstructions(response.specialInstructions);
                setActiveStep(1);
            } else {
                setIsCustomerNotFound(true); // Show registration form
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to validate phone number.',
                status: 'error',
                duration: 3000,
                isClosable: true,
            });
        } finally {
            setIsPhoneLoading(false);
        }
    };

    // Function to register the customer
    const registerCustomer = async () => {
        if (!firstName || !lastName || !phoneNumber) {
            toast({
                title: 'Error',
                description: 'All fields are required. Please fill in all the details.',
                status: 'error',
                duration: 3000,
                isClosable: true,
            });
            return;
        }
        setIsRegistrationLoading(true);
        try {
            const {isSignUpComplete, userId, nextStep} = await initiateSignUp(
                laundryId,
                email,
                `+1${phoneNumber}`, // TODO: Change this logic,
                firstName,
                lastName,
                true,
                receivePhoneNotification
            );

            if (isSignUpComplete && nextStep === "DONE") {
                setCustomerId(userId);
                setActiveStep(1); // Proceed to the next step
                toast({
                    title: "Registration Successful",
                    description: "Customer has been registered successfully.",
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                });
            } else {
                toast({
                    title: "Sign Up Failed",
                    description: "Try Logging in the user",
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
        } finally {
            setIsRegistrationLoading(false);
        }
    };

    // Function to format dates in the laundry's time zone
    const getDateInTimeZone = (date, timeZone) => {
        const zonedDate = toZonedTime(date, timeZone);
        return format(zonedDate, 'yyyy-MM-dd', {timeZone});
    };
    
    const handlePhoneInputChange = async (e) => {
        const input = e.target.value;
        setPhoneNumber(input);
      
        const digitsOnly = input.replace(/\D/g, '');
        if (digitsOnly.length >= 3) {
          try {
            const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/customer/check-partial-phonenumbers`, 
              {
                params: {
                  operation: "searchPhone",
                  phoneQuery: digitsOnly,
                  laundryId: laundryId,
                },
                headers: {
                  "x-api-key": process.env.REACT_APP_AWS_API_KEY,
                }
              }
            );
      
            // console.log("Response from API:", response); 
      
            const data = JSON.parse(response.data.body); 
            // console.log("Parsed suggestions:", data.suggestions); 
            setPhoneSuggestions(data.suggestions || []);
            setShowSuggestions(true);
          } catch (err) {
            // console.error("Failed to fetch phone suggestions", err);
            setShowSuggestions(false);
          }
        } else {
          setShowSuggestions(false);
        }
      };
      
      
    const renderPhoneNumberStep = () => (
        <Box maxWidth="500px" margin="auto" padding={6}>
          <Heading mb={4}>Enter Phone Number</Heading>
      
          <FormControl id="phoneNumber" isRequired position="relative">
            <FormLabel>Phone Number</FormLabel>
            <Input
              type="tel"
              placeholder="Enter customer's phone number"
              value={phoneNumber}
              onChange={handlePhoneInputChange}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} // small delay to allow click
            />
      
            {showSuggestions && phoneSuggestions.length > 0 && (
              <Box
                position="absolute"
                top="100%"
                left={0}
                right={0}
                bg="#ccf0ed"
                boxShadow="lg"
                border="1px solid"
                borderColor="gray.300"
                borderRadius="md"
                zIndex={20}
                mt={1}
                maxHeight="250px"
                overflowY="auto"
              >
                {phoneSuggestions.map((customer, index) => (
                  <Box
                    key={index}
                    px={4}
                    py={2}
                    borderBottom="1px solid"
                    borderColor="gray.100"
                    _hover={{ bg: "gray.50", cursor: "pointer" }}
                    onClick={() => {
                      setPhoneNumber(customer.phoneNumber.replace("+1", ""));
                      setShowSuggestions(false);
                    }}
                  >
                    <Box fontWeight="semibold">
                        {customer.firstName} {customer.lastName}
                    </Box>

                    <Box fontSize="sm" color="gray.600">
                      {customer.phoneNumber}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </FormControl>

          
          
          <HStack mt={3} alignItems="center" spacing={6}>

          

          <FormControl>
    <FormLabel mb={1} fontWeight="medium">Commercial Order</FormLabel>
    <RadioGroup
      onChange={(val) => setIsCommercialOrder(val === "yes")}
      value={isCommercialOrder ? "yes" : "no"}
    >
      <HStack spacing={4}>
        <Radio value="yes">Yes</Radio>
        <Radio value="no">No</Radio>
      </HStack>
    </RadioGroup>
  </FormControl>

  <Button
            mt={4}
            colorScheme="blue"
            onClick={validatePhoneNumber}
            isLoading={isPhoneLoading}
          >
            Next
          </Button>
          </HStack>



      
          {isCustomerNotFound && (
            <Box mt={6} p={6} borderRadius="md" maxWidth="500px" margin="auto">
              <Heading mb={4} size="md" textAlign="center" color="teal.600">
                Register Customer
              </Heading>
              <Stack spacing={4}>
                <FormControl id="firstName" isRequired>
                  <FormLabel>First Name</FormLabel>
                  <Input
                    type="text"
                    placeholder="Enter first name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </FormControl>
                <FormControl id="lastName" isRequired>
                  <FormLabel>Last Name</FormLabel>
                  <Input
                    type="text"
                    placeholder="Enter last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </FormControl>
                <FormControl id="email">
                  <FormLabel>Email Address (optional)</FormLabel>
                  <Input
                    type="email"
                    placeholder="Enter email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </FormControl>
                <Checkbox
                  isChecked={receivePhoneNotification}
                  onChange={(e) => setReceivePhoneNotification(e.target.checked)}
                  colorScheme="teal"
                >
                  Receive order notifications via phone
                </Checkbox>
                <Button
                  mt={4}
                  colorScheme="teal"
                  onClick={registerCustomer}
                  isLoading={isRegistrationLoading}
                  width="full"
                >
                  Register User
                </Button>
              </Stack>
            </Box>
          )}
        </Box>
      );
      
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
                    const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/get-info-api`, {
                        params: {
                            operation: 'getLaundryInfo',
                            laundryId: laundryId,
                        },
                        headers: {
                            // 'x-api-key': adminAuthToken,
                            'Authorization': `Bearer ${authToken}`
                        },
                    });

                    if (response.data.status === 'success') {
                        setLaundryServices(response.data.laundryServices);
                        setDeliveryTimeSlots(response.data.deliveryTimeSlots);
                        setInStorePickupTimeSlots(response.data.inStorePickupTimeSlots);
                        setLaundryTimeZone(response.data.laundryTimeZone);
                        setStripeTerminalExists(response.data.stripeTerminalExists);
                        setDeliveryTimeInterval(parseInt(response.data.deliveryTimeInterval, 10));
                        if (response.data.stripePublicKey) {
                            setStripePromise(loadStripe(response.data.stripePublicKey));
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

    }, [toast, navigate, laundryId, authToken]);

    // Initialize pickupDate and dropoffDate after laundryTimeZone is available
    useEffect(() => {
        if (laundryTimeZone && !pickupDate && !dropoffDate) {
            const today = getDateInTimeZone(new Date(), laundryTimeZone); // pickup date
            const nextDay = getDateInTimeZone(addDays(new Date(), 1), laundryTimeZone); // drop off date
            // Get current time in HH:mm format
            const now = new Date();
            const currentTime = now.toLocaleTimeString('en-US', {
                timeZone: laundryTimeZone,
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
            });

            setPickupDate(today);
            setDropoffDate(nextDay);
            setPickupTime(currentTime)
        }
    }, [laundryTimeZone, pickupDate, dropoffDate]);


    return (
        <Box spacing={4}  margin="auto">
            <Stepper index={activeStep} size="md" colorScheme="blue">
                {steps.map((step, index) => (
                    <Step key={index}>
                        <StepIndicator>
                            <StepStatus complete={<StepNumber/>} active={<StepNumber/>} incomplete={<StepNumber/>}/>
                        </StepIndicator>
                        <StepTitle>{step.title}</StepTitle>
                        {index !== steps.length - 1 && <StepSeparator/>}
                    </Step>
                ))}
            </Stepper>
            <Box mt={2}>
                {activeStep === 0 && renderPhoneNumberStep()}
                {activeStep === 1 && (
                    <ServiceSelection
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
                        setSpecialInstructions={setSpecialInstructions}
                        initialSpecialInstructions={initialSpecialInstructions}
                        setSaveSpecialInstructions={setSaveSpecialInstructions}
                        laundryId={laundryId}
                        address={address}
                        setAddress={setAddress}
                        laundryServices={laundryServices}
                        inStorePickupTimeSlots={inStorePickupTimeSlots}
                        deliveryTimeInterval={deliveryTimeInterval}
                        laundryTimeZone={laundryTimeZone}
                        isServiceStepValid={isServiceStepValid}
                        setIsServiceStepValid={setIsServiceStepValid}
                        handleNextStep={() => setActiveStep(2)}
                        deliveryInstructions={deliveryInstructions}
                        setDeliveryInstructions={setDeliveryInstructions}
                        doorNumber={doorNumber}
                        setDoorNumber={setDoorNumber}
                        promoCode={promoCode}
                        setPromoCode={setPromoCode}
                        laundryBags={laundryBags}
                        setLaundryBags={setLaundryBags}
                        promoValidated={promoValidated}
                        setPromoValidated={setPromoValidated}
                        setDiscountPrice={setDiscountPrice}
                        setFinalTotalPrice={setFinalTotalPrice}
                        customerId={customerId}
                        isPromoFieldDisabled={isPromoFieldDisabled}
                        setIsPromoFieldDisabled={setIsPromoFieldDisabled}
                    />
                )}
                {activeStep === 2 && stripePromise && (
                    <Elements stripe={stripePromise}>
                    <PaymentSelection
                        customerId={customerId}
                        laundryId={laundryId}
                        address={address}
                        specialInstructions={specialInstructions}
                        saveSpecialInstructions={saveSpecialInstructions}
                        services={services}
                        pickupDateUTC={pickupDate}
                        pickupTime={pickupTime}
                        dropoffDateUTC={dropoffDate}
                        dropoffTime={dropoffTime}
                        doorNumber={doorNumber}
                        deliveryInstructions={deliveryInstructions}
                        promoCode={promoCode}
                        laundryBags={laundryBags}
                        setLaundryBags={setLaundryBags}
                        promoValidated={promoValidated}
                        discountPrice={discountPrice}
                        stripeTerminalExists={stripeTerminalExists}
                        finalTotalPrice={finalTotalPrice}
                        isCommercialOrder={isCommercialOrder}
                    />
                    </Elements>
                )}


                {activeStep > 1 && (
                    <Button mt={4} onClick={() => setActiveStep(activeStep - 1)} isDisabled={activeStep === 0}>
                        Previous
                    </Button>
                )}
            </Box>
        </Box>
    );
}
