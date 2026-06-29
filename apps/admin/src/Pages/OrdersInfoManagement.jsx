import React, {useEffect, useState, useRef} from 'react';
import axios from 'axios';
import {useParams} from 'react-router-dom';
import {ChevronDownIcon, CloseIcon, InfoIcon } from '@chakra-ui/icons';
import CancelUberDelivery from './CancelUberDelivery';
import CancelOrderDialog from "./CancelOrderDialog";
import { useCancelUberHandoff } from './useCancelUberHandoff';
import {
    FaUser,
    FaPhone,
    FaCalendarAlt,
    FaClock,
    FaMoneyBillWave,
    FaUserEdit,
    FaBars,
    FaStickyNote,
    FaShoppingBag,
    FaTimesCircle,
    FaMapMarkerAlt
} from "react-icons/fa";
import {
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    NumberIncrementStepper, NumberDecrementStepper,
    Badge,
    Table,
    Thead,
    Th,
    Tr,
    Tbody,
    Td,
    SimpleGrid,
    Popover,
    PopoverTrigger,
    PopoverContent,
    PopoverHeader,
    PopoverBody,
    PopoverArrow,
    PopoverCloseButton,
    Accordion, AccordionItem, AccordionButton, AccordionIcon, AccordionPanel, Center, Radio, RadioGroup
} from "@chakra-ui/react";
import {
    Box,
    Button,
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerHeader,
    DrawerOverlay,
    Flex,
    Heading,
    Icon,
    IconButton,
    Input,
    Menu,
    MenuButton,
    MenuItem,
    MenuList,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    Spinner,
    Stack,
    Text,
    Tooltip,
    useBreakpointValue,
    useDisclosure,
    useToast,
    VStack,
    HStack,
    InputGroup,
    InputLeftAddon
} from '@chakra-ui/react';
import PaymentModal from '../Components/AdminHome/adminPaymentModal';
import {fetchShopDetails} from "./AdminHomePage";
import OrderActionsDrawer from "./OrderActionsDrawer";
import ItemTrackingPanel from "../Components/ItemTracking/ItemTrackingPanel";
import {fetchLaundryProducts, fetchLaundryInfo} from './LaundryInfoManagement';
import {Elements} from "@stripe/react-stripe-js";
import {loadStripe} from "@stripe/stripe-js";
import {useAdminSession} from "../hooks/useAdminSession";
import InvoiceModal from './InvoiceModal';
import InvoicePreview from './InvoicePreview';
import {roundToTwo} from "../utils/decimalUtils";
import {printViaIframe} from "../utils/printUtils";
import { generateTicketHtml } from '../utils/ticketPrint';
import { toZonedTime, format, zonedTimeToUtc, utcToZonedTime} from 'date-fns-tz';
import { addMinutes } from "date-fns";
import { Autocomplete } from "@react-google-maps/api";


