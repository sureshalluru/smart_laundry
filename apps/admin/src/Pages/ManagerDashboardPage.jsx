import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
    Accordion,
    Wrap,
    AccordionItem,
    AccordionButton,
    AccordionPanel,
    AccordionIcon,
    Box,
    Button,
    HStack,
    VStack,
    Heading,
    Text,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    Flex,
    Spinner,
    IconButton,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    FormControl,
    FormLabel,
    Input,
    FormErrorMessage,
    Menu,
    MenuButton,
    MenuList,
    MenuItem,
    Divider,
    Select,
    useToast,
    useDisclosure,
    Grid,
    GridItem,
    Switch,
    WrapItem,
    InputGroup,
    InputLeftElement,
    InputRightElement,
    Badge,
    Avatar,
    SimpleGrid
} from "@chakra-ui/react";
import EmployeeTipTab from "./EmployeeTipTab";
import SMSMarketingTab from '../Components/AdminHome/SMSMarketingTab';
import { GoogleMap, LoadScript, Marker, Autocomplete } from '@react-google-maps/api';
import { DeleteIcon, EditIcon, CheckIcon, SearchIcon, CloseIcon, EmailIcon, ChevronDownIcon, RepeatIcon, PhoneIcon} from "@chakra-ui/icons";
import axios from "axios";
import { useParams } from "react-router-dom";
import { format, startOfWeek, parseISO } from "date-fns";

