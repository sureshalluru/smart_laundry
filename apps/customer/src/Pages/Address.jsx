import React, { useState, useRef, useContext } from 'react';
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
    Heading
} from '@chakra-ui/react';
import { LoadScript, StandaloneSearchBox } from '@react-google-maps/api';
import axios from "axios";
import AddressImage from "../images/address.png";

const Address = () => {
    const { laundryData } = useContext(LaundryContext);
    const { laundryId } = useParams();
    const [address, setAddress] = useState('');
    const [isAddressSelected, setIsAddressSelected] = useState(false); // <-- Track if user picked from suggestions
    const navigate = useNavigate();
    const libraries = ['places'];
    const searchBoxRef = useRef(null);
    const googleApiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    const toast = useToast();
    const [validatingAddress, setValidatingAddress] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // 1) Check if user typed nothing
        if (!address.trim()) {
            toast({
                title: "Address Required",
                description: "Please type your address and pick from the suggestions.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            return;
        }

        // 2) Check if user typed something but didn't select from suggestions
        if (!isAddressSelected) {
            toast({
                title: "Invalid Address",
                description: "Please select a valid address from the suggestions.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            return;
        }

        try {
            setValidatingAddress(true);
            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/laundry/validate-address`,
                {
                    params: {
                        operation: 'validateAddress',
                        laundryId: laundryId,
                        address: address
                    },
                    headers: {
                        'x-api-key': process.env.REACT_APP_AWS_API_KEY
                    }
                }
            );
            const data = response.data;
            if (data.status === 'success') {
                if (data.serviceable) {
                    localStorage.setItem('customerAddress', address);
                    navigate(`/${laundryId}/login`);
                } else {
                    toast({
                        title: "Not Serviceable",
                        description: 'This location is not serviceable. Please try again.',
                        status: "warning",
                        duration: 3000,
                        isClosable: true,
                    });
                    setValidatingAddress(false);
                }
            } else {
                toast({
                    title: "Error",
                    description: `Error: ${data.message}`,
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
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
        } finally {
            setValidatingAddress(false);
        }
    };

    const handlePlacesChanged = () => {
        const places = searchBoxRef.current.getPlaces();
        if (places.length > 0) {
            const place = places[0];
            setAddress(place.formatted_address);
            setIsAddressSelected(true); // <-- Mark that user picked from suggestions
        }
    };

    // If user manually changes the text, reset isAddressSelected
    const handleAddressChange = (e) => {
        setAddress(e.target.value);
        setIsAddressSelected(false);
    };

    return (
        <Box
            bg="#AADDD9"
            minH="100vh"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="flex-start"
            px={[7, 9, 11]}
            py={[12, 16, 20]}
        >
            <LoadScript googleMapsApiKey={googleApiKey} libraries={libraries}>
                <Box w="full" maxW="600px">
                    {/* Top section: image + heading in a VStack */}
                    <VStack spacing={[4, 6, 8]} align="center">
                        <Image
                            src={AddressImage}
                            alt="Laundry Service"
                            objectFit="fit"
                            boxSize={["200px", "400px"]}
                        />

                        <Heading
                            size={['md', 'lg']}
                            color="blue.600"
                            textAlign="center"
                        >
                            Welcome to {laundryData?.laundryName}
                        </Heading>
                    </VStack>

                    {/* Form section in its own VStack */}
                    <VStack
                        as="form"
                        onSubmit={handleSubmit}
                        spacing={[4, 5, 6]}
                        mt={[6, 8]}
                        w="full"
                        align="stretch"
                    >
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
                                    size="md"
                                    boxShadow="sm"
                                    focusBorderColor="blue.500"
                                    borderColor="blue.300"
                                    fontSize={["sm", "md"]}
                                />
                            </StandaloneSearchBox>
                        </FormControl>

                        <Button
                            type="submit"
                            colorScheme="blue"
                            size="md"
                            alignSelf="center"
                            isLoading={validatingAddress}
                            loadingText="Validating Address"
                            boxShadow="md"
                            w={["full","auto"]}
                        >
                            Continue
                        </Button>
                    </VStack>
                </Box>
            </LoadScript>
        </Box>
    );
};

export default Address;
