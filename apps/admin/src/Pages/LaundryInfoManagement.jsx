import React, { useEffect, useState, useRef } from "react";
import { useDisclosure,Tooltip } from "@chakra-ui/react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import { DeleteIcon, AddIcon } from "@chakra-ui/icons";
import {
    Box,
    Spinner,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    Text,
    Flex,
    Button,
    IconButton,
    Input,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    ModalCloseButton,
    useToast,
    Select,
    InputGroup,
    InputLeftAddon
} from "@chakra-ui/react";


export const fetchLaundryOrders = async (laundryId, operation) => {
    const authToken = localStorage.getItem('idToken');
    const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/orders-info`;

    try {
      const response = await axios.get(url, {
        params: {
          operation,
          laundryId,
        },
        headers: {
          // 'x-api-key': process.env.REACT_APP_AWS_API_KEY,
            'Authorization': `Bearer ${authToken}`
        },
        timeout: 15000,
      });
  
      return response.data?.body || []; // Return the orders data
    } catch (error) {
      console.error('Error fetching laundry orders:', error);
      throw error; 
    }
  };

export const fetchLaundryServices = async (laundryId) => {
    const authToken = localStorage.getItem('idToken');

    try {
      const params = {
        operation: "viewServices",
        laundryId: laundryId,
      };
      const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`;
      const response = await axios.get(url, {
        params,
        headers: {
            // "x-api-key": process.env.REACT_APP_AWS_API_KEY
            'Authorization': `Bearer ${authToken}`

        },
      });
      const services = Object.values(response.data?.body?.services || {});
      // console.log("laundry services are ", services);
      return services;
    } catch (error) {
      console.error("Error fetching laundry services:", error);
      throw error; 
    }
  };

 export const fetchLaundryProducts = async (laundryId) => {
     const authToken = localStorage.getItem('idToken');
     const params = { operation: "viewAllProducts", laundryId };
    try {
        const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`;
        const response = await axios.get(url, {
            params,
            headers: {
                // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                'Authorization': `Bearer ${authToken}`

            },
        });
        const products = Object.values(response.data?.body?.products || {});
        // console.log("products from laundry shop", products);
        return products;
    } catch (error) {
        console.error("Error fetching products:", error);
    } 
};
  
export const fetchLaundryInfo = async (laundryId) => {
    const authToken = localStorage.getItem('idToken');
    const params = { operation: "viewShopInfo", laundryId };
    try {
        const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`;
        const response = await axios.get(url, {
            params,
            headers: {
                // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                'Authorization': `Bearer ${authToken}`

            },
        });

        // Check if the response is successful
        if (response.data.statusCode === 200) {
            return response.data.body; // Return the laundry info
        } else {
            console.error("Error fetching laundry info:", response.data.message);
            return null; // Return null if there’s an error
        }
    } catch (error) {
        console.error("Error fetching laundry products:", error);
        return null; // Return null in case of any error during the API call
    }
};