const ManagerDashboardPage = () => {
    const { laundryId } = useParams();
    const toast = useToast();
    const REACT_APP_GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;


    // Tab state: "employee" or "customer"
    const [activeTab, setActiveTab] = useState("employee");

    // EMPLOYEE MANAGEMENT
    const [employees, setEmployees] = useState([]);
    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const [employeeToDelete, setEmployeeToDelete] = useState(null);
    const authToken = localStorage.getItem('idToken');
    const roles = [
        "Admin",
        "Manager",
        "Employee",
        "Driver",
    ];
    // Filter roles based on current user's role — Manager can only add Employee and Driver
    const currentUserRole = localStorage.getItem('empRole') || 'Employee';
    const availableRoles = currentUserRole === 'Admin' ? roles : roles.filter(r => r === 'Employee' || r === 'Driver');
    const [isAdding, setIsAdding] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [loadingNotifications, setLoadingNotifications] = useState({});
    const [newEmp, setNewEmp] = useState({
        firstName: "",
        lastName: "",
        joiningDate: "",
        role: "",
        phone: "",
        email: "",
        address: {
            street: "",
            city: "",
            state: "",
            country: "",
            zipCode: "",
        },
        laundryId,
    });
    const [errors, setErrors] = useState({});

    const {
        isOpen: isAddEmpModalOpen,
        onOpen: onAddEmpModalOpen,
        onClose: onAddEmpModalClose,
    } = useDisclosure();

    const {
        isOpen: isDeleteEmpModalOpen,
        onOpen: onDeleteEmpModalOpen,
        onClose: onDeleteEmpModalClose,
    } = useDisclosure();

    // Fetch Employees
    useEffect(() => {
        if (activeTab === "employee") {
            fetchEmployees();
        }
    }, [activeTab, laundryId]);

    const fetchEmployees = async () => {
        setLoadingEmployees(true);
        try {
            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/show-all-employees`,
                {
                    params: {
                        operation: "showAllEmployees",
                        laundryId,
                    },
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY,
                    },
                }
            );

            const employeesData = response.data.body.employees.map((emp) => ({
                employeeId: emp.employeeId,
                fullName: emp.fullName,
                contact: {
                    email: emp.contact.email,
                    phone: emp.contact.phone,
                },
                laundryId: emp.laundryId,
                joiningDate: emp.joiningDate,
                role: emp.role,
            }));
            setEmployees(employeesData);
        } catch (error) {
            console.error("Error fetching employees:", error);
            toast({
                title: "Error fetching employees",
                description: "Could not retrieve employee list.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoadingEmployees(false);
        }
    };


    // Employee Form Validation
    const validateField = (fieldName, value) => {
        let error = "";

        switch (fieldName) {
            case "firstName":
                if (!value) error = "First Name is required.";
                else if (value.length < 2)
                    error = "First Name must be at least 2 characters.";
                break;
            case "lastName":
                if (!value) error = "Last Name is required.";
                else if (value.length < 2)
                    error = "Last Name must be at least 2 characters.";
                break;
            case "joiningDate":
                if (!value) error = "Joining Date is required.";
                break;
            case "role":
                if (!value) error = "Role is required.";
                break;
            case "phone":
                const phoneRegex = /^\d{10}$/;
                if (!value) error = "Phone number is required.";
                else if (!phoneRegex.test(value))
                    error = "Phone number must be exactly 10 digits.";
                break;
            case "email":
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!value) error = "Email is required.";
                else if (!emailRegex.test(value))
                    error = "Please enter a valid email address.";
                break;
            case "address.street":
            case "address.city":
            case "address.state":
            case "address.country":
            case "address.zipCode":
                if (!value) error = "This field is required.";
                break;
            default:
                break;
        }

        setErrors((prev) => ({
            ...prev,
            [fieldName]: error,
        }));

        return !error;
    };

    const validateForm = () => {
        let isValid = true;

        for (const field in newEmp) {
            if (field === "address") {
                for (const subField in newEmp.address) {
                    const valid = validateField(
                        `address.${subField}`,
                        newEmp.address[subField]
                    );
                    if (!valid) isValid = false;
                }
            } else {
                const valid = validateField(field, newEmp[field]);
                if (!valid) isValid = false;
            }
        }

        return isValid;
    };

    const handleChange = (field, value) => {
        if (field.includes("address")) {
            const addressField = field.split(".")[1];
            setNewEmp((prev) => ({
                ...prev,
                address: {
                    ...prev.address,
                    [addressField]: value,
                },
            }));
            validateField(field, value);
        } else {
            setNewEmp((prev) => ({ ...prev, [field]: value }));
            validateField(field, value);
        }
    };

    // Add Employee
    const handleAddEmployee = async () => {
        if (!validateForm()) {
            toast({
                title: "Validation Errors",
                description: "Please correct the errors before submitting.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            return;
        }

        setIsAdding(true);
        try {
            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/create-employee`,
                newEmp,
                {
                    params: {
                        operation: "createEmployee",
                    },
                    headers: {
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY,
                        'X-Amz-Date': laundryId,
                        'Authorization': `Bearer ${authToken}`
                    },
                }
            );

            const { createdEmployees, failedEmployees } = response.data.body;

            // Check for failed employees
            if (failedEmployees && failedEmployees.length > 0) {
                failedEmployees.forEach((failed) => {
                    toast({
                        title: "Error adding employee.",
                        description: `${failed.error}: ${
                            failed.data.email ? failed.data.email : "No Email Provided"
                        }`,
                        status: "error",
                        duration: 5000,
                        isClosable: true,
                    });
                });
                return;
            }

            const createdEmployee = createdEmployees?.[0];
            if (!createdEmployee || !createdEmployee.empId) {
                throw new Error("Invalid API response: empId is missing");
            }

            // Update state
            setEmployees((prev) => [
                ...prev,
                {
                    employeeId: createdEmployee.empId,
                    fullName: `${newEmp.firstName} ${newEmp.lastName}`,
                    contact: {
                        email: createdEmployee.email,
                        phone: newEmp.phone,
                    },
                    laundryId: newEmp.laundryId,
                    joiningDate: newEmp.joiningDate,
                    role: newEmp.role,
                },
            ]);

            toast({
                title: "Employee added successfully.",
                description: `Employee ID: ${createdEmployee.empId}`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });

            // Reset form & close modal
            onAddEmpModalClose();
            setNewEmp({
                firstName: "",
                lastName: "",
                joiningDate: "",
                role: "",
                phone: "",
                email: "",
                address: {
                    street: "",
                    city: "",
                    state: "",
                    country: "",
                    zipCode: "",
                },
                laundryId,
            });
            setErrors({});
        } catch (error) {
            console.error("Error adding employee:", error);
            toast({
                title: "Error adding employee.",
                description: error.message || "Please try again later.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsAdding(false);
        }
    };


    // Delete Employee
    const handleDeleteEmployee = async () => {
        if (!employeeToDelete) return;
        setIsDeleting(true);
        try {
            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/create-employee`,
                { empId: employeeToDelete.employeeId },
                {
                    params: {
                        operation: "deleteEmployee",
                        laundryId: laundryId,
                    },
                    headers: {
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY,
                        'Authorization': `Bearer ${authToken}`
                    },
                }
            );

            toast({
                title: "Employee Deleted",
                description: response.data.body.message,
                status: "success",
                duration: 5000,
                isClosable: true,
            });

            // Update state
            setEmployees((prev) =>
                prev.filter((emp) => emp.employeeId !== employeeToDelete.employeeId)
            );

            setEmployeeToDelete(null);
            onDeleteEmpModalClose();
        } catch (error) {
            console.error("Error deleting employee:", error);
            toast({
                title: "Error Deleting Employee",
                description:
                    error.response?.data?.message || "An error occurred. Please try again.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            onDeleteEmpModalClose();
        } finally {
            setIsDeleting(false);
        }
    };

    // Send Notification (Employee Credentials)
    const handleSendNotification = async (empId) => {
        setLoadingNotifications((prev) => ({ ...prev, [empId]: true }));
        try {
            await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/show-all-employees`,
                {
                    params: {
                        operation: "sendEmpCredentials",
                        empId,
                        laundryId,
                    },
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY,
                    },
                }
            );

            toast({
                title: "Notification Sent",
                description: `Credentials successfully sent to Employee ID: ${empId}.`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });
        } catch (error) {
            console.error("Error sending notification:", error);
            toast({
                title: "Error Sending Notification",
                description: error.response?.data?.message || "An error occurred.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoadingNotifications((prev) => ({ ...prev, [empId]: false }));
        }
    };

    // CUSTOMER MANAGEMENT

    const [customers, setCustomers] = useState([]);
    const [loadingCustomers, setLoadingCustomers] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastEvaluatedKey, setLastEvaluatedKey] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [editingCustomerId, setEditingCustomerId] = useState(null);
    const [updatedNotificationPref, setUpdatedNotificationPref] = useState({
        email: false,
        sms: false
    });
    const [updatedPreferences, setUpdatedPreferences] = useState({});
    const BATCH_SIZE = 20;

    // Custom pricing state
    const [pricingModalOpen, setPricingModalOpen] = useState(false);
    const [pricingCustomer, setPricingCustomer] = useState(null);
    const [pricingRules, setPricingRules] = useState([]);
    const [newPricingType, setNewPricingType] = useState('discount');
    const [newPricingService, setNewPricingService] = useState('');
    const [newPricingValue, setNewPricingValue] = useState('');
    const [servicesData, setServicesData] = useState([]);

    // Fetch services for dropdown
    useEffect(() => {
        if (laundryId) {
            axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`, {
                params: { operation: 'viewServices', laundryId },
                headers: { Authorization: `Bearer ${authToken}` },
            }).then(res => {
                setServicesData(Object.values(res.data?.body?.services || {}));
            }).catch(() => {});
        }
    }, [laundryId]);

    const fetchCustomerPricing = async (customerId) => {
        try {
            const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/admin/customer-pricing`, {
                params: { laundryId, customerId },
                headers: { Authorization: `Bearer ${authToken}` },
            });
            setPricingRules(res.data?.pricingRules || []);
        } catch (err) { console.error(err); }
    };

    const handleAddPricingRule = async () => {
        if (!newPricingValue || parseFloat(newPricingValue) <= 0) return;
        try {
            await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/admin/customer-pricing`, {
                customerId: pricingCustomer.customerId,
                laundryId,
                pricingType: newPricingType,
                serviceName: newPricingService || null,
                value: parseFloat(newPricingValue),
            }, { headers: { Authorization: `Bearer ${authToken}` } });
            fetchCustomerPricing(pricingCustomer.customerId);
            setNewPricingValue('');
            setNewPricingService('');
            toast({ title: 'Pricing rule saved', status: 'success', duration: 2000 });
        } catch (err) {
            toast({ title: 'Error saving pricing', status: 'error', duration: 3000 });
        }
    };

    const handleDeletePricingRule = async (ruleId) => {
        try {
            await axios.delete(`${process.env.REACT_APP_AWS_API_URL}/api/admin/customer-pricing`, {
                params: { id: ruleId, laundryId },
                headers: { Authorization: `Bearer ${authToken}` },
            });
            setPricingRules(prev => prev.filter(r => r.id !== ruleId));
            toast({ title: 'Removed', status: 'success', duration: 2000 });
        } catch (err) {
            toast({ title: 'Error', status: 'error', duration: 3000 });
        }
    };

    useEffect(() => {
        if (activeTab === "customer") {
            fetchCustomers();
        }
    }, [activeTab, laundryId]);

    const fetchCustomers = async (loadMore = false) => {
        if (loadMore) {
            setLoadingMore(true);
        } else {
            setLoadingCustomers(true);
        }

        try {
            const params = new URLSearchParams({
                operation: "showAllCustomers",
                laundryId,
                batchSize: BATCH_SIZE.toString(),
            });

            // Handle lastEvaluatedKey
            if (loadMore && lastEvaluatedKey) {
                // Convert DynamoDB key to URL-safe format
                const encodedKey = encodeURIComponent(JSON.stringify(lastEvaluatedKey));
                params.append('lastEvaluatedKey', encodedKey);
            }

            // Log the final parameters being sent
            console.log("Request parameters:", params.toString());

            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/show-all-customers`,
                {
                    params,
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY,
                    },
                }
            );

            // Log the complete response data received from the API
            console.log("API Response:", response.data);

            const data = response.data.body;
            const newCustomers = data.customers || [];

            setCustomers(prev => loadMore ? [...prev, ...newCustomers] : newCustomers);
            setLastEvaluatedKey(data.pagination?.lastEvaluatedKey || null);
            setHasMore(data.pagination?.hasMore || false);
            setUpdatedPreferences(newCustomers.notificationPreferences);

            // Log the lastEvaluatedKey from the response for debugging
            console.log("New lastEvaluatedKey:", data.pagination?.lastEvaluatedKey);
        } catch (error) {
            console.error("Error details:", {
                config: error.config,
                response: error.response?.data
            });
            toast({
                title: "Loading Error",
                description: error.response?.data?.message || "Failed to load more customers",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            if (loadMore) {
                setLoadingMore(false);
            } else {
                setLoadingCustomers(false);
            }
        }
    };

    const loadMoreCustomers = () => {
        if (hasMore && !loadingMore) {
            fetchCustomers(true);
        }
    };

    const handleUpdateNotificationPref = async (customerId) => {
        if (!updatedNotificationPref.email && !updatedNotificationPref.sms) {
            toast({
                title: 'Error',
                description: 'At least one notification method must be enabled.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            return;
        }

        try {
            const notification_preferences_payload = {
                queryStringParameters: {
                    operation: "updateNotificationPreferences",
                    customerId: customerId,
                    notificationPreferences: JSON.stringify(updatedNotificationPref),
                }
            };

            const response = await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-customer-notifications`,
                notification_preferences_payload,
                {
                    headers: {
                        // 'x-api-key': process.env.REACT_APP_AWS_API_KEY,
                        'X-Amz-Date': laundryId,
                        'Authorization': `Bearer ${authToken}`
                    },
                }
            );

            const responseBody = JSON.parse(response.data.body);
            if (responseBody.status === 'success') {
                setCustomers((prev) =>
                    prev.map((cust) =>
                        cust.customerId === customerId
                            ? {
                                ...cust,
                                notification_preferences: {
                                    email: updatedNotificationPref.email,
                                    sms: updatedNotificationPref.sms,
                                },
                            }
                            : cust
                    )
                );

                toast({
                    title: "Preferences Updated",
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                });
                setEditingCustomerId(null);
            } else {
                toast({
                    title: 'Failed to update preferences',
                    description: responseBody.message || "An unexpected error occurred.",
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
                // Reset the preferences if needed
                const originalCustomer = customers.find(cust => cust.customerId === customerId);
                setUpdatedNotificationPref(originalCustomer?.notification_preferences || { email: false, sms: false });
            }
        } catch (error) {
            toast({
                title: "Update Failed",
                description: error.response?.data?.message || "Could not update preferences",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            const originalCustomer = customers.find(cust => cust.customerId === customerId);
            setUpdatedNotificationPref(originalCustomer?.notification_preferences || { email: false, sms: false });
        }
    };

    /* ---------- UPCOMING RECURRING ORDERS ---------- */
    const [upcomingOrders, setUpcomingOrders] = useState([]);
    const [upcomingTotalCount, setUpcomingTotalCount] = useState(0);
    const [loadingUpcoming, setLoadingUpcoming] = useState(false);

    useEffect(() => {
        if (activeTab === "upcoming") {
            fetchUpcomingOrders();
        }
    }, [activeTab, laundryId]);

    const fetchUpcomingOrders = async () => {
        setLoadingUpcoming(true);
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/frequency/upcoming`,
                {
                    params: { laundryId, days: 90 },
                    headers: { Authorization: `Bearer ${authToken}` },
                }
            );
            setUpcomingOrders(res.data?.upcoming || []);
            setUpcomingTotalCount(res.data?.totalCount || 0);
        } catch (error) {
            console.error("Error fetching upcoming orders:", error);
            toast({
                title: "Error fetching upcoming orders",
                description: "Could not retrieve upcoming recurring orders.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoadingUpcoming(false);
        }
    };

    const [convertingCommercial, setConvertingCommercial] = useState({});

    const handleConvertToCommercial = async (frequencyId) => {
        setConvertingCommercial((prev) => ({ ...prev, [frequencyId]: true }));
        try {
            await axios.patch(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/frequency-commercial`,
                { frequencyId, laundryId, isCommercial: true },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );
            toast({
                title: "Converted to Commercial",
                description: "Frequency record has been marked as commercial.",
                status: "success",
                duration: 3000,
                isClosable: true,
            });
            // Refresh the list to show updated status
            fetchUpcomingOrders();
        } catch (error) {
            console.error("Error converting to commercial:", error);
            toast({
                title: "Conversion failed",
                description: error?.response?.data?.body?.message || "Could not convert frequency to commercial.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setConvertingCommercial((prev) => ({ ...prev, [frequencyId]: false }));
        }
    };

    // Group upcoming orders by week
    const groupedUpcomingByWeek = useMemo(() => {
        if (!upcomingOrders.length) return [];
        const groups = {};
        upcomingOrders.forEach((order) => {
            const date = parseISO(order.pickupDate);
            const weekStart = startOfWeek(date, { weekStartsOn: 1 });
            const key = format(weekStart, "yyyy-MM-dd");
            if (!groups[key]) {
                groups[key] = { weekStart, label: `Week of ${format(weekStart, "MMM d")}`, orders: [] };
            }
            groups[key].orders.push(order);
        });
        return Object.values(groups).sort((a, b) => a.weekStart - b.weekStart);
    }, [upcomingOrders]);

    const frequencyColorScheme = (freq) => {
        switch (freq) {
            case "Weekly": return "purple";
            case "Bi-Weekly": return "blue";
            case "Monthly": return "orange";
            default: return "gray";
        }
    };

   /* ---------- SEARCH ---------- */
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [customerDisplayLimit, setCustomerDisplayLimit] = useState(50);
    const debounceRef = useRef(null);

    // Debounce: update debouncedSearch 300ms after the user stops typing
    const handleSearchChange = useCallback((e) => {
        const val = e.target.value;
        setSearchTerm(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(val);
            setCustomerDisplayLimit(50); // reset pagination on new search
        }, 300);
    }, []);

    const handleClearSearch = useCallback(() => {
        setSearchTerm("");
        setDebouncedSearch("");
        setCustomerDisplayLimit(50);
        if (debounceRef.current) clearTimeout(debounceRef.current);
    }, []);

    const normalize = (v = "") => v.toString().toLowerCase();
    const filteredEmployees = useMemo(() => {
        if (!debouncedSearch.trim()) return employees;
        const q = normalize(debouncedSearch);
        return employees.filter((emp) =>
            [emp.fullName, emp.contact?.phone, emp.contact?.email]
            .some((field) => normalize(field).includes(q))
        );
        }, [employees, debouncedSearch]);

    const filteredCustomers = useMemo(() => {
    if (!debouncedSearch.trim()) return customers;
    const q = normalize(debouncedSearch);
    return customers.filter((c) =>
        [
        `${c.firstName} ${c.lastName}`,
        c.phoneNumber,
        c.email,
        ].some((field) => normalize(field).includes(q))
    );
    }, [customers, debouncedSearch]);

    // Only render up to customerDisplayLimit items to avoid DOM thrashing
    const visibleCustomers = useMemo(() =>
        filteredCustomers.slice(0, customerDisplayLimit),
    [filteredCustomers, customerDisplayLimit]);

    return (
        <Box p={4}>

            {/* ---------- DASHBOARD HEADER ---------- */ }


            <VStack spacing={6} align="stretch" mb={{ base: 6, md: 8 }}>
            {/* ◼︎ Top row — title & (conditional) search */}
            <Flex
                direction={{ base: "column-reverse", md: "row" }}
                justify="space-between"
                align={{ base: "stretch", md: "center" }}
                gap={4}
            >
                {/* — Tabs — */}
                <Wrap spacing={3} justify={{ base: "center", md: "flex-start" }}>
                {[
                    { id: "employee", label: "Employee Management" },
                    { id: "customer", label: "Customer Management" },
                    { id: "employeeTips", label: "Monthly Employee Tips" },
                    { id: "upcoming", label: "Upcoming" },
                    { id: "sms", label: "SMS Marketing" },
                ].map(({ id, label }) => (
                    <WrapItem key={id}>
                    <Button
                        onClick={() => setActiveTab(id)}
                        variant={activeTab === id ? "solid" : "outline"}
                        colorScheme="teal"
                        size="sm"
                        borderRadius="full"
                        whiteSpace="nowrap"
                    >
                        {label}
                    </Button>
                    </WrapItem>
                ))}
                </Wrap>

                {/* — Search (only for employee / customer tabs) — */}
                {["employee", "customer"].includes(activeTab) && (
                <Box w={{ base: "100%", md: "280px", lg: "320px" }} alignSelf="flex-end">
                    <InputGroup size="sm">
                    <InputLeftElement
                        pointerEvents="none"
                        color="gray.400"
                        fontSize="sm"
                        children={<SearchIcon />}
                    />
                    <Input
                        placeholder="name, phone, or email…"
                        value={searchTerm}
                        onChange={handleSearchChange}
                        bg="white"
                        borderRadius="full"
                        _focus={{ ring: 1, ringColor: "teal.400" }}
                    />
                    {searchTerm && (
                        <InputRightElement>
                        <IconButton
                            aria-label="Clear search"
                            icon={<CloseIcon fontSize="xs" />}
                            size="xs"
                            variant="ghost"
                            onClick={handleClearSearch}
                        />
                        </InputRightElement>
                    )}
                    </InputGroup>
                </Box>
                )}
            </Flex>
            </VStack>

            {/* EMPLOYEE TABLE SECTION */}
            {activeTab === "employee" && (
                <>
                    <Flex
                    justify={{ base: "center", md: "flex-end" }}
                    gap={{ base: 3, md: 4 }}
                    wrap="wrap"                    /* lets them wrap nicely on very small screens */
                    >
                    {/* Add Employee */}
                    <Button
                        onClick={onAddEmpModalOpen}
                        colorScheme="blue"
                        size="sm"                    /* slightly smaller, crisper */
                        px={6}
                        borderRadius="lg"
                        boxShadow="md"
                        _hover={{ boxShadow: "lg" }}
                    >
                        Add&nbsp;Employee
                    </Button>

                    {/* Save Changes */}
                    <Button
                        onClick={handleAddEmployee}
                        colorScheme="green"
                        size="sm"
                        px={6}
                        borderRadius="lg"
                        boxShadow="md"
                        _hover={{ boxShadow: "lg" }}
                        isDisabled={Object.values(errors).some(Boolean)}
                        isLoading={isAdding}
                    >
                        Save&nbsp;Changes
                    </Button>
                    </Flex>     
                    
                    {loadingEmployees ? (
                    <VStack spacing={4} mt={6} align="center">
                        <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="xl" />
                        <Text fontSize="lg" textAlign="center" color="gray.500">
                        Fetching employee details…
                        </Text>
                    </VStack>
                    ) : (
                    <Box
                        bg="white"
                        borderRadius="xl"
                        boxShadow="sm"
                        overflowX="auto"
                        mt={6}
                        mb={8}
                    >
                        <Table variant="striped" size="sm" sx={{ "tbody tr:nth-of-type(odd)": { bg: "teal.50" } }}>
                        {/* sticky header */}
                        <Thead position="sticky" top={0} zIndex={1} boxShadow="sm">
                            <Tr bg="teal.700">
                            <Th color="white">Emp ID</Th>
                            <Th color="white">Name</Th>
                            <Th color="white">Contact</Th>
                            {/* <Th color="white">Laundry</Th> */}
                            <Th color="white">Joining&nbsp;Date</Th>
                            <Th color="white">Role</Th>
                            <Th color="white">Action</Th>
                            </Tr>
                        </Thead>

                        <Tbody>
                            {filteredEmployees.map((emp) => (
                            <Tr key={emp.employeeId} _hover={{ bg: "teal.100" }}>
                                {/* ID */}
                                <Td fontWeight="semibold">{emp.employeeId}</Td>

                                {/* Name – plain text, wraps if long */}
                                <Td whiteSpace="normal">
                                <Text fontWeight="medium">{emp.fullName}</Text>
                                </Td>

                                {/* Contact – full e-mail & phone, no truncation */}
                                <Td>
                                <VStack align="start" spacing={0.5} fontSize="sm">
                                    <HStack spacing={1}>
                                    <EmailIcon boxSize={3} />
                                    <Text>{emp.contact.email}</Text>
                                    </HStack>
                                    <HStack spacing={1}>
                                    <PhoneIcon boxSize={3} />
                                    <Text>{emp.contact.phone}</Text>
                                    </HStack>
                                </VStack>
                                </Td>

                                {/* Laundry badge */}
                                {/* <Td>
                                <Badge colorScheme="purple" variant="subtle" px={2}>
                                    {emp.laundryId}
                                </Badge>
                                </Td> */}

                                {/* Joining date */}
                                <Td whiteSpace="nowrap">
                                {format(new Date(emp.joiningDate), "yyyy-MM-dd")}
                                </Td>

                                {/* Role badge */}
                                <Td>
                                <Badge variant="solid" colorScheme="green" borderRadius="full" px={3}>
                                    {emp.role}
                                </Badge>
                                </Td>

                                {/* Action buttons */}
                                <Td>
                                <HStack spacing={1}>
                                    <IconButton
                                    aria-label="Send Notification"
                                    icon={<EmailIcon />}
                                    size="sm"
                                    colorScheme="blue"
                                    isLoading={loadingNotifications[emp.employeeId]}
                                    onClick={() => handleSendNotification(emp.employeeId)}
                                    />
                                    <IconButton
                                    aria-label="Delete Employee"
                                    icon={<DeleteIcon />}
                                    size="sm"
                                    colorScheme="red"
                                    onClick={() => {
                                        setEmployeeToDelete(emp);
                                        onDeleteEmpModalOpen();
                                    }}
                                    />
                                </HStack>
                                </Td>
                            </Tr>
                            ))}
                        </Tbody>
                        </Table>
                    </Box>
                    )}                   

                    {/* ▸ Add Employee Modal  */}
                    <Modal isOpen={isAddEmpModalOpen} onClose={onAddEmpModalClose} size="lg">
                    <ModalOverlay />

                    <ModalContent borderRadius="xl">
                        <ModalHeader bg="teal.700" color="white" borderTopRadius="xl">
                        Add&nbsp;New&nbsp;Employee
                        </ModalHeader>
                        <ModalCloseButton color="white" />

                        <ModalBody py={6}>
                        <VStack spacing={8} align="stretch">
                            {/* ▦ PERSONAL INFO */}
                            <Box>
                            <Heading as="h3" size="sm" color="teal.600" mb={2}>
                                Personal Information
                            </Heading>
                            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                                {/* first / last */}
                                <FormControl isInvalid={!!errors.firstName}>
                                <FormLabel>First Name&nbsp;<Text as="span" color="red">*</Text></FormLabel>
                                <Input
                                    placeholder="First name"
                                    value={newEmp.firstName}
                                    onChange={(e) => handleChange("firstName", e.target.value)}
                                    variant="filled"
                                    borderRadius="md"
                                />
                                <FormErrorMessage>{errors.firstName}</FormErrorMessage>
                                </FormControl>

                                <FormControl isInvalid={!!errors.lastName}>
                                <FormLabel>Last Name&nbsp;<Text as="span" color="red">*</Text></FormLabel>
                                <Input
                                    placeholder="Last name"
                                    value={newEmp.lastName}
                                    onChange={(e) => handleChange("lastName", e.target.value)}
                                    variant="filled"
                                    borderRadius="md"
                                />
                                <FormErrorMessage>{errors.lastName}</FormErrorMessage>
                                </FormControl>
                            </SimpleGrid>
                            </Box>

                            {/* ▦ CONTACT */}
                            <Box>
                            <Heading as="h3" size="sm" color="teal.600" mb={2}>
                                Contact Details
                            </Heading>
                            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                                <FormControl isInvalid={!!errors.phone}>
                                <FormLabel>Phone&nbsp;<Text as="span" color="red">*</Text></FormLabel>
                                <Input
                                    placeholder="10-digit phone"
                                    value={newEmp.phone}
                                    onChange={(e) => handleChange("phone", e.target.value)}
                                    maxLength={10}
                                    variant="filled"
                                    borderRadius="md"
                                />
                                <FormErrorMessage>{errors.phone}</FormErrorMessage>
                                </FormControl>

                                <FormControl isInvalid={!!errors.email}>
                                <FormLabel>Email&nbsp;<Text as="span" color="red">*</Text></FormLabel>
                                <Input
                                    placeholder="email@example.com"
                                    value={newEmp.email}
                                    onChange={(e) => handleChange("email", e.target.value)}
                                    variant="filled"
                                    borderRadius="md"
                                />
                                <FormErrorMessage>{errors.email}</FormErrorMessage>
                                </FormControl>
                            </SimpleGrid>
                            </Box>

                            {/* ▦ ADDRESS */}
                            <Box>
                            <Heading as="h3" size="sm" color="teal.600" mb={2}>
                                Address Information
                            </Heading>
                            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                                <FormControl isInvalid={!!errors["address.street"]}>
                                <FormLabel>Street&nbsp;<Text as="span" color="red">*</Text></FormLabel>
                                <Input
                                    placeholder="123 Main St"
                                    value={newEmp.address.street}
                                    onChange={(e) => handleChange("address.street", e.target.value)}
                                    variant="filled"
                                    borderRadius="md"
                                />
                                <FormErrorMessage>{errors["address.street"]}</FormErrorMessage>
                                </FormControl>

                                <FormControl isInvalid={!!errors["address.city"]}>
                                <FormLabel>City&nbsp;<Text as="span" color="red">*</Text></FormLabel>
                                <Input
                                    placeholder="City"
                                    value={newEmp.address.city}
                                    onChange={(e) => handleChange("address.city", e.target.value)}
                                    variant="filled"
                                    borderRadius="md"
                                />
                                <FormErrorMessage>{errors["address.city"]}</FormErrorMessage>
                                </FormControl>

                                <FormControl isInvalid={!!errors["address.state"]}>
                                <FormLabel>State&nbsp;<Text as="span" color="red">*</Text></FormLabel>
                                <Input
                                    placeholder="State"
                                    value={newEmp.address.state}
                                    onChange={(e) => handleChange("address.state", e.target.value)}
                                    variant="filled"
                                    borderRadius="md"
                                />
                                <FormErrorMessage>{errors["address.state"]}</FormErrorMessage>
                                </FormControl>

                                <FormControl isInvalid={!!errors["address.country"]}>
                                <FormLabel>Country&nbsp;<Text as="span" color="red">*</Text></FormLabel>
                                <Input
                                    placeholder="Country"
                                    value={newEmp.address.country}
                                    onChange={(e) => handleChange("address.country", e.target.value)}
                                    variant="filled"
                                    borderRadius="md"
                                />
                                <FormErrorMessage>{errors["address.country"]}</FormErrorMessage>
                                </FormControl>

                                <FormControl isInvalid={!!errors["address.zipCode"]}>
                                <FormLabel>Zip Code&nbsp;<Text as="span" color="red">*</Text></FormLabel>
                                <Input
                                    placeholder="ZIP"
                                    value={newEmp.address.zipCode}
                                    onChange={(e) => handleChange("address.zipCode", e.target.value)}
                                    variant="filled"
                                    borderRadius="md"
                                />
                                <FormErrorMessage>{errors["address.zipCode"]}</FormErrorMessage>
                                </FormControl>
                            </SimpleGrid>
                            </Box>

                            {/* ▦ ROLE / DATE */}
                            <Box>
                            <Heading as="h3" size="sm" color="teal.600" mb={2}>
                                Other Information
                            </Heading>
                            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                                {/* Role dropdown */}
                                <FormControl isInvalid={!!errors.role}>
                                <FormLabel>Role&nbsp;<Text as="span" color="red">*</Text></FormLabel>
                                <Menu>
                                    <MenuButton
                                    as={Button}
                                    rightIcon={<ChevronDownIcon />}
                                    w="100%"
                                    variant="outline"
                                    borderRadius="md"
                                    textAlign="left"
                                    >
                                    {newEmp.role || "Select role"}
                                    </MenuButton>
                                    <MenuList maxH="200px" overflowY="auto">
                                    {availableRoles.map((r) => (
                                        <MenuItem key={r} onClick={() => handleChange("role", r)}>
                                        {r}
                                        </MenuItem>
                                    ))}
                                    </MenuList>
                                </Menu>
                                <FormErrorMessage>{errors.role}</FormErrorMessage>
                                </FormControl>

                                {/* Joining date */}
                                <FormControl isInvalid={!!errors.joiningDate}>
                                <FormLabel>Joining Date&nbsp;<Text as="span" color="red">*</Text></FormLabel>
                                <Input
                                    type="date"
                                    value={newEmp.joiningDate}
                                    onChange={(e) => handleChange("joiningDate", e.target.value)}
                                    min={new Date().toISOString().split("T")[0]}
                                    variant="filled"
                                    borderRadius="md"
                                />
                                <FormErrorMessage>{errors.joiningDate}</FormErrorMessage>
                                </FormControl>
                            </SimpleGrid>
                            </Box>
                        </VStack>
                        </ModalBody>

                        <ModalFooter>
                        <Button
                            colorScheme="teal"
                            borderRadius="full"
                            px={8}
                            onClick={handleAddEmployee}
                            isDisabled={Object.values(errors).some(Boolean)}
                            isLoading={isAdding}
                        >
                            Save&nbsp;Employee
                        </Button>
                        </ModalFooter>
                    </ModalContent>
                    </Modal>
   
                    {/* Delete Employee Modal */}
                    <Modal isOpen={isDeleteEmpModalOpen} onClose={onDeleteEmpModalClose}>
                        <ModalOverlay />
                        <ModalContent>
                            <ModalHeader>Confirm Employee Deletion</ModalHeader>
                            <ModalCloseButton />
                            <ModalBody>
                                {employeeToDelete && (
                                    <Text>
                                        Are you sure you want to delete employee{" "}
                                        <strong>{employeeToDelete.fullName}</strong> with ID{" "}
                                        <strong>{employeeToDelete.employeeId}</strong>?
                                    </Text>
                                )}
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    colorScheme="red"
                                    onClick={handleDeleteEmployee}
                                    isLoading={isDeleting}
                                    mr={3}
                                >
                                    Yes, Delete
                                </Button>
                                <Button variant="ghost" onClick={onDeleteEmpModalClose}>
                                    Cancel
                                </Button>
                            </ModalFooter>
                        </ModalContent>
                    </Modal>
                </>
            )}

            {/*// JSX for Customer Management Section*/}
            {activeTab === "customer" && (
                <>
                    <Heading as="h2" size="md" mb={4}>
                        Customer Management
                        {customers.length > 0 && (
                            <Text as="span" fontSize="sm" color="gray.500" ml={2}>
                                ({customers.length} {hasMore} customers)
                            </Text>
                        )}
                    </Heading>

                    {loadingCustomers && !loadingMore ? (
                        <VStack spacing={4} mt={6} align="center">
                            <Spinner
                                thickness="4px"
                                speed="0.65s"
                                emptyColor="gray.200"
                                color="blue.500"
                                size="xl"
                            />
                            <Text fontSize="lg" textAlign="center" color="gray.500">
                                Loading customer details...
                            </Text>
                        </VStack>
                    ) : (
                        <>
                            <Accordion allowMultiple>
                                {visibleCustomers.map((cust) => (
                                    <AccordionItem key={cust.customerId}>
                                        <h2>
                                            <AccordionButton>
                                                <Box flex="1" textAlign="left">
                                                    <HStack spacing={2}>
                                                        <Text color="blue.600" fontWeight="bold">
                                                            {cust.firstName} {cust.lastName}
                                                        </Text>
                                                        {cust.isCommercial && (
                                                            <Badge colorScheme="purple" fontSize="xs">Commercial</Badge>
                                                        )}
                                                    </HStack>
                                                    <Text fontSize="sm">
                                                        Phone: {cust.phoneNumber} | Email: {cust.email}
                                                    </Text>
                                                </Box>
                                                <AccordionIcon />
                                            </AccordionButton>
                                        </h2>

                                        <AccordionPanel pb={4} bg="gray.50" borderRadius="md">
                                            <VStack align="stretch" spacing={3}>
                                                <Text>
                                                    <strong>Customer ID:</strong> {cust.customerId}
                                                </Text>
                                                <Text>
                                                    <strong>Total Order Value:</strong> $
                                                    {(cust.totalOrderValue || 0).toFixed(2)}
                                                </Text>
                                                <Text>
                                                    <strong>Last Completed Order:</strong>{" "}
                                                    {cust.lastCompletedOrder
                                                        ? `#${cust.lastCompletedOrder.orderId} on ${new Date(
                                                            cust.lastCompletedOrder.createdAt
                                                        ).toLocaleDateString()}`
                                                        : "None"}
                                                </Text>
                                                <Text>
                                                    <strong>Current Orders:</strong>{" "}
                                                    {cust.currentOrders && cust.currentOrders.length > 0 ? (
                                                        <div style={{
                                                            maxHeight: '150px',
                                                            overflowY: 'auto',
                                                            border: '1px solid #ddd',
                                                            padding: '5px',
                                                            marginTop: '5px'
                                                        }}>
                                                            {(cust.currentOrders.length > 10
                                                                    ? cust.currentOrders.slice(0, 10)
                                                                    : cust.currentOrders
                                                            ).map((order, i, displayedOrders) => (
                                                                <div key={order.orderId}>
                                                                    #{order.orderId} on {new Date(order.createdAt).toLocaleDateString()}
                                                                    {i < displayedOrders.length - 1 && <br />}
                                                                </div>
                                                            ))}
                                                            {cust.currentOrders.length > 10 && (
                                                                <div style={{ color: '#666', fontStyle: 'italic' }}>
                                                                    <br />(Showing 10 of {cust.currentOrders.length} orders)
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        "None"
                                                    )}
                                                </Text>

                                                <Box>
                                                    <Text fontWeight="bold">Notification Preferences:</Text>
                                                    {editingCustomerId === cust.customerId ? (
                                                        <>
                                                            <Grid templateColumns="repeat(2, 1fr)" gap={4} mt={2}>
                                                                <GridItem>
                                                                    <FormControl display="flex" alignItems="center">
                                                                        <FormLabel htmlFor="email-preference" mb="0">
                                                                            Email Notifications
                                                                        </FormLabel>
                                                                        <Switch
                                                                            id="email-preference"
                                                                            isChecked={updatedNotificationPref.email || false}
                                                                            onChange={() =>
                                                                                setUpdatedNotificationPref(prev => ({
                                                                                    ...prev,
                                                                                    email: !prev.email
                                                                                }))
                                                                            }
                                                                        />
                                                                    </FormControl>
                                                                </GridItem>
                                                                <GridItem>
                                                                    <FormControl display="flex" alignItems="center">
                                                                        <FormLabel htmlFor="sms-preference" mb="0">
                                                                            SMS Notifications
                                                                        </FormLabel>
                                                                        <Switch
                                                                            id="sms-preference"
                                                                            isChecked={updatedNotificationPref.sms || false}
                                                                            onChange={() =>
                                                                                setUpdatedNotificationPref(prev => ({
                                                                                    ...prev,
                                                                                    sms: !prev.sms
                                                                                }))
                                                                            }
                                                                        />
                                                                    </FormControl>
                                                                </GridItem>
                                                            </Grid>
                                                            <HStack mt={4}>
                                                                <Button
                                                                    size="sm"
                                                                    colorScheme="blue"
                                                                    onClick={() => handleUpdateNotificationPref(cust.customerId)}
                                                                >
                                                                    Save
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setEditingCustomerId(null);
                                                                        setUpdatedNotificationPref(cust.notification_preferences); // Reset on cancel
                                                                    }}
                                                                >
                                                                    Cancel
                                                                </Button>
                                                            </HStack>
                                                        </>
                                                    ) : (
                                                        <Text>
                                                            Email: {String(cust.notification_preferences?.email || false)},
                                                            SMS: {String(cust.notification_preferences?.sms || false)}
                                                            <Button
                                                                size="sm"
                                                                ml={2}
                                                                onClick={() => {
                                                                    setEditingCustomerId(cust.customerId);
                                                                    setUpdatedNotificationPref({
                                                                        email: cust.notification_preferences?.email || false,
                                                                        sms: cust.notification_preferences?.sms || false
                                                                    });
                                                                }}
                                                            >
                                                                Edit
                                                            </Button>
                                                        </Text>
                                                    )}
                                                </Box>
                                                {cust.addresses?.length > 0 && (
                                                    <Box>
                                                        <Text fontWeight="bold">Addresses:</Text>
                                                        {cust.addresses.map((addr, idx) => (
                                                            <Box key={idx} mt={2} p={2} bg="gray.100" borderRadius="md">
                                                                <Text>{addr.address}</Text>
                                                                {addr.doorNumber && (
                                                                    <Text fontSize="sm">Unit: {addr.doorNumber}</Text>
                                                                )}
                                                                {addr.addressInstructions && (
                                                                    <Text fontSize="sm">
                                                                        Instructions: {addr.addressInstructions}
                                                                    </Text>
                                                                )}
                                                            </Box>
                                                        ))}
                                                    </Box>
                                                )}
                                                <Button size="sm" colorScheme="orange" variant="outline"
                                                    onClick={() => { setPricingCustomer(cust); setPricingModalOpen(true); fetchCustomerPricing(cust.customerId); }}>
                                                    💰 Custom Pricing
                                                </Button>
                                                {/* Commercial Account Conversion */}
                                                <HStack spacing={2} mt={1}>
                                                    {cust.isCommercial ? (
                                                        <Badge colorScheme="purple" fontSize="sm" px={3} py={1} borderRadius="md">
                                                            ✅ Commercial Account
                                                        </Badge>
                                                    ) : (
                                                        <Button size="sm" colorScheme="purple" variant="outline"
                                                            onClick={async () => {
                                                                const billingEmail = prompt("Enter billing email for this commercial account:");
                                                                if (!billingEmail) return;
                                                                try {
                                                                    await axios.patch(
                                                                        `${process.env.REACT_APP_AWS_API_URL}/api/admin/customer-commercial`,
                                                                        { customerId: cust.customerId, laundryId, billingEmail, isCommercial: true },
                                                                        { headers: { Authorization: `Bearer ${authToken}` } }
                                                                    );
                                                                    toast({ title: "Converted to Commercial", description: `${cust.firstName} is now a commercial customer.`, status: "success", duration: 3000 });
                                                                    // Update local state
                                                                    setCustomers(prev => prev.map(c => c.customerId === cust.customerId ? { ...c, isCommercial: true, billingEmail } : c));
                                                                } catch (err) {
                                                                    toast({ title: "Error", description: err.response?.data?.body?.message || err.message, status: "error", duration: 4000 });
                                                                }
                                                            }}>
                                                            🏢 Convert to Commercial
                                                        </Button>
                                                    )}
                                                </HStack>
                                            </VStack>
                                        </AccordionPanel>
                                    </AccordionItem>
                                ))}
                            </Accordion>

                            {/* UI-level pagination: show more from already-loaded results */}
                            {visibleCustomers.length < filteredCustomers.length && (
                                <Box mt={4} textAlign="center">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        colorScheme="teal"
                                        onClick={() => setCustomerDisplayLimit(prev => prev + 50)}
                                    >
                                        Show More ({filteredCustomers.length - visibleCustomers.length} remaining)
                                    </Button>
                                </Box>
                            )}

                            {/* Server-side pagination: fetch next batch from API */}
                            <Box mt={6} textAlign="center">
                                {hasMore ? (
                                    <Button
                                        onClick={loadMoreCustomers}
                                        isLoading={loadingMore}
                                        loadingText="Loading more customers..."
                                        colorScheme="blue"
                                        variant="outline"
                                        leftIcon={<RepeatIcon />}
                                        isDisabled={!hasMore || loadingMore}
                                    >
                                        Load More Customers
                                    </Button>
                                ) : customers.length > 0 ? (
                                    <Text color="gray.500" mt={4}>
                                        All {customers.length} customers loaded
                                    </Text>
                                ) : (
                                    <Text color="gray.500" mt={4}>
                                        No customers found
                                    </Text>
                                )}
                            </Box>
                        </>
                    )}
                </>
            )}

            {activeTab === "employeeTips" && (
  <EmployeeTipTab laundryId={laundryId} />
)}

            {/* UPCOMING RECURRING ORDERS SECTION */}
            {activeTab === "upcoming" && (
                <Box>
                    <Flex align="center" gap={3} mb={4}>
                        <Heading as="h2" size="md">
                            Upcoming Recurring Orders (Next 90 Days)
                        </Heading>
                        <Badge colorScheme="teal" fontSize="md" px={3} py={1} borderRadius="full">
                            {upcomingTotalCount}
                        </Badge>
                    </Flex>

                    {loadingUpcoming ? (
                        <VStack spacing={4} mt={6} align="center">
                            <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="teal.500" size="xl" />
                            <Text fontSize="lg" textAlign="center" color="gray.500">
                                Loading upcoming orders…
                            </Text>
                        </VStack>
                    ) : upcomingOrders.length === 0 ? (
                        <Text color="gray.500" mt={4}>No upcoming recurring orders found.</Text>
                    ) : (
                        <VStack spacing={6} align="stretch">
                            {groupedUpcomingByWeek.map((group) => (
                                <Box key={group.label}>
                                    <Heading as="h3" size="sm" color="teal.700" mb={2} borderBottom="1px solid" borderColor="gray.200" pb={1}>
                                        {group.label}
                                    </Heading>
                                    <Box bg="white" borderRadius="xl" boxShadow="sm" overflowX="auto">
                                        <Table variant="striped" size="sm" sx={{ "tbody tr:nth-of-type(odd)": { bg: "teal.50" } }}>
                                            <Thead>
                                                <Tr bg="teal.700">
                                                    <Th color="white">Pickup Date</Th>
                                                    <Th color="white">Customer</Th>
                                                    <Th color="white">Frequency</Th>
                                                    <Th color="white">Time Slot</Th>
                                                    <Th color="white">Service</Th>
                                                    <Th color="white">Auto-Charge</Th>
                                                    <Th color="white">Commercial</Th>
                                                </Tr>
                                            </Thead>
                                            <Tbody>
                                                {group.orders.map((order, idx) => (
                                                    <Tr key={`${order.frequencyId}-${idx}`} _hover={{ bg: "teal.100" }}>
                                                        <Td fontWeight="medium">{format(parseISO(order.pickupDate), "EEE, MMM d")}</Td>
                                                        <Td>
                                                            <VStack align="start" spacing={0}>
                                                                <Text fontWeight="medium">{order.customerName}</Text>
                                                                <Text fontSize="xs" color="gray.500">{order.customerPhone}</Text>
                                                            </VStack>
                                                        </Td>
                                                        <Td>
                                                            <Badge colorScheme={frequencyColorScheme(order.frequency)} borderRadius="full" px={2}>
                                                                {order.frequency}
                                                            </Badge>
                                                        </Td>
                                                        <Td fontSize="sm">{order.pickupTimeInterval}</Td>
                                                        <Td fontSize="sm">{order.pickupService}</Td>
                                                        <Td>
                                                            <Badge colorScheme={order.autoCharge ? "green" : "gray"} variant="subtle" borderRadius="full" px={2}>
                                                                {order.autoCharge ? "Yes" : "No"}
                                                            </Badge>
                                                        </Td>
                                                        <Td>
                                                            {order.effectiveCommercial ? (
                                                                <Badge colorScheme="purple" variant="solid" borderRadius="full" px={2}>
                                                                    Commercial
                                                                </Badge>
                                                            ) : (
                                                                <Button
                                                                    size="xs"
                                                                    colorScheme="purple"
                                                                    variant="outline"
                                                                    borderRadius="full"
                                                                    isLoading={convertingCommercial[order.frequencyId]}
                                                                    onClick={() => handleConvertToCommercial(order.frequencyId)}
                                                                >
                                                                    Convert to Commercial
                                                                </Button>
                                                            )}
                                                        </Td>
                                                    </Tr>
                                                ))}
                                            </Tbody>
                                        </Table>
                                    </Box>
                                </Box>
                            ))}
                        </VStack>
                    )}
                </Box>
            )}

            {/* SMS MARKETING SECTION */}
            {activeTab === "sms" && (
                <SMSMarketingTab laundryId={laundryId} authToken={authToken} />
            )}

            {/* Custom Pricing Modal */}
            {pricingModalOpen && pricingCustomer && (
                <Modal isOpen={pricingModalOpen} onClose={() => setPricingModalOpen(false)} size="lg">
                    <ModalOverlay />
                    <ModalContent>
                        <ModalHeader>💰 Custom Pricing: {pricingCustomer.firstName} {pricingCustomer.lastName}</ModalHeader>
                        <ModalCloseButton />
                        <ModalBody>
                            <VStack spacing={4} align="stretch">
                                {/* Existing rules */}
                                {pricingRules.length > 0 && (
                                    <Box>
                                        <Text fontWeight="bold" mb={2}>Current Rules:</Text>
                                        {pricingRules.map(rule => (
                                            <Flex key={rule.id} justify="space-between" align="center" p={2} bg="gray.50" borderRadius="md" mb={1}>
                                                <Box>
                                                    <Text fontSize="sm" fontWeight="600">
                                                        {rule.pricingType === 'discount'
                                                            ? `${rule.value}% discount${rule.serviceName ? ` on ${rule.serviceName}` : ' (all services)'}`
                                                            : `$${rule.value}${rule.serviceName ? ` for ${rule.serviceName}` : ''}`}
                                                    </Text>
                                                </Box>
                                                <Button size="xs" colorScheme="red" variant="ghost" onClick={() => handleDeletePricingRule(rule.id)}>✕</Button>
                                            </Flex>
                                        ))}
                                    </Box>
                                )}

                                {/* Add new rule */}
                                <Box p={3} border="1px solid" borderColor="gray.200" borderRadius="md">
                                    <Text fontWeight="bold" mb={2}>Add Rule:</Text>
                                    <HStack mb={2}>
                                        <Select size="sm" value={newPricingType} onChange={e => setNewPricingType(e.target.value)}>
                                            <option value="discount">% Discount</option>
                                            <option value="custom_price">Custom Price ($)</option>
                                        </Select>
                                        <Input size="sm" placeholder={newPricingType === 'discount' ? 'e.g. 15' : 'e.g. 1.50'}
                                            value={newPricingValue} onChange={e => setNewPricingValue(e.target.value)} type="number" />
                                    </HStack>
                                    <HStack>
                                        <Select size="sm" placeholder="All services" value={newPricingService} onChange={e => setNewPricingService(e.target.value)}>
                                            {(servicesData || []).map((svc, i) => (
                                                <option key={i} value={svc.serviceName}>{svc.serviceName}</option>
                                            ))}
                                        </Select>
                                        <Button size="sm" colorScheme="blue" onClick={handleAddPricingRule}>Add</Button>
                                    </HStack>
                                    <Text fontSize="xs" color="gray.500" mt={1}>
                                        {newPricingType === 'discount' ? 'Applies % off when processing this customer\'s orders.' : 'Overrides the service price for this customer.'}
                                    </Text>
                                </Box>
                            </VStack>
                        </ModalBody>
                        <ModalFooter>
                            <Button onClick={() => setPricingModalOpen(false)}>Close</Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>
            )}

        </Box>
    );
};

export default ManagerDashboardPage;
