import React, {useState, useEffect, useRef} from 'react';
import {CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements} from '@stripe/react-stripe-js';
import {
    Box,
    Button,
    Divider,
    FormControl,
    FormLabel,
    Input,
    Text,
    IconButton,
    Stack,
    CloseButton,
    Spinner,
    useToast,
    Badge,
    Flex,
    Checkbox,
    Select,
    InputGroup,
    InputLeftAddon,
    useDisclosure,
    AlertDialog,
    AlertDialogOverlay,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogBody,
    AlertDialogFooter
} from '@chakra-ui/react';
import {DeleteIcon} from '@chakra-ui/icons';
import axios from 'axios';

// 1) Utility function to parse the shipping address
function parseFullAddress(fullAddress) {
    if (!fullAddress) {
        return {
            line1: '',
            city: '',
            state: '',
            postal_code: '',
            country: ''
        };
    }

    const parts = fullAddress.split(',');

    if (parts.length < 4) {

        return {
            line1: fullAddress,
            city: '',
            state: '',
            postal_code: '',
            country: ''
        };
    }
    const line1 = parts[0].trim();
    const city = parts[1].trim();
    const stateZip = parts[2].trim();
    let country = parts[3].trim();
    // Convert "USA" to "US" so it matches the dropdown option
    if (country.toUpperCase() === 'USA') {
        country = 'US';
    }
    const [state = '', postal_code = ''] = stateZip.split(' ');

    return {
        line1,
        city,
        state,
        postal_code,
        country
    };
}

