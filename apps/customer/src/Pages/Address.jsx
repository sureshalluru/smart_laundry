import React, { useState, useRef, useContext, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LaundryContext } from '../Components/Contexts/LaundryContext';
import {
    FormControl,
    FormLabel,
    Input,
    Button,
    VStack,
    Image,
    useToast,
    Box,
    Heading,
    Text,
    HStack,
} from '@chakra-ui/react';
import { StandaloneSearchBox } from '@react-google-maps/api';
import axios from "axios";
import LaundryPickupImage from "../images/laundry-pickup.svg";

const Address = () => {
    const { laundryData } = useContext(LaundryContext);
    const { laundryId } = useParams();
    const navigate = useNavigate();

    // If user already has a valid session (token + address), skip to order flow
    useEffect(() => {
        const token = localStorage.getItem('idToken');
        const savedAddress = localStorage.getItem('customerAddress');
        if (token && savedAddress) {
            try {
                // Check if token is not expired
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.exp * 1000 > Date.now()) {
                    navigate(`/${laundryId}/user/schedule-order`, { replace: true });
                    return;
                }
            } catch (e) {
                // Invalid token, continue to address page
            }
        }
    }, [laundryId, navigate]);

    const [address, setAddress] = useState('');
    const [isAddressSelected, setIsAddressSelected] = useState(false);
    const searchBoxRef = useRef(null);
    const toast = useToast();
    const [validatingAddress, setValidatingAddress] = useState(false);
    const [showNotifyForm, setShowNotifyForm] = useState(false);
    const [notifyEmail, setNotifyEmail] = useState('');
    const [notifyPhone, setNotifyPhone] = useState('');
    const [notifySubmitting, setNotifySubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!address.trim()) {
            toast({ title: "Address Required", description: "Please type your address and pick from the suggestions.", status: "error", duration: 3000, isClosable: true });
            return;
        }
        if (!isAddressSelected) {
            toast({ title: "Invalid Address", description: "Please select a valid address from the suggestions.", status: "error", duration: 3000, isClosable: true });
            return;
        }
        try {
            setValidatingAddress(true);
            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/laundry/validate-address`,
                { params: { operation: 'validateAddress', laundryId, address }, headers: { 'x-api-key': process.env.REACT_APP_AWS_API_KEY } }
            );
            const data = response.data;
            if (data.status === 'success') {
                if (data.serviceable) {
                    localStorage.setItem('customerAddress', address);
                    navigate(`/${laundryId}/login`);
                } else {
                    setShowNotifyForm(true);
                    toast({ title: "Not Serviceable", description: 'This area is not yet serviced. Leave your info to be notified when we expand!', status: "info", duration: 5000, isClosable: true });
                }
            } else {
                toast({ title: "Error", description: `Error: ${data.message}`, status: "error", duration: 3000, isClosable: true });
            }
        } catch (error) {
            toast({ title: "Error", description: 'An error occurred. Please try again.', status: "error", duration: 3000, isClosable: true });
        } finally {
            setValidatingAddress(false);
        }
    };

    const handlePlacesChanged = () => {
        const places = searchBoxRef.current.getPlaces();
        if (places.length > 0) {
            setAddress(places[0].formatted_address);
            setIsAddressSelected(true);
        }
    };

    const handleAddressChange = (e) => {
        setAddress(e.target.value);
        setIsAddressSelected(false);
    };

    const themeGradient = laundryData?.themeColor === 'green'
        ? "linear-gradient(180deg, #F0FFF4 0%, #C6F6D5 100%)"
        : "linear-gradient(180deg, #EBF8FF 0%, #BEE3F8 100%)";

    return (
        <Box bg={themeGradient} minH="100vh" display="flex" flexDirection="column" alignItems="center" justifyContent="flex-start" px={[7, 9, 11]} py={[12, 16, 20]}>
            <Box w="full" maxW="600px">
                <VStack spacing={[4, 6, 8]} align="center">
                    <Image src={LaundryPickupImage} alt="Free Pickup & Delivery" objectFit="contain" w={{ base: '240px', md: '320px' }} h={{ base: '160px', md: '200px' }} />
                    <Heading size={['md', 'lg']} color="blue.600" textAlign="center">
                        Welcome to {laundryData?.laundryName}
                    </Heading>
                </VStack>

                <VStack as="form" onSubmit={handleSubmit} spacing={[4, 5, 6]} mt={[6, 8]} w="full" align="stretch">
                    <FormControl id="address" isRequired>
                        <FormLabel fontSize={["sm", "md", "lg"]} color="blue.600" mb={2}>
                            Enter your address for free pickup
                        </FormLabel>
                        <StandaloneSearchBox
                            onLoad={ref => (searchBoxRef.current = ref)}
                            onPlacesChanged={handlePlacesChanged}
                        >
                            <Input
                                type="text"
                                placeholder="Type and select your Address"
                                value={address}
                                onChange={handleAddressChange}
                                autoComplete="off"
                                size="lg"
                                boxShadow="sm"
                                focusBorderColor="blue.500"
                                borderColor="blue.300"
                                fontSize={["sm", "md"]}
                            />
                        </StandaloneSearchBox>
                    </FormControl>

                    <Button type="submit" colorScheme="blue" size="md" alignSelf="center" isLoading={validatingAddress} loadingText="Validating Address" boxShadow="md" w={["full","auto"]}>
                        Continue
                    </Button>

                    {/* Notify Me Form — shows when address is not serviceable */}
                    {showNotifyForm && (
                        <Box bg="white" borderRadius="xl" p={5} boxShadow="md" w="full" mt={4}>
                            <VStack spacing={3} align="stretch">
                                <Text fontWeight="600" color="gray.700" fontSize="sm">
                                    We don't serve this area yet, but we're expanding!
                                </Text>
                                <Text fontSize="xs" color="gray.500">
                                    Leave your email or phone and we'll notify you when we're available in your area.
                                </Text>
                                <Input
                                    placeholder="Email address"
                                    value={notifyEmail}
                                    onChange={(e) => setNotifyEmail(e.target.value)}
                                    size="sm"
                                    type="email"
                                />
                                <Input
                                    placeholder="Phone number (optional)"
                                    value={notifyPhone}
                                    onChange={(e) => setNotifyPhone(e.target.value)}
                                    size="sm"
                                />
                                <Button
                                    size="sm"
                                    colorScheme="green"
                                    isLoading={notifySubmitting}
                                    onClick={async () => {
                                        if (!notifyEmail && !notifyPhone) {
                                            toast({ title: "Please provide email or phone", status: "warning", duration: 3000 });
                                            return;
                                        }
                                        setNotifySubmitting(true);
                                        try {
                                            await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/zip-interest`, {
                                                laundryId, address, email: notifyEmail, phone: notifyPhone,
                                                zipCode: address.match(/\d{5}/)?.[0] || '',
                                            });
                                            toast({ title: "Got it!", description: "We'll reach out when we expand to your area.", status: "success", duration: 5000 });
                                            setShowNotifyForm(false);
                                        } catch (err) {
                                            toast({ title: "Error", description: "Please try again.", status: "error", duration: 3000 });
                                        } finally {
                                            setNotifySubmitting(false);
                                        }
                                    }}
                                >
                                    Notify Me
                                </Button>
                            </VStack>
                        </Box>
                    )}
                </VStack>
            </Box>
        </Box>
    );
};

export default Address;