const OrdersInfo = ({orderOperation, validateEmpCredentials, stripePublicKey, stripeTerminalExists, empPrefix, laundryTimeZone}) => {
    const {laundryId} = useParams();
    const [orders, setOrders] = useState([]);
    const [filteredOrders, setFilteredOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [singleOrderLoading, setSingleOrderLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
    const {isOpen, onOpen, onClose} = useDisclosure();
    const [isEditMode, setIsEditMode] = useState(false);
    const [empId, setEmpId] = useState('');
    const [passcode, setPasscode] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [activeStatusChip, setActiveStatusChip] = useState('All');
    const [paymentFilter, setPaymentFilter] = useState('');
    const [orderStatusMap, setOrderStatusMap] = useState({});
    const [servicesToAddMap, setServicesToAddMap] = useState({});
    const [servicesToRemoveMap, setServicesToRemoveMap] = useState({});
    const [statusOptions, setStatusOptions] = useState([]);
    const [serviceNames, setServiceNames] = useState([]);
    const [productsToAdd, setProductsToAdd] = useState([]);
    const [productsToRemove, setProductsToRemove] = useState([]);
    const [productsToUpdate, setProductsToUpdate] = useState([]);
    const [orderHistory, setOrderHistory] = useState(null);
    const [orderLoading, setOrderLoading] = useState(false);
    const [printLoading, setPrintLoading] = useState(false);
    const [ticketLoading, setTicketLoading] = useState(false);
    const [paymentButtonDisplay, setPaymentButtonDisplay] = useState(false);
    const [saveLoading, setSaveLoading] = useState(false); // progress Indicator state for the order update
    const [employeevalidationLoading, setEmployeevalidationLoading] = useState(false); // progress Indicator state for the employee credentials validation
    const [shouldRefetchOrdersAfterClose, setShouldRefetchOrdersAfterClose] = useState(false);
    const [orderTab, setOrderTab] = useState('all');
    const [sortOrder, setSortOrder] = useState("asc");
    const invoiceRef = useRef(null);
    const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
    const [paymentInstructions, setPaymentInstructions] = useState("");
    const [sendEmail, setSendEmail] = useState(true);
    const [initialStatus, setInitialStatus] = useState(null); // For the Status Change Logic
    const [currentLimit, setCurrentLimit] = useState(10);
    const [products, setProducts] = useState([]);
    const [originalProducts, setOriginalProducts] = useState([]);
    const toast = useToast();
    const [isActionsDrawerOpen, setIsActionsDrawerOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const authToken = localStorage.getItem('idToken');
    const [isUberModalOpen, setUberModalOpen] = useState(false);
    const [uberType, setUberType] = useState(null); // "pickup" or "dropoff"
    const [uberScheduleType, setUberScheduleType] = useState("instant");
    const [uberEnv, setUberEnv] = useState("");
    const [pickupTimeWindow, setPickupTimeWindow] = useState("");
    const [pickupType, setPickupType] = useState("scheduled"); // default to 'scheduled'
    const [isInstant, setIsInstant] = useState(false);
    const [showUberStatusInfo, setShowUberStatusInfo] = useState(false);
    const [isDeliveryOptionModalOpen, setIsDeliveryOptionModalOpen] = useState(false);
    const [selectedDeliveryMethod, setSelectedDeliveryMethod] = useState("");
    const [customDropoffAddress, setCustomDropoffAddress] = useState("");
    const [customDropoffDate, setCustomDropoffDate] = useState("");
    const [autocomplete, setAutocomplete] = useState(null);
const [autocompleteRef, setAutocompleteRef] = useState(null);
const [mapLatLng, setMapLatLng] = useState(null);
const apiBaseUrl = process.env.REACT_APP_AWS_API_URL;
const cancelDialog = useDisclosure();




const getInstantPickupWindow = (laundryTimeZone) => {
  const now = new Date();
  const zonedTime = toZonedTime(now, laundryTimeZone); // Convert to laundry time zone

  // Round minutes to next 5-minute interval
  const roundedMinutes = Math.ceil(zonedTime.getMinutes() / 5) * 5;
  zonedTime.setMinutes(roundedMinutes);
  zonedTime.setSeconds(0);
  zonedTime.setMilliseconds(0);

  const start = new Date(zonedTime);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2-hour window

  const startStr = format(start, "HH:mm");
  const endStr = format(end, "HH:mm");

  console.log(`[DEBUG] Instant pickup window for ${laundryTimeZone}: ${startStr} - ${endStr}`);
  return `${startStr} - ${endStr}`;
};

    const {
        isSessionValid,
        refreshAdminActivity,
        startSession,
        endSession,
        sessionActive,
        getEmpId
    } = useAdminSession();
    const getOrderStatusColor = (status) => {
        switch (status) {
            case 'OrderPickedUp':
            case 'Delivered' :
                return 'green.500';
            case 'ReadyForIntake':
            case 'ReceivedAtFacility':
            case 'ProcessingStarted':
            case 'ProcessingCompleted':
                return 'orange.500';
            case 'EnRouteToDelivery':
                return 'green.200';
            case 'OrderCanceled':
                return 'red.500';
            default:
                return 'blue.500';
        }
    };
    const formatDateTime = (date, time) => {
        return time ? `${date} (${time})` : date;
    };

    const useAdaptiveTruncate = () => {
        const truncateLength = useBreakpointValue({
            base: 12,    // Mobile phones (smallest screens)
            sm: 16,      // Small tablets
            md: 20,      // Tablets/medium screens
            lg: 24,      // Laptops
            xl: 30,      // Large desktops
            '2xl': 40    // Extra large screens
        });


        const truncateText = (text) => {
            if (!text) return '';
            if (text.length > truncateLength) {
                return `${text.substring(0, truncateLength)}...`;
            }
            return text;
        };

        return truncateText;
    };

    const openActionsDrawer = (order) => {
        setIsActionsDrawerOpen((prev) => ({
            ...prev,
            [order.orderId]: !prev[order.orderId] // âœ… Toggle only for this order
        }));
        setSelectedOrder(prev => (prev?.orderId === order.orderId ? null : order)); // âœ… Ensure only one order is selected
    };

    const closeActionsDrawer = () => {
        console.log("Closing Drawer");  // âœ… Debugging Log
        setIsActionsDrawerOpen(false);
        setSelectedOrder(null);
    };

    // payment Information modal
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const handleOpenPaymentModal = () => {
        setIsPaymentModalOpen(true);
    };
    const closePaymentModal = () => setIsPaymentModalOpen(false);

    const [shopDetails, setShopDetails] = useState({
        name: '',
        phone: '',
        email: '',
    });
    const [laundryLogo, setLaundryLogo] = useState(null);


    const {
        isOpen: isOrderHistoryModalOpen,
        onOpen: onOrderHistoryModalOpen,
        onClose: onOrderHistoryModalClose,
    } = useDisclosure();

    const handleLoadMore = () => {
        if (currentLimit < filteredOrders.length) {
            setCurrentLimit((prevLimit) => prevLimit + 10);
        }
    };
    const {
        isOpen: isCredentialModalOpen,
        onOpen: onCredentialModalOpen,
        onClose: onCredentialModalClose,
    } = useDisclosure();

    const padding = useBreakpointValue({base: '2', md: '4', lg: '6'});
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const last90Days = new Date();
    last90Days.setDate(last90Days.getDate() - 90);

    const {isOpen: isDrawerOpen, onOpen: onDrawerOpen, onClose: onDrawerClose} = useDisclosure();

    const formatToLocalDateTime = (dateTime) => {
        if (!dateTime) return "N/A"; // Null or undefined case

        const date = new Date(dateTime);

        if (isNaN(date.getTime())) {
            console.warn("Encountered invalid date value:", dateTime);
            return "Invalid Date";
        }

        return new Intl.DateTimeFormat(navigator.language, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
            hour12: true,
        }).format(date);
    };

    useEffect(() => {
        const fetchData = async () => {
            await Promise.all([
                fetchLaundryOrders(laundryId, orderOperation),
                fetchProducts(),
                fetchLaundryServices(laundryId),
                fetchLaundryStatuses(laundryId),
            ]);

        };
        fetchData();
    }, [laundryId, orderOperation]);

    // Server-side search — queries ALL orders (no time limit) when user types 3+ characters
    useEffect(() => {
        if (!searchTerm || searchTerm.trim().length < 3) return;

        const searchTimeout = setTimeout(async () => {
            try {
                const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/orders-info`;
                const response = await axios.get(url, {
                    params: { operation: 'searchOrders', laundryId, searchQuery: searchTerm.trim() },
                    headers: { 'Authorization': `Bearer ${authToken}` },
                    timeout: 10000,
                });
                const searchResults = response.data?.body || [];
                if (Array.isArray(searchResults) && searchResults.length > 0) {
                    // Merge search results with existing orders (deduplicate by orderId)
                    const existingIds = new Set(orders.map(o => o.orderId));
                    const newOrders = searchResults.filter(o => !existingIds.has(o.orderId));
                    if (newOrders.length > 0) {
                        setOrders(prev => [...prev, ...newOrders]);
                    }
                }
            } catch (err) {
                console.error('Server-side search failed:', err);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(searchTimeout);
    }, [searchTerm, laundryId, authToken]);

    useEffect(() => {
        const filtered = orders.filter((order) => {
            // Normalize strings for case-insensitive comparison
            const normalizeString = (str) => str?.toLowerCase() || '';

            // Check if search term matches Order ID, Customer Phone, or Customer Name
            const matchesSearchTerm = searchTerm
                ? normalizeString(order.orderId).includes(normalizeString(searchTerm)) || // Match Order ID
                normalizeString(order.customerPhone).includes(normalizeString(searchTerm)) || // Match Customer Phone
                normalizeString(order.customerName).includes(normalizeString(searchTerm)) // Match Customer Name
                : true;

            // Match active orders with status filter (chip-based or dropdown)
            const matchesOrderStatus =
                orderOperation === 'active'
                    ? (() => {
                        // Chip filter takes priority for active orders
                        if (activeStatusChip && activeStatusChip !== 'All') {
                            switch (activeStatusChip) {
                                case 'Submitted':
                                    return order.orderStatus === 'OrderSubmitted';
                                case 'Picked Up':
                                    return order.orderStatus === 'ReadyForIntake';
                                case 'At Facility':
                                    return order.orderStatus === 'ReceivedAtFacility';
                                case 'Processing':
                                    return order.orderStatus === 'Processing' || order.orderStatus === 'ProcessingStarted';
                                case 'Processed':
                                    return order.orderStatus === 'ProcessingCompleted';
                                case 'Ready':
                                    return order.orderStatus === 'ReadyForDelivery' || order.orderStatus === 'EnRouteToDelivery';
                                default:
                                    return true;
                            }
                        }
                        // Fallback to dropdown statusFilter
                        if (statusFilter) {
                            return order.orderStatus === statusFilter;
                        }
                        return true; // No filter matches all
                    })()
                    : true;

            // Match completed orders with time filter
            const matchesTimeFilter =
                orderOperation === 'completed'
                    ? (() => {
                        if (!statusFilter) return true; // No filter matches all
                        const now = new Date();
                        const createdAt = new Date(order.createdAt);

                        switch (statusFilter) {
                            case 'past7Days':
                                return now - createdAt <= 7 * 24 * 60 * 60 * 1000; // 7 days
                            case 'past1Month':
                                return now - createdAt <= 30 * 24 * 60 * 60 * 1000; // 30 days
                            case 'past90Days':
                                return now - createdAt <= 90 * 24 * 60 * 60 * 1000; // 90 days
                            default:
                                return true; // Default to showing all
                        }
                    })()
                    : true;

            const matchesReasonFilter =
                orderOperation === 'canceled'
                    ? (() => {
                        if (!statusFilter) return true; // No filter matches all
                        switch (statusFilter) {
                            case 'noServiceNeeded':
                                return order.cancelReason === "Service no longer needed"
                            case 'mistake':
                                return order.cancelReason === "Order created by mistake"
                            case 'badTime':
                                return order.cancelReason === "Pickup/Delivery time no longer works"
                            case 'other':
                                return order.cancelReason !== "Service no longer needed"
                                    && order.cancelReason !== "Order created by mistake"
                                    && order.cancelReason !== "Pickup/Delivery time no longer works"
                            default:
                                return true; // Default to showing all
                        }
                    })()
                    : true;


            const matchesTab =
                orderTab === 'all' ||
                (orderTab === 'instore' && order.orderId.startsWith('IS-')) ||
                (orderTab === 'online' && order.orderId.startsWith('O-')) ||
                (orderTab === 'commercial' && order.orderId.startsWith('CL-'));

            const matchesPaymentFilter = paymentFilter
                ? normalizeString(order.paymentStatus) === normalizeString(paymentFilter)
                : true;


            return matchesSearchTerm && matchesOrderStatus && matchesTimeFilter && matchesReasonFilter && matchesTab && matchesPaymentFilter;
        });

        let filteredList = filtered;

        if (orderTab === 'online' && sortOrder) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const toDate = (str) => {
                if (!str) return null;
                const [year, month, day] = str.split('-').map(Number);
                return new Date(year, month - 1, day);
            };

            const isToday = (date) => date?.getTime() === today.getTime();

            const todaysOrders = filtered.filter((order) => {
                const pickup = toDate(order.pickupDate);
                const dropoff = toDate(order.dropoffDate);
                return isToday(pickup) || isToday(dropoff);
            });

            const otherOrders = filtered.filter((order) => {
                const pickup = toDate(order.pickupDate);
                const dropoff = toDate(order.dropoffDate);
                return !isToday(pickup) && !isToday(dropoff);
            });

            // Sort other orders by pickupDate DESCENDING (newest first)
            otherOrders.sort((a, b) => {
                const dateA = toDate(a.pickupDate);
                const dateB = toDate(b.pickupDate);
                return dateB - dateA;
            });

            filteredList = [...todaysOrders, ...otherOrders];
        }

        if (orderTab === 'instore' && sortOrder) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const toDate = (str) => {
                if (!str) return null;
                const [year, month, day] = str.split('-').map(Number);
                return new Date(year, month - 1, day);
            };

            const isToday = (date) => date?.getTime() === today.getTime();

            const todaysOrders = filtered.filter((order) => {
                const dropoff = toDate(order.dropoffDate);
                return isToday(dropoff);
            });

            const otherOrders = filtered.filter((order) => {
                const dropoff = toDate(order.dropoffDate);
                return !isToday(dropoff);
            });

            // Sort remaining orders by dropoffDate descending
            otherOrders.sort((a, b) => {
                const dateA = toDate(a.dropoffDate);
                const dateB = toDate(b.dropoffDate);
                return dateB - dateA;
            });

            filteredList = [...todaysOrders, ...otherOrders];
        }

        if (orderTab === 'commercial' && sortOrder) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const toDate = (str) => {
                if (!str) return null;
                const [year, month, day] = str.split('-').map(Number);
                return new Date(year, month - 1, day);
            };

            const isToday = (date) => date?.getTime() === today.getTime();

            const todaysOrders = filtered.filter((order) => {
                const dropoff = toDate(order.dropoffDate);
                return isToday(dropoff);
            });

            const otherOrders = filtered.filter((order) => {
                const dropoff = toDate(order.dropoffDate);
                return !isToday(dropoff);
            });

            // Sort remaining by dropoffDate descending
            otherOrders.sort((a, b) => {
                const dateA = toDate(a.dropoffDate);
                const dateB = toDate(b.dropoffDate);
                return dateB - dateA;
            });

            filteredList = [...todaysOrders, ...otherOrders];
        }


        setFilteredOrders(filteredList);

    }, [searchTerm, statusFilter, activeStatusChip, paymentFilter, orders, orderOperation, orderTab, sortOrder]);


    useEffect(() => {
        const updatedStatusMap = filteredOrders.reduce((map, order) => {
            map[order.orderId] = order.orderStatus || "N/A"; // Fallback to "N/A"
            return map;
        }, {});

        setOrderStatusMap(updatedStatusMap);
    }, [filteredOrders]);

    const fetchLaundryOrders = async (laundryId, orderOperation) => {
        setOrderLoading(true); // Start order loading
        try {
            const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/orders-info`;
            const response = await axios.get(url, {
                params: {
                    operation: orderOperation,
                    laundryId,
                    page: 1
                },
                timeout: 15000,
                headers: {
                    'Authorization': `Bearer ${authToken}`

                },
            });
            console.log("Raw API response:", response.status, response.data);
            let ordersData = response.data?.body || response.data || [];
            // If body is a JSON string, parse it
            if (typeof ordersData === 'string') {
                try {
                    ordersData = JSON.parse(ordersData);
                } catch (e) {
                    console.error('API returned non-JSON body:', ordersData);
                    ordersData = [];
                }
            }
            // Ensure ordersData is always an array
            if (!Array.isArray(ordersData)) {
                console.warn('ordersData is not an array:', ordersData);
                ordersData = [];
            }
            // console.log("all orders:",ordersData);
            // console.log("Full API Response:", response);
            // console.log("Error Message:", response.data?.error || "No error field");
            setOrders(ordersData);
            setFilteredOrders(ordersData);
            // console.log("orders data now : ", filteredOrders);

            // Initialize orderStatusMap with current order statuses
            const initialStatusMap = ordersData.reduce((map, order) => {
                map[order.orderId] = order.orderStatus;
                return map;
            }, {});
            setOrderStatusMap(initialStatusMap);
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                // Timeout specific error
                toast({
                    title: "Request Timeout",
                    description: "The server is taking too long to respond. Please try again.",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                    position: "top",
                });
            } else {
                // General API or network error
                toast({
                    title: "Error Fetching Data",
                    description: "An error occurred while fetching data.",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                    position: "top",
                });
            }
            console.error('Error fetching orders:', error); // Log the error for debugging
            setOrders([]);
            setFilteredOrders([]);
        } finally {
            setOrderLoading(false);
        }
    };

    const fetchLaundryStatuses = async (laundryId) => {
        setLoading(true);
        const params = {
            operation: 'fetchStatuses',
            laundryId: laundryId
        };
        try {
            const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/orders-info`;
            const response = await axios.get(url, {
                params,
                headers: {
                    'Authorization': `Bearer ${authToken}`

                },
            });

            const serviceData = response.data && response.data.body && response.data.body.data
                ? response.data.body.data
                : [];

            setStatusOptions(serviceData);

        } catch (error) {
            console.error('Error fetching laundry services/ statuses:', error);
            setServiceNames([]);

        } finally {
            setLoading(false);
        }
    };

    const handleAfterCancel = ({ orderId, cancelReason }) => {
  // update currently opened order
  setSelectedOrderDetails(prev =>
    prev ? { ...prev, orderStatus: "OrderCanceled", cancelReason } : prev
  );

  // update orders list
  setOrders(prev =>
    Array.isArray(prev)
      ? prev.map(o =>
          o.orderId === orderId
            ? { ...o, orderStatus: "OrderCanceled", cancelReason }
            : o
        )
      : prev
  );

  // optional: mirror in a status map you maintain
  if (typeof setOrderStatusMap === "function") {
    setOrderStatusMap(prev => ({ ...prev, [orderId]: "OrderCanceled" }));
  }
};

    const handlePrintInvoice = async (order) => {
        try {
            const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/admin/print-invoice`, {
                params: {
                    operation: "generateInvoice",
                    orderId: order.orderId,
                    laundryId: laundryId,
                    sendEmail: true,
                },
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                responseType: 'blob',
            });

            const file = new Blob([response.data], {type: 'application/pdf'});
            const fileURL = URL.createObjectURL(file);
            window.open(fileURL);

            toast({
                title: "Invoice Generated",
                description: "Invoice has been opened and sent to the customer.",
                status: "success",
                duration: 4000,
                isClosable: true,
                position: "top",
            });
        } catch (error) {
            console.error("Error generating invoice:", error);
            toast({
                title: "Failed to Generate Invoice",
                description: "Please try again later.",
                status: "error",
                duration: 4000,
                isClosable: true,
                position: "top",
            });
        }
    };

    useEffect(() => {
        const fetchLaundryLogoAndDomain = async () => {
            try {
                const response = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`,
                    {
                        params: {operation: "viewLaundryInfoById", laundryId},
                        headers: {
                            'Authorization': `Bearer ${authToken}`

                        },
                    }
                );

                const laundryInfo = response.data?.body?.laundryInfo?.[0] || {};
                setLaundryLogo(laundryInfo.laundryLogo || null);
            } catch (error) {
                console.error("Error fetching laundry logo:", error);
            }
        };

        fetchLaundryLogoAndDomain();
    }, [laundryId]);

useEffect(() => {
  let isMounted = true; // avoid updating state after unmount

  const fetchLaundryDetails = async () => {
    const laundryDetails = await fetchLaundryInfo(laundryId);
    if (isMounted && laundryDetails) {
      setShopDetails({
        name: laundryDetails.name,
        phone: laundryDetails.phone,
        email: laundryDetails.email,
        address: `${laundryDetails.laundryAddress?.street}, ${laundryDetails.laundryAddress?.city}, ${laundryDetails.laundryAddress?.state} ${laundryDetails.laundryAddress?.zipCode}`,
        instructions: laundryDetails.pickupDropoffInstructions || ""
      });
      setUberEnv(laundryDetails.uberEnv || "");
    }
  };

  fetchLaundryDetails();

  return () => {
    isMounted = false; // prevent stale updates
  };
}, [laundryId]);


    const fetchLaundryServices = async (laundryId) => {
        setLoading(true);
        const params = {
            operation: 'fetchServices',
            laundryId: laundryId
        };
        try {
            const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/orders-info`;
            const response = await axios.get(url, {
                params,
                headers: {
                    'Authorization': `Bearer ${authToken}`
                },
            });

            const servicesData = response.data && response.data.body && response.data.body.data
                ? response.data.body.data
                : [];

            setServiceNames(servicesData);

        } catch (error) {
            console.error('Error fetching laundry services/ statuses:', error);
            setServiceNames([]);

        } finally {
            setLoading(false);
        }
    };

    const fetchSingleOrder = async (laundryId, orderId) => {
        setSingleOrderLoading(true);
        try {
            const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/single-order-info`;
            const response = await axios.get(url, {
                params: {
                    operation: 'getSingleOrder',
                    laundryId,
                    orderId
                },
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
            });
            setSelectedOrderDetails((prev) => ({
                ...prev,
                products: singleOrdersData?.products || [],
            }));

            // Return order details if they exist
            const singleOrdersData = response.data?.body || null;
            setInitialStatus(singleOrdersData.orderStatus);
            return singleOrdersData;
        } catch (error) {
            console.error('Error fetching order details:', error);
            return null;
        } finally {
            setSingleOrderLoading(false);
        }
    };

    const handleOrderClick = async (orderId) => {
        // Open the drawer first
        onDrawerOpen();

        // Reset previous state
        setSelectedOrderDetails(null);
        setOriginalProducts([]);

        // Fetch the data (loading is handled inside fetchSingleOrder)
        const orderDetails = await fetchSingleOrder(laundryId, orderId);
        if (orderDetails) {
            setSelectedOrderDetails(orderDetails);
            setOriginalProducts(orderDetails.products || []);
        } else {
            setSelectedOrderDetails({error: "Failed to load order details. Please try again later."});
        }
    };

    const fetchProducts = async () => {
        try {
            const productsResponse = await fetchLaundryProducts(laundryId);
            // console.log("fetch products:", productsResponse);
            setProducts(productsResponse);
        } catch (error) {
            console.error("Error fetching products:", error);
            toast({
                title: "Error",
                description: "Failed to load products. Please try again.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        }
    };

    // Define a function to check if the current status allows editing
    const isEditableStatus = (orderStatus) => {
        const editableStatuses = ["OrderSubmitted", "ReadyForIntake", "ReceivedAtFacility", "ProcessingStarted"];
        return editableStatuses.includes(orderStatus);
    };

    useEffect(() => {
        const fetchLaundryLogoAndDomain = async () => {
            try {
                const response = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`,
                    {
                        params: {operation: "viewLaundryInfoById", laundryId},
                        headers: {
                            'Authorization': `Bearer ${authToken}`

                        },
                    }
                );

                const laundryInfo = response.data?.body?.laundryInfo?.[0] || {};
                setLaundryLogo(laundryInfo.laundryLogo || null);
            } catch (error) {
                console.error("Error fetching laundry logo:", error);
            }
        };

        fetchLaundryLogoAndDomain();
    }, [laundryId]);


    const fetchLaundryDetails = async () => {
    try {
        const laundryDetails = await fetchLaundryInfo(laundryId);
        console.log("laundry details", laundryDetails);

        if (laundryDetails) {
        console.log("ðŸ§º Laundry Address:", laundryDetails.address);

        setShopDetails({
            name: laundryDetails.laundryName || "",
            phone: laundryDetails.contactDetails?.phoneNumber || "",
            email: laundryDetails.contactDetails?.email || "",
            address: laundryDetails.address || "",
            instructions: laundryDetails.pickupDropoffInstructions || ""
        });
        //   setLaundryTimeZone(laundryDetails.laundryTimeZone || "");
        setUberEnv(laundryDetails.uberEnv || "");
        }
    } catch (err) {
        console.error("âŒ Failed to fetch laundry details:", err);
    }
    };


    useEffect(() => {
    if (laundryId) {
        fetchLaundryDetails(); 
    }
    }, [laundryId]);

    function sanitizeAddress(address) {
    return address
        ?.replace(/\s*,\s*/g, ", ")            // normalize comma spacing
        .replace(/,+/g, ",")                   // remove duplicate commas
        .replace(/\s+/g, " ")                  // collapse multiple spaces
        .replace(/,\s*$/, "")                  // remove trailing comma
        .replace(/,\s*(\d{5})(?:-\d{4})?$/, " $1")  // fix comma before ZIP
        .trim();
    }


    const handleConfirmUberOrder = async () => {
    const isPickup = uberType === "pickup";
    const shopDetails = await fetchShopDetails(laundryId);
    console.log("shop details:", shopDetails);
    const order = selectedOrderDetails;
    console.log("selected order details : ", order);

    const cleanedPickupAddress = sanitizeAddress(
        isPickup
        ? order.customerAddress?.address || "Unknown Pickup Address"
        : shopDetails.address || "Unknown Laundry Address"
    );

    const cleanedDropoffAddress = sanitizeAddress(
        isPickup
        ? shopDetails.address || "Unknown Laundry Address"
        : order.customerAddress?.address || "Unknown Dropoff Address"
    );
    console.log("uberScheduleType:", uberScheduleType);

    const payload = {
        laundry_id: laundryId,
        uberEnv: shopDetails.uberEnv || "",

        pickup_address: cleanedPickupAddress,
        dropoff_address: cleanedDropoffAddress,

        pickup_phone: isPickup
        ? order.customerPhone || ""
        : shopDetails.phone || "",

        dropoff_phone: isPickup
        ? shopDetails.phone || ""
        : order.customerPhone || "",

        order_id: order.orderId || "",

        delivery_date:
        uberScheduleType === "instant"
            ? new Date().toISOString().split("T")[0]
            : isPickup
            ? order.pickupDate
            : order.dropoffDate,

        time_interval:
        uberScheduleType === "instant"
            ? pickupTimeWindow
            : isPickup
            ? order.pickupTimeInterval || ""
            : order.dropoffTimeInterval || "",

        laundry_bags_qty: order.laundryBags || 1,

        type: isPickup ? "laundryPickup" : "laundryDropoff",

        pickup_name: isPickup
        ? order.customerName || "Customer"
        : shopDetails.name || "Laundry",

        dropoff_name: isPickup
        ? shopDetails.name || "Laundry"
        : order.customerName || "Customer",

        pickup_notes: isPickup
        ? order.customerAddress?.addressInstructions || ""
        : shopDetails.instructions || "",

        dropoff_notes: isPickup
        ? shopDetails.instructions || ""
        : order.customerAddress?.addressInstructions || "",

        laundry_name: shopDetails.name || "Laundry",
    };

    console.log("Uber order payload", payload);

        try {
            const response = await fetch(
                `${process.env.REACT_APP_AWS_API_URL}/api/uber/uberQuoteEstimate?operation=schedule-uber-order`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", 
                        // 'Authorization': `Bearer ${authToken}` 
                    },
                    body: JSON.stringify(payload)
                }
            );
            const result = await response.json();
            console.log("uber api response:", result);

            if (result.statusCode === 200) {
            toast({
                title: "Uber Scheduled",
                description: `Uber ${uberType} order placed successfully.`,
                status: "success",
                duration: 4000,
                isClosable: true,
                position: "top",
            });

            setUberModalOpen(false);
            fetchLaundryOrders(laundryId, orderOperation);
            } else {
            let friendlyMessage = "Something went wrong while scheduling the Uber. Please try again.";

            try {
                const parsed = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
                const rawError = parsed?.error || "";

                if (rawError.includes("400 Client Error")) {
                friendlyMessage = "Uber could not process the request. Please check the address and phone number.";
                } else if (rawError.includes("delivery_quotes")) {
                friendlyMessage = "Uber failed to generate a quote. Try again in a few minutes.";
                }
            } catch (e) {
                // default message stays
            }

            toast({
                title: "Uber Scheduling Failed",
                description: friendlyMessage,
                status: "error",
                duration: 6000,
                isClosable: true,
                position: "top",
            });
            }
        } catch (error) {
            console.error("Uber order failed", error);

            toast({
            title: "Uber Error",
            description: "Failed to place Uber order.",
            status: "error",
            duration: 4000,
            isClosable: true
            });
        }
    };


    const handlePlaceUber = (type) => {
    if (!isSessionValid()) {
        setEmpId("");
        setPasscode("");
        endSession(true);
        onCredentialModalOpen(); // already exists
        return;
    }

    refreshAdminActivity(); // keep session alive
    setUberType(type); // "pickup" or "dropoff"
    setUberModalOpen(true); // open modal
    };

    const handleConfirmUberOrderFromModal = async (customAddress) => {
  const isPickup = false; // we're placing DROP OFF

  const shopDetails = await fetchShopDetails(laundryId);
  const order = selectedOrderDetails;

  const payload = {
    laundry_id: laundryId,
    uberEnv: shopDetails.uberEnv || "",

    pickup_address: shopDetails.address || "Unknown Laundry Address",
    dropoff_address: customAddress,

    pickup_phone: shopDetails.phone || "",  
    dropoff_phone: order.customerPhone || "",

    order_id: order.orderId || "",
    delivery_date: uberScheduleType === "instant"
      ? new Date().toISOString().split("T")[0]
      : order.dropoffDate,

    time_interval: uberScheduleType === "instant"
      ? getInstantPickupWindow(laundryTimeZone)
      : order.dropoffTimeInterval || "",

    laundry_bags_qty: order.laundryBags || 1,
    type: "laundryDropoff",

    pickup_name: shopDetails.name || "Laundry",
    dropoff_name: order.customerName || "Customer",

    pickup_notes: shopDetails.instructions || "",
    dropoff_notes: order.customerAddress?.addressInstructions || "",

    laundry_name: shopDetails.name || "Laundry",
  };

  try {
    const response = await fetch(
      `${process.env.REACT_APP_AWS_API_URL}/api/uber/uberQuoteEstimate?operation=schedule-uber-order`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (result.statusCode === 200) {
      toast({
        title: "Uber Scheduled",
        description: "Uber delivery order placed successfully.",
        status: "success",
        duration: 4000,
        isClosable: true,
        position: "top",
      });

      fetchLaundryOrders(laundryId, orderOperation);
      onDrawerClose();
    } else {
      let friendlyMessage = "Failed to schedule Uber. Please check details.";

      try {
        const parsed = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
        const rawError = parsed?.error || "";

        if (rawError.includes("400 Client Error")) {
          friendlyMessage = "Uber rejected the request. Check address/phone.";
        } else if (rawError.includes("delivery_quotes")) {
          friendlyMessage = "Uber failed to quote. Try again later.";
        }
      } catch (_) {}

      toast({
        title: "Uber Error",
        description: friendlyMessage,
        status: "error",
        duration: 6000,
        isClosable: true,
        position: "top",
      });
    }
  } catch (err) {
    console.error("Uber API Error", err);
    toast({
      title: "Error",
      description: "Something went wrong while placing the Uber order.",
      status: "error",
      duration: 5000,
      isClosable: true,
    });
  }
};

const { open: openCancelUber, ModalUI: CancelUberModal } = useCancelUberHandoff();

    const OrderDetailsDrawer = () => {
        const canEditServices = isEditableStatus(selectedOrderDetails?.orderStatus);
        const [serviceSearchTerm, setServiceSearchTerm] = useState('');
        const [productSearchTerm, setProductSearchTerm] = useState('');
        const [isCancelingOrder, setIsCancelingOrder] = useState(false);
        const truncateText = useAdaptiveTruncate();
        // Responsive values
        const drawerPlacement = useBreakpointValue({base: "bottom", md: "right"});
        const drawerSize = useBreakpointValue({ base: "xs", sm: "xs", md: "sm", lg: "md" });
        const modalSize = useBreakpointValue({base: "xs", sm: "xs", md: "sm", lg: "md"});
        const modalWidth = useBreakpointValue({base: "90%", sm: "80%", md: "60%", lg: "40%"});
        const modalMaxHeight = useBreakpointValue({base: "65vh", sm: "70vh", md: "75vh", lg: "80vh"});
        const inputSize = useBreakpointValue({base: "xs", md: "sm"});
        const buttonSize = useBreakpointValue({base: "xs", md: "sm"});
        const fontSize = useBreakpointValue({base: "xs", md: "sm"});
        const tablePadding = useBreakpointValue({base: 1, md: 2});
        const [confirmLoading, setConfirmLoading] = useState(false);

        const status = selectedOrderDetails?.orderStatus?.trim().toLowerCase();
        const orderType = selectedOrderDetails?.orderType?.trim().toLowerCase();
        const onConfirm = async () => {
    setConfirmLoading(true);
    try {
      await handleConfirmUberOrder(); // wait for backend response
    } finally {
      setConfirmLoading(false);
    }
  };

        const isOrderEditDisabled =
            (orderType === "commercial" && (status === "delivered" && selectedOrderDetails?.paymentStatus === "Paid")) ||
            (orderType !== "commercial" &&
                (
                    status === "ordercanceled" ||
                    status === "delivered" ||
                    status === "orderpickedup"
                )
            );


        const handleEditClick = () => {
            if (isSessionValid()) {
                setIsEditMode(true);
                refreshAdminActivity();
                const sessionEmpId = getEmpId();
                if (sessionEmpId) {
                    setEmpId(sessionEmpId);
                }
            } else {
                setEmpId("");
                setPasscode("");
                endSession(true); // Clear session silently
                onCredentialModalOpen();
            }
        };

        const productsArray = Object.values(products);

        // Payment Button logic
        const isInStoreOrder = selectedOrderDetails?.orderType === "InStore";
        const payments = Array.isArray(selectedOrderDetails?.finalPaymentIntentId)
            ? selectedOrderDetails.finalPaymentIntentId
            : [];
        const totalPaymentsReceived = payments
            .filter(p => p.paymentMethod !== 'hold')
            .reduce((acc, p) => acc + roundToTwo(parseFloat(p.amount || 0)), 0);
        const totalCost = roundToTwo(selectedOrderDetails?.totalCost || 0);
        const tipCost = roundToTwo(selectedOrderDetails?.tip.tipAmount || 0);
        const combinedCost = roundToTwo(totalCost + tipCost); // TODO: replace with grandTotal

        const handleValidateCredentials = async () => {
            setEmployeevalidationLoading(true);
            try {
                // Validate employee credentials and get role
                // const { isValidated, role } = await validateEmpCredentials(laundryId, empId, passcode);
                const fullEmpId = empPrefix + empId;
                const {isValidated, role} = await validateEmpCredentials(laundryId, fullEmpId, passcode);


                if (isValidated) {
                    // Restrict access for Delivery Driver
                    if (role === "Delivery Driver") {
                        toast({
                            title: "Access Denied",
                            description: `Your role is '${role}'. You do not have permission to edit this order.`,
                            status: "error",
                            duration: 3000,
                            isClosable: true,
                            position: "top",
                        });
                        setEmployeevalidationLoading(false);
                        return; // Exit function without enabling edit mode
                    }

                    startSession(fullEmpId); //fullEmpId to store in session
                    setEmpId(fullEmpId);
                    // Enable edit mode for all other roles
                    toast({
                        title: "Validation Success",
                        description: `Employee credentials validated successfully! (Role: ${role})`,
                        status: "success",
                        duration: 3000,
                        isClosable: true,
                        position: "top",
                    });

                    onCredentialModalClose();

                    if (isCancelingOrder) {
                        // handleCancelOrder();
                        setIsCancelingOrder(false);
                    } else {
                        setEmpId(fullEmpId);
                        setIsEditMode(true);
                    }

                } else {
                    toast({
                        title: "Validation Failed",
                        description: `Invalid employee credentials. Your role: '${role || "Unknown"}'.`,
                        status: "error",
                        duration: 3000,
                        isClosable: true,
                        position: "top",
                    });
                    console.error("Invalid credentials");
                }
            } catch (error) {
                console.error("Error validating employee credentials:", error);
                toast({
                    title: "Validation Error",
                    description: "An error occurred during validation.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });
            } finally {
                setEmployeevalidationLoading(false);
            }
        };

        const getAvailableServices = () => {
            const existingServiceNames = (selectedOrderDetails?.services || []).map((service) => service.service.toLowerCase());
            return serviceNames.filter((service) => !existingServiceNames.includes(service.serviceName.toLowerCase()));
        };

        // const handleCancelOrder = () => {
        //     handleSave({
        //         ...selectedOrderDetails,
        //         orderStatus: "OrderCanceled"
        //     }, laundryId).then(r => setIsCancelingOrder(false));

        // };

        const handleAddService = (selectedService) => {
            const {serviceName, price, inputWeight} = selectedService;
            setSelectedOrderDetails((prev) => {
                const updatedServices = [
                    ...(prev.services || []),
                    {
                        service: serviceName,
                        weightOrCount: inputWeight ? 0.1 : 1,
                        servicePrice: price,
                        inputWeight: inputWeight
                    },
                ];
                const newTotalCost = updateOrderTotals(updatedServices, prev.products || []);

                return {
                    ...prev,
                    services: updatedServices,
                    totalCost: newTotalCost,
                    subTotal: newTotalCost,
                };
            });

            setServicesToAddMap((prev) => ({
                ...prev,
                [selectedOrderDetails.orderId]: [
                    ...(prev[selectedOrderDetails.orderId] || []),
                    {
                        service: serviceName,
                        weightOrCount: inputWeight ? 0.1 : 1,
                        servicePrice: price,
                        inputWeight: inputWeight
                    }
                ],
            }));

        };

        const handleDeleteService = (index) => {
            if (selectedOrderDetails.services.length === 1) {
                toast({
                    title: "Cannot Remove Service",
                    description: "At least one service is required in the order.",
                    status: "warning",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });
                return; // Stop further execution
            }

            setSelectedOrderDetails((prev) => {
                const removedService = prev.services[index];
                const updatedServices = prev.services.filter((_, i) => i !== index);

                setServicesToRemoveMap((prevMap) => ({
                    ...prevMap,
                    [prev.orderId]: [...(prevMap[prev.orderId] || []), removedService.id || removedService.service]
                }));

                const newTotalCost = updateOrderTotals(updatedServices, prev.products || []);

                return {
                    ...prev,
                    services: updatedServices,
                    totalCost: newTotalCost,
                    subTotal: newTotalCost, // Update subTotal as well
                };
            });
        };

        const handleServiceChange = (index, field, value) => {
            setSelectedOrderDetails((prev) => {
                const updatedServices = prev.services.map((service, i) =>
                    i === index ? {...service, [field]: value} : service
                );

                const newTotalCost = updateOrderTotals(updatedServices, prev.products || []);

                return {
                    ...prev,
                    services: updatedServices,
                    totalCost: newTotalCost,
                    subTotal: newTotalCost, // Update subTotal as well
                };
            });
        };


        const handleAddProduct = (product) => {

            const normalizedProduct = {
                ...product,
                productPrice: product.price || product.productPrice,
            };


            setProductsToAdd((prev) => {
                setProductsToRemove((removePrev) =>
                    removePrev.filter((removedProduct) => removedProduct !== normalizedProduct.productName)
                );

                const isProductAlreadyAdded = prev.some(
                    (p) => p.productName === normalizedProduct.productName
                );

                return isProductAlreadyAdded
                    ? prev
                    : [...prev, {productName: normalizedProduct.productName, productCount: 1}];
            });

            setSelectedOrderDetails((prev) => {
                const isProductAlreadyInOrder = (prev.products || []).some(
                    (p) => p.productName === normalizedProduct.productName
                );

                const updatedProducts = isProductAlreadyInOrder
                    ? prev.products
                    : [...(prev.products || []), {...normalizedProduct, productCount: 1}];

                // console.log("Updated Products after Addition:", updatedProducts);

                const newTotalCost = updateOrderTotals(prev.services || [], updatedProducts);

                // console.log("Updated Total Cost after Addition:", updatedTotalCost);

                return {
                    ...prev,
                    products: updatedProducts,
                    totalCost: newTotalCost,
                    subTotal: newTotalCost, // Update subTotal as well
                };
            });
        };


        const handleDeleteProduct = (index) => {
            setSelectedOrderDetails((prev) => {
                const productToDelete = prev.products[index];

                // Normalize the product to ensure consistency
                const normalizedProductToDelete = {
                    ...productToDelete,
                    productPrice: productToDelete.price || productToDelete.productPrice,
                };

                // console.log("Normalized Product to Delete:", normalizedProductToDelete);

                const updatedProducts = prev.products
                    .filter((_, i) => i !== index)
                    .map((product) => ({
                        ...product,
                        productPrice: product.price || product.productPrice, // Ensure all products are normalized
                    }));

                // console.log("Updated Products after Deletion:", updatedProducts);

                // Update `productsToRemove` and `productsToAdd`
                setProductsToRemove((prevRemove) => {
                    const isOriginalProduct = originalProducts.some(
                        (p) => p.productName === normalizedProductToDelete.productName
                    );
                    return isOriginalProduct
                        ? [...prevRemove, normalizedProductToDelete.productName]
                        : prevRemove;
                });

                setProductsToAdd((prevAdd) =>
                    prevAdd.filter(
                        (addedProduct) =>
                            addedProduct.productName !== normalizedProductToDelete.productName
                    )
                );

                const newTotalCost = updateOrderTotals(prev.services || [], updatedProducts);

                return {
                    ...prev,
                    products: updatedProducts,
                    totalCost: newTotalCost,
                    subTotal: newTotalCost, // Update subTotal as well
                };
            });
        };

        const handleUpdateProductCount = (index, newCount) => {
            // const updatedCount = parseInt(newCount, 10) || 0;
            let processedCount = newCount;
            if (newCount === '' || isNaN(newCount)) {
                processedCount = 1; // Default to 1 if empty or invalid
            } else {
                processedCount = Math.max(1, parseInt(newCount, 10)); // Ensure minimum 1
            }
            // console.log("Updating product count:", { index, newCount, updatedCount });

            setSelectedOrderDetails((prev) => {
                const updatedProducts = prev.products.map((p, i) =>
                    i === index ? {...p, productCount: processedCount} : p
                );

                // Add the updated product to `productsToUpdate`
                setProductsToUpdate((prevProductsToUpdate) => {
                    const updatedProduct = updatedProducts[index];
                    const isAlreadyInUpdate = prevProductsToUpdate.some(
                        (product) => product.productName === updatedProduct.productName
                    );

                    if (isAlreadyInUpdate) {
                        return prevProductsToUpdate.map((product) =>
                            product.productName === updatedProduct.productName
                                ? {...product, productCount: processedCount}
                                : product
                        );
                    } else {
                        return [...prevProductsToUpdate, {...updatedProduct}];
                    }
                });

                const newTotalCost = updateOrderTotals(prev.services || [], updatedProducts);

                return {
                    ...prev,
                    products: updatedProducts,
                    totalCost: newTotalCost,
                    subTotal: newTotalCost, // Update subTotal as well
                };
            });
        };

        const getAvailableProducts = () => {
            return productsArray.filter(
                (product) =>
                    !selectedOrderDetails.products?.some(
                        (p) => p.productName === product.productName
                    )
            );
        };

        const calculateTotalPrice = (services = [], products = []) => {
            // Calculate the total cost for services
            const serviceTotal = services.reduce(
                (sum, service) =>
                    sum +
                    parseFloat(service.servicePrice || 0) * parseFloat(service.weightOrCount || 0),
                0
            );

            // Calculate the total cost for products
            const productTotal = products.reduce(
                (sum, product) =>
                    sum +
                    parseFloat(product.productPrice || product.price || 0) * parseInt(product.productCount || 0, 10),
                0
            );

            return roundToTwo(serviceTotal + productTotal);
        };
        // new function
        const updateOrderTotals = (services, products) => {
            const newTotalCost = calculateTotalPrice(services, products);
            return newTotalCost;
        };


        const handleEditModeClose = () => {
            setIsEditMode(false);  // Exit edit mode
            onDrawerClose();       // Close the drawer
            if (shouldRefetchOrdersAfterClose) {
                fetchLaundryOrders(laundryId, orderOperation);
                setShouldRefetchOrdersAfterClose(false);
            }
        };

        // Replace the adjustedStatusOptions and status change handler with:
        const isOnlineOrder = selectedOrderDetails?.orderId.startsWith("O-");
        const isProcessingCompleted = orderStatusMap[selectedOrderDetails?.orderId] === "ProcessingCompleted";
        const isMenuDisabled = false; // Never disable â€” individual menu items handle blocking

        // Adjust status options dynamically
        let adjustedStatusOptions = [...statusOptions];

        if (isOnlineOrder) {
            // Skip displaying OrderPickedUp for online orders
            adjustedStatusOptions = adjustedStatusOptions.filter(
                status => status !== "OrderPickedUp"
            );
        }

        if (isInStoreOrder) {
            // Replace Delivered with OrderPickedUp for in-store orders
            adjustedStatusOptions = adjustedStatusOptions.filter(
                status => status !== "Delivered"
            );
        }

        // Status change handler
        const handleStatusChange = (status) => {
            setSelectedOrderDetails(prev => ({
                ...prev,
                orderStatus: status
            }));

            if (status === "ProcessingCompleted") {
                toast({
                    title: "You are changing the order status to 'ProcessingCompleted'",
                    description: "Please note that no updates to the order will be saved after this. If you wish to make any updates, please cancel the status and update the order first.",
                    status: "warning",
                    duration: 5000,
                    isClosable: true,
                    position: "top",
                });
            }
        };

        return (
            <Drawer
                isOpen={isDrawerOpen}
                placement={drawerPlacement}
                onClose={() => {
                    setIsEditMode(false);
                    onDrawerClose();
                }}
                size={drawerSize}
            >
                <DrawerOverlay/>
                <DrawerContent
                    borderTopRadius={{base: "xl", md: "none"}}
                    maxH={{base: "75vh", md: "100vh"}}
                    overflowY="auto"
                >

                    <DrawerHeader
                        borderBottomWidth="1px"
                        display="flex"
                        justifyContent={{base: "center", md: "space-between"}}
                        alignItems="center"
                        position="relative"
                        flexDirection={{base: "column", md: "row"}}
                        gap={{base: 2, md: 0}}
                        px={{base: 3, md: 4}}
                        py={3}
                    >
                        {/* Left: Close and Edit Buttons */}
                        <Box display="flex" gap={2} justifyContent="flex-start">
                            <IconButton
                                aria-label="Close drawer"
                                icon={<CloseIcon/>}
                                variant="outline"
                                size={buttonSize}
                                onClick={handleEditModeClose}
                                borderRadius="md"
                                colorScheme="gray"
                            />

                            {isEditMode ? (
                                <Button
                                    colorScheme="green"
                                    size={buttonSize}
                                    minWidth={{base: "70px", md: "85px"}}
                                    isLoading={saveLoading}
                                    isDisabled={selectedOrderDetails?.orderStatus === "OrderCanceled"}
                                    onClick={() => {
                                        // Check for any invalid services
                                        const hasInvalidServices = selectedOrderDetails.services.some(
                                            service => service.weightOrCount === "" ||
                                                isNaN(service.weightOrCount) ||
                                                parseFloat(service.weightOrCount) < 0.1
                                        );

                                        if (hasInvalidServices) {
                                            toast({
                                                title: "Cannot Save Order",
                                                description: "Please enter valid quantities for all services (minimum 0.1)",
                                                status: "error",
                                                duration: 3000,
                                                isClosable: true,
                                                position: "top",
                                            });
                                            return;
                                        }
                                        handleSave(selectedOrderDetails, laundryId);
                                    }}

                                >
                                    Save
                                </Button>
                            ) : (
                                <Button
                                    colorScheme="blue"
                                    size={buttonSize}
                                    minWidth={{base: "70px", md: "85px"}}
                                    isDisabled={isOrderEditDisabled}
                                    onClick={handleEditClick}
                                >
                                    Edit
                                </Button>
                            )}
                        </Box>

                        {/* Center: Highlighted Order Details */}
                        <Text
                            fontSize={{base: "sm", md: "md"}}
                            fontWeight="bold"
                            textAlign="center"
                            mt={{base: 2, md: 0}}
                            mx={{base: 0, md: 2}}
                            noOfLines={1}
                        >
                            Order #{selectedOrderDetails?.orderId}
                        </Text>

                        {/* <Button
                            colorScheme="red"
                            size={buttonSize}
                            minWidth={{base: "100px", md: "120px"}}
                            isDisabled={selectedOrderDetails?.orderStatus === "OrderCanceled" ||
                                selectedOrderDetails?.orderStatus === "ProcessingStarted" ||
                                selectedOrderDetails?.orderStatus === "ProcessingCompleted" ||
                                selectedOrderDetails?.orderStatus === "EnRouteToDelivery" ||
                                selectedOrderDetails?.orderStatus === "Delivered" ||
                                selectedOrderDetails?.orderStatus === "OrderPickedUp" ||
                                selectedOrderDetails?.paymentStatus === "Paid"
                            }
                            onClick={() => {
                                const confirmCancel = window.confirm("Are you sure you want to cancel this order? This action cannot be undone.");
                                if (confirmCancel) {
                                    setIsCancelingOrder(true);  // Important to mark that cancel flow started
                                    if (isSessionValid()) {
                                        refreshAdminActivity();   // Refresh session timer
                                        handleCancelOrder();      // Directly cancel if session is valid
                                    } else {
                                        setEmpId("");
                                        setPasscode("");
                                        onCredentialModalOpen();  // Open credentials modal if session expired
                                    }
                                }
                            }}

                        >
                            {selectedOrderDetails?.orderStatus === "OrderCanceled" ? "Canceled" : "Cancel Order"}
                        </Button> */}

                        <Button
  colorScheme="red"
  size={buttonSize}
  minWidth={{ base: "100px", md: "120px" }}
  isDisabled={
    selectedOrderDetails?.orderStatus === "OrderCanceled" ||
    selectedOrderDetails?.orderStatus === "ProcessingStarted" ||
    selectedOrderDetails?.orderStatus === "ProcessingCompleted" ||
    selectedOrderDetails?.orderStatus === "EnRouteToDelivery" ||
    selectedOrderDetails?.orderStatus === "Delivered" ||
    selectedOrderDetails?.orderStatus === "OrderPickedUp" ||
    selectedOrderDetails?.paymentStatus === "Paid"
  }
  onClick={() => {
    setIsCancelingOrder(true);
    if (isSessionValid()) {
      refreshAdminActivity();
      cancelDialog.onOpen(); // open the new AlertDialog
    } else {
      setEmpId("");
      setPasscode("");
      onCredentialModalOpen(); // after credentials validated, call cancelDialog.onOpen()
    }
  }}
>
  {selectedOrderDetails?.orderStatus === "OrderCanceled"
    ? "Canceled"
    : "Cancel Order"}
</Button>

                    </DrawerHeader>

                    <DrawerBody overflowY="auto" p={{base: 1, md: 2}}>
                        {singleOrderLoading ? (
                            <Center h="100%">
                                <Spinner size="lg"/>
                                <Text mt={4}>Loading order details...</Text>
                            </Center>
                        ) : selectedOrderDetails.error ? (
                            <Center h="100%">
                                <Text color="red.500" fontWeight="bold">{selectedOrderDetails.error}</Text>
                            </Center>
                        ) : (
                            <Stack spacing={2}>
                                {/* Status and Payment */}
                                <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                                    <Flex align="center" gap={2} flexWrap="wrap">
                                        {isEditMode ? (
                                            <Menu>
                                                <MenuButton as={Button} rightIcon={<ChevronDownIcon/>}
                                                            colorScheme="blue"
                                                            size={buttonSize}
                                                            isDisabled={isMenuDisabled}
                                                >
                                                    {truncateText(selectedOrderDetails.orderStatus)}
                                                </MenuButton>
                                                <MenuList maxH="70vh" overflowY="auto">
                                                    {adjustedStatusOptions.map((status, index) => {
                                                        const baseStatus = initialStatus || selectedOrderDetails.orderStatus;
                                                        const currentIndex = adjustedStatusOptions.indexOf(baseStatus);
                                                        const isEnabled = index === currentIndex || index === currentIndex + 1;
                                                        
                                                        // Don't allow admin to set Delivered for online orders (driver only)
                                                        const isTerminalStatus = status === "Delivered" || (status === "OrderPickedUp" && selectedOrderDetails?.orderType === "Online");

                                                        // Payment logic:
                                                        // - Can't go past ProcessingCompleted unless paid (or invoice sent)
                                                        // - Exception: In-store can go to OrderPickedUp (pay at counter)
                                                        const isPaid = selectedOrderDetails?.paymentStatus === "Paid" || selectedOrderDetails?.paymentStatus === "Invoice Sent";
                                                        const isInStoreOrder = selectedOrderDetails?.orderType === "InStore";
                                                        const isPastProcessing = ["EnRouteToDelivery", "Delivered", "OrderPickedUp"].includes(status);
                                                        const isBlockedByPayment = isPastProcessing && !isPaid 
                                                            && !(isInStoreOrder && status === "OrderPickedUp");

                                                        // For in-store orders: allow jumping from ProcessingCompleted to OrderPickedUp
                                                        const isPickedUpFromProcessing = isInStoreOrder && status === "OrderPickedUp" && baseStatus === "ProcessingCompleted";
                                                        const finalEnabled = isEnabled || isPickedUpFromProcessing;

                                                        return (
                                                            <MenuItem
                                                                key={status}
                                                                onClick={() => (finalEnabled && !isTerminalStatus && !isBlockedByPayment) && handleStatusChange(status)}
                                                                isDisabled={!finalEnabled || isTerminalStatus || isBlockedByPayment}
                                                            >
                                                                {status}{isBlockedByPayment ? ' (Payment Required)' : ''}
                                                            </MenuItem>
                                                        );
                                                    })}
                                                </MenuList>
                                            </Menu>
                                        ) : (
                                            <Badge
                                                colorScheme={
                                                    selectedOrderDetails.orderStatus === "OrderCanceled"
                                                        ? "red"
                                                        : selectedOrderDetails.orderStatus === "Delivered"
                                                            ? "green"
                                                            : "blue"
                                                }
                                                fontSize={fontSize}
                                                px={3}
                                                py={1}
                                            >
                                                {selectedOrderDetails.orderStatus}
                                            </Badge>
                                        )}
                                        <Badge
                                            colorScheme={selectedOrderDetails.paymentStatus === "Paid" ? "green" : "red"}
                                            fontSize={fontSize}
                                            px={3}
                                            py={1}
                                        >
                                            Payment: {selectedOrderDetails.paymentStatus}
                                        </Badge>

                                        {/* Payment Button - Placed next to Order Status */}
                                        {isInStoreOrder && !paymentButtonDisplay && (combinedCost > totalPaymentsReceived) && (
                                                <Tooltip
                                                    label={isEditMode ? "" : "Enable Edit Mode"}
                                                    aria-label="Payment Button Tooltip"
                                                    isDisabled={isEditMode}
                                                >
                                                    <Button
                                                        size={buttonSize}
                                                        colorScheme={
                                                            totalPaymentsReceived === 0
                                                                ? "blue"
                                                                : combinedCost === totalPaymentsReceived
                                                                    ? "green"
                                                                    : combinedCost < totalPaymentsReceived
                                                                        ? "orange"
                                                                        : "yellow"
                                                        }
                                                        isDisabled={!isEditMode}
                                                        onClick={handleOpenPaymentModal}
                                                    >
                                                        {totalPaymentsReceived === 0
                                                            ? "Initiate Payment"
                                                            : combinedCost === totalPaymentsReceived
                                                                ? "Finalize Payment"
                                                                : combinedCost < totalPaymentsReceived
                                                                    ? "Refund"
                                                                    : "Collect"}
                                                    </Button>
                                                </Tooltip>
                                            )}
                                    </Flex>

                                </Flex>

                                {/* Customer and Address */}
                                <Flex direction={{base: "column", md: "row"}} gap={3}>
                                    <Box flex="1" bg="gray.50" p={3} borderRadius="md">
                                        <Stack spacing={1}>
                                            <Text fontWeight="bold" fontSize={fontSize}>
                                                {selectedOrderDetails.customerName || "N/A"}
                                            </Text>
                                            <Text fontSize={fontSize}>{selectedOrderDetails.customerPhone}</Text>
                                            {selectedOrderDetails.customerEmail && (
                                                <Text fontSize={fontSize}>
                                                    {selectedOrderDetails.customerEmail}
                                                </Text>
                                            )}
                                        </Stack>
                                    </Box>

                                    <Box flex="1" bg="gray.50" p={3} borderRadius="md">
                                        <HStack spacing={2} mb={1}>
                                            <Text fontWeight="bold" fontSize={fontSize}>Delivery Address</Text>
                                        </HStack>
                                        {selectedOrderDetails.customerAddress?.address ? (
                                            <Stack spacing={1} fontSize={fontSize}>
                                                <Text
                                                    noOfLines={2}>{selectedOrderDetails.customerAddress.address}</Text>
                                                {selectedOrderDetails.customerAddress.doorNumber && (
                                                    <Text>Door
                                                        #: {selectedOrderDetails.customerAddress.doorNumber}</Text>
                                                )}
                                                {selectedOrderDetails.customerAddress.addressInstructions && (
                                                    <Text noOfLines={2}>
                                                        <Text as="span" fontWeight="semibold">Instructions: </Text>
                                                        {selectedOrderDetails.customerAddress.addressInstructions}
                                                    </Text>)}
                                            </Stack>
                                        ) : (
                                            <Text fontSize={fontSize}>Address Not Available</Text>
                                        )}
                                    </Box>
                                </Flex>

                                {/* Order Summary */}
                                <Box>
                                    <Text fontSize="md" fontWeight="bold" mb={2}>Order Summary</Text>

                                    {/* Services */}
                                    <Box mb={4}>
                                        <Table variant="simple" size="sm">
                                            <Thead>
                                                <Tr>
                                                    <Th px={tablePadding} py={2} textAlign="left">Service</Th>
                                                    <Th px={tablePadding} py={2} textAlign="center">Qty</Th>
                                                    <Th px={tablePadding} py={2} textAlign="center">Price</Th>
                                                    {isEditMode && canEditServices && <Th px={tablePadding} py={2}/>}
                                                </Tr>
                                            </Thead>
                                            <Tbody>
                                                {selectedOrderDetails.services?.map((service, index) => (
                                                    <Tr key={index}>
                                                        <Td
                                                            px={tablePadding}
                                                            py={2}
                                                            textAlign="left"
                                                        >
                                                            <Tooltip label={service.service} placement="top">
                                                                <Text noOfLines={1}>
                                                                    {truncateText(service.service)}
                                                                </Text>
                                                            </Tooltip>
                                                        </Td>
                                                        <Td px={tablePadding} py={2} textAlign="center">
                                                            {isEditMode && canEditServices ? (
                                                                <Input
                                                                    placeholder="Weight/Count"
                                                                    value={service.weightOrCount}
                                                                    onChange={(e) => {
                                                                        const value = e.target.value;
                                                                        // Allow empty value or any numeric input
                                                                        if (value === "" || !isNaN(value)) {
                                                                            handleServiceChange(index, "weightOrCount", value);
                                                                        }
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        if (e.target.value === "" || parseFloat(e.target.value) < 0.1) {
                                                                            // Default to weight-based (0.1) if we're not sure
                                                                            const isWeightBased = service.inputWeight ??
                                                                                serviceNames.find(s => s.serviceName === service.service)?.inputWeight ??
                                                                                true;
                                                                            handleServiceChange(index, "weightOrCount", isWeightBased ? 0.1 : 1);
                                                                        }
                                                                    }}
                                                                    size={inputSize}
                                                                    textAlign="center"
                                                                    type="number"
                                                                    isInvalid={service.weightOrCount === "" ||
                                                                        isNaN(service.weightOrCount) ||
                                                                        parseFloat(service.weightOrCount) < 0.1}
                                                                    errorBorderColor="red.500"
                                                                    focusBorderColor={service.weightOrCount === "" ||
                                                                    isNaN(service.weightOrCount) ||
                                                                    parseFloat(service.weightOrCount) < 0.1 ? "red.500" : "blue.500"}
                                                                    width={{base: "70px", md: "90px"}}
                                                                />
                                                            ) : (
                                                                service.weightOrCount
                                                            )}
                                                        </Td>
                                                        <Td px={tablePadding} py={2} textAlign="center">
                                                            ${service.servicePrice ||
                                                            serviceNames.find((s) => s.serviceName === service.service)?.price}
                                                            {service.inputWeight ??
                                                            serviceNames.find((s) => s.serviceName === service.service)?.inputWeight
                                                                ? "/lb"
                                                                : "/piece"}
                                                        </Td>
                                                        {isEditMode && canEditServices && (
                                                            <Td px={tablePadding} py={2} textAlign="center">
                                                                <IconButton
                                                                    aria-label="Delete service"
                                                                    icon={<CloseIcon/>}
                                                                    size="xs"
                                                                    colorScheme="red"
                                                                    onClick={() => {
                                                                        if (selectedOrderDetails.services.length === 1) {
                                                                            toast({
                                                                                title: "Cannot Remove Service",
                                                                                description: "At least one service is required in the order.",
                                                                                status: "warning",
                                                                                duration: 3000,
                                                                                isClosable: true,
                                                                                position: "top",
                                                                            });
                                                                            return;
                                                                        }
                                                                        handleDeleteService(index);
                                                                    }}
                                                                />
                                                            </Td>
                                                        )}
                                                    </Tr>
                                                ))}
                                            </Tbody>
                                        </Table>

                                        {isEditMode && canEditServices && (
                                            <Box mt={2}>
                                                <Menu>
                                                    <MenuButton
                                                        as={Button}
                                                        rightIcon={<ChevronDownIcon/>}
                                                        size={buttonSize}
                                                    >
                                                        Add Service
                                                    </MenuButton>
                                                    <MenuList maxH="70vh" overflowY="auto">
                                                        <Box px={3} py={2}>
                                                            <Input
                                                                placeholder="Search services"
                                                                value={serviceSearchTerm}
                                                                onChange={(e) => setServiceSearchTerm(e.target.value)}
                                                                size={inputSize}
                                                            />
                                                        </Box>
                                                        {getAvailableServices()
                                                            .filter((service) =>
                                                                service.serviceName.toLowerCase().includes(serviceSearchTerm.toLowerCase())
                                                            )
                                                            .map((service) => (
                                                                <MenuItem
                                                                    key={service.serviceName}
                                                                    onClick={() => handleAddService(service)}
                                                                >
                                                                    <Flex justify="space-between" w="100%">
                                                                        <Text
                                                                            fontSize={fontSize}>{truncateText(service.serviceName)}</Text>
                                                                        <Text fontSize={fontSize}>
                                                                            ${service.price} {service.inputWeight ? "/lb" : "/piece"}
                                                                        </Text>
                                                                    </Flex>
                                                                </MenuItem>
                                                            ))}
                                                    </MenuList>
                                                </Menu>
                                            </Box>
                                        )}
                                    </Box>

                                    {/* Scale Photo Upload */}
                                    {isEditMode && canEditServices && (
                                        <Box mb={4} p={3} bg="gray.50" borderRadius="md">
                                            <HStack spacing={3} align="center">
                                                <Text fontSize={fontSize} fontWeight="600">Scale Photo:</Text>
                                                <Button
                                                    size="xs"
                                                    colorScheme="teal"
                                                    onClick={() => document.getElementById('scalePhotoInput').click()}
                                                >
                                                    ðŸ“· Upload Scale Photo
                                                </Button>
                                                <input
                                                    id="scalePhotoInput"
                                                    type="file"
                                                    accept="image/*"
                                                    capture="environment"
                                                    style={{ display: 'none' }}
                                                    onChange={async (e) => {
                                                        const file = e.target.files[0];
                                                        if (!file) return;
                                                        try {
                                                            const reader = new FileReader();
                                                            reader.onloadend = async () => {
                                                                const base64 = reader.result;
                                                                await axios.post(
                                                                    `${process.env.REACT_APP_AWS_API_URL}/api/driver/upload-image`,
                                                                    { imageBase64: base64 },
                                                                    { params: { operation: 'uploadImage', laundryId, orderId: selectedOrderDetails.orderId, imageType: 'weight' }, headers: { Authorization: `Bearer ${authToken}` } }
                                                                );
                                                                toast({ title: 'Scale photo uploaded', status: 'success', duration: 3000 });
                                                            };
                                                            reader.readAsDataURL(file);
                                                        } catch (err) {
                                                            toast({ title: 'Upload failed', status: 'error', duration: 3000 });
                                                        }
                                                        e.target.value = '';
                                                    }}
                                                />
                                                {selectedOrderDetails.imageUrl && (
                                                    <Text fontSize="xs" color="green.500">âœ“ Photo on file</Text>
                                                )}
                                            </HStack>
                                        </Box>
                                    )}

                                    {/* Laundry Photos Display */}
                                    {(selectedOrderDetails.imageUrl || selectedOrderDetails.weightImageUrl) && (
                                        <Box mb={4} p={3} bg="gray.50" borderRadius="md">
                                            <Text fontSize={fontSize} fontWeight="600" mb={2}>ðŸ“· Laundry Photos</Text>
                                            <HStack spacing={3} flexWrap="wrap">
                                                {selectedOrderDetails.imageUrl && (
                                                    <Box>
                                                        <Text fontSize="xs" color="gray.500" mb={1}>Pickup</Text>
                                                        <img
                                                            src={
                                                                selectedOrderDetails.imageUrl.startsWith('data:') || selectedOrderDetails.imageUrl.startsWith('http')
                                                                    ? selectedOrderDetails.imageUrl
                                                                    : `data:image/jpeg;base64,${selectedOrderDetails.imageUrl}`
                                                            }
                                                            alt="Pickup photo"
                                                            style={{ maxHeight: '150px', borderRadius: '8px', objectFit: 'cover' }}
                                                        />
                                                    </Box>
                                                )}
                                                {selectedOrderDetails.weightImageUrl && (
                                                    <Box>
                                                        <Text fontSize="xs" color="gray.500" mb={1}>Weight/Scale</Text>
                                                        <img
                                                            src={
                                                                selectedOrderDetails.weightImageUrl.startsWith('data:') || selectedOrderDetails.weightImageUrl.startsWith('http')
                                                                    ? selectedOrderDetails.weightImageUrl
                                                                    : `data:image/jpeg;base64,${selectedOrderDetails.weightImageUrl}`
                                                            }
                                                            alt="Weight photo"
                                                            style={{ maxHeight: '150px', borderRadius: '8px', objectFit: 'cover' }}
                                                        />
                                                    </Box>
                                                )}
                                            </HStack>
                                        </Box>
                                    )}

                                    {/* Products */}
                                    {(selectedOrderDetails.products?.length > 0 || isEditMode) && (
                                        <Box mb={4}>
                                            {selectedOrderDetails.products?.length > 0 ? (

                                                <Table variant="simple" size="sm">
                                                    <Thead>
                                                        <Tr>
                                                            <Th px={tablePadding} py={2} textAlign="left">Product</Th>
                                                            <Th px={tablePadding} py={2} textAlign="center">Qty</Th>
                                                            <Th px={tablePadding} py={2} textAlign="center">Price</Th>
                                                            {isEditMode && canEditServices &&
                                                                <Th px={tablePadding} py={2}/>}
                                                        </Tr>
                                                    </Thead>
                                                    <Tbody>
                                                        {selectedOrderDetails.products.map((product, index) => (
                                                            <Tr key={index}>
                                                                <Td
                                                                    px={tablePadding}
                                                                    py={2}
                                                                    textAlign="left"
                                                                >
                                                                    <Tooltip label={product.productName}
                                                                             placement="top">
                                                                        <Text noOfLines={1}>
                                                                            {truncateText(product.productName)}
                                                                        </Text>
                                                                    </Tooltip>
                                                                </Td>
                                                                <Td px={tablePadding} py={2} textAlign="center">
                                                                    {isEditMode && canEditServices ? (
                                                                        <NumberInput
                                                                            value={product.productCount || 1}
                                                                            min={1}
                                                                            onChange={(value) =>
                                                                                handleUpdateProductCount(index, value)
                                                                            }
                                                                            onBlur={(e) => {
                                                                                if (e.target.value === '' || e.target.value <= 0) {
                                                                                    handleUpdateProductCount(index, 1);
                                                                                }
                                                                            }}
                                                                            size={inputSize}
                                                                            maxW={{base: "80px", md: "100px"}}
                                                                        >
                                                                            <NumberInputField p={1}/>
                                                                            <NumberInputStepper>
                                                                                <NumberIncrementStepper size="xs"/>
                                                                                <NumberDecrementStepper size="xs"/>
                                                                            </NumberInputStepper>
                                                                        </NumberInput>
                                                                    ) : (
                                                                        product.productCount
                                                                    )}
                                                                </Td>
                                                                <Td px={tablePadding} py={2} textAlign="center">
                                                                    ${roundToTwo(product.price || product.productPrice)}

                                                                </Td>
                                                                {isEditMode && canEditServices && (
                                                                    <Td px={tablePadding} py={2} textAlign="center">
                                                                        <IconButton
                                                                            aria-label="Delete product"
                                                                            icon={<CloseIcon/>}
                                                                            size="xs"
                                                                            colorScheme="red"
                                                                            onClick={() => handleDeleteProduct(index)}
                                                                        />
                                                                    </Td>
                                                                )}
                                                            </Tr>
                                                        ))}
                                                    </Tbody>
                                                </Table>
                                            ) : (
                                                <Text color="gray.500" fontSize={fontSize} mb={2}>
                                                    No products added
                                                </Text>
                                            )}
                                            {isEditMode && canEditServices && (
                                                <Box mt={2}>
                                                    <Menu>
                                                        <MenuButton as={Button} rightIcon={<ChevronDownIcon/>}
                                                                    size={buttonSize}
                                                        >
                                                            Add Product
                                                        </MenuButton>
                                                        <MenuList maxH="70vh" overflowY="auto">
                                                            <Box px={3} py={2}>
                                                                <Input
                                                                    placeholder="Search products"
                                                                    value={productSearchTerm}
                                                                    onChange={(e) => setProductSearchTerm(e.target.value)}
                                                                    size={inputSize}
                                                                />
                                                            </Box>
                                                            {getAvailableProducts()
                                                                .filter(product =>
                                                                    product.productName
                                                                        .toLowerCase()
                                                                        .includes(productSearchTerm.toLowerCase()))
                                                                .map(product => (
                                                                    <MenuItem
                                                                        key={product.productName}
                                                                        onClick={() => handleAddProduct(product)}
                                                                    >
                                                                        <Flex justify="space-between" w="100%">
                                                                            <Text fontSize={fontSize}>
                                                                                {truncateText(product.productName)}
                                                                            </Text>
                                                                            <Text fontSize={fontSize}>
                                                                                ${roundToTwo(product.price || 0)}
                                                                            </Text>
                                                                        </Flex>
                                                                    </MenuItem>
                                                                ))}
                                                        </MenuList>
                                                    </Menu>
                                                </Box>
                                            )}
                                        </Box>
                                    )}

                                    {/* Special Instructions and Bags */}
                                    <Flex direction={{base: "column", md: "row"}} gap={3} mb={3}>
                                        <Box flex="1">
                                            <HStack mb={1}>
                                                <Icon as={FaStickyNote}/>
                                                <Text fontWeight="semibold" fontSize={fontSize}>Special
                                                    Instructions</Text>
                                            </HStack>
                                            <Text
                                                bg="gray.50"
                                                p={3}
                                                borderRadius="md"
                                                fontSize={fontSize}
                                                noOfLines={3}
                                            >
                                                {selectedOrderDetails.specialInstructions || "No special instructions"}
                                            </Text>
                                        </Box>

                                        <Box flex="1">
                                            <HStack mb={1}>
                                                <Icon as={FaShoppingBag}/>
                                                <Text fontWeight="semibold" fontSize={fontSize}>Laundry Bags</Text>
                                            </HStack>
                                            {isEditMode && canEditServices ? (
                                                <NumberInput
                                                    value={selectedOrderDetails.laundryBags || 0}
                                                    min={0}
                                                    onChange={(value) =>
                                                        setSelectedOrderDetails((prev) => ({
                                                            ...prev,
                                                            laundryBags: value,
                                                        }))
                                                    }
                                                    size={inputSize}
                                                    width="100%"
                                                >
                                                    <NumberInputField p={2}/>
                                                    <NumberInputStepper>
                                                        <NumberIncrementStepper size="sm"/>
                                                        <NumberDecrementStepper size="sm"/>
                                                    </NumberInputStepper>
                                                </NumberInput>
                                            ) : (
                                                <Text
                                                    bg="gray.50"
                                                    p={3}
                                                    borderRadius="md"
                                                    fontSize={fontSize}
                                                >
                                                    {selectedOrderDetails.laundryBags ?? "0"}
                                                </Text>
                                            )}
                                        </Box>

                                        {/* Total Weight (for records â€” especially per-bag orders) */}
                                        <Box flex="1">
                                            <HStack mb={1}>
                                                <Text fontWeight="semibold" fontSize={fontSize}>âš–ï¸ Total Weight (lbs)</Text>
                                                {selectedOrderDetails.pricingType === 'per_bag' && (
                                                    <Badge colorScheme="purple" fontSize="xs">Per Bag</Badge>
                                                )}
                                            </HStack>
                                            {isEditMode ? (
                                                <NumberInput
                                                    value={selectedOrderDetails.totalWeight || ''}
                                                    min={0}
                                                    precision={1}
                                                    step={0.5}
                                                    onChange={(value) =>
                                                        setSelectedOrderDetails((prev) => ({
                                                            ...prev,
                                                            totalWeight: value,
                                                        }))
                                                    }
                                                    size={inputSize}
                                                    width="100%"
                                                >
                                                    <NumberInputField p={2} placeholder="Enter weight"/>
                                                    <NumberInputStepper>
                                                        <NumberIncrementStepper size="sm"/>
                                                        <NumberDecrementStepper size="sm"/>
                                                    </NumberInputStepper>
                                                </NumberInput>
                                            ) : (
                                                <Text
                                                    bg="gray.50"
                                                    p={3}
                                                    borderRadius="md"
                                                    fontSize={fontSize}
                                                >
                                                    {selectedOrderDetails.totalWeight ? `${selectedOrderDetails.totalWeight} lbs` : "Not recorded"}
                                                </Text>
                                            )}
                                        </Box>
                                    </Flex>
                                </Box>

                                {/* Item Tracking â€” QR code for employee phone upload */}
                                <ItemTrackingPanel
                                    orderId={selectedOrderDetails?.orderId}
                                    laundryId={laundryId}
                                    orderStatus={orderStatusMap[selectedOrderDetails?.orderId] || selectedOrderDetails?.orderStatus}
                                    employeeId={getEmpId() || 'EMP'}
                                />

                                {/* Pickup & Delivery */}
                                <Box>
                                <Text fontSize="md" fontWeight="bold" mb={2}>Pickup & Delivery</Text>
                                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                                    {/* Pickup Info */}
                                    <Box bg="gray.50" p={3} borderRadius="md">
                                    <Text fontWeight="semibold" fontSize={fontSize} mb={1}>Pickup</Text>
                                    <VStack align="start" spacing={0}>
                                        <Text fontSize={fontSize}>Date: {selectedOrderDetails.pickupDate}</Text>
                                        <Text fontSize={fontSize}>Time: {selectedOrderDetails.pickupTimeInterval}</Text>
                                        <Text fontSize={fontSize}>Method: {selectedOrderDetails.pickupService}</Text>
                                    </VStack>

                                    {selectedOrderDetails.pickupService === "Uber" && selectedOrderDetails.uberInfo?.laundryPickup && (
                                        <Accordion allowToggle mt={2}>
                                        <AccordionItem>
                                            <AccordionButton>
                                            <Box flex="1" textAlign="left">
                                                Uber Pickup Details
                                            </Box>
                                            <AccordionIcon />
                                            </AccordionButton>
                                            <AccordionPanel pb={2}>
                                            <Flex align="center" fontSize="xs" mb={1}>
                                            <Text mr={1}>
                                                Uber Status: <strong>{selectedOrderDetails.uberInfo?.laundryPickup?.status || "N/A"}</strong>
                                            </Text>
                                            <Icon
                                                as={InfoIcon}
                                                color="gray.500"
                                                cursor="pointer"
                                                onClick={() => setShowUberStatusInfo(prev => !prev)}
                                            />
                                            </Flex>

                                            {showUberStatusInfo && (
                                            <Box mt={2} p={3} bg="gray.50" borderRadius="md" border="1px solid #CBD5E0">
                                                <Text fontWeight="bold" mb={2} fontSize="sm">Uber Status Descriptions</Text>
                                                <VStack align="start" spacing={1} fontSize="xs">
                                                <Text><strong>Pending:</strong> Looking for a driver.</Text>
                                                <Text><strong>Pickup:</strong> Driver is on the way to pick up.</Text>
                                                <Text><strong>Near Pickup:</strong> Driver is almost at the pickup location.</Text>
                                                <Text><strong>Picked Up:</strong> Driver picked up your order.</Text>
                                                <Text><strong>Dropoff:</strong> Driver is on the way to deliver.</Text>
                                                <Text><strong>Near Dropoff:</strong> Driver is almost at your location.</Text>
                                                <Text><strong>Delivered:</strong> Order delivered.</Text>
                                                <Text><strong>Canceled:</strong> Delivery was canceled.</Text>
                                                <Text><strong>Returned:</strong> Order is being returned.</Text>
                                                </VStack>
                                            </Box>
                                            )}

                                            <Text fontSize="xs">Fee: ${selectedOrderDetails.uberInfo?.laundryPickup?.feeCents / 100}</Text>
                                            <Text fontSize="xs">
                                                Tracking: <a href={selectedOrderDetails.uberInfo?.laundryPickup?.trackingUrl} target="_blank" rel="noreferrer" style={{ color: "blue" }}>Link</a>
                                            </Text>
                                            <Text fontSize="xs">deliveryId: {selectedOrderDetails.uberInfo?.laundryPickup?.deliveryId}</Text>


                                            <Button
                                                mt={3}
                                                size="sm"
                                                colorScheme="red"
                                                onClick={() =>
                                                    openCancelUber({
                                                    laundryId,
                                                    orderId: selectedOrderDetails?.orderId,
                                                    deliveryId: selectedOrderDetails?.uberInfo?.laundryPickup?.deliveryId,
                                                    kind: "pickup",
                                                    // optional: pass a callback for refresh after cancel
                                                    onSuccess: async () => {
                                                        // await fetchSingleOrder(laundryId, selectedOrderDetails?.orderId);
                                                        const orderDetails = await fetchSingleOrder(laundryId, selectedOrderDetails?.orderId);
                                                        if (orderDetails) {
                                                            setSelectedOrderDetails(orderDetails);
                                                            setOriginalProducts(orderDetails.products || []);
                                                        } else {
                                                            setSelectedOrderDetails({error: "Failed to load order details. Please try again later."});
                                                        }
                                                    },
                                                    })
                                                }
                                                >
                                                Cancel Uber Pickup
                                            </Button>

                                            </AccordionPanel>
                                        </AccordionItem>
                                        </Accordion>
                                    )}
                                    {!(selectedOrderDetails.orderType === "InStore" || selectedOrderDetails.orderId?.startsWith("IS-")) &&
                                        (selectedOrderDetails.pickupService !== "Uber" ||
                                            selectedOrderDetails.uberInfo?.laundryPickup?.status === "canceled") &&
                                        selectedOrderDetails.orderStatus === "OrderSubmitted" && (
                                            <Button
                                            mt={3}
                                            size="sm"
                                            colorScheme="blue"
                                            onClick={() => handlePlaceUber("pickup")}
                                            >
                                            Place Uber Pickup
                                            </Button>
                                        )}

                                    </Box>

                                <Box bg="gray.50" p={3} borderRadius="md">
                                <Text fontWeight="semibold" fontSize={fontSize} mb={1}>Delivery</Text>
                                <VStack align="start" spacing={0}>
                                    <Text fontSize={fontSize}>Date: {selectedOrderDetails.dropoffDate}</Text>
                                    <Text fontSize={fontSize}>Time: {selectedOrderDetails.dropoffTimeInterval}</Text>
                                    <Text fontSize={fontSize}>Method: {selectedOrderDetails.dropoffService}</Text>

                                    {/* Schedule Delivery: Only for IS- orders with no dropoffService */}
                                {selectedOrderDetails?.orderId?.startsWith("IS-") &&
                                selectedOrderDetails?.dropoffService !== "Laundry Driver" &&
                                selectedOrderDetails?.dropoffService !== "Uber" && (
                                    <Button
                                    mt={3}
                                    size="sm"
                                    colorScheme="blue"
                                    onClick={() => {
                                        if (!isSessionValid()) {
                                        setEmpId("");
                                        setPasscode("");
                                        endSession(true);
                                        onCredentialModalOpen();
                                        return;
                                        }
                                        setIsDeliveryOptionModalOpen(true);
                                    }}
                                    >
                                    Schedule the Delivery
                                    </Button>
                                )}




                                    {/* Place Uber Dropoff: For O- orders OR IS- with dropoffService === "Laundry Driver" */}
                                    {selectedOrderDetails.dropoffService !== "Uber" &&
                                    selectedOrderDetails.orderStatus !== "Delivered" &&
                                    (
                                        (!selectedOrderDetails.orderId?.startsWith("IS-") /* O- */) ||
                                        selectedOrderDetails.dropoffService === "Laundry Driver" /* IS- with LD */
                                    ) &&
                                    (
                                        <Button
                                        mt={3}
                                        size="sm"
                                        colorScheme="purple"
                                        onClick={() => handlePlaceUber("dropoff")}
                                        >
                                        Place Uber Dropoff
                                        </Button>
                                    )}
                                </VStack>

                                {/* Uber Dropoff Details */}
                                {selectedOrderDetails.dropoffService === "Uber" &&
                                    selectedOrderDetails.uberInfo?.laundryDropoff && (
                                    <Accordion allowToggle mt={2}>
                                        <AccordionItem>
                                        <AccordionButton>
                                            <Box flex="1" textAlign="left">Uber Dropoff Details</Box>
                                            <AccordionIcon />
                                        </AccordionButton>
                                        <AccordionPanel pb={2}>
                                            <Flex align="center" fontSize="xs" mb={1}>
                                            <Text mr={1}>
                                                Uber Status: <strong>{selectedOrderDetails.uberInfo?.laundryDropoff?.status || "N/A"}</strong>
                                            </Text>
                                            <Icon
                                                as={InfoIcon}
                                                color="gray.500"
                                                cursor="pointer"
                                                onClick={() => setShowUberStatusInfo(prev => !prev)}
                                            />
                                            </Flex>

                                            {showUberStatusInfo && (
                                            <Box mt={2} p={3} bg="gray.50" borderRadius="md" border="1px solid #CBD5E0">
                                                <Text fontWeight="bold" mb={2} fontSize="sm">Uber Status Descriptions</Text>
                                                <VStack align="start" spacing={1} fontSize="xs">
                                                <Text><strong>Pending:</strong> Looking for a driver.</Text>
                                                <Text><strong>Pickup:</strong> Driver is on the way to pick up.</Text>
                                                <Text><strong>Near Pickup:</strong> Driver is almost at the pickup location.</Text>
                                                <Text><strong>Picked Up:</strong> Driver picked up your order.</Text>
                                                <Text><strong>Dropoff:</strong> Driver is on the way to deliver.</Text>
                                                <Text><strong>Near Dropoff:</strong> Driver is almost at your location.</Text>
                                                <Text><strong>Delivered:</strong> Order delivered.</Text>
                                                <Text><strong>Canceled:</strong> Delivery was canceled.</Text>
                                                <Text><strong>Returned:</strong> Order is being returned.</Text>
                                                </VStack>
                                            </Box>
                                            )}

                                            <Text fontSize="xs">Fee: ${selectedOrderDetails.uberInfo?.laundryDropoff?.feeCents / 100}</Text>
                                            <Text fontSize="xs">
                                            Tracking: <a href={selectedOrderDetails.uberInfo?.laundryDropoff?.trackingUrl} target="_blank" rel="noreferrer" style={{ color: "blue" }}>Link</a>
                                            </Text>
                                            <Text fontSize="xs">deliveryId: {selectedOrderDetails.uberInfo?.laundryDropoff?.deliveryId}</Text>

                                            <Button
                                            mt={3}
                                            size="sm"
                                            colorScheme="red"
                                            onClick={() =>
                                                openCancelUber({
                                                laundryId,
                                                orderId: selectedOrderDetails?.orderId,
                                                deliveryId: selectedOrderDetails?.uberInfo?.laundryDropoff?.deliveryId,
                                                kind: "dropoff",
                                                // optional: pass a callback for refresh after cancel
                                                onSuccess: async () => {
                                                    const orderDetails = await fetchSingleOrder(laundryId, selectedOrderDetails?.orderId);
                                                    if (orderDetails) {
                                                        setSelectedOrderDetails(orderDetails);
                                                        setOriginalProducts(orderDetails.products || []);
                                                    } else {
                                                        setSelectedOrderDetails({error: "Failed to load order details. Please try again later."});
                                                    }
                                                },
                                                })
                                            }
                                            >
                                            Cancel Uber Dropoff
                                            </Button>


                                        </AccordionPanel>
                                        </AccordionItem>
                                    </Accordion>
                                    )}
                                </Box>

                                </SimpleGrid>
                                </Box>

                                {/* Payments */}
                                <Box>
                                    <Text fontSize="md" fontWeight="bold" mb={2}>Payments</Text>
                                    <Stack spacing={3} bg="gray.50" p={3} borderRadius="md">
                                        <Flex justify="space-between" align="center">
                                            <Text fontWeight="medium" fontSize={fontSize}>Subtotal:</Text>
                                            <Text
                                                fontSize={fontSize}>${roundToTwo(selectedOrderDetails.subTotal || 0)}</Text>
                                        </Flex>

                                        {/* Tip - Second item */}
                                        <Flex justify="space-between" align="center">
                                            <Text fontWeight="medium" fontSize={fontSize}>
                                                Tip:{" "}
                                                {selectedOrderDetails.tip?.tipType === "percentage"
                                                    ? `${selectedOrderDetails.tip?.tipPercentage || 0}%`
                                                    : selectedOrderDetails.tip?.tipType === "custom"
                                                        ? "(custom)"
                                                        : "(none)"}
                                            </Text>
                                            <Text fontSize={fontSize}>
                                                ${roundToTwo(selectedOrderDetails.tip?.tipAmount || 0)}
                                            </Text>
                                        </Flex>

                                        {/* Coupon - Third item */}
                                        <Flex justify="space-between" align="center">
                                            <Text fontWeight="medium" fontSize={fontSize}>Coupon:</Text>
                                            {isEditMode && canEditServices ? (
                                                <Input
                                                    value={selectedOrderDetails.coupon || ""}
                                                    onChange={(e) =>
                                                        setSelectedOrderDetails((prev) => ({
                                                            ...prev,
                                                            coupon: e.target.value,
                                                        }))
                                                    }
                                                    size={inputSize}
                                                    width={{base: "120px", md: "150px"}}
                                                    textAlign="right"
                                                />
                                            ) : (
                                                <Text fontSize={fontSize}>
                                                    {selectedOrderDetails.coupon || "None"}
                                                </Text>
                                            )}
                                        </Flex>

                                        {selectedOrderDetails.discountedPrice > 0 && (
                                            <Flex justify="space-between" align="center">
                                                <Text fontWeight="medium" fontSize={fontSize}>Discount:</Text>
                                                <Text color="red.500" fontSize={fontSize}>
                                                    -${roundToTwo(selectedOrderDetails.discountedPrice || 0)}
                                                </Text>
                                            </Flex>
                                        )}

                                        {/* Total - Highlighted section */}
                                        <Flex
                                            justify="space-between"
                                            align="center"
                                            pt={2}
                                            mt={1}
                                            borderTop="1px solid"
                                            borderColor="gray.200"
                                        >
                                            <Text fontWeight="bold" fontSize={fontSize}>Grand Total:</Text>
                                            <Text fontWeight="bold" fontSize={fontSize}>
                                                ${roundToTwo(selectedOrderDetails.grandTotal || 0)}
                                            </Text>
                                        </Flex>

                                        {/* Payment Details Accordion */}
                                        {selectedOrderDetails.finalPaymentIntentId?.length > 0 && (
                                            <Accordion allowToggle mt={2}>
                                                <AccordionItem border="none">
                                                    <AccordionButton
                                                        px={0}
                                                        _hover={{bg: "transparent"}}
                                                        justifyContent="flex-start"
                                                    >
                                                        <Text fontSize="xs" color="blue.500" fontWeight="medium">
                                                            View Payment Details
                                                        </Text>
                                                        <AccordionIcon ml={1}/>
                                                    </AccordionButton>
                                                    <AccordionPanel px={0} pb={0}>
                                                        <Stack spacing={2}>
                                                            {selectedOrderDetails.finalPaymentIntentId.map((payment, index) => (
                                                                <Box
                                                                    key={index}
                                                                    p={2}
                                                                    bg="white"
                                                                    borderRadius="md"
                                                                    boxShadow="sm"
                                                                >
                                                                    <Flex justify="space-between" mb={1}>
                                                                        <Text fontSize={fontSize}
                                                                              fontWeight="medium">Amount:</Text>
                                                                        <Text
                                                                            fontSize={fontSize}>${payment.amount}</Text>
                                                                    </Flex>
                                                                    <Flex justify="space-between" mb={1}>
                                                                        <Text fontSize={fontSize}
                                                                              fontWeight="medium">Method:</Text>
                                                                        <Text
                                                                            fontSize={fontSize}>{payment.paymentMethod}</Text>
                                                                    </Flex>
                                                                    {payment.paymentIntentId && (
                                                                        <Flex justify="space-between">
                                                                            <Text fontSize={fontSize}
                                                                                  fontWeight="medium">
                                                                                Transaction ID:
                                                                            </Text>
                                                                            <Text fontSize={fontSize} color="gray.600">
                                                                                {payment.paymentIntentId}
                                                                            </Text>
                                                                        </Flex>
                                                                    )}
                                                                </Box>
                                                            ))}
                                                        </Stack>
                                                    </AccordionPanel>
                                                </AccordionItem>
                                            </Accordion>
                                        )}
                                    </Stack>
                                </Box> 
                            </Stack>
                        )}
                    </DrawerBody>

                    <Modal isOpen={isDeliveryOptionModalOpen} onClose={() => setIsDeliveryOptionModalOpen(false)} size="lg">
                    <ModalOverlay />
                    <ModalContent>
                        <ModalHeader>Schedule the Delivery</ModalHeader>
                        <ModalCloseButton />
                        <ModalBody>
                        {/* Step 1: Delivery Method Selection */}
                        <Text fontWeight="semibold" mb={2}>Choose Delivery Method</Text>
                        <RadioGroup
                            onChange={(val) => {
                            setSelectedDeliveryMethod(val);
                            }}
                            value={selectedDeliveryMethod}
                        >
                            <Stack spacing={3} direction="column">
                            <Radio value="Laundry Driver">Laundry Driver (Free)</Radio>
                            <Radio value="Uber">Uber Delivery (Charges Apply)</Radio>
                            {selectedDeliveryMethod && (
                    <Box mt={4}>
                    <Text fontWeight="semibold" mb={1}>Dropoff Address</Text>
                    <Autocomplete
                        onLoad={(ac) => setAutocompleteRef(ac)}
                        onPlaceChanged={() => {
                        if (autocompleteRef) {
                            const place = autocompleteRef.getPlace();
                            const address = place?.formatted_address;
                            const location = place?.geometry?.location;
                            if (address) setCustomDropoffAddress(address);
                            if (location) {
                            // optionally set lat/lng for map preview
                            setMapLatLng({ lat: location.lat(), lng: location.lng() });
                            }
                        }
                        }}
                    >
                        <Input
                        placeholder="Enter dropoff address"
                        value={customDropoffAddress}
                        onChange={(e) => setCustomDropoffAddress(e.target.value)}
                        />
                    </Autocomplete>

                    <Text fontWeight="semibold" mb={1} mt={3}>Dropoff Date</Text>
                    <Input
                        type="date"
                        value={customDropoffDate}
                        onChange={(e) => setCustomDropoffDate(e.target.value)}
                    />
                    </Box>


                    )}

                            </Stack>
                        </RadioGroup>

                        {/* Step 2: Uber Scheduling Details (Conditional) */}
                        {selectedDeliveryMethod === "Uber" && (
                            <Box mt={6} p={4} border="1px solid #CBD5E0" borderRadius="md" bg="gray.50">
                            <Text fontWeight="semibold" mb={2}>Uber Scheduling</Text>

                            <RadioGroup
                                onChange={(val) => setUberScheduleType(val)}
                                value={uberScheduleType}
                            >
                                <Stack direction="row">
                                <Radio value="instant">Instant</Radio>
                                <Radio value="scheduled">Scheduled</Radio>
                                </Stack>
                            </RadioGroup>

                            {uberScheduleType === "instant" && (
                                <Text fontSize="sm" mt={2}>
                                Instant window: {getInstantPickupWindow(laundryTimeZone)}
                                </Text>
                            )}

                            {uberScheduleType === "scheduled" && (
                                <Text fontSize="sm" mt={2}>
                                Scheduled time: {selectedOrderDetails.dropoffTimeInterval || "N/A"}
                                </Text>
                            )}
                            </Box>
                        )}
                        </ModalBody>

                        <ModalFooter>
                        <Button variant="ghost" mr={3} onClick={() => setIsDeliveryOptionModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                    colorScheme="blue"
                    onClick={() => {
                        if (!customDropoffAddress.trim()) {
                        toast({
                            title: "Missing Address",
                            description: "Please enter a dropoff address before confirming.",
                            status: "warning",
                            duration: 3000,
                            isClosable: true,
                            position: "top",
                        });
                        return;
                        }

                        setIsDeliveryOptionModalOpen(false);
                        const finalAddress = customDropoffAddress.trim() || selectedOrderDetails.customerAddress?.address || "Unknown Dropoff Address";

                        if (selectedDeliveryMethod === "Uber") {
                    setIsDeliveryOptionModalOpen(false);
                    handleConfirmUberOrderFromModal(finalAddress);
                    } else {
                    handleAssignLaundryDriver(finalAddress);
                    }
                    }}
                    >
                    Confirm
                    </Button>

                        </ModalFooter>
                    </ModalContent>
                    </Modal>
                    {CancelUberModal}

                    <CancelOrderDialog
  isOpen={cancelDialog.isOpen}
  onClose={cancelDialog.onClose}
  apiBaseUrl={process.env.REACT_APP_AWS_API_URL}
  authToken={localStorage.getItem("x-api-key") || localStorage.getItem("idToken")}
  order={selectedOrderDetails}
  laundryId={laundryId}
  onCanceled={({ orderId, cancelReason }) => {
    // Update opened order
    setSelectedOrderDetails(prev =>
      prev ? { ...prev, orderStatus: "OrderCanceled", cancelReason } : prev
    );
    // Update list
    setOrders(prev =>
      Array.isArray(prev)
        ? prev.map(o =>
            o.orderId === orderId
              ? { ...o, orderStatus: "OrderCanceled", cancelReason }
              : o
          )
        : prev
    );
    // Optional: update status map
    if (typeof setOrderStatusMap === "function") {
      setOrderStatusMap(prev => ({ ...prev, [orderId]: "OrderCanceled" }));
    }
  }}
/>

                    {/* Modal for Employee Credential Validation */}
                    <Modal
                        isOpen={isCredentialModalOpen}
                        onClose={() => {
                            setIsEditMode(false);
                            onCredentialModalClose();
                            onClose();
                        }}
                        isCentered
                        motionPreset="slideInBottom"
                    >
                        <ModalOverlay/>
                        <ModalContent
                            size={modalSize} // Dynamically set size
                            maxW={modalWidth} // Adjust width dynamically
                            maxH={modalMaxHeight} // Ensure height is dynamic
                            overflowY="auto"
                            borderRadius="lg"
                        >
                            <ModalHeader>Enter Employee Credentials</ModalHeader>
                            <ModalBody>
                                <InputGroup mb={4}>
                                    <InputLeftAddon>{empPrefix}</InputLeftAddon>
                                    <Input
                                        placeholder="EmpId"
                                        value={empId}
                                        onChange={(e) => setEmpId(e.target.value)}
                                        size={inputSize}
                                    />
                                </InputGroup>

                                <Input
                                    placeholder="Passcode"
                                    type="password"
                                    value={passcode}
                                    onChange={(e) => setPasscode(e.target.value)}
                                    size={inputSize}
                                />
                            </ModalBody>

                            <ModalFooter>
                                <Button
                                    colorScheme="blue"
                                    onClick={handleValidateCredentials}
                                    isLoading={employeevalidationLoading}
                                    size={buttonSize}
                                >
                                    Submit
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => onCredentialModalClose()}
                                    ml={3}
                                    size={buttonSize}
                                >
                                    Cancel
                                </Button>
                            </ModalFooter>
                        </ModalContent>
                    </Modal>
                    {selectedOrderDetails && (
                    <Modal isOpen={isUberModalOpen} onClose={() => setUberModalOpen(false)} isCentered>
                        <ModalOverlay />
                        <ModalContent>
                        <ModalHeader>
                            Place Uber {uberType === "pickup" ? "Pickup" : "Dropoff"}
                        </ModalHeader>
                        <ModalBody>
                    
                        <RadioGroup
                            onChange={(val) => setUberScheduleType(val)}
                            value={uberScheduleType}
                        >
                            <Stack direction="row">
                            <Radio value="instant">Instant</Radio>
                            <Radio value="scheduled">Scheduled</Radio>
                            </Stack>
                        </RadioGroup>

                        {uberScheduleType === "instant" && (
                            <Text fontSize="sm" mt={2}>
                            Instant window: {getInstantPickupWindow(laundryTimeZone)}
                            </Text>
                        )}

                        {uberScheduleType === "scheduled" && (
                        <Text fontSize="sm" color="gray.600" mt={1} ml={6}>
                        Scheduled Time:&nbsp;
                        {uberType === "pickup"
                            ? `${selectedOrderDetails.pickupDate || "N/A"} ${selectedOrderDetails.pickupTimeInterval || "N/A"}`
                            : `${selectedOrderDetails.dropoffDate || "N/A"} ${selectedOrderDetails.dropoffTimeInterval || "N/A"}`}
                        </Text>
                        )}

                        </ModalBody>
                        <ModalFooter>
                            {/* <Button colorScheme="green" onClick={handleConfirmUberOrder}>
                            Confirm Uber Order
                            </Button> */}
                            <Button
        colorScheme="green"
        onClick={onConfirm}
        isLoading={confirmLoading}
        loadingText="Confirming..."
      >
        Confirm Uber Order
      </Button>
                            <Button variant="ghost" ml={3} onClick={() => setUberModalOpen(false)}>
                            Cancel
                            </Button>
                        </ModalFooter>
                        </ModalContent>
                    </Modal>
                    )}


                </DrawerContent>
                {!singleOrderLoading && selectedOrderDetails?.orderId && (
                    <Elements stripe={loadStripe(stripePublicKey)}>
                        <PaymentModal
                            isOpen={isPaymentModalOpen}
                            onClose={closePaymentModal}
                            onOrderClose={onDrawerClose}
                            orderId={selectedOrderDetails?.orderId}
                            laundryId={laundryId}
                            empId={empId}
                            totalCost={selectedOrderDetails?.totalCost}
                            subTotal={selectedOrderDetails?.subTotal}
                            discountPrice={selectedOrderDetails?.discountedPrice}
                            paymentMethod={selectedOrderDetails?.finalPaymentIntentId?.[0]?.paymentMethod || ""}
                            tip={selectedOrderDetails?.tip}
                            setOrders={setOrders}
                            setFilteredOrders={setFilteredOrders}
                            setOrderStatusMap={setOrderStatusMap}
                            setIsEditMode={setIsEditMode}
                            stripeTerminalExists={stripeTerminalExists}
                            totalPaymentsReceived={totalPaymentsReceived}
                            orderType={selectedOrderDetails?.orderType}
                            setInitialStatus={setInitialStatus}
                        />
                    </Elements>
                )}
            </Drawer>
        );
    };
useEffect(() => {
  const style = document.createElement('style');
  style.innerHTML = `
    .pac-container {
      z-index: 9999 !important;
    }
  `;
  document.head.appendChild(style);

  return () => {
    document.head.removeChild(style);
  };
}, []);


const handleAssignLaundryDriver = async (customAddress) => {
  try {
    const payload = {
      dropoffService: "LaundryDriver",
      dropoffAddress: customAddress,
      dropoffDate: customDropoffDate || null,
    };

    console.log("ðŸšš Assigning Laundry Driver with payload:", payload);

    const response = await axios.put(
      `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-order`,
      payload,
      {
        params: {
          operation: "updateOrderInfo",
          orderId: selectedOrderDetails.orderId,
          laundryId: laundryId,
          empId: empId,
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
      }
    );

    const statusCode = response.data?.statusCode;
    const message = response.data?.body?.message;
    console.log("API response", response);
    console.log("message", message);
    if (statusCode === 200 && message === "No changes detected.") {
      toast({
        title: "No Update Needed",
        description: "The selected dropoff method is already set.",
        status: "info",
        duration: 3000,
        isClosable: true,
      });
      setIsDeliveryOptionModalOpen(false);
      return;
    }

    if (statusCode === 200) {
      toast({
        title: "Success",
        description: "Dropoff method set to Laundry Driver.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      setIsDeliveryOptionModalOpen(false);
      fetchLaundryOrders(laundryId, orderOperation);
      onDrawerClose();
    } else {
      throw new Error("Unexpected response");
    }
  } catch (error) {
    console.error("âŒ Failed to update dropoff method:", error);
    toast({
      title: "Error",
      description: "Failed to assign Laundry Driver. Please try again.",
      status: "error",
      duration: 4000,
      isClosable: true,
    });
  }
};



    const handleSave = async (updatedOrderDetails, laundryId) => {
        // console.log("initiate update order details:", updatedOrderDetails);
        const {orderId, orderStatus, services, products, coupon, laundryBags, totalWeight} = updatedOrderDetails;
        //TODO: If the order is cancelled then we need to remove the current orders
        // list from the customers table as well in the current orders list

        // console.log("Products to Update:", productsToUpdate);
        // console.log('products to add:', productsToAdd);
        // console.log("Products to remove",productsToRemove);
        // console.log("Products in Selected Order Details:", updatedOrderDetails.products);
        // console.log('coupon to add', coupon);

        const payload = {
            orderStatus,
            coupon,
            laundryBags,
            totalWeight: totalWeight || undefined,
        };

        if ((servicesToAddMap[orderId] || []).length > 0) {
            payload.servicesToAdd = servicesToAddMap[orderId];
        }
        if ((services || []).length > 0) {
            payload.servicesToUpdate = services;
        }
        if ((servicesToRemoveMap[orderId] || []).length > 0) {
            payload.servicesToRemove = servicesToRemoveMap[orderId];
        }
        if (productsToAdd.length > 0) {
            payload.productsToAdd = productsToAdd.map(({productName, productCount}) => ({productName, productCount}));
        }
        if (productsToRemove.length > 0) {
            payload.productsToRemove = productsToRemove;
        }
        if (productsToUpdate.length > 0) {
            payload.productsToUpdate = productsToUpdate.map(({productName, productCount}) => ({
                productName,
                productCount
            }));
        }

        const updatedOrder = {...updatedOrderDetails, orderStatus, services};

        setOrders((prev) => prev.map((order) => order.orderId === orderId ? {...order, ...updatedOrder} : order));
        setFilteredOrders((prev) => prev.map((order) => order.orderId === orderId ? {...order, ...updatedOrder} : order));
        setOrderStatusMap((prev) => ({...prev, [orderId]: orderStatus}));

        const originalOrder = orders.find((order) => order.orderId === orderId);

        // console.log("validated empId in update api call function: ", validEmpId);
        try {
            setSaveLoading(true);
            setPaymentButtonDisplay(true);
            const updatedResponse = await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-order`,
                payload,
                {
                    params: {
                        operation: "updateOrder",
                        orderId,
                        laundryId: laundryId,
                        empId: empId,
                    },
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    },
                }
            );

            const statusCode = updatedResponse.data?.statusCode;
            // console.log("status code from api: ", statusCode);
            // console.log("updated response is: ", updatedResponse.data);
            if (statusCode === 200) {
                // console.log(`Order ${orderId} updated successfully!`, updatedResponse.data);
                const serverUpdatedOrder = updatedResponse.data?.body || null;

                if (serverUpdatedOrder) {
                    setOrders((prev) => prev.map((order) => order.orderId === orderId ? {...order, ...serverUpdatedOrder} : order));
                    setFilteredOrders((prev) => prev.map((order) => order.orderId === orderId ? {...order, ...serverUpdatedOrder} : order));
                    setOrderStatusMap((prev) => ({...prev, [orderId]: serverUpdatedOrder.orderStatus}));
                }

                // Reset mutation states after successful save
                setProductsToAdd([]);
                setProductsToRemove([]);
                setProductsToUpdate([]);
                setServicesToAddMap((prev) => ({...prev, [orderId]: []}));
                setServicesToRemoveMap((prev) => ({...prev, [orderId]: []}));

                setSelectedOrderDetails((prev) => ({
                    ...prev,
                    ...updatedOrder,
                    coupon: updatedOrder.coupon,
                    isEditingCoupon: false,
                    editInitialStatus: undefined,
                }));

                toast({
                    title: "Order Updated",
                    description: `Order #${orderId} was updated successfully.`,
                    status: "success",
                    duration: 500,
                    isClosable: true,
                    position: "top",
                });

                // Show payment warning if auto-capture failed
                if (serverUpdatedOrder?.paymentWarning) {
                    toast({
                        title: "âš ï¸ Payment Failed",
                        description: serverUpdatedOrder.paymentWarning,
                        status: "warning",
                        duration: 10000,
                        isClosable: true,
                        position: "top",
                    });
                }

                setShouldRefetchOrdersAfterClose(true);

                const newOrderDetails = await fetchSingleOrder(laundryId, orderId);

                if (newOrderDetails) {
                    setSelectedOrderDetails(newOrderDetails);
                    setOriginalProducts(newOrderDetails.products || []);
                }
                // fetchLaundryOrders(laundryId,orderOperation);
                setIsEditMode(false);

                // onDrawerClose();
            } else {
                const errorMessage = updatedResponse?.data?.body?.message || 'Unknown error occurred.';
                handleRollback(originalOrder, errorMessage); // TODO: Instead of handleRollBack let us use the close drawer
                setIsEditMode(false);
                // onDrawerClose();

            }
        } catch (error) {
            console.error("Error updating order:", error);

            const errorMessage =
                error.response?.data?.body?.message ||
                "An unexpected error occurred while updating the order.";

            setOrders((prev) => prev.map((order) => order.orderId === orderId ? {...order, ...updatedOrderDetails} : order));
            setFilteredOrders((prev) => prev.map((order) => order.orderId === orderId ? {...order, ...updatedOrderDetails} : order));
            setOrderStatusMap((prev) => ({...prev, [orderId]: updatedOrderDetails.orderStatus}));
            // Always reset mutation state on failure to avoid reapplying stale data
            setProductsToAdd([]);
            setProductsToRemove([]);
            setProductsToUpdate([]);
            setServicesToAddMap((prev) => ({...prev, [orderId]: []}));
            setServicesToRemoveMap((prev) => ({...prev, [orderId]: []}));

            toast({
                title: "Update Failed",
                description: errorMessage,
                status: "error",
                duration: 5000,
                isClosable: true,
                position: "top",
            });
            setIsEditMode(false);
            // onDrawerClose();
        } finally {
            setSaveLoading(false);
            setPaymentButtonDisplay(false);
        }
    };


    const handleRollback = (originalOrder, errorMessage) => {
        console.error("Update failed:", errorMessage);

        toast({
            title: "Update Failed",
            description: errorMessage,
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "top",
        });

        // Revert UI to the original state
        setOrders((prevOrders) =>
            prevOrders.map((order) =>
                order.orderId === originalOrder.orderId ? {...originalOrder} : order
            )
        );

        setFilteredOrders((prevFilteredOrders) =>
            prevFilteredOrders.map((order) =>
                order.orderId === originalOrder.orderId ? {...originalOrder} : order
            )
        );

        setOrderStatusMap((prevStatusMap) => ({
            ...prevStatusMap,
            [originalOrder.orderId]: originalOrder.orderStatus,
        }));

        setProductsToAdd([]);
        setProductsToRemove([]);
        setProductsToUpdate([]);
        setSelectedOrderDetails(originalOrder);
        setOriginalProducts(originalOrder.products || []);
    };

    const handleOrderHistory = async (orderId) => {
        // console.log("Start handleOrderHistory:", orderId);
        setLoading(true);
        onOrderHistoryModalOpen();

        const params = {
            operation: 'orderHistory',
            laundryId: laundryId,
            orderId: orderId,
        };

        try {
            const urlOrderHistory = `${process.env.REACT_APP_AWS_API_URL}/api/admin/order-audit-history`;
            // console.log("Constructed URL:", urlOrderHistory);
            // console.log("Headers:", { 'x-api-key': process.env.REACT_APP_AWS_API_KEY });
            // console.log("Query Parameters:", params);

            const response = await axios.get(urlOrderHistory, {
                params,
                headers: {
                    'Authorization': `Bearer ${authToken}`
                },
                timeout: 10000, // Set timeout to 10 seconds
            });

            // ("Response from order history API:", response.data);
            setOrderHistory(response.data.body);
        } catch (error) {
            if (error.response) {
                console.error("Error response from API:", error.response.status, error.response.data);
            } else if (error.request) {
                console.error("Request made but no response received:", error.request);
            } else {
                console.error("Error setting up request:", error.message);
            }
        } finally {
            setLoading(false);
            setIsActionsDrawerOpen(false);
        }
    };

    const handlePrintTicket = async (order) => {
        try {
            setTicketLoading(true);

            // Fetch shop details (same pattern as handlePrintReceipt)
            const shop = await fetchShopDetails(laundryId);

            const htmlContent = generateTicketHtml({
                orderId: order.orderId,
                laundryId,
                userDomain: shop.userDomain || null,
                bags: order.laundryBags || 1,
                storeName: shop.name,
                storeAddress: shop.address,
                storePhone: shop.phone,
                storeEmail: shop.email,
                customerName: order.customerName,
                customerPhone: order.customerPhone,
                employeeName: order.employeeName,
                dueDate: order.dropoffDate,
                dueTimeInterval: order.dropoffTimeInterval || '',
                orderDate: order.pickupDate || '',
                services: order.services,
                products: order.products,
                subTotal: order.subTotal,
                coupon: order.coupon || 'None',
                discountedPrice: order.discountedPrice || '0.00',
                tipAmount: order.tip?.tipAmount || '0.00',
                grandTotal: order.grandTotal,
                balanceDue: order.balanceDue || order.grandTotal,
                notes: order.specialInstructions || '',
            });

            await printViaIframe(htmlContent, { delay: 800 });
        } catch (error) {
            console.error("Error printing ticket:", error);
            alert("Failed to print ticket. Please try again.");
        } finally {
            setTicketLoading(false);
        }
    };

    const handleGenerateInvoice = async (order) => {
        const invoiceDate = new Date().toLocaleDateString();

        const grandTotal = order.grandTotal || 0;
        const paidAmount = order.paidAmount || 0;
        const dueAmount = roundToTwo(grandTotal - paidAmount);

        console.log(order);
        const htmlContent = `
          <html>
            <head>
              <title>Invoice - ${order.orderId}</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  padding: 40px;
                  font-size: 14px;
                }
      
                .invoice-header {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 20px;
                }
      
                .invoice-header .date {
                  flex: 1;
                  text-align: left;
                  font-weight: bold;
                }
      
                .invoice-header .title {
                  flex: 1;
                  text-align: center;
                  font-size: 24px;
                  font-weight: bold;
                }
      
                .invoice-header .logo {
                  flex: 1;
                  text-align: right;
                }
      
                .invoice-header .logo img {
                  height: 50px;
                  object-fit: contain;
                }
      
                .header, .details {
                  display: flex;
                  justify-content: space-between;
                  margin-bottom: 20px;
                }
      
                .info-box {
                  width: 48%;
                }
      
                .section-title {
                  font-weight: bold;
                  margin: 20px 0 10px 0;
                }
      
                table {
                  width: 100%;
                  border-collapse: collapse;
                  margin-bottom: 10px;
                }
      
                th {
                  text-align: left;
                  font-weight: bold;
                  padding-bottom: 6px;
                  border-bottom: 1px solid #ccc;
                }
      
                td {
                  padding: 4px 0;
                }
      
                tr:not(:last-child) td {
                  border-bottom: 1px solid #eee;
                }
      
                .amount-summary {
                  margin-top: 20px;
                  font-weight: bold;
                  text-align: right;
                }
      
                .footer {
                  margin-top: 40px;
                  font-size: 13px;
                  line-height: 1.6;
                  border-top: 1px solid #ccc;
                  padding-top: 10px;
                }
              </style>
            </head>
            <body>
      
              <div class="invoice-header">
                <div class="date">Date: ${invoiceDate}</div>
                <div class="title">INVOICE</div>
                <div class="logo">
                  ${laundryLogo ? `<img src="${laundryLogo}" alt="Laundry Logo" />` : ''}
                </div>
              </div>
      
              <div class="header">
                <div class="info-box">
                  <strong>Customer Info:</strong><br />
                  ${order.customerName}<br />
                  ${order.customerPhone}<br />
                  ${order.customerEmail}
                </div>
                <div class="info-box" style="text-align: right;">
                  <strong>Laundry Info:</strong><br />
                  ${shopDetails.name}<br />
                  ${shopDetails.phone}<br />
                  ${shopDetails.email}
                </div>
              </div>
      
              <div class="details">
                <strong>Order ID:</strong> ${order.orderId}<br />
                <strong>Pickup Date:</strong> ${order.pickupDate}<br />
                <strong>Dropoff Date:</strong> ${order.dropoffDate}
              </div>
      
              <div class="section-title">Services:</div>
              <table>
                <thead>
                  <tr><th>Service</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
                </thead>
                <tbody>
                  ${order.services.map(s => `
                    <tr>
                      <td>${s.service}</td>
                      <td>${s.weightOrCount}</td>
                      <td>$${s.servicePrice}</td>
                      <td>$${roundToTwo(s.servicePrice * s.weightOrCount)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
      
              ${order.products && order.products.length > 0 ? `
                <div class="section-title">Products:</div>
                <table>
                  <thead>
                    <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
                  </thead>
                  <tbody>
                    ${order.products.map(p => `
                      <tr>
                        <td>${p.productName}</td>
                        <td>${p.productCount}</td>
                        <td>$${p.productPrice}</td>
                        <td>$${roundToTwo(p.productPrice * p.productCount)}</td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              ` : ''}
      
              <div class="amount-summary">
                <div>Total: $${grandTotal}</div>
                <div>Amount Paid: $${paidAmount}</div>
                <div>Amount Due: $${dueAmount}</div>
              </div>
      
              <div class="footer">
                ${order.paymentInstructions
            ? `<p><strong>Payment Instructions:</strong><br />${order.paymentInstructions.replace(/\n/g, '<br />')}</p><br />`
            : ''
        }
                Please make checks payable to: <strong>${shopDetails.name}</strong><br />
                You may hand it over during pickup, or mail it to our official billing address.<br />
                For questions, reach out at <strong>${shopDetails.email}</strong> or call <strong>${shopDetails.phone}</strong>.<br /><br />
                Thank you for choosing our laundry service. We appreciate your business and look forward to serving you again!
              </div>
    
      
            </body>
          </html>
        `;

        try {
            await printViaIframe(htmlContent, { delay: 500 });
        } catch (error) {
            console.error("Error printing invoice:", error);
            alert("Failed to print invoice. Please try again.");
        }
    };

    const handlePrintReceipt = async (order) => {
        try {
            // Start the spinner
            setPrintLoading(true);

            // Fetch shop details dynamically
            const shopDetails = await fetchShopDetails(laundryId);

            const htmlContent = generateTicketHtml({
                orderId: order.orderId,
                laundryId,
                userDomain: shopDetails.userDomain || null,
                bags: 1, // Receipt is always single page
                storeName: shopDetails.name,
                storeAddress: shopDetails.address,
                storePhone: shopDetails.phone,
                storeEmail: shopDetails.email,
                customerName: order.customerName || 'N/A',
                customerPhone: order.customerPhone || 'N/A',
                employeeName: order.employeeName || 'N/A',
                dueDate: order.dropoffDate || 'N/A',
                dueTimeInterval: order.dropoffTimeInterval || 'N/A',
                orderDate: `${order.pickupDate || 'N/A'} ${order.pickupTimeInterval || ''}`,
                services: order.services || [],
                products: order.products || [],
                subTotal: order.subTotal || '0.00',
                coupon: order.coupon || 'None',
                discountedPrice: order.discountedPrice || '0.00',
                tipAmount: order.tip?.tipAmount || '0.00',
                grandTotal: order.grandTotal || '0.00',
                balanceDue: order.balanceDue || '0.00',
                notes: order.specialInstructions || '',
            });

            await printViaIframe(htmlContent, { delay: 500 });
        } catch (error) {
            console.error("Error fetching shop details:", error);
            alert("Failed to fetch shop details. Please try again.");
        } finally {
            // Stop the spinner
            setPrintLoading(false);
        }
    };

    const handleCloseOrderHistoryModal = () => {
        setOrderHistory(null);
        onOrderHistoryModalClose();
    };
  
    useEffect(() => {
        if (uberScheduleType === "instant") {
            const window = getInstantPickupWindow(laundryTimeZone);
            setPickupTimeWindow(window);
            console.log("Instant Window Set:", window);
        }
    }, [uberScheduleType, laundryTimeZone]);


    return (
        <Box
            padding={padding}
            bg="white">
            {/* Search and Filter Controls */}
            <Flex justifyContent="space-between" mb={6} flexWrap="wrap" gap={4}>
                <Input
                    placeholder="Search by Order ID, Phone, or Name"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    maxWidth="400px"
                    bg="#F7FAFC"
                />

                {/* Payment Status Filter */}
                <Menu>
                    <MenuButton as={Button} colorScheme={paymentFilter ? "orange" : "gray"} size="sm" width="160px">
                        {paymentFilter || "Payment Status"}
                    </MenuButton>
                    <MenuList>
                        <MenuItem onClick={() => setPaymentFilter("Unpaid")}>Unpaid</MenuItem>
                        <MenuItem onClick={() => setPaymentFilter("Paid")}>Paid</MenuItem>
                        <MenuItem onClick={() => setPaymentFilter("")}>Clear Filter</MenuItem>
                    </MenuList>
                </Menu>

                {/* Filter Dropdown */}
                {orderOperation === "active" ? (
                    <Menu>
                        <MenuButton as={Button} colorScheme="blue" size="sm" width="200px">
                            {statusFilter || "Filter Statuses"}
                        </MenuButton>
                        <MenuList>
                            {statusOptions.map((status) => (
                                <MenuItem key={status} onClick={() => { setStatusFilter(status); setActiveStatusChip('All'); }}>
                                    {status}
                                </MenuItem>
                            ))}
                            <MenuItem onClick={() => { setStatusFilter(""); setActiveStatusChip('All'); }}>Clear Filter</MenuItem>
                        </MenuList>
                    </Menu>
                ) : orderOperation === "canceled" ? (
                    <Menu>
                        <MenuButton as={Button} colorScheme="blue" size="sm" width="200px">
                            {statusFilter
                                ? statusFilter === "noServiceNeeded"
                                    ? "Service no longer needed"
                                    : statusFilter === "mistake"
                                        ? "Order created by mistake"
                                        : statusFilter === "badTime"
                                            ? "Bad pickup/delivery time"
                                            : "Other"
                                : "Filter by Reason"}
                        </MenuButton>
                        <MenuList>
                            <MenuItem onClick={() => setStatusFilter("noServiceNeeded")}>Service no longer
                                needed</MenuItem>
                            <MenuItem onClick={() => setStatusFilter("mistake")}>Order created by mistake</MenuItem>
                            <MenuItem onClick={() => setStatusFilter("badTime")}>Bad pickup/delivery time</MenuItem>
                            <MenuItem onClick={() => setStatusFilter("other")}>Other</MenuItem>
                            <MenuItem onClick={() => setStatusFilter("")}>Clear Filter</MenuItem>
                        </MenuList>
                    </Menu>
                ) : (
                    <Menu>
                        <MenuButton as={Button} colorScheme="blue" size="sm" width="200px">
                            {statusFilter
                                ? statusFilter === "past7Days"
                                    ? "Past 7 Days"
                                    : statusFilter === "past1Month"
                                        ? "Past 1 Month"
                                        : "Past 90 Days"
                                : "Filter by Time"}
                        </MenuButton>
                        <MenuList>
                            <MenuItem onClick={() => setStatusFilter("past7Days")}>Past 7 Days</MenuItem>
                            <MenuItem onClick={() => setStatusFilter("past1Month")}>Past 1 Month</MenuItem>
                            <MenuItem onClick={() => setStatusFilter("past90Days")}>Past 90 Days</MenuItem>
                            <MenuItem onClick={() => setStatusFilter("")}>Clear Filter</MenuItem>
                        </MenuList>
                    </Menu>
                )}
            </Flex>

            <SimpleGrid
                columns={{base: 2, sm: 2, md: 4}}
                spacing={{base: 2, md: 4}}
                mb={4}
            >
                <Button
                    size={{base: "md", md: "sm"}}
                    width="100%"
                    colorScheme={orderTab === 'all' ? "blue" : "gray"}
                    onClick={() => setOrderTab('all')}
                >
                    All Orders
                </Button>

                <Button
                    size={{base: "md", md: "sm"}}
                    width="100%"
                    colorScheme={orderTab === 'instore' ? "blue" : "gray"}
                    onClick={() => setOrderTab('instore')}
                >
                    In-Store Orders
                </Button>

                <Button
                    size={{base: "md", md: "sm"}}
                    width="100%"
                    colorScheme={orderTab === 'online' ? "blue" : "gray"}
                    onClick={() => setOrderTab('online')}
                >
                    Online Orders
                </Button>

                <Button
                    size={{base: "md", md: "sm"}}
                    width="100%"
                    colorScheme={orderTab === 'commercial' ? "blue" : "gray"}
                    onClick={() => setOrderTab('commercial')}
                >
                    Commercial
                </Button>
            </SimpleGrid>

            {/* Status Filter Chips - Only for Active Orders */}
            {orderOperation === 'active' && (
                <Flex
                    overflowX="auto"
                    gap={2}
                    mb={4}
                    pb={2}
                    css={{
                        '&::-webkit-scrollbar': { height: '4px' },
                        '&::-webkit-scrollbar-thumb': { background: '#CBD5E0', borderRadius: '4px' },
                    }}
                >
                    {(() => {
                        const statusChips = [
                            { label: 'All', statuses: null },
                            { label: 'Submitted', statuses: ['OrderSubmitted'] },
                            { label: 'Picked Up', statuses: ['ReadyForIntake'] },
                            { label: 'At Facility', statuses: ['ReceivedAtFacility'] },
                            { label: 'Processing', statuses: ['Processing', 'ProcessingStarted'] },
                            { label: 'Processed', statuses: ['ProcessingCompleted'] },
                            { label: 'Ready', statuses: ['ReadyForDelivery', 'EnRouteToDelivery'] },
                        ];

                        // Filter orders by the active tab first (Online/In-Store/All/Commercial)
                        const tabFilteredOrders = orders.filter((o) =>
                            orderTab === 'all' ||
                            (orderTab === 'instore' && o.orderId?.startsWith('IS-')) ||
                            (orderTab === 'online' && o.orderId?.startsWith('O-')) ||
                            (orderTab === 'commercial' && o.orderId?.startsWith('CL-'))
                        );

                        return statusChips.map((chip) => {
                            const count = chip.statuses === null
                                ? tabFilteredOrders.length
                                : tabFilteredOrders.filter((o) => chip.statuses.includes(o.orderStatus)).length;
                            const isSelected = activeStatusChip === chip.label;

                            return (
                                <Button
                                    key={chip.label}
                                    size="sm"
                                    minW="auto"
                                    px={4}
                                    borderRadius="full"
                                    fontWeight="medium"
                                    fontSize="sm"
                                    flexShrink={0}
                                    variant={isSelected ? 'solid' : 'outline'}
                                    colorScheme={isSelected ? 'blue' : 'gray'}
                                    color={isSelected ? 'white' : 'gray.600'}
                                    borderColor={isSelected ? 'blue.500' : 'gray.300'}
                                    onClick={() => {
                                        setActiveStatusChip(chip.label);
                                        setStatusFilter(''); // Clear dropdown filter when chip is used
                                    }}
                                >
                                    {chip.label} ({count})
                                </Button>
                            );
                        });
                    })()}
                </Flex>
            )}


            {/* Orders Section */}
            <>
                {orderLoading && (
                    <Flex justifyContent="center" alignItems="center" minHeight={{base: "150px", md: "200px"}}>
                        <Spinner size={{base: "lg", md: "xl"}} color="blue.500"/>
                        <Text ml={4} fontSize={{base: "md", md: "lg"}} fontWeight="bold" color="blue.600">
                            Fetching Orders...
                        </Text>
                    </Flex>
                )}

                {!orderLoading && filteredOrders.length > 0 && (
                    <Stack spacing={{base: 4, md: 6}}>
                        {filteredOrders.slice(0, currentLimit).map((order) => (
                            <Box
                                key={order.orderId}
                                p={{base: 2, md: 4}}
                                borderWidth="1px"
                                borderRadius="md"
                                boxShadow="sm"
                                bg="#F7FAFC"
                                position="relative"
                            >
                                {/* Action Button - Fixed in top-right corner */}
                                <Box position="absolute" top={3} right={3}>
                                    <IconButton
                                        icon={<FaBars/>}
                                        onClick={() => openActionsDrawer(order)}
                                        size={{base: "sm", md: "md"}}
                                        aria-label="Order actions"
                                        colorScheme="teal"
                                        variant="ghost"
                                    />
                                </Box>

                                <SimpleGrid
                                    columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 4 }}
                                    spacing={{base: 2, md: 2, lg: 3}}
                                >
                                    {/* Column 1: Order ID & Customer */}
                                    <Stack spacing={2}>
                                        <Flex
                                            align="center"
                                            cursor="pointer"
                                            onClick={() => handleOrderClick(order.orderId)}
                                        >
                                            <Text
                                                color="blue.600"
                                                fontWeight="bold"
                                                fontSize="md"
                                                _hover={{textDecoration: "underline"}}
                                            >
                                                #{order.orderId}
                                            </Text>
                                        </Flex>

                                        <Flex align="center">
                                            <Icon as={FaUser} mr={2} color="gray.600"/>
                                            <Text fontSize="sm">{order.customerName || "N/A"}</Text>
                                        </Flex>

                                        <Flex align="center">
                                            <Icon as={FaPhone} mr={2} color="gray.600"/>
                                            <Text fontSize="sm">{order.customerPhone || "N/A"}</Text>
                                        </Flex>
                                    </Stack>

                                    {/* Column 2: Dates */}
                                    <Stack spacing={2}>
                                        <Flex align="center">
                                            <Icon as={FaCalendarAlt} mr={2} color="gray.600"/>
                                            <Text fontSize="sm">Ordered: {format(
                                                toZonedTime(new Date(order.createdAt), laundryTimeZone),
                                                'yyyy-MM-dd hh:mm a',
                                                { timeZone: laundryTimeZone }
                                            )}</Text>
                                        </Flex>

                                        {order.orderId.startsWith("O-") && (
                                            <Flex align="center">
                                                <Icon as={FaClock} mr={2} color="gray.600"/>
                                                <Text fontSize="sm" >
                                                    Pickup: {formatDateTime(order.pickupDate, order.pickupTimeInterval)}
                                                    {order.pickupService && (
          <Badge
  colorScheme={
    order.orderType === "InStore" || order.orderId?.startsWith("IS-")
      ? "green"
      : order.pickupService?.toLowerCase()?.includes("uber")
      ? "blue"
      : "green"
  }
  fontSize="0.7em"
  variant="solid"
>
  {(!order.pickupService || order.pickupService === "N/A")
    ? (order.orderType === "InStore" || order.orderId?.startsWith("IS-")
        ? "Customer"
        : "Laundry Driver")
    : order.pickupService}
</Badge>

        )}
                                                </Text>
                                            </Flex>
                                        )}

                                        <Flex align="center">
                                            <Icon as={FaClock} mr={2} color="gray.600"/>
                                            <Text fontSize="sm">
                                                Due: {formatDateTime(order.dropoffDate, order.dropoffTimeInterval)}
                                                {order.dropoffService && (
 <Badge
  colorScheme={
    order.dropoffService?.toLowerCase()?.includes("uber") ? "blue" : "green"
  }
  fontSize="0.7em"
  variant="solid"
>
  {(!order.dropoffService || order.dropoffService === "N/A")
    ? (order.orderType === "InStore" || order.orderId?.startsWith("IS-")
        ? "Customer"
        : "Laundry Driver")
    : order.dropoffService}
</Badge>


      )}
                                            </Text>
                                        </Flex>
                                    </Stack>

                                    {/* Column 3: Status & Payment */}
                                    <Stack spacing={2} >
                                        <Flex align="center" wrap="wrap">
                                            <Text fontWeight="bold" fontSize="sm" mr={2}>Status:</Text>
                                            <Badge
                                                bgColor={getOrderStatusColor(order.orderStatus)}
                                                color="white"
                                                fontSize="xs"
                                                px={2}
                                                py={1}
                                                whiteSpace="normal"
                                                wordBreak="break-word"
                                                p={1}
                                                borderRadius="md"
                                            >
                                                {order.orderStatus}
                                            </Badge>
                                        </Flex>

                                        <Flex align="center">
                                            <Text fontWeight="bold" fontSize="sm" mr={2}>Payment:</Text>
                                            <Badge
                                                colorScheme={order.paymentStatus === "Paid" ? "green" : "red"}
                                                fontSize="xs"
                                                px={2}
                                                py={1}
                                                borderRadius="md"
                                            >
                                                {order.paymentStatus}
                                            </Badge>

                                        </Flex>

                                        {order.orderStatus === "OrderCanceled" && (
                                            <Flex align="center">
                                                <Icon as={FaTimesCircle} mr={2} color="red.500"/>
                                                <Text fontSize="sm" color="red.600">
                                                    {order.cancelReason || "Canceled"}
                                                </Text>
                                            </Flex>
                                        )}
                                    </Stack>

                                    {/* Column 4: Total Price & Action Button (Right Aligned on larger screens) */}
                                    <Stack spacing={2}>
                                        <Flex align="center">
                                            <Icon as={FaMoneyBillWave} mr={2} color="gray.600"/>
                                            <Text fontWeight="bold" fontSize="sm">
                                                ${roundToTwo(order.grandTotal)}
                                            </Text>
                                        </Flex>
                                        <Flex align="center">
                                            <Icon as={FaUserEdit} mr={2} color="gray.600"/>
                                            <Text fontSize="sm">{order.lastUpdatedBy || "N/A"}</Text>
                                        </Flex>
                                    </Stack>
                                </SimpleGrid>
                            </Box>

                        ))}

                    </Stack>
                )}

                {!orderLoading && filteredOrders.length === 0 && (
                    <Flex direction="column" align="center" justify="center" mt={{base: 6, md: 10}} textAlign="center">
                        <Box boxSize={{base: "80px", md: "100px"}} mb={{base: 3, md: 4}}>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="feather feather-box"
                                width="100%"
                                height="100%"
                                color="#A0AEC0"
                            >
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <path d="M3 9h18M9 21V9"></path>
                            </svg>
                        </Box>
                        <Heading as="h4" size={{base: "sm", md: "md"}} mb={2} color="gray.600">
                            No Orders Found
                        </Heading>
                        <Text fontSize={{base: "xs", md: "sm"}} color="gray.500"
                              maxWidth={{base: "300px", md: "400px"}}>
                            We couldn't find any orders matching your search term. Try modifying your search or clear
                            filters to view all available orders.
                        </Text>
                    </Flex>
                )}

                {/* âœ… Call the Drawer Component Here */}
                <OrderActionsDrawer
                    isOpen={isActionsDrawerOpen}
                    onClose={closeActionsDrawer}
                    order={selectedOrder}
                    handleOrderHistory={handleOrderHistory}
                    handlePrintTicket={handlePrintTicket}
                    handlePrintReceipt={handlePrintReceipt}
                    setSelectedOrder={setSelectedOrder}
                    setInvoiceModalOpen={setInvoiceModalOpen}
                    setPaymentInstructions={setPaymentInstructions}
                    setSendEmail={setSendEmail}
                    laundryId={laundryId}
                />

                <InvoiceModal
                    isOpen={invoiceModalOpen}
                    onClose={() => setInvoiceModalOpen(false)}
                    order={selectedOrder}
                    paymentInstructions={paymentInstructions}
                    setPaymentInstructions={setPaymentInstructions}
                    laundryId={laundryId}
                    onPrintInvoice={handleGenerateInvoice}
                    sendEmail={sendEmail}
                    setSendEmail={setSendEmail}
                    invoiceRef={invoiceRef}
                    empId={empId}
                />


            </>

            {OrderDetailsDrawer()}
            {/* Modal to show order history */}

            <Modal isOpen={isOrderHistoryModalOpen} onClose={handleCloseOrderHistoryModal} isCentered>
                <ModalOverlay/>
                <ModalContent
                    w={useBreakpointValue({base: "90%", sm: "60%", md: "500px", lg: "600px"})}
                    maxH="75vh"
                    overflow="hidden"
                    bg="white"
                    borderRadius="md"
                >
                    <ModalHeader bg="white" fontWeight="bold" fontSize={{base: "lg", md: "xl"}} position="sticky">
                        <Text fontWeight="bold" mb={4} fontSize={{base: "md", md: "lg"}}>
                            <Text as="span" color="blue.600">
                                {orderHistory?.orderId ?? "Order"} History
                            </Text>
                        </Text>
                    </ModalHeader>
                    <ModalCloseButton/>
                    <ModalBody
                        overflowY="auto"
                        px={{base: 3, md: 4}}
                        py={{base: 2, md: 3}}
                    >
                        {loading ? (
                            <Flex justifyContent="center" alignItems="center" height="200px">
                                <Spinner size="xl" color="blue.500"/>
                            </Flex>
                        ) : orderHistory && orderHistory.history ? (
                            <Stack spacing={4}>
                                {orderHistory.history.map((entry, index) => (
                                    <Box
                                        key={index}
                                        borderWidth="1px"
                                        borderRadius="md"
                                        boxShadow="sm"
                                        p={4}
                                        bg="#F7FAFC"
                                    >
                                        <Flex
                                            justifyContent="space-between"
                                            alignItems="center"
                                            borderBottomWidth="1px"
                                            borderColor="gray.300"
                                            pb={2}
                                            mb={2}
                                            flexWrap="wrap"
                                        >
                                            <Text fontWeight="bold" fontSize="sm">Timestamp:</Text>
                                            <Text fontSize="sm">{new Date(entry.timestamp).toLocaleString()}</Text>
                                        </Flex>

                                        <Flex justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap">
                                            <Text fontWeight="bold" fontSize="sm">Action Performed By (Emp Name):</Text>
                                            <Text fontSize="sm">{entry["Employee Name"] || entry.empId}</Text>
                                        </Flex>

                                        <Box>
                                            <Text fontWeight="bold" fontSize="sm" mb={2}>Modifications:</Text>
                                            <Box as="ul" pl={4} fontSize="sm" color="gray.700">
                                                {entry.modifications?.length > 0 ? (
                                                    entry.modifications.map((mod, idx) => (
                                                        <Box as="li" key={idx}>{mod}</Box>
                                                    ))
                                                ) : (
                                                    <Box as="li" color="gray.500">No modifications recorded</Box>
                                                )}
                                            </Box>
                                        </Box>
                                    </Box>
                                ))}
                            </Stack>
                        ) : (
                            <Flex direction="column" align="center" justify="center" mt={10} textAlign="center">
                                <Box boxSize="80px" mb={4}>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="feather feather-file-text"
                                        width="100%"
                                        height="100%"
                                        color="#A0AEC0"
                                    >
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                        <line x1="16" y1="13" x2="8" y2="13"/>
                                        <line x1="16" y1="17" x2="8" y2="17"/>
                                        <polyline points="10 9 9 9 8 9"/>
                                    </svg>
                                </Box>
                                <Heading as="h4" size="md" mb={2} color="gray.600">
                                    No Audit History Found
                                </Heading>
                                <Text fontSize="sm" color="gray.500" maxW="400px">
                                    There is no audit history available for this order. Check back later or contact the
                                    administrator for further details.
                                </Text>
                            </Flex>
                        )}
                    </ModalBody>
                </ModalContent>
            </Modal>


            {/* Load More Button */}
            {currentLimit < filteredOrders.length && (
                <Flex justifyContent="center" mt={6}>
                    <Button
                        colorScheme="blue"
                        onClick={handleLoadMore}
                    >
                        Load More
                    </Button>
                </Flex>
            )}

            <Box display="none">
                <InvoicePreview
                    ref={invoiceRef}
                    order={selectedOrder || {}}
                    paymentInstructions={paymentInstructions || ''}
                    shopDetails={shopDetails || {}}         // Make sure shopDetails is defined in your component
                    laundryLogo={laundryLogo || ''}
                />
            </Box>

        </Box>
    );


};


export default OrdersInfo;