export const fetchLaundryInfoById = async (laundryId) => {
    const authToken = localStorage.getItem('idToken');
    const params = { operation: "viewLaundryInfoById", laundryId };
    try {
        const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`;
        const response = await axios.get(url, {
            params,
            headers: {
                // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                'Authorization': `Bearer ${authToken}`

            },
        });

        // Check if the response is successful
        if (response.data.statusCode === 200) {
            return response.data.body; // Return the laundry info
        } else {
            console.error("Error fetching laundry info:", response.data.message);
            return null; // Return null if there’s an error
        }
    } catch (error) {
        console.error("Error fetching laundry products:", error);
        return null; // Return null in case of any error during the API call
    }
};

export const fetchEmployeeTips = async (laundryId, startDate, endDate) => {
    const authToken = localStorage.getItem('idToken');
    const apiKey = process.env.REACT_APP_TIP_API_KEY;
    const baseUrl = `${process.env.REACT_APP_AWS_API_URL}/api/admin/employee-tip-info`;

    const params = {
        operation: 'viewTipsByLaundryId',
        laundryId,
        startDate,
        endDate
    };

    try {
        const response = await axios.get(baseUrl, {
            params,
            headers: {
                'Authorization': `Bearer ${authToken}`
                // 'x-api-key': process.env.REACT_APP_TIP_API_KEY
            },
        });

        if (response.data?.statusCode === 200) {
            console.log(response);
            return response.data.body;
        } else {
            throw new Error('Failed to fetch tip data.');
        }
    } catch (error) {
        console.error('Error fetching employee tip info:', error);
        throw error;
    }
};

const ReusableModal = React.memo(({ isOpen, onClose, title, footerButtons, children }) => (
    <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
            <ModalHeader>{title}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>{children}</ModalBody>
            <ModalFooter>
                {footerButtons.map(({ label, onClick, colorScheme, variant, isLoading}, index) => (
                    <Button
                        key={index}
                        onClick={onClick}
                        colorScheme={colorScheme}
                        variant={variant}
                        isLoading={isLoading}
                        ml={index > 0 ? 3 : 0}
                    >
                        {label}
                    </Button>
                ))}
            </ModalFooter>
        </ModalContent>
    </Modal>
));

/* ─── Delivery Schedule Section ─────────────────────────────────────────────── */
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DeliveryScheduleSection = ({ laundryId }) => {
    const toast = useToast();
    const [slots, setSlots] = useState([]);
    const [deliveryTimeInterval, setDeliveryTimeInterval] = useState(2);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const authToken = localStorage.getItem('idToken');

    useEffect(() => {
        const fetchSchedule = async () => {
            try {
                const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/delivery-schedule`, {
                    params: { laundryId },
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                const data = res.data?.body || res.data;
                if (data.deliveryTimeSlots) {
                    setSlots(data.deliveryTimeSlots);
                }
                if (data.deliveryTimeInterval) {
                    setDeliveryTimeInterval(data.deliveryTimeInterval);
                }
            } catch (err) {
                console.error(err);
                toast({ title: 'Error loading schedule', status: 'error', duration: 3000 });
            } finally {
                setLoading(false);
            }
        };
        if (laundryId) fetchSchedule();
    }, [laundryId]);

    const handleSlotChange = (day, field, value) => {
        setSlots(prev => {
            const existing = prev.find(s => s.day === day);
            if (existing) {
                return prev.map(s => s.day === day ? { ...s, [field]: value } : s);
            } else {
                return [...prev, { day, startTime: '08:00', endTime: '17:00', [field]: value }];
            }
        });
    };

    const toggleDay = (day, enabled) => {
        if (enabled) {
            setSlots(prev => [...prev, { day, startTime: '08:00', endTime: '17:00' }]);
        } else {
            setSlots(prev => prev.filter(s => s.day !== day));
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.put(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/delivery-schedule`, {
                laundryId,
                deliveryTimeSlots: slots,
                deliveryTimeInterval,
            }, {
                headers: { Authorization: `Bearer ${authToken}` }
            });
            toast({ title: 'Schedule saved!', status: 'success', duration: 3000 });
        } catch (err) {
            console.error(err);
            toast({ title: 'Error saving schedule', status: 'error', duration: 3000 });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Flex justify="center" p={8}><Spinner size="lg" /></Flex>;

    return (
        <Box p={4}>
            <Text fontSize="xl" fontWeight="bold" mb={4}>Delivery Schedule</Text>
            <Text fontSize="sm" color="gray.600" mb={4}>
                Configure which days and hours are available for pickup/delivery. Instant Uber pickup is only available during these hours.
            </Text>

            <Box mb={6} maxW="300px">
                <Text fontWeight="semibold" mb={1}>Time Slot Interval (hours)</Text>
                <Select value={deliveryTimeInterval} onChange={(e) => setDeliveryTimeInterval(Number(e.target.value))}>
                    <option value={1}>1 hour</option>
                    <option value={2}>2 hours</option>
                    <option value={3}>3 hours</option>
                    <option value={4}>4 hours</option>
                </Select>
            </Box>

            <Table variant="simple" size="sm" border="1px solid" borderColor="gray.200">
                <Thead bg="blue.50">
                    <Tr>
                        <Th>Day</Th>
                        <Th>Enabled</Th>
                        <Th>Start Time</Th>
                        <Th>End Time</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {DAYS_OF_WEEK.map(day => {
                        const slot = slots.find(s => s.day === day);
                        const enabled = !!slot;
                        return (
                            <Tr key={day}>
                                <Td fontWeight="semibold">{day}</Td>
                                <Td>
                                    <input
                                        type="checkbox"
                                        checked={enabled}
                                        onChange={(e) => toggleDay(day, e.target.checked)}
                                    />
                                </Td>
                                <Td>
                                    <Input
                                        type="time"
                                        size="sm"
                                        width="130px"
                                        value={slot?.startTime || '08:00'}
                                        isDisabled={!enabled}
                                        onChange={(e) => handleSlotChange(day, 'startTime', e.target.value)}
                                    />
                                </Td>
                                <Td>
                                    <Input
                                        type="time"
                                        size="sm"
                                        width="130px"
                                        value={slot?.endTime || '17:00'}
                                        isDisabled={!enabled}
                                        onChange={(e) => handleSlotChange(day, 'endTime', e.target.value)}
                                    />
                                </Td>
                            </Tr>
                        );
                    })}
                </Tbody>
            </Table>

            <Button colorScheme="blue" mt={4} onClick={handleSave} isLoading={saving}>
                Save Schedule
            </Button>
        </Box>
    );
};

const LaundryInfoManagement = ({ validateEmpCredentials, type, empPrefix }) => {
    const { laundryId } = useParams();
    const [servicesData, setServicesData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newServices, setNewServices] = useState([]);
    const [empId, setEmpId] = useState("");
    const [passcode, setPasscode] = useState("");
    const [productsData, setProductsData] = useState([]);
    const [newProducts, setNewProducts] = useState([]);
    const [productsToUpdate, setProductsToUpdate] = useState([]);
    const [productsToRemove, setProductsToRemove] = useState([]);
    const [isServiceEditMode, setIsServiceEditMode] = useState(false); // Edit mode for services
    const [isProductEditMode, setIsProductEditMode] = useState(false); // Edit mode for products
    const [isServiceCredentialModalOpen, setIsServiceCredentialModalOpen] = useState(false);
    const [isProductCredentialModalOpen, setIsProductCredentialModalOpen] = useState(false); 
    const [servicesToRemove, setServicesToRemove] = useState([]);
    const toast = useToast();
    const [isValidatingEmployee, setIsValidatingEmployee] = useState(false); // for the employee validation updates state
    const [isSavingInfo, setIsSavingInfo] = useState(false); // For the service, product and location updates state
    const [currentServiceLimit, setCurrentServiceLimit] = useState(10);
    const [currentProductLimit, setCurrentProductLimit] = useState(10);
    const navigate = useNavigate();

    // States for serviceable locations
    const [locationsData, setLocationsData] = useState([]);
    const [newLocations, setNewLocations] = useState([]);
    const [locationsToRemove, setLocationsToRemove] = useState([]);
    const [isLocationEditMode, setIsLocationEditMode] = useState(false);
    const [isLocationCredentialModalOpen, setIsLocationCredentialModalOpen] = useState(false);

    // States for logo and domain adding
    const [isLogoDomainEditMode, setIsLogoDomainEditMode] = useState(false);
    const [logoFile, setLogoFile] = useState(null);
    const [adminDomain, setAdminDomain] = useState("");
    const [userDomain, setUserDomain] = useState("");
    const [isSavingLogoInfo, setIsSavingLogoInfo] = useState(false);
    const [laundryLogo, setLaundryLogo] = useState(null);  
    const [isLogoDomainFetched, setIsLogoDomainFetched] = useState(false);
    const { isOpen: isLogoDomainAlertOpen, onOpen: openLogoDomainAlert, onClose: closeLogoDomainAlert } = useDisclosure();
    const cancelRef = useRef();
    const [isLogoDomainCredentialModalOpen, setIsLogoDomainCredentialModalOpen] = useState(false);
    const [isEditButtonDisabled, setIsEditButtonDisabled] = useState(false);
    const authToken = localStorage.getItem('idToken');

    // Function to open credential modal when clicking "Edit" or "Add"
    const handleEditLogoDomainClick = () => {
        if (!isEditButtonDisabled) {
            setIsLogoDomainCredentialModalOpen(true);
        }
    };
    

    // Function to verify credentials and proceed with edit
    const validateAndEnableEdit = async () => {
        setIsValidatingEmployee(true);
        try {
            const fullEmpId = empPrefix + empId
            const { isValidated, role } = await validateEmpCredentials(laundryId, fullEmpId, passcode);
            if (isValidated && ( role === "Manager" || role === "Admin" )) {
                toast({
                    title: "Access Granted",
                    description: `Role: ${role}. You may now edit the logo and domain.`,
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });

                setIsLogoDomainCredentialModalOpen(false);
                setIsLogoDomainEditMode(true);
                setIsEditButtonDisabled(true); // Disable edit button after validation
                setEmpId("");
                setPasscode("");
            } else {
                toast({
                    title: "Access Denied",
                    description: isValidated
                        ? `Your role: ${role}. Only Admins and Managers can edit this section.`
                        : "Invalid credentials. Please try again.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });
            }
        } catch (error) {
            console.error("Error validating credentials:", error);
            toast({
                title: "Error",
                description: "An error occurred while validating credentials. Please try again.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        } finally {
            setIsValidatingEmployee(false);
        }
    };
    
    // Function to save logo & domain after confirmation
    const handleSaveWithConfirmation = async () => {
        const confirmSave = window.confirm(
            "This action will overwrite the existing data, replace the logo, and update the domain. Make sure you are updating the correct values. Do you want to proceed?"
        );
    
        if (confirmSave) {
            await handleSaveLogoAndDomain();
            setIsEditButtonDisabled(false); // Re-enable edit button after save
            navigate(0); // Navigate to the same route to refresh the data
        }
    };


    // Confirms edit action and enables edit mode
    const confirmEditLogoDomain = () => {
        closeLogoDomainAlert();
        setIsLogoDomainEditMode(true);
    };

    // Handlers for Load More
    const handleLoadMoreServices = () => {
        if (currentServiceLimit < servicesData.length) {
            setCurrentServiceLimit((prevLimit) => prevLimit + 10);
        }
    };

    const handleLoadMoreProducts = () => {
        if (currentProductLimit < productsData.length) {
            setCurrentProductLimit((prevLimit) => prevLimit + 10);
        }
    };

    const handleValidateSubmit = async (type) => {
        setIsValidatingEmployee(true);
        try {
            // Validate employee credentials and get role
            const fullEmpId = empPrefix + empId
            const { isValidated, role } = await validateEmpCredentials(laundryId, fullEmpId, passcode);
    
            if (isValidated && (role === "Admin" || role === "Manager")) {
                toast({
                    title: "Validation Success",
                    description: `Access granted. Role: ${role}. You can now edit ${type}.`,
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });
    
                // Close the modal and enable editing based on type
                if (type === "services") {
                    setIsServiceCredentialModalOpen(false);
                    setIsServiceEditMode(true);
                } else if (type === "products") {
                    setIsProductCredentialModalOpen(false);
                    setIsProductEditMode(true);
                } else if (type === "locations") {
                    setIsLocationCredentialModalOpen(false);
                    setIsLocationEditMode(true);
                }
    
                // Reset credentials
                setEmpId('');
                setPasscode('');
            } else {
                const errorMessage = isValidated
                    ? `Unauthorized action. Your role: ${role}. Only Admins and Managers can edit ${type}.`
                    : `Invalid credentials for ${type}. Please try again.`;
    
                toast({
                    title: "Access Denied",
                    description: errorMessage,
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });

            }
        } catch (error) {
            console.error("Error validating employee credentials:", error);
            toast({
                title: "Validation Error",
                description: "An error occurred during validation. Please try again.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });

        }
        finally {
            // Reset credentials after success or failure
            setEmpId("");
            setPasscode("");
            setIsValidatingEmployee(false);
        }
    };

    
    // Fetch Laundry Logo & Domain Info
    const fetchLaundryLogoAndDomain = async () => {
        const authToken = localStorage.getItem('idToken');
        try {
            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`,
                {
                    params: { operation: "viewLaundryInfoById", laundryId },
                    headers: {
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                        'Authorization': `Bearer ${authToken}`
                    },
                }
            );
    
            const laundryInfo = response.data?.body?.laundryInfo?.[0] || {};
            console.log("logo info",laundryInfo.laundryLogo);
            console.log("domain: ",laundryInfo.laundryDomain);
            setLaundryLogo(laundryInfo.laundryLogo || null);
            setAdminDomain(laundryInfo.laundryDomain?.adminDomain  || "");
            setUserDomain(laundryInfo.laundryDomain?.userDomain || "");
            setIsLogoDomainFetched(true);
        } catch (error) {
            console.error("Error fetching laundry logo & domain:", error);
            setIsLogoDomainFetched(true);
        }
    };
    
    
    // useEffect(() => {
    //
    //     if (laundryId) {
    //         fetchServices(); // Trigger the fetch operation
    //     }
    // }, [laundryId]);
    
    
    useEffect(() => {
        if (laundryId ) {
            //fetchLaundryServices();
            fetchServices(); // Trigger the fetch operation
            fetchProducts(); 
            fetchLocations();
            fetchLaundryLogoAndDomain();

        }
    }, [laundryId]);
    
    const fetchServices = async () => {
        setLoading(true); // Show the loading spinner
        try {
            const services = await fetchLaundryServices(laundryId); // Call the function
            setServicesData(services); // Update state with the fetched services
        } catch (error) {
            console.error("Error fetching services:", error);
            toast({
                title: "Error",
                description: "Failed to load services. Please try again.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        } finally {
            setLoading(false); // Hide the loading spinner
        }
    };
    
    const validateServices = (services) => {
        for (const service of services) {
            if (!service.serviceName || service.serviceName.trim() === "" || !service.price || isNaN(service.price) || parseFloat(service.price) <= 0) {
                return { isValid: false, message: "Service name/price cannot be empty." };
            }
        }
        return { isValid: true };
    };
    
    // Fetch serviceable locations
    const fetchLocations = async () => {
        const authToken = localStorage.getItem('idToken');
        try {
            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`,
                {
                    params: { operation: "viewLaundryInfoById", laundryId },
                    headers: {
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                        'Authorization': `Bearer ${authToken}`
                    },
                }
            );
            setLocationsData(response.data?.body?.laundryInfo?.[0]?.serviceableZipCodes || []);
        } catch (error) {
            throw error;
        }
    };


    // Add a new location
    const handleAddLocation = () => {
        setNewLocations([...newLocations, ""]);
    };

    // Update new location value
    const handleNewLocationChange = (index, value) => {
        setNewLocations((prev) =>
            prev.map((loc, i) => (i === index ? value : loc))
        );
    };

    // Remove a new location before saving
    const handleRemoveNewLocation = (index) => {
        setNewLocations((prev) => prev.filter((_, i) => i !== index));
    };

    // Mark existing location for removal
    const handleDeleteLocation = (index) => {
        const locationToRemove = locationsData[index];
        setLocationsToRemove((prev) => [...prev, locationToRemove]);
        setLocationsData((prev) => prev.filter((_, i) => i !== index));
    };

    // Save serviceable locations
    const handleSaveLocations = async () => {

        const payload = {
            zipCodesToAdd: newLocations,
            zipCodesToRemove: locationsToRemove,
        };

        if (
            payload.zipCodesToAdd.length === 0 &&
            payload.zipCodesToRemove.length === 0
        ) {
            toast({
                title: "No Changes",
                description: "No locations were added or removed.",
                status: "info",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            setIsLocationEditMode(false);
            return;
        }
        setIsSavingInfo(true);
        try {
            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-products-services`,
                payload,
                {
                    params: { operation: "modifyServiceableZipCodes", laundryId: laundryId },
                    headers: {
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                        'Authorization': `Bearer ${authToken}`


                    },
                }
            );

            toast({
                title: "Save Successful",
                description: response.data?.body?.message || "Locations updated successfully.",
                status: "success",
                duration: 5000,
                isClosable: true,
                position: "top",
            });

            // Refresh data
            setNewLocations([]);
            setLocationsToRemove([]);
            fetchLocations();
            setIsLocationEditMode(false);
        } catch (error) {
            console.error("Error saving locations:", error);
            toast({
                title: "Save Failed",
                description: "An error occurred while saving locations.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        }
        finally {
            setIsSavingInfo(false);
        }
    };

    const handleSaveServices = async () => {

    const allServices = [...servicesData, ...newServices];

        // Validate services
        const validation = validateServices(allServices);
        if (!validation.isValid) {
            toast({
                title: "Validation Error",
                description: validation.message,
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            return;
        }
        const payload = {
            servicesToAdd: (newServices || []).map(({ serviceName, price, description, customerAccess, inputWeight }) => ({
                serviceName,
                price: parseFloat(price) || 0, // Ensure valid price
                description: description || "N/A", // Default description
                customerAccess: customerAccess ?? false, // Default to false
                inputWeight: inputWeight ?? false, // Default to false
            })),
            servicesToUpdate: (servicesData || [])
                .filter((service) => service.isModified)
                .map(({ serviceName, price, description, customerAccess, inputWeight }) => ({
                    serviceName,
                    price: parseFloat(price) || 0,
                    description: description || "N/A",
                    customerAccess: customerAccess ?? false,
                    inputWeight: inputWeight ?? false,
                })),
            servicesToRemove: servicesToRemove || [],
        };
    
        if (
            payload.servicesToAdd.length === 0 &&
            payload.servicesToUpdate.length === 0 &&
            payload.servicesToRemove.length === 0
        ) {
            toast({
                title: "No Changes",
                description: "No services were added, updated, or removed.",
                status: "info",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            setIsServiceEditMode(false);
            return;
        }
        setIsSavingInfo(true);
        try {
            const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-products-services`;
            const params = { operation: "updateServices", laundryId };
    
            const response = await axios.post(url, payload, {
                headers: {
                    // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                    'X-Amz-Date': laundryId,
                    'Authorization': `Bearer ${authToken}`

                },
                params,
            });
    
            if (response?.status === 200 && response?.data?.body?.message) {
                
                toast({
                    title: "Save Successful",
                    description: response.data.body.message,
                    status: "success",
                    duration: 5000,
                    isClosable: true,
                    position: "top",
                });
                setNewServices([]);
                setServicesToRemove([]);
                fetchServices();
                setIsServiceEditMode(false);
            } else {
                throw new Error("Unexpected API response");
            }
        } catch (error) {
            console.error("Error saving services:", error);
            toast({
                title: "Save Failed",
                description: error.response?.data?.message || "An error occurred while saving services.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        }
        finally {
            setIsSavingInfo(false);
        }
    };
        
    const handleEditService = (index, field, value) => {
        setServicesData((prev) =>
            prev.map((service, i) =>
                i === index
                    ? { ...service, [field]: field === "price" ? parseFloat(value) : value, isModified: true }
                    : service
            )
        );
    };
 
    const handleAddService = () => {
        setNewServices([
            ...newServices,
            { serviceName: "", price: "", description: "", access: [], inputWeight: false },
        ]);
    };    
    
    
    
    const handleNewServiceChange = (index, field, value) => {
        setNewServices((prev) =>
            prev.map((service, i) =>
                i === index
                    ? { ...service, [field]: field === "price" ? parseFloat(value) : value }
                    : service
            )
        );
    };
    
    const handleDeleteService = (index) => {
        const serviceToRemove = servicesData[index].serviceName;
        setServicesToRemove((prev) => [...prev, serviceToRemove]);
        setServicesData((prev) => prev.filter((_, i) => i !== index));
    };
    
    const handleRemoveNewService = (index) => {
        setNewServices((prev) => prev.filter((_, i) => i !== index));
    };
    
    const fetchProducts = async () => {
        setLoading(true);
        try {
            const products = await fetchLaundryProducts(laundryId);
            setProductsData(products);
            // console.log("products from laundry shop", products);
        } catch (error) {
            console.error("Error fetching products:", error);
            toast({
                title: "Error",
                description: "Failed to load services. Please try again.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            setProductsData([]);
        } finally {
            setLoading(false);
        }
    };
    
    // Add a new product to the "newProducts" list
    const handleAddProduct = () => {
        setNewProducts([
            ...newProducts,
            {
                productName: "",
                price: "", // Initialize as an empty string
                description: "",
                customerAccess: false, // Default to false
            },
        ]);
    };

    // Handle changes to fields in "newProducts"
    const handleNewProductChange = (index, field, value) => {
        const updatedProducts = [...newProducts];
        updatedProducts[index][field] =
            field === "price" ? parseFloat(value) || "" : 
            field === "customerAccess" ? value === "true" : value;
        setNewProducts(updatedProducts);
    };

    const handleEditProduct = (index, field, value) => {
        // Clone the productsData to avoid direct mutation
        const updatedProducts = [...productsData];

        // Handle the customerAccess toggle and other fields
        if (field === "price") {
            updatedProducts[index][field] = parseFloat(value) || ""; // Ensure price is a valid float
        } else if (field === "customerAccess") {
            updatedProducts[index][field] = value === "true"; // Convert "true"/"false" string to boolean
        } else {
            updatedProducts[index][field] = value; // Update other fields as is
        }

        // Update the state for productsData
        setProductsData(updatedProducts);

        // Track product updates in productsToUpdate
        const productName = updatedProducts[index]?.productName;

        setProductsToUpdate((prev) => {
            const existingUpdate = prev.find((prod) => prod.productName === productName);
            if (existingUpdate) {
                // Update the existing product in productsToUpdate
                return prev.map((prod) =>
                    prod.productName === productName
                        ? { ...prod, [field]: updatedProducts[index][field] }
                        : prod
                );
            } else {
                // Add a new product update if not already in productsToUpdate
                return [
                    ...prev,
                    { productName, [field]: updatedProducts[index][field] },
                ];
            }
        });
    };

    // Handle deleting a product from "productsData"
    const handleDeleteProduct = (index) => {
        const productToRemove = productsData[index];
        if (productToRemove?.productName) {
            setProductsToRemove((prev) => [...prev, productToRemove.productName]);
            setProductsData((prev) => prev.filter((_, i) => i !== index));
        } else {
            console.error("Error: Product name is missing for deletion.");
        }
    };

    const validateProducts = (products) => {
        for (const product of products) {

            if (
                !product.productName || // Check if product name is not provided
                typeof product.productName !== "string" || // Check if product name is not a string
                product.productName.trim() === "" || // Check if product name is an empty string
                product.price === undefined || // Check if price is not provided
                product.price === null || // Check if price is explicitly set to null
                product.price === "" || // Check if price is an empty string
                isNaN(Number(product.price)) || // Check if price is not a valid number
                parseFloat(product.price) <= 0 // Check if price is less than or equal to zero
            ) {
                console.log("Invalid product:", product);
                const errorMessage =
                    !product.productName || product.productName.trim() === ""
                        ? "Product name is required and cannot be empty."
                        : product.price === undefined || product.price === null || product.price === ""
                        ? "Product price is required and cannot be empty."
                        : isNaN(Number(product.price)) || parseFloat(product.price) <= 0
                        ? "Product price must be a valid positive number."
                        : "Invalid product data.";
            
                return { isValid: false, message: errorMessage };
            }
            
            
            
        }
        return { isValid: true };
    };
    
    
    const handleSaveProducts = async () => {
        const allProducts = [...productsData, ...newProducts];

        // Validate services
        if(newProducts.length > 0){
            // console.log("new products: ", newProducts);
        const validation = validateProducts(allProducts);
        // console.log("product validation:", validation);
        if (!validation.isValid) {
            toast({
                title: "Validation Error",
                description: validation.message,
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            return;
        }
    }

        const baseUrl = `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-products`;
        const params = { operation: "updateProducts", laundryId:laundryId };

        const payload = {
            productsToAdd: newProducts,
            productsToUpdate,
            productsToRemove,
        };

        // console.log("payload items: ", payload);
        setIsSavingInfo(true);
        try {
            const response = await axios.post(baseUrl, payload, {
                params,
                headers: {
                    // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                    'Authorization': `Bearer ${authToken}`

                },
            });
            const { message } = response.data.body;

            if (newProducts.length > 0 || productsToUpdate.length > 0 || productsToRemove.length > 0) {
                // Changes were made
                toast({
                    title: "Save Successful",
                    description: message,
                    status: "success",
                    duration: 5000,
                    isClosable: true,
                    position: "top",
                });
            } else {
                // No changes
                toast({
                    title: "No Changes",
                    description: "No products were added, updated, or removed.",
                    status: "info",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });
            }

            // Reset states after save
            setNewProducts([]);
            setProductsToUpdate([]);
            setProductsToRemove([]);
            fetchProducts();
            setIsProductEditMode(false); // Exit product edit mode
        } catch (error) {
            console.error("Error saving products:", error);
            toast({
                title: "Save Failed",
                description: "An error occurred while saving products.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        } finally {
            setIsSavingInfo(false);
            setEmpId("");
            setPasscode("");
        }
    };

    if (loading) {
        return (
            <Flex justifyContent="center" alignItems="center" height="200px">
                <Spinner size="xl" color="blue.500" />
            </Flex>
        );
    }

    if (servicesData.length === 0) {
        return <Text>Loading...</Text>;
    }

    const handleRemoveNewProduct = (index) => {
        setNewProducts((prev) => prev.filter((_, i) => i !== index));
    };

    // Handle File Upload
    const handleLogoUpload = (event) => {
        const file = event.target.files[0];
        setLogoFile(file);
    };

    // Handle Domain Change
    const handleAdminDomainChange = (event) => {
        setAdminDomain(event.target.value);
    };

    const handleUserDomainChange = (event) => {
        setUserDomain(event.target.value);
    };

    // Convert Image to Base64
    const convertToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(",")[1]); // Extract Base64 part
            reader.onerror = (error) => reject(error);
        });
    };

    // Handle Save Logo & Domain
    const handleSaveLogoAndDomain = async () => {
        if (!logoFile && !adminDomain && !userDomain) {
            toast({
                title: "Error",
                description: "At least one of logo or domain must be provided.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            return;
        }

        setIsSavingInfo(true);

        try {
            let base64Image = null;
            if (logoFile) {
                base64Image = await convertToBase64(logoFile);
            }

            const payload = {
                imageBase64: base64Image,
                laundryDomain: {
                    adminDomain: adminDomain || null,
                    userDomain: userDomain || null
                }
            };

            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-products-services`,
                payload,
                {
                    params: { operation: "updateLaundryInfo", laundryId: laundryId },
                    headers: {
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                        'Authorization': `Bearer ${authToken}`

                    },
                }
            );

            if (response.status === 200) {
                toast({
                    title: "Success",
                    description: "Laundry info updated successfully!",
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });
                setIsLogoDomainEditMode(false);
            } else {
                throw new Error(response.data.error || "Failed to update.");
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message,
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        } finally {
            setIsSavingInfo(false);
        }
    };
    

    return (
        <Box 
            overflowX="auto" 
            mt={4} 
            bg = "white"
        >
        
        <Flex justify="space-between" alignItems="center" mb={4}>
            {type === "services" ? (
                isServiceEditMode ? (
                    <Flex>
                        <Button
                            colorScheme="green"
                            mr={4}
                            onClick={handleSaveServices}
                            isLoading={isSavingInfo}
                        >
                            Save Services
                        </Button>
                        <IconButton
                            aria-label="Add Service"
                            icon={<AddIcon />}
                            colorScheme="teal"
                            onClick={handleAddService}
                        />
                    </Flex>
                ) : (
                    <Button
                        colorScheme="teal"
                        onClick={() => setIsServiceCredentialModalOpen(true)}
                    >
                        Edit Services
                    </Button>
                )
            ) : type === "products" ? (
                isProductEditMode ? (
                    <Flex>
                        <Button
                            colorScheme="green"
                            mr={4}
                            onClick={handleSaveProducts}
                            isLoading={isSavingInfo}
                        >
                            Save Products
                        </Button>
                        <IconButton
                            aria-label="Add Product"
                            icon={<AddIcon />}
                            colorScheme="teal"
                            onClick={handleAddProduct}
                        />
                    </Flex>
                ) : (
                    <Button
                        colorScheme="teal"
                        onClick={() => setIsProductCredentialModalOpen(true)}
                    >
                        Edit Products
                    </Button>
                )
            ) : type === "zipCodes" ? (
                isLocationEditMode ? (
                    <Flex>
                        <Button
                            colorScheme="green"
                            mr={4}
                            onClick={handleSaveLocations}
                            isLoading={isSavingInfo}
                        >
                            Save Locations
                        </Button>
                        <IconButton
                            aria-label="Add Location"
                            icon={<AddIcon />}
                            colorScheme="teal"
                            onClick={handleAddLocation}
                        />
                    </Flex>
                ) : (
                    <Button
                        colorScheme="teal"
                        onClick={() => setIsLocationCredentialModalOpen(true)}
                    >
                        Edit Locations
                    </Button>
                )
            ) : type === "logoAndDomain" ? (
                isLogoDomainFetched ? (
                    <Box p={4}>
                        <Flex alignItems="center" mb={4}>
                            <Text fontSize="lg" fontWeight="bold" mr={4}>Laundry Logo:</Text>
                            {laundryLogo ? (
                                <img src={laundryLogo} alt="Laundry Logo" width="150" height="150" style={{ borderRadius: "5px" }} />
                            ) : (
                                <Text color="gray.500">No Logo Available</Text>
                            )}
                        </Flex>
            
                        <Flex alignItems="center" mb={4}>
                            <Text fontSize="lg" fontWeight="bold" mr={4}>Laundry Domain:</Text>
                            <Box>
                                {adminDomain && <Text fontSize="md"><b>Admin:</b> {adminDomain}</Text>}
                                {userDomain && <Text fontSize="md"><b>User:</b> {userDomain}</Text>}
                                {!adminDomain && !userDomain && <Text color="gray.500">No Domain Available</Text>}
                            </Box>
                        </Flex>
            
                        <Box>
                        {/* Button that triggers credential validation before editing */}
                        <Button colorScheme="teal" onClick={handleEditLogoDomainClick} isDisabled={isEditButtonDisabled}>
                            {laundryLogo || adminDomain || userDomain ? "Edit Logo & Domain" : "Add Logo & Domain"}
                        </Button>
                        <Text fontSize="sm" color="red.500" fontWeight="bold" mt={1}>
                            * Manager Access Only
                        </Text>
                        </Box>

                        {/* Credential Modal for Logo & Domain Edit */}
                        <ReusableModal
                            isOpen={isLogoDomainCredentialModalOpen}
                            onClose={() => {
                                setIsLogoDomainCredentialModalOpen(false);
                                setEmpId("");
                                setPasscode("");
                            }}
                            title="Enter Credentials to Edit Logo & Domain"
                            footerButtons={[
                                {
                                    label: "Submit",
                                    onClick: validateAndEnableEdit,
                                    colorScheme: "blue",
                                    isLoading: isValidatingEmployee,
                                },
                                {
                                    label: "Cancel",
                                    onClick: () => {
                                        setIsLogoDomainCredentialModalOpen(false);
                                        setEmpId("");  // Reset Employee ID
                                        setPasscode(""); // Reset Passcode
                                    },
                                    variant: "ghost",
                                },
                            ]}
                        >
                            
                            <InputGroup mb={4}>
                                <InputLeftAddon>{empPrefix}</InputLeftAddon>
                                <Input
                                    placeholder="EmpId"
                                    value={empId}
                                    onChange={(e) => setEmpId(e.target.value)}
                                />
                            </InputGroup>
                            <Input
                                placeholder="Passcode"
                                type="password"
                                value={passcode}
                                onChange={(e) => setPasscode(e.target.value)}
                            />
                        </ReusableModal>
            
                        {/* Form for Editing Logo and Domain (Only shown after validation) */}
                        {isLogoDomainEditMode && (
                            <Box p={4} mt={3}>
                                <Flex direction="column" gap={3}>
                                    <Box>
                                        <Text fontSize="md" fontWeight="bold">Upload Laundry Logo</Text>
                                        <Input type="file" accept="image/*" onChange={handleLogoUpload} />
                                    </Box>
            
                                    {/* <Box>
                                        <Text fontSize="md" fontWeight="bold">Admin Domain</Text>
                                        <Input placeholder="Enter Admin Domain" value={adminDomain} onChange={handleAdminDomainChange} />
                                    </Box> */}
                                    <Box>
                                        <Text fontSize="md" fontWeight="bold">Admin Domain</Text>
                                        <Input 
                                            placeholder="Enter Admin Domain" 
                                            value={isLogoDomainEditMode ? "" : adminDomain} 
                                            onChange={handleAdminDomainChange} 
                                        />
                                    </Box>
                                                
                                    <Box>
                                        <Text fontSize="md" fontWeight="bold">User Domain</Text>
                                        <Input 
                                            placeholder="Enter User Domain" 
                                            value={isLogoDomainEditMode ? "" : userDomain} 
                                            onChange={handleUserDomainChange} 
                                        />
                                    </Box>
            
                                    <Flex mt={3}>
                                        <Button colorScheme="green" mr={4} onClick={handleSaveWithConfirmation} isLoading={isSavingInfo} isDisabled={!logoFile && !adminDomain && !userDomain}>
                                            Save
                                        </Button>
                                        <Button colorScheme="red" onClick={() => {
                                            setIsLogoDomainEditMode(false);
                                            setIsEditButtonDisabled(false); // Re-enable edit button after cancel
                                        }}>
                                            Cancel
                                        </Button>
                                    </Flex>
                                </Flex>
                            </Box>
                        )}
                    </Box>
                ) : (
                    <Text>Loading...</Text>
                )
            ) : null }
            
        

        </Flex>

            {/* Delivery Schedule */}
            {type === "deliverySchedule" && (
                <DeliveryScheduleSection laundryId={laundryId} />
            )}

            {/* Table for Services */}
            {type === "services" && (              
                <>
                    <Table variant="simple" size="sm" colorScheme="blue" border="1px solid" borderColor="gray.200">
                        <Thead bg="#EBF8FF">
                            <Tr>
                                <Th fontWeight="bold" fontSize="md">Service Name</Th>
                                <Th fontWeight="bold" fontSize="md" isNumeric>Price</Th>
                                <Th fontWeight="bold" fontSize="md">Customer Access</Th>
                                <Th fontWeight="bold" fontSize="md">Description</Th>
                                <Th fontWeight="bold" fontSize="md">Input Weight</Th>
                                {isServiceEditMode && <Th fontWeight="bold" fontSize="md">Actions</Th>}
                            </Tr>
                        </Thead>
                        <Tbody bg="#F7FAFC">
  {/* Newly added services first */}
  {isServiceEditMode &&
    (newServices || []).map((service, index) => (
      <Tr key={`new-${index}`}>
        <Td>
          <Input
            size="sm"
            placeholder="Service Name"
            value={service.serviceName || ""}
            onChange={(e) => handleNewServiceChange(index, "serviceName", e.target.value)}
          />
        </Td>
        <Td isNumeric>
          <Input
            size="sm"
            placeholder="Price"
            type="number"
            value={service.price || ""}
            onChange={(e) => handleNewServiceChange(index, "price", e.target.value)}
          />
        </Td>
        <Td>
          <select
            value={service.customerAccess ? "true" : "false"}
            onChange={(e) => handleNewServiceChange(index, "customerAccess", e.target.value === "true")}
            style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </Td>
        <Td>
          <Input
            size="sm"
            placeholder="Description"
            value={service.description || ""}
            onChange={(e) => handleNewServiceChange(index, "description", e.target.value)}
          />
        </Td>
        <Td>
          <select
            value={service.inputWeight ? "true" : "false"}
            onChange={(e) => handleNewServiceChange(index, "inputWeight", e.target.value === "true")}
            style={{ padding: "0.25rem", fontSize:"0.875rem", width: "100%" }}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </Td>
        <Td>
          <IconButton
            icon={<DeleteIcon />}
            colorScheme="red"
            aria-label="Delete New Service"
            size="sm"
            onClick={() => handleRemoveNewService(index)}
          />
        </Td>
      </Tr>
    ))
  }

  {/* Existing services second */}
  {servicesData.slice(0, currentServiceLimit).map((service, index) => (
    <Tr key={index} _hover={{ bg: "blue.50" }} borderBottom="1px solid" borderColor="gray.200">
      <Td fontSize="sm">{service.serviceName}</Td>
      <Td fontSize="sm" isNumeric>
        {isServiceEditMode ? (
          <Input
            size="sm"
            type="number"
            value={service.price || ""}
            placeholder="Enter Price"
            onChange={(e) => handleEditService(index, "price", e.target.value)}
          />
        ) : (
          `$${service.price || "0.00"}`
        )}
      </Td>
      <Td fontSize="sm">
        {isServiceEditMode ? (
          <select
            value={service.customerAccess ? "true" : "false"}
            onChange={(e) =>
              handleEditService(index, "customerAccess", e.target.value === "true")
            }
            style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        ) : (
          service.customerAccess ? "True" : "False"
        )}
      </Td>
      <Td fontSize="sm">
        {isServiceEditMode ? (
          <Input
            size="sm"
            value={service.description || ""}
            placeholder="Enter Description"
            onChange={(e) => handleEditService(index, "description", e.target.value)}
          />
        ) : (
          service.description || "N/A"
        )}
      </Td>
      <Td fontSize="sm">
        {isServiceEditMode ? (
          <select
            value={service.inputWeight ? "true" : "false"}
            onChange={(e) =>
              handleEditService(index, "inputWeight", e.target.value === "true")
            }
            style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        ) : (
          service.inputWeight ? "True" : "False"
        )}
      </Td>
      {isServiceEditMode && (
        <Td>
          <IconButton
            icon={<DeleteIcon />}
            colorScheme="red"
            aria-label="Delete Service"
            size="sm"
            onClick={() => handleDeleteService(index)}
          />
        </Td>
      )}
    </Tr>
  ))}
</Tbody>

                    </Table>

                    {currentServiceLimit < servicesData.length && (
                        <Flex justifyContent="center" mt={4}>
                            <Button colorScheme="blue" onClick={handleLoadMoreServices}>
                                Load More Services
                            </Button>
                        </Flex>
                    )}
                    
                </>
            )} 
            {type === "products" &&(
                <>
                
                    {/* Table for Products */}

                    <Table variant="simple" size="sm" colorScheme="blue" border="1px solid" borderColor="gray.200">
                    <Thead bg="#EBF8FF">
                        <Tr>
                        <Th fontWeight="bold" fontSize="md">Product Name</Th>
                        <Th fontWeight="bold" fontSize="md" isNumeric>Price</Th>
                        <Th fontWeight="bold" fontSize="md">Description</Th>
                        <Th fontWeight="bold" fontSize="md">Customer Access</Th>
                        {isProductEditMode && <Th fontWeight="bold" fontSize="md">Actions</Th>}
                        </Tr>
                    </Thead>
                    <Tbody bg="#F7FAFC">
                    {isProductEditMode && newProducts.map((product, index) => (
                        <Tr key={`new-${index}`} _hover={{ bg: "green.50" }}>
                            <Td>
                                <Input
                                    size="sm"
                                    placeholder="Product Name"
                                    value={product.productName}
                                    onChange={(e) =>
                                        handleNewProductChange(index, "productName", e.target.value)
                                    }
                                />
                            </Td>
                            <Td isNumeric>
                                <Input
                                    size="sm"
                                    placeholder="Price"
                                    type="number"
                                    value={product.price}
                                    onChange={(e) =>
                                        handleNewProductChange(index, "price", e.target.value)
                                    }
                                />
                            </Td>
                            <Td>
                                <Input
                                    size="sm"
                                    placeholder="Description"
                                    value={product.description}
                                    onChange={(e) =>
                                        handleNewProductChange(index, "description", e.target.value)
                                    }
                                />
                            </Td>
                            <Td>
                                <Select
                                    size="sm"
                                    value={product.customerAccess ? "true" : "false"}
                                    onChange={(e) =>
                                        handleNewProductChange(index, "customerAccess", e.target.value === "true")
                                    }
                                >
                                    <option value="true">True</option>
                                    <option value="false">False</option>
                                </Select>
                            </Td>
                            <Td>
                                <IconButton
                                    icon={<DeleteIcon />}
                                    colorScheme="red"
                                    aria-label="Delete New Product"
                                    size="sm"
                                    onClick={() => handleRemoveNewProduct(index)}
                                    _hover={{ bg: "red.600" }}
                                    ml={2}
                                />
                            </Td>
                        </Tr>
                    ))}
                    
                        {/* Existing Products */}
                        {productsData.slice(0, currentProductLimit).map((product, index) => (
                        <Tr key={index} _hover={{ bg: "green.50" }}>
                            <Td fontSize="sm">{product.productName}</Td>
                            <Td fontSize="sm" isNumeric>
                            {isProductEditMode ? (
                                <Input
                                size="sm"
                                type="number"
                                value={product.price}
                                placeholder="Enter Price"
                                onChange={(e) => handleEditProduct(index, "price", e.target.value)}
                                />
                            ) : (
                                `$${product.price}`
                            )}
                            </Td>
                            <Td fontSize="sm">
                            {isProductEditMode ? (
                                <Input
                                size="sm"
                                value={product.description}
                                placeholder="Enter Description"
                                onChange={(e) => handleEditProduct(index, "description", e.target.value)}
                                />
                            ) : (
                                product.description
                            )}
                            </Td>
                            <Td fontSize="sm">
                                {isProductEditMode ? (
                                    <Select
                                        size="sm"
                                        value={product.customerAccess ? "true" : "false"} // Set the selected value
                                        onChange={(e) => handleEditProduct(index, "customerAccess", e.target.value)} // Handle selection changes
                                    >
                                        <option value="true">True</option>
                                        <option value="false">False</option>
                                    </Select>
                                ) : (
                                    <Text>{product.customerAccess ? "Yes" : "No"}</Text> // Display "Yes" for true and "No" for false
                                )}
                            </Td>

                            {isProductEditMode && (
                            <Td>
                                <IconButton
                                icon={<DeleteIcon />}
                                colorScheme="red"
                                aria-label="Delete Product"
                                size="sm"
                                onClick={() => handleDeleteProduct(index)}
                                _hover={{ bg: "red.600" }}
                                ml={2}
                                />
                            </Td>
                            )}
                        </Tr>
                        ))}
                        
                    

                    </Tbody>
                    </Table>

                    {currentProductLimit < productsData.length && (
                        <Flex justifyContent="center" mt={4}>
                            <Button colorScheme="blue" onClick={handleLoadMoreProducts}>
                                Load More Products
                            </Button>
                        </Flex>
                    )}

                    
                </>
            )}        
            {type === "zipCodes" && (
                <>
                    <Table variant="simple" size="sm" colorScheme="blue">
                        <Thead bg="#EBF8FF">
                            <Tr>
                                <Th>Serviceable Zip Codes</Th>
                                {isLocationEditMode && <Th>Actions</Th>}
                            </Tr>
                        </Thead>
                        <Tbody bg="#F7FAFC">
                            {/* Existing locations */}
                            {locationsData.map((location, index) => (
                                <Tr key={index}>
                                    <Td>{location}</Td>
                                    {isLocationEditMode && (
                                        <Td>
                                            <IconButton
                                                icon={<DeleteIcon />}
                                                colorScheme="red"
                                                aria-label="Delete Location"
                                                size="sm"
                                                onClick={() => handleDeleteLocation(index)}
                                            />
                                        </Td>
                                    )}
                                </Tr>
                            ))}

                            {/* New locations */}
                            {isLocationEditMode &&
                                newLocations.map((location, index) => (
                                    <Tr key={`new-${index}`}>
                                        <Td>
                                            <Input
                                                size="sm"
                                                placeholder="Enter Zip Code"
                                                value={location}
                                                onChange={(e) =>
                                                    handleNewLocationChange(index, e.target.value)
                                                }
                                            />
                                        </Td>
                                        <Td>
                                            <IconButton
                                                icon={<DeleteIcon />}
                                                colorScheme="red"
                                                aria-label="Delete New Location"
                                                size="sm"
                                                onClick={() => handleRemoveNewLocation(index)}
                                            />
                                        </Td>
                                    </Tr>
                                ))}
                        </Tbody>
                    </Table>
                </>
            )}

            {/* Credential Modal for Services */}
            <ReusableModal
                isOpen={isServiceCredentialModalOpen}
                onClose={() => {
                    setIsServiceCredentialModalOpen(false);
                    setEmpId("");
                    setPasscode("");
                }}
                title="Enter Credentials for Service Edit"
                footerButtons={[
                    {
                        label: "Submit",
                        onClick: () => handleValidateSubmit("services"),
                        colorScheme: "blue",
                        isLoading: isValidatingEmployee,
                    },
                    {
                        label: "Cancel",
                        onClick: () => {
                            setIsServiceCredentialModalOpen(false);
                            setEmpId("");  // Reset Employee ID
                            setPasscode(""); // Reset Passcode
                        },
                        variant: "ghost",
                    },
                ]}
            >
                <InputGroup mb={4}>
                    <InputLeftAddon>{empPrefix}</InputLeftAddon>
                    <Input
                        placeholder="EmpId"
                        value={empId}
                        onChange={(e) => setEmpId(e.target.value)}
                    />
                </InputGroup>
                <Input
                    placeholder="Passcode"
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                />
            </ReusableModal>

            {/* Credential Modal for Products */}
            <ReusableModal
                isOpen={isProductCredentialModalOpen}
                onClose={() => {
                    setIsProductCredentialModalOpen(false);
                    setEmpId("");
                    setPasscode("");
                }}
                title="Enter Credentials for Product Edit"
                footerButtons={[
                    {
                        label: "Submit",
                        onClick: () => handleValidateSubmit("products"),
                        colorScheme: "blue",
                        isLoading: isValidatingEmployee,
                    },
                    {
                        label: "Cancel",
                        onClick: () => {
                            setIsProductCredentialModalOpen(false);
                            setEmpId("");  // Reset Employee ID
                            setPasscode(""); // Reset Passcode
                        },
                        variant: "ghost",
                    },

                ]}
            >
                <InputGroup mb={4}>
                    <InputLeftAddon>{empPrefix}</InputLeftAddon>
                    <Input
                        placeholder="EmpId"
                        value={empId}
                        onChange={(e) => setEmpId(e.target.value)}
                    />
                </InputGroup>
                <Input
                    placeholder="Passcode"
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                />
            </ReusableModal>

            {/* Add a new credential modal for locations */}
            <ReusableModal
                isOpen={isLocationCredentialModalOpen}
                onClose={() => {
                    setIsLocationCredentialModalOpen(false);
                    setEmpId("");
                    setPasscode("");
                }}
                title="Enter Credentials for Location Edit"
                footerButtons={[
                    {
                        label: "Submit",
                        onClick: () => handleValidateSubmit("locations"),
                        colorScheme: "blue",
                        isLoading: isValidatingEmployee,
                    },
                    {
                        label: "Cancel",
                        onClick: () => {
                            setIsLocationCredentialModalOpen(false);
                            setEmpId("");  // Reset Employee ID
                            setPasscode(""); // Reset Passcode
                        },
                        variant: "ghost",
                    },
                ]}
            >
                <InputGroup mb={4}>
                    <InputLeftAddon>{empPrefix}</InputLeftAddon>
                    <Input
                        placeholder="EmpId"
                        value={empId}
                        onChange={(e) => setEmpId(e.target.value)}
                    />
                </InputGroup>
                <Input
                    placeholder="Passcode"
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                />
            </ReusableModal>
        </Box>
    );

};

export default LaundryInfoManagement;
