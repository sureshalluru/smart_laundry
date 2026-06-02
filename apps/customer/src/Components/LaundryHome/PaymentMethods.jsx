import React, {useState, useEffect, useRef} from 'react';
import {CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements} from '@stripe/react-stripe-js';
import {
    Box,
    Button,
    FormControl,
    FormLabel,
    Input,
    Text,
    IconButton,
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
    AlertDialogFooter,
    Heading,
    Card,
    CardBody,
    CardHeader,
    CardFooter, SimpleGrid, Stack
} from '@chakra-ui/react';
import {DeleteIcon, AddIcon} from '@chakra-ui/icons';
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

const PaymentMethods = ({
                            customerId,
                            laundryId,
                            customerPaymentId,
                            setCustomerPaymentId,
                        }) => {
    const stripe = useStripe();
    const elements = useElements();
    const authToken = localStorage.getItem('idToken');
    const shippingAddressString = localStorage.getItem('customerAddress') || '';
    const [showNewCardForm, setShowNewCardForm] = useState(false);
    const [name, setName] = useState('');
    const [existingPaymentMethods, setExistingPaymentMethods] = useState([]); // Store the payment methods of a customer
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

    const bgColor = "#AADDD9"; // Main background color
    const cardBgColor = "white"; // Card background color
    const borderColor = "gray.200"; // Border color

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
    }, [customerPaymentId, authToken, toast, setExistingPaymentMethods, laundryId]);


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


    return (
        <Box p={{base: 4, md: 6}} w="100%" minH="100vh" bg={bgColor}>
            <Card
                variant="outline"
                bg={cardBgColor}
                borderColor={borderColor}
                boxShadow="sm"
            >
                <CardHeader>
                    <Heading size="md" mb={1}>Payment Methods</Heading>
                    <Text fontSize={{base: "sm", md: "md"}} color="gray.500">Manage your saved payment methods</Text>
                </CardHeader>

                <CardBody>
                    {loading ? (
                        <Flex justify="center" align="center" minH="100px">
                            <Spinner thickness="4px" speed="0.65s" color="blue.500" size="xl"/>
                        </Flex>
                    ) : existingPaymentMethods.length > 0 ? (
                        <SimpleGrid columns={{base: 1, sm: 2, md: 3}} spacing={4}>
                            {existingPaymentMethods.map((method) => (
                                <Box
                                    key={method.id}
                                    p={4}
                                    pt={6}   // extra padding to accommodate delete icon
                                    pr={6}
                                    borderRadius="md"
                                    bg="blue.50"
                                    border="1px"
                                    borderColor={borderColor}
                                    position="relative"
                                    transition="all 0.2s"
                                    _hover={{
                                        transform: 'scale(1.02)',
                                        boxShadow: 'md',
                                    }}
                                >
                                    {/* Delete Button */}
                                    <IconButton
                                        icon={<DeleteIcon />}
                                        colorScheme="red"
                                        variant="ghost"
                                        onClick={() => handleDeleteCardClick(method)}
                                        isDisabled={processing}
                                        size="sm"
                                        aria-label="Delete card"
                                        position="absolute"
                                        top="8px"
                                        right="8px"
                                        zIndex={1}
                                    />

                                    {/* Brand + Default Badges */}
                                    <Flex align="center" mb={2} wrap="wrap" gap={2}>
                                        <Badge
                                            colorScheme={getBrandColorScheme(method.card.brand)}
                                            variant="subtle"
                                            fontSize="0.8em"
                                            px={2}
                                            py={1}
                                            borderRadius="full"
                                        >
                                            {method.card.brand.toUpperCase()}
                                        </Badge>
                                        {method.is_default && (
                                            <Badge
                                                variant="solid"
                                                colorScheme="green"
                                                fontSize="0.8em"
                                                px={2}
                                                py={1}
                                                borderRadius="full"
                                            >
                                                DEFAULT
                                            </Badge>
                                        )}
                                    </Flex>

                                    {/* Card Number */}
                                    <Text fontSize="xl" fontWeight="bold" mb={1}>
                                        •••• •••• •••• {method.card.last4}
                                    </Text>

                                    {/* Name + Expiry */}
                                    <Flex justify="space-between" align="center" mt={2} wrap="wrap">
                                        <Text fontSize="sm" color="gray.600" minW="50%">
                                            {method.billing_details.name || 'No name provided'}
                                        </Text>
                                        <Text fontSize="sm" color="gray.600" textAlign={{ base: 'left', md: 'right' }} mt={{ base: 1, md: 0 }}>
                                            Expires {method.card.exp_month.toString().padStart(2, '0')}/{method.card.exp_year.toString().slice(-2)}
                                        </Text>
                                    </Flex>
                                </Box>

                            ))}
                        </SimpleGrid>
                    ) : (
                        <Box textAlign="center" py={8}>
                            <Text color="gray.500">No payment methods saved</Text>
                        </Box>
                    )}

                    {!showNewCardForm && (
                        <Button
                            leftIcon={<AddIcon/>}
                            colorScheme="blue"
                            variant="outline"
                            onClick={() => setShowNewCardForm(true)}
                            isDisabled={processing}
                            width="100%"
                            mt={4}
                        >
                            Add New Payment Method
                        </Button>
                    )}
                </CardBody>

                {showNewCardForm && (
                    <CardFooter borderTop="1px" borderColor={borderColor} bg={cardBgColor}>
                        <Box width="100%" position="relative">
                            <CloseButton
                                position="absolute"
                                right="0"
                                top="-12px"
                                onClick={() => setShowNewCardForm(false)}
                                isDisabled={processing}
                                size="lg"
                                bg="white"
                                borderRadius="full"
                                border="1px"
                                borderColor={borderColor}
                                _hover={{bg: 'red.100', color: 'red.600'}}
                            />
                            <form onSubmit={handleNewCardSubmit}>
                                {/* 1) Card Information Section */}
                                <Box
                                    p={4}
                                    borderRadius="md"
                                    border="1px"
                                    borderColor="gray.200"
                                    mb={4}
                                    bg="gray.50"
                                >
                                    <Heading size="md" mb={4} color="gray.700">
                                        Card Information
                                    </Heading>

                                    {/* Card Number */}
                                    <FormControl id="card-number" isRequired mb={4}>
                                        <FormLabel fontSize="sm" fontWeight="semibold" color="gray.600">
                                            Card Number
                                        </FormLabel>
                                        <Box
                                            border="1px"
                                            borderColor="gray.300"
                                            borderRadius="md"
                                            p={3}
                                            bg="white"
                                            _focusWithin={{
                                                borderColor: 'blue.500',
                                                boxShadow: '0 0 0 1px #3182ce'
                                            }}
                                        >
                                            <CardNumberElement options={{style: cardStyle}}/>
                                        </Box>
                                    </FormControl>

                                    {/* Expiry and CVC in a row */}
                                    <Stack direction={{base: 'column', sm: 'row'}} spacing={4} mb={4}>
                                        <FormControl id="card-expiry" isRequired>
                                            <FormLabel fontSize="sm" fontWeight="semibold" color="gray.600">
                                                Expiration Date
                                            </FormLabel>
                                            <Box
                                                border="1px"
                                                borderColor="gray.300"
                                                borderRadius="md"
                                                p={3}
                                                bg="white"
                                                _focusWithin={{
                                                    borderColor: 'blue.500',
                                                    boxShadow: '0 0 0 1px #3182ce'
                                                }}
                                            >
                                                <CardExpiryElement options={{style: cardStyle}}/>
                                            </Box>
                                        </FormControl>

                                        <FormControl id="card-cvc" isRequired>
                                            <FormLabel fontSize="sm" fontWeight="semibold" color="gray.600">
                                                CVC
                                            </FormLabel>
                                            <Box
                                                border="1px"
                                                borderColor="gray.300"
                                                borderRadius="md"
                                                p={3}
                                                bg="white"
                                                _focusWithin={{
                                                    borderColor: 'blue.500',
                                                    boxShadow: '0 0 0 1px #3182ce'
                                                }}
                                            >
                                                <CardCvcElement options={{style: cardStyle}}/>
                                            </Box>
                                        </FormControl>
                                    </Stack>

                                    {/* Name and Phone */}
                                    <FormControl id="name" isRequired mb={4}>
                                        <FormLabel fontSize="sm" fontWeight="semibold" color="gray.600">
                                            Name on Card
                                        </FormLabel>
                                        <Input
                                            size="md"
                                            type="text"
                                            placeholder="John Doe"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            bg="white"
                                            focusBorderColor="blue.500"
                                        />
                                    </FormControl>

                                    <FormControl id="phone" isRequired>
                                        <FormLabel fontSize="sm" fontWeight="semibold" color="gray.600">
                                            Phone Number
                                        </FormLabel>
                                        <InputGroup>
                                            <InputLeftAddon children="+1" bg="gray.100" color="gray.600"/>
                                            <Input
                                                type="tel"
                                                placeholder="10-digit phone number"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                bg="white"
                                                focusBorderColor="blue.500"
                                                maxLength={10}
                                            />
                                        </InputGroup>
                                    </FormControl>
                                </Box>

                                {/* 2) Billing Address Section */}
                                <Box
                                    p={4}
                                    borderRadius="md"
                                    border="1px"
                                    borderColor="gray.200"
                                    mb={4}
                                    bg="gray.50"
                                >
                                    <Flex align="center" justify="space-between" mb={4}>
                                        <Heading size="md" color="gray.700">
                                            Billing Address
                                        </Heading>
                                        <FormControl display="flex" alignItems="center" width="auto">
                                            <Checkbox
                                                id="use-shipping"
                                                mr={2}
                                                isChecked={useShippingAddress}
                                                onChange={handleUseShippingAddressChange}
                                                colorScheme="blue"
                                            />
                                            <FormLabel htmlFor="use-shipping" mb={0} fontSize="sm" color="gray.600">
                                                Use pickup address
                                            </FormLabel>
                                        </FormControl>
                                    </Flex>

                                    <FormControl id="line1" isRequired mb={4}>
                                        <FormLabel fontSize="sm" fontWeight="semibold" color="gray.600">
                                            Street Address
                                        </FormLabel>
                                        <Input
                                            size="md"
                                            type="text"
                                            placeholder="123 Main St"
                                            value={address.line1}
                                            onChange={(e) => setAddress({...address, line1: e.target.value})}
                                            bg="white"
                                            focusBorderColor="blue.500"
                                        />
                                    </FormControl>

                                    <FormControl id="line2" mb={4}>
                                        <FormLabel fontSize="sm" color="gray.600">
                                            Apt, Suite, etc. (Optional)
                                        </FormLabel>
                                        <Input
                                            size="md"
                                            type="text"
                                            placeholder="Apt 4B"
                                            value={address.line2}
                                            onChange={(e) => setAddress({...address, line2: e.target.value})}
                                            bg="white"
                                            focusBorderColor="blue.500"
                                        />
                                    </FormControl>

                                    <Stack direction={{base: 'column', sm: 'row'}} spacing={4} mb={4}>
                                        <FormControl id="city" isRequired>
                                            <FormLabel fontSize="sm" fontWeight="semibold" color="gray.600">
                                                City
                                            </FormLabel>
                                            <Input
                                                size="md"
                                                type="text"
                                                placeholder="New York"
                                                value={address.city}
                                                onChange={(e) => setAddress({...address, city: e.target.value})}
                                                bg="white"
                                                focusBorderColor="blue.500"
                                            />
                                        </FormControl>

                                        <FormControl id="state" isRequired>
                                            <FormLabel fontSize="sm" fontWeight="semibold" color="gray.600">
                                                State
                                            </FormLabel>
                                            <Input
                                                size="md"
                                                type="text"
                                                placeholder="NY"
                                                value={address.state}
                                                onChange={(e) => setAddress({...address, state: e.target.value})}
                                                bg="white"
                                                focusBorderColor="blue.500"
                                                maxLength={2}
                                            />
                                        </FormControl>

                                        <FormControl id="postal_code" isRequired>
                                            <FormLabel fontSize="sm" fontWeight="semibold" color="gray.600">
                                                ZIP Code
                                            </FormLabel>
                                            <Input
                                                size="md"
                                                type="text"
                                                placeholder="10001"
                                                value={address.postal_code}
                                                onChange={(e) => setAddress({...address, postal_code: e.target.value})}
                                                bg="white"
                                                focusBorderColor="blue.500"
                                                maxLength={5}
                                            />
                                        </FormControl>
                                    </Stack>

                                    <FormControl id="country" isRequired>
                                        <FormLabel fontSize="sm" fontWeight="semibold" color="gray.600">
                                            Country
                                        </FormLabel>
                                        <Select
                                            placeholder="Select country"
                                            value={address.country}
                                            onChange={(e) => setAddress({...address, country: e.target.value})}
                                            bg="white"
                                            focusBorderColor="blue.500"
                                        >
                                            <option value="US">United States</option>
                                        </Select>
                                    </FormControl>
                                </Box>

                                <Button
                                    type="submit"
                                    colorScheme="blue"
                                    size="lg"
                                    width="100%"
                                    isLoading={processing}
                                    loadingText="Adding Card..."
                                >
                                    Add Payment Method
                                </Button>
                            </form>
                        </Box>
                    </CardFooter>
                )}
            </Card>

            <AlertDialog
                isOpen={isDeleteDialogOpen}
                leastDestructiveRef={cancelRef}
                onClose={onDeleteDialogClose}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            Delete Payment Method
                        </AlertDialogHeader>

                        <AlertDialogBody>Are you sure? This will permanently remove this payment
                            method.</AlertDialogBody>
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
        </Box>
    );
};

export default PaymentMethods;