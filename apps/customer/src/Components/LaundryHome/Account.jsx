import React, {useEffect, useState} from 'react';
import {
    Box,
    Heading,
    Text,
    Flex,
    IconButton,
    Grid,
    GridItem,
    Divider,
    useToast,
    Spinner,
    FormControl,
    FormLabel,
    Switch
} from '@chakra-ui/react';
import {EditIcon, CheckIcon, CloseIcon, DeleteIcon} from '@chakra-ui/icons';
import axios from 'axios';
import {format, toZonedTime} from "date-fns-tz";

const Account = ({customerId, laundryTimeZone}) => {
    const [customerInfo, setCustomerInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [frequencyDetails, setFrequencyDetails] = useState([]); // state for frequency details
    const [isNotificationEditing, setIsNotificationEditing] = useState(false);
    const [updatedPreferences, setUpdatedPreferences] = useState({});
    const toast = useToast();
    const [isNotificationUpdateLoading, setIsNotificationUpdateLoading] = useState(false); // Notification Update Spinner
    const [loadingAddressId, setLoadingAddressId] = useState(null); // Delete Address loading state

    const authToken = localStorage.getItem('idToken');

    useEffect(() => {
        const fetchCustomerInfo = async () => {
            try {
                const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/customer/get-customer-info`, {
                    params: {
                        operation: 'getCustomerInformation',
                        customerId: customerId,
                    },
                    headers: {
                        'x-api-key': authToken,
                    },
                });

                const responseBody = JSON.parse(response.data.body);
                if (responseBody.status === 'success') {
                    setCustomerInfo(responseBody.data);
                    setUpdatedPreferences(responseBody.data.notificationPreferences);
                    setFrequencyDetails(responseBody.data.frequencyDetails || []); // Set frequency details
                } else {
                    toast({
                        title: 'Failed to fetch customer information',
                        description: responseBody.message || "An unexpected error occurred.",
                        status: 'error',
                        duration: 5000,
                        isClosable: true,
                    });
                }
            } catch (error) {
                toast({
                    title: 'Error fetching customer information',
                    description: error.response?.data?.message || error.message,
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            } finally {
                setLoading(false);
            }
        };
        fetchCustomerInfo();
    }, [authToken, customerId, toast]);

    // Function to trigger the edit notifications`
    const handleNotificationEditClick = () => {
        setIsNotificationEditing(!isNotificationEditing);
        setUpdatedPreferences(customerInfo.notificationPreferences); // Reset to original values when entering edit mode
    };

    // Function to listen for changes in the Notification preference
    const handleNotificationPreferenceChange = (field) => {
        setUpdatedPreferences((prev) => ({
            ...prev,
            [field]: !prev[field],
        }));
    };

    // To update the preferences in the table
    const handleNotificationSavePreferences = async () => {
        // Check if at least one notification preference is enabled
        if (!updatedPreferences.email && !updatedPreferences.phone) {
            toast({
                title: 'Error',
                description: 'At least one notification method (Email or SMS) must be enabled.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            handleCancelEdit();
            return; // Exit the function if validation fails
        }
        setIsNotificationUpdateLoading(true);
        try {
            const notification_preferences_payload = {
                "queryStringParameters": {
                    operation: "updateNotificationPreferences",
                    customerId: customerId,
                    notificationPreferences: JSON.stringify(updatedPreferences),
                }
            };

            const response = await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/customer/update-customer-notifications`,
                notification_preferences_payload,
                {
                    headers: {
                        'x-api-key': authToken,
                    },
                }
            );
            const responseBody = JSON.parse(response.data.body);

            if (responseBody.status === 'success') {
                // Update customerInfo only on success
                setCustomerInfo((prev) => ({
                    ...prev,
                    notificationPreferences: updatedPreferences,
                }));
                toast({
                    title: 'Preferences updated successfully',
                    status: 'success',
                    duration: 5000,
                    isClosable: true,
                });
                setIsNotificationEditing(false);
            } else {
                toast({
                    title: 'Failed to update preferences',
                    description: responseBody.message || "An unexpected error occurred.",
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
                setUpdatedPreferences(customerInfo.notificationPreferences); // Revert to original preferences on error

            }
        } catch (error) {
            toast({
                title: 'Failed to update preferences',
                description: error.response?.data?.message || error.message,
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            setUpdatedPreferences(customerInfo.notificationPreferences); // Revert to original preferences on request failure

        }
        finally {
            setIsNotificationUpdateLoading(false);
        }
    };
    // Function that handles the close button
    const handleCancelEdit = () => {
        setUpdatedPreferences(customerInfo.notificationPreferences); // Reset preferences on cancel
        setIsNotificationEditing(false);
    };

    // Function to Edit the Address
    // const handleEditAddress = (addressId) => {
    //     // Logic for editing address goes here
    //     toast({
    //         title: 'Edit Address',
    //         description: `Edit functionality for address ID ${addressId} clicked.`,
    //         status: 'info',
    //         duration: 3000,
    //         isClosable: true,
    //     });
    // };

    // Function to Delete the Address
    const handleDeleteAddress = async (addressId) => {
        setLoadingAddressId(addressId); // Set the loading state to the current address ID
        try {
            const response = await axios.delete(`${process.env.REACT_APP_AWS_API_URL}/api/customer/delete-customer-address`, {
                params: {
                    operation: 'deleteCustomerAddress',
                    customerId: customerId,
                    addressId: addressId,
                },
                headers: {
                    'x-api-key': authToken,
                },
            });

            const responseBody = JSON.parse(response.data.body)

            if (responseBody.status === 'success') {
                toast({
                    title: 'Address Deleted',
                    description: `Address with Id ${addressId} deleted successfully.`,
                    status: 'success',
                    duration: 3000,
                    isClosable: true,
                });

                // Update the state to remove the address from the list
                setCustomerInfo((prev) => ({
                    ...prev,
                    addresses: prev.addresses.filter((address) => address.addressId !== addressId),
                }));
            } else {
                toast({
                    title: 'Error',
                    description: responseBody.message || 'Failed to delete the address.',
                    status: 'error',
                    duration: 3000,
                    isClosable: true,
                });
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: error.response?.data?.message || 'Failed to delete the address.',
                status: 'error',
                duration: 3000,
                isClosable: true,
            });
        }
        finally {
            setLoadingAddressId(null);
        }
    };


    return (
        <Box
            p={[4, 6]}
            w="100%"
            display="flex"
            flexDirection="column"
            bg="#EBF8FF"
            overflow="hidden"
        >
            {/* Sticky top heading "Account" */}
            <Box
                p={[2, 4]}
                borderBottomWidth="1px"
                zIndex="1"
                position="sticky"
                top="0"
                bg="#EBF8FF"
            >
                <Text
                    fontSize={["xl", "2xl"]}
                    fontWeight="bold"
                    textAlign="center"
                    color="blue.700"
                >
                    Account
                </Text>
            </Box>

    {loading ? (
            <Flex justify="center" align="center" h="50vh">
                <Spinner size="xl" />
            </Flex>
    ):
    (
        <Box p={[2,4]} flex="1" overflowY="auto" maxWidth={["100%", "77%"]} mx="auto" mt={[2,4]}  bg="#EBF8FF">
            {/* Personal Information Section */}
            <Box bg="#ccf0ed" p={[2,4]} borderRadius="md" boxShadow="md" mb={[4,6]} >
                <Heading as="h2" size="md" color="green.800" mb={[2,4]}>
                    Personal Information
                </Heading>
                <Divider mb={[2,4]} />
                <Grid
                    templateColumns={["105px 1fr", "150px 1fr"]}
                    rowGap={2}
                    columnGap={[1,2]}
                >
                    <GridItem>
                        <Text fontWeight="bold">First Name:</Text>
                    </GridItem>
                    <GridItem>
                        <Text wordBreak="break-word">{customerInfo?.firstName || "N/A"}</Text>
                    </GridItem>

                    <GridItem>
                        <Text fontWeight="bold">Last Name:</Text>
                    </GridItem>
                    <GridItem>
                        <Text wordBreak="break-word">{customerInfo?.lastName || "N/A"}</Text>
                    </GridItem>

                    <GridItem>
                        <Text fontWeight="bold">Phone Number:</Text>
                    </GridItem>
                    <GridItem>
                        <Text wordBreak="break-word">{customerInfo?.phoneNumber || "N/A"}</Text>
                    </GridItem>

                    <GridItem>
                        <Text fontWeight="bold">Email Address:</Text>
                    </GridItem>
                    <GridItem>
                        <Text wordBreak="break-word">{customerInfo?.email || "N/A"}</Text>
                    </GridItem>
                </Grid>
            </Box>

            {/* Address Section */}
            <Box bg="#ccf0ed" p={[2,4]} borderRadius="md" boxShadow="md" mb={[4,6]}>
                <Heading as="h2" size="md" color="green.800" mb={[2,4]}>
                    Address
                </Heading>
                <Divider mb={[2,4]} />
                <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4} columnGap={[1,2]}>
                    {customerInfo?.addresses?.length > 0 ? (
                        customerInfo.addresses.map((address, index) => (
                            <Box key={address.addressId} p={[2,4]} bg="#ccf0ed" borderRadius="md" boxShadow="sm" border="1px solid" borderColor="gray.200">
                                <Flex justify="space-between" align="center" mb={2}>
                                    <Text fontSize="md" color="gray.600" fontWeight="bold">{`Address ${index + 1}`}</Text>
                                    <Flex>
                                        {/*<IconButton*/}
                                        {/*    icon={<EditIcon />}*/}
                                        {/*    aria-label="Edit Address"*/}
                                        {/*    colorScheme="blue"*/}
                                        {/*    variant="ghost"*/}
                                        {/*    onClick={() => handleEditAddress(address.addressId)}*/}
                                        {/*/>*/}
                                        <IconButton
                                            icon={<DeleteIcon />}
                                            aria-label="Delete Address"
                                            colorScheme="red"
                                            variant="ghost"
                                            onClick={() => handleDeleteAddress(address.addressId)}
                                            isLoading={loadingAddressId === address.addressId}

                                        />
                                    </Flex>
                                </Flex>
                                {/* 2-column label-value for each address  */}
                                <Grid
                                    templateColumns={["110px 1fr", "120px 1fr"]}
                                    rowGap={2}
                                    columnGap={2}
                                >
                                    <GridItem>
                                        <Text fontWeight="bold">Full Address:</Text>
                                    </GridItem>
                                    <GridItem>
                                        <Text color="gray.800" wordBreak="break-word">{address.address || "N/A"}</Text>
                                    </GridItem>

                                    <GridItem>
                                        <Text fontWeight="bold">Door #:</Text>
                                    </GridItem>
                                    <GridItem>
                                        <Text color="gray.800" wordBreak="break-word">{address.doorNumber || "N/A"}</Text>
                                    </GridItem>

                                    <GridItem>
                                        <Text fontWeight="bold">Instructions:</Text>
                                    </GridItem>
                                    <GridItem>
                                        <Text color="gray.800" wordBreak="break-word">
                                            {address.addressInstructions || "N/A"}
                                        </Text>
                                    </GridItem>
                                </Grid>
                            </Box>
                        ))
                    ) : (
                        <Text>No addresses saved</Text>
                    )}
                </Grid>
            </Box>

            {/* Notification Preferences Section */}
            <Box bg="#ccf0ed" p={[2,4]} borderRadius="md" boxShadow="md" mb={[4,6]}>
                <Flex justify="space-between" align="center" mb={[2,4]}>
                    <Heading as="h2" size="md" color="green.800">Notification Preferences</Heading>
                    {isNotificationEditing ? (
                        <>
                            <IconButton
                                icon={<CheckIcon />}
                                aria-label="Save Preferences"
                                colorScheme="green"
                                variant="ghost"
                                onClick={handleNotificationSavePreferences}
                                isLoading={isNotificationUpdateLoading}
                            />
                            <IconButton
                                icon={<CloseIcon />}
                                aria-label="Cancel Editing"
                                colorScheme="red"
                                variant="ghost"
                                onClick={handleCancelEdit}
                            />
                        </>
                    ) : (
                        <IconButton
                            icon={<EditIcon />}
                            aria-label="Edit Notification Preferences"
                            colorScheme="teal"
                            variant="ghost"
                            onClick={handleNotificationEditClick}
                        />
                    )}
                </Flex>
                <Divider mb={[2,4]} />
                <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4} columnGap={[1,2]}>
                    <GridItem>
                        <FormControl display="flex" alignItems="center">
                            <FormLabel htmlFor="email-preference" mb="0">
                                Email Notifications
                            </FormLabel>
                            <Switch
                                id="email-preference"
                                isChecked={updatedPreferences.email || false}
                                isDisabled={!isNotificationEditing}
                                onChange={() => handleNotificationPreferenceChange('email')}
                            />
                        </FormControl>
                    </GridItem>
                    <GridItem>
                        <FormControl display="flex" alignItems="center">
                            <FormLabel htmlFor="phone-preference" mb="0" >
                                SMS Notifications
                            </FormLabel>
                            <Switch
                                id="phone-preference"
                                isChecked={updatedPreferences.sms || false}
                                isDisabled={!isNotificationEditing}
                                onChange={() => handleNotificationPreferenceChange('sms')}
                            />
                        </FormControl>
                    </GridItem>
                </Grid>
            </Box>
            {/* Frequency Details Section */}
            <Box bg="#ccf0ed" p={[2,4]} borderRadius="md" boxShadow="md" mt={[2,4]}>
                <Heading as="h2" size="md" color="green.800" mb={[2,4]}>
                    Recurring Order Frequency
                </Heading>
                <Divider mb={[2,4]} />
                {frequencyDetails.length > 0 ? (
                    <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
                        {frequencyDetails.map((frequency, index) => (
                            <Box
                                key={index}
                                p={[2,4]}
                                borderRadius="md"
                                boxShadow="sm"
                                border="1px solid"
                                borderColor="gray.200"
                            >
                                <Grid templateColumns={["125px 1fr"]} rowGap={1} columnGap={[1,2]}>
                                    <GridItem>
                                        <Text fontWeight="bold">
                                            Address:
                                        </Text>
                                    </GridItem>
                                    <GridItem>
                                        <Text color="gray.800" mb={2} wordBreak="break-word">
                                            {frequency.address || "N/A"}
                                        </Text>
                                    </GridItem>

                                    <GridItem>
                                        <Text  fontWeight="bold">
                                            Created Date:
                                        </Text>
                                    </GridItem>
                                    <GridItem>
                                        <Text mb={2} wordBreak="break-word">
                                            {frequency.frequencyCreatedDate
                                                ? format(
                                                    toZonedTime(
                                                        new Date(frequency.frequencyCreatedDate),
                                                        laundryTimeZone
                                                    ),
                                                    "yyyy-MM-dd hh:mm a",
                                                    { timeZone: laundryTimeZone }
                                                )
                                                : "N/A"}
                                        </Text>
                                    </GridItem>

                                    <GridItem>
                                        <Text fontWeight="bold">
                                            Next Pickup Date:
                                        </Text>
                                    </GridItem>
                                    <GridItem>
                                        <Text color="gray.800" mb={2} wordBreak="break-word">
                                            {frequency.futurePickupDate || "N/A"}
                                        </Text>
                                    </GridItem>

                                    <GridItem>
                                        <Text  fontWeight="bold">
                                            Pickup Interval:
                                        </Text>
                                    </GridItem>
                                    <GridItem>
                                        <Text color="gray.800" mb={2} wordBreak="break-word">
                                            {frequency.pickupTimeInterval || "N/A"}
                                        </Text>
                                    </GridItem>

                                    <GridItem>
                                        <Text fontWeight="bold">
                                            Dropoff Interval:
                                        </Text>
                                    </GridItem>
                                    <GridItem>
                                        <Text color="gray.800" wordBreak="break-word">
                                            {frequency.dropoffTimeInterval || "N/A"}
                                        </Text>
                                    </GridItem>
                                </Grid>
                            </Box>
                        ))}
                    </Grid>
                ) : (
                    <Text>No associated frequencies found</Text>
                )}
            </Box>

        </Box>
    )}
        </Box>
    );
};

export default Account;