const PaymentPage = ({
                         customerId,
                         laundryId,
                         customerPaymentId,
                         setCustomerPaymentId,
                         setIsPaymentStepValid,
                         isPaymentStepValid,
                         existingPaymentMethods,
                         setExistingPaymentMethods,
                         handleNextStep,
                         payByInvoice,
                         setPayByInvoice
                     }) => {
    const stripe = useStripe();
    const elements = useElements();
    const authToken = localStorage.getItem('idToken');
    const shippingAddressString = localStorage.getItem('customerAddress') || '';
    const [showNewCardForm, setShowNewCardForm] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState({
        line1: '',
        line2: '',
        city: '',
        state: '',
        postal_code: '',
        country: ''
    });
    const [processing, setProcessing] = useState(false);
    const [loading, setLoading] = useState(false); // Added loading state for fetching card details
    const toast = useToast();
    const [useShippingAddress, setUseShippingAddress] = useState(false);
    // For the AlertDialog
    const {
        isOpen: isDeleteDialogOpen,
        onOpen: onDeleteDialogOpen,
        onClose: onDeleteDialogClose
    } = useDisclosure();
    const cancelRef = useRef(); // For focusing the cancel button
    const [cardToDelete, setCardToDelete] = useState(null);

    // This style object customizes the Stripe CardElement
    const cardStyle = {
        style: {
            base: {
                color: "var(--chakra-colors-gray-800)",
                fontFamily: "system-ui, sans-serif",
                fontSmoothing: "antialiased",
                fontSize: "16px",
                "::placeholder": {
                    color: "var(--chakra-colors-gray-400)"
                }
            },
            invalid: {
                color: "var(--chakra-colors-red-500)",
                iconColor: "var(--chakra-colors-red-500)"
            }
        }
    };
    // 2) Toggle shipping address -> fill or clear
    const handleUseShippingAddressChange = (e) => {
        const checked = e.target.checked;
        setUseShippingAddress(checked);

        if (checked) {
            // Parse shipping address and fill
            const parsed = parseFullAddress(shippingAddressString);
            setAddress(prev => ({
                ...prev,
                line1: parsed.line1,
                city: parsed.city,
                state: parsed.state,
                postal_code: parsed.postal_code,
                country: parsed.country
            }));
        } else {
            // Clear only if it was previously filled by shipping address
            setAddress({
                line1: '',
                line2: '',
                city: '',
                state: '',
                postal_code: '',
                country: ''
            });
        }
    };
    // Retrieve the list of cards from Stripe
    useEffect(() => {
        setIsPaymentStepValid(false);
        if (customerPaymentId) {
            setLoading(true); // Set loading state to true before fetching
            axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/payment/get-card-details`, {
                params: {
                    operation: 'getCardDetails',
                    customerPaymentId: customerPaymentId,
                    laundryId: laundryId,
                },
                headers: {
                    'x-api-key': authToken
                }
            })
                .then(response => {
                    // Check if the response contains an error status
                    if (response.data.status === 'error') {
                        toast({
                            title: "Error fetching card details",
                            description: "Error! Please add a new payment Method.",
                            status: "error",
                            duration: 5000,
                            isClosable: true,
                        });
                        setExistingPaymentMethods([]); // Clear payment methods on error
                    } else {
                        // Handle the success response
                        setExistingPaymentMethods(response.data.paymentMethods);
                    }
                })
                .catch(error => {
                    toast({
                        title: "Error fetching card details",
                        description: error.message || "An unexpected error occurred",
                        status: "error",
                        duration: 5000,
                        isClosable: true,
                    });
                })
                .finally(() => {
                    setLoading(false); // Set loading to false after request completes
                });
        }
    }, [customerPaymentId, authToken, toast, setIsPaymentStepValid, setExistingPaymentMethods, laundryId]);

    // Update `isPaymentStepValid` whenever `existingPaymentMethods` changes
    useEffect(() => {
        setIsPaymentStepValid(existingPaymentMethods.length > 0);
    }, [existingPaymentMethods, setIsPaymentStepValid]);

    // Change the Badge Colors based on the Card Type
    function getBrandColorScheme(brand) {
        switch (brand.toLowerCase()) {
            case 'visa':
                return 'blue';
            case 'mastercard':
                return 'red';
            case 'american express':
                return 'cyan';
            case 'discover':
                return 'orange';
            default:
                return 'gray';
        }
    }

    // Delete an existing card from the list
    const handleDeleteCardClick = async (method) => {
        // Prevent deletion of card, if the deletion is default card
        if (method.is_default) {
            toast({
                title: "Cannot Delete Default Payment Method",
                description: "Please add a new payment method to delete the default payment method",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            return;
        }
        // Prevent deletion if there's only one payment method
        if (existingPaymentMethods.length === 1) {
            toast({
                title: "Cannot Delete Payment Method",
                description: "You must have at least one payment method. Please add a new one before deleting.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            return;

        }
        // Open the dialog and store the card to be deleted
        setCardToDelete(method);
        onDeleteDialogOpen();
    };
    // 4) If user confirms "Delete"
    const confirmDeleteCard = async () => {
        if (!cardToDelete) {
            onDeleteDialogClose();
            return;
        }

        setProcessing(true);

        try {
            const response = await axios.delete(`${process.env.REACT_APP_AWS_API_URL}/api/payment/delete-card`, {
                params: {
                    operation: 'deleteCardDetails',
                    customerPaymentMethod: cardToDelete.id,
                    laundryId: laundryId,
                },
                headers: {
                    'x-api-key': authToken
                }
            });

            if (response.data.status) {
                setExistingPaymentMethods(existingPaymentMethods.filter(method => method.id !== cardToDelete.id));
                toast({
                    title: "Card deleted",
                    description: "The card has been successfully deleted.",
                    status: "success",
                    duration: 5000,
                    isClosable: true,
                });
            } else {
                toast({
                    title: "Failed to delete card",
                    description: "Could not delete the card. Please try again.",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
            }
        } catch (error) {
            toast({
                title: "Error deleting card",
                description: error.message || "An unexpected error occurred",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setProcessing(false);
            setCardToDelete(null);
            onDeleteDialogClose();
        }
    };

    // Add a new card and make it the default
    const handleNewCardSubmit = async (event) => {
        event.preventDefault();
        setProcessing(true);
        // 1) Validate phone is exactly 10 digits
        const digitsOnly = phone.replace(/\D/g, '');
        if (digitsOnly.length !== 10) {
            toast({
                title: "Invalid phone number",
                description: "Please enter a 10-digit US phone number (area code + number).",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            setProcessing(false);
            return;
        }
        const finalPhone = `+1${digitsOnly}`;
        const cardElement = elements.getElement(CardNumberElement);
        const {error, paymentMethod} = await stripe.createPaymentMethod({
            type: 'card',
            card: cardElement,
            billing_details: {
                name: name,
                phone: finalPhone,
                address: {
                    line1: address.line1,
                    line2: address.line2,
                    city: address.city,
                    state: address.state,
                    postal_code: address.postal_code,
                    country: address.country
                }
            }
        });

        if (error) {
            toast({
                title: "Error creating payment method",
                description: error.message || "Invalid card details. Please check and try again.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            setProcessing(false);
            return;
        }
        // save card payload
        const cardPayload = {
            "queryStringParameters": {
                operation: 'saveCardDetails',
                customerPaymentId: customerPaymentId,
                customerId: customerId,
                customerPaymentMethod: paymentMethod.id,
                laundryId: laundryId,

            }
        };

        axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/payment/save-card`, cardPayload,
            {
                headers: {
                    'x-api-key': authToken
                }
            })
            .then(response => {
                if (response.data.status === 'success') {
                    setCustomerPaymentId(response.data.customerPaymentId);
                    // Mark the new card as default and update state
                    const newCard = {
                        ...paymentMethod,
                        is_default: true,
                        billing_details: paymentMethod.billing_details
                    };
                    const updatedMethods = existingPaymentMethods.map(method => ({
                        ...method,
                        is_default: false
                    }));
                    setExistingPaymentMethods([...updatedMethods, newCard]);

                    toast({
                        title: "New card added",
                        description: "Your new card has been added and set as default.",
                        status: "success",
                        duration: 5000,
                        isClosable: true,
                    });
                    setShowNewCardForm(false);
                }
                if (response.data.status === 'error') {
                    toast({
                        title: "Error saving card",
                        description: response.data.error || "An unexpected error occurred",
                        status: "error",
                        duration: 5000,
                        isClosable: true,
                    });
                }
            })
            .catch(error => {
                toast({
                    title: "Error saving card",
                    description: error.message || "An unexpected error occurred",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
            })
            .finally(() => {
                setProcessing(false);
            });
    };


    // Disable "Next: Review Order" button while loading or if there are no valid payment methods
    const disableNextButton = loading || !isPaymentStepValid;
    return (
        <Stack spacing={4} width="100%">
            <Text fontSize={['md', 'lg']} fontWeight="bold">Payment Methods</Text>
            <Divider/>

            {loading ? (
                <Flex justifyContent="center" alignItems="center" height="100px">
                    <Spinner
                        thickness="4px"
                        speed="0.65s"
                        emptyColor="gray.200"
                        color="blue.500"
                        size="xl"
                        label="Fetching Payment Information.."
                    />
                </Flex>
            ) : existingPaymentMethods.length > 0 ? (
                <Stack spacing={4} width="100%">
                    {existingPaymentMethods.map((method) => (
                        <Box
                            key={method.id}
                            p={4}
                            borderRadius="md"
                            bg="blue.300"
                            color="white"
                            position="relative"
                            overflow="hidden"
                        >
                            {/* Delete button in top-right corner */}
                            <IconButton
                                icon={<DeleteIcon/>}
                                colorScheme="red"
                                variant="ghost"
                                onClick={() => handleDeleteCardClick(method)}
                                isDisabled={processing}
                                size="sm"
                                aria-label="Delete card"
                                position="absolute"
                                top="4px"
                                right="4px"
                            />


                            <Badge colorScheme={getBrandColorScheme(method.card.brand)}>
                                {method.card.brand.toUpperCase()}
                            </Badge>

                            <Flex justify="space-between" align="center" mt={2}>
                                <Text fontSize="lg" fontWeight="bold">
                                    Card ending in {method.card.last4}
                                </Text>
                                {method.is_default && (
                                    <Badge variant="solid" colorScheme="green" fontSize="0.7em">
                                        DEFAULT
                                    </Badge>
                                )}

                            </Flex>

                            <Flex justify="space-between" align="center" mt={2}>
                                <Text fontSize="sm">
                                    {method.billing_details.name || ''}
                                </Text>
                                <Text fontSize="sm">
                                    {method.card.exp_month}/{method.card.exp_year}
                                </Text>
                            </Flex>


                        </Box>
                    ))}
                </Stack>
            ) : (
                <Text>No payment methods available. Please add a payment method to place an order.</Text>
            )}

            <Button colorScheme="blue" onClick={() => setShowNewCardForm(true)} isDisabled={processing} width="100%">
                Add new payment method
            </Button>

            {showNewCardForm && (
                <Box width="100%" position="relative" mt={[2, 5]} borderRadius="md" p={[1, 4]}>
                    <CloseButton
                        position="absolute"
                        right="4px"
                        top="4px"
                        onClick={() => setShowNewCardForm(false)}
                        isDisabled={processing}
                        zIndex="overlay"
                        _hover={{
                            bg: 'red.500',
                            color: 'white',
                        }}
                    />
                    <form onSubmit={handleNewCardSubmit}>
                        {/* 1) Card Information Box */}
                        <Box p={[2, 4]} borderRadius="md" boxShadow="md" mb={4}>
                            <Text fontSize={['md', 'lg']} fontWeight="bold" mb={2}>
                                Card Information
                            </Text>

                            {/* Card Number, Expiration, and CVC in a single row */}
                            <Stack direction={{base: 'column', md: 'row'}} spacing={4} mb={4}>
                                <FormControl id="card-number" isRequired>
                                    <FormLabel fontSize={["sm", "md"]}>Card Number</FormLabel>
                                    <Box
                                        border="1px"
                                        borderRadius="md"
                                        p={2}
                                        _focusWithin={{borderColor: 'blue.500'}}
                                    >
                                        <CardNumberElement options={{style: cardStyle}}/>
                                    </Box>
                                </FormControl>

                                <FormControl id="card-expiry" isRequired>
                                    <FormLabel fontSize={["sm", "md"]}>Expiration Date</FormLabel>
                                    <Box
                                        border="1px"
                                        borderRadius="md"
                                        p={2}
                                        _focusWithin={{borderColor: 'blue.500'}}
                                    >
                                        <CardExpiryElement options={{style: cardStyle}}/>
                                    </Box>
                                </FormControl>

                                <FormControl id="card-cvc" isRequired>
                                    <FormLabel fontSize={["sm", "md"]}>CVC</FormLabel>
                                    <Box
                                        border="1px"
                                        borderRadius="md"
                                        p={2}
                                        _focusWithin={{borderColor: 'blue.500'}}
                                    >
                                        <CardCvcElement options={{style: cardStyle}}/>
                                    </Box>
                                </FormControl>
                            </Stack>

                            {/* Name and Phone Number */}
                            <FormControl id="name" isRequired>
                                <FormLabel fontSize={["sm", "md"]}>Name on Card</FormLabel>
                                <Input
                                    width="100%"
                                    type="text"
                                    placeholder="John Doe"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </FormControl>

                            <FormControl id="phone" isRequired mt={4}>
                                <FormLabel fontSize={["sm", "md"]}>Phone Number</FormLabel>
                                <InputGroup>
                                    <InputLeftAddon children="+1"/>
                                    <Input
                                        width="100%"
                                        type="tel"
                                        placeholder="Enter your 10-digit phone number"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                    />
                                </InputGroup>
                            </FormControl>
                        </Box>

                        {/* 2) Use Shipping Address Checkbox */}
                        <FormControl display="flex" alignItems="center" mb={4}>
                            <Checkbox
                                mr={2}
                                isChecked={useShippingAddress}
                                onChange={handleUseShippingAddressChange}
                            >
                                Use pickup address as billing address
                            </Checkbox>
                        </FormControl>

                        {/* 3) Billing Address Box */}
                        <Box p={4} borderRadius="md" boxShadow="md" mb={4}>
                            <Text fontSize={["md", "lg"]} fontWeight="bold" mb={2}>
                                Billing Address
                            </Text>

                            <FormControl id="line1" isRequired mt={4}>
                                <FormLabel fontSize={["sm", "md"]}>Address Line 1</FormLabel>
                                <Input
                                    width="100%"
                                    type="text"
                                    placeholder="123 Main St"
                                    value={address.line1}
                                    onChange={(e) => setAddress({...address, line1: e.target.value})}
                                />
                            </FormControl>

                            <Stack direction={{base: 'column', md: 'row'}} spacing={4} mt={4}>
                                <FormControl id="line2">
                                    <FormLabel fontSize={["sm", "md"]}>Address Line 2</FormLabel>
                                    <Input
                                        width="100%"
                                        type="text"
                                        placeholder="Apartment, suite, etc. (optional)"
                                        value={address.line2}
                                        onChange={(e) => setAddress({...address, line2: e.target.value})}
                                    />
                                </FormControl>

                                <FormControl id="city" isRequired>
                                    <FormLabel fontSize={["sm", "md"]}>City</FormLabel>
                                    <Input
                                        width="100%"
                                        type="text"
                                        placeholder="City"
                                        value={address.city}
                                        onChange={(e) => setAddress({...address, city: e.target.value})}
                                    />
                                </FormControl>
                            </Stack>

                            <Stack direction={{base: 'column', md: 'row'}} spacing={[2, 4]} mt={4}>
                                <FormControl id="state" isRequired>
                                    <FormLabel fontSize={["sm", "md"]}>State</FormLabel>
                                    <Input
                                        width="100%"
                                        type="text"
                                        placeholder="State"
                                        value={address.state}
                                        onChange={(e) => setAddress({...address, state: e.target.value})}
                                    />
                                </FormControl>

                                <FormControl id="postal_code" isRequired>
                                    <FormLabel fontSize={["sm", "md"]}>Zip Code</FormLabel>
                                    <Input
                                        width="100%"
                                        type="text"
                                        placeholder="12345"
                                        value={address.postal_code}
                                        onChange={(e) =>
                                            setAddress({...address, postal_code: e.target.value})
                                        }
                                    />
                                </FormControl>
                            </Stack>

                            <FormControl id="country" isRequired mt={4}>
                                <FormLabel fontSize={["sm", "md"]}>Country</FormLabel>
                                <Select
                                    placeholder="Select Country"
                                    value={address.country}
                                    onChange={(e) => setAddress({...address, country: e.target.value})}
                                >
                                    <option value="US">United States</option>
                                </Select>
                            </FormControl>
                        </Box>

                        <Button type="submit" colorScheme="blue" mt={4} isLoading={processing} width="100%">
                            Add
                        </Button>
                    </form>
                </Box>
            )}

            <Button
                colorScheme="blue"
                onClick={handleNextStep}
                isDisabled={disableNextButton && !payByInvoice}
                width="100%"
            >
                Next: Review Order
            </Button>

            {/* Pay by Invoice option for commercial customers */}
            <Box mt={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Flex align="center" justify="space-between">
                    <Box>
                        <Text fontSize="sm" fontWeight="600">Commercial Customer?</Text>
                        <Text fontSize="xs" color="gray.500">Pay by invoice (Net 30 days). No card required.</Text>
                    </Box>
                    <Button
                        size="sm"
                        colorScheme={payByInvoice ? "green" : "gray"}
                        variant={payByInvoice ? "solid" : "outline"}
                        onClick={() => {
                            setPayByInvoice(!payByInvoice);
                            if (!payByInvoice) setIsPaymentStepValid(true);
                        }}
                    >
                        {payByInvoice ? "✓ Invoice Selected" : "Pay by Invoice"}
                    </Button>
                </Flex>
            </Box>

            {/* AlertDialog for Delete Confirmation */}
            <AlertDialog
                isOpen={isDeleteDialogOpen}
                leastDestructiveRef={cancelRef}
                onClose={onDeleteDialogClose}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            Delete Card
                        </AlertDialogHeader>

                        <AlertDialogBody>
                            Are you sure you want to delete this card? You can't undo this action.
                        </AlertDialogBody>

                        <AlertDialogFooter>
                            <Button ref={cancelRef} onClick={onDeleteDialogClose}>
                                Cancel
                            </Button>
                            <Button
                                colorScheme="red"
                                onClick={confirmDeleteCard}
                                ml={3}
                                isLoading={processing}
                            >
                                Delete
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
        </Stack>
    );
};

export default PaymentPage;