import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Flex,
    Text,
    Spinner,
    Button,
    useDisclosure,
    Drawer,
    DrawerOverlay,
    DrawerContent,
    DrawerHeader,
    DrawerBody,
    Badge,
    VStack,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    Card,
    CardBody,
    useToast,
    DrawerCloseButton,
    useBreakpointValue,
    AlertDialog,
    AlertDialogBody,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogOverlay,
    DrawerFooter,
    Grid,
    GridItem,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalCloseButton,
    Avatar,
    Image,
    Heading,
    Textarea,
    Radio,
    RadioGroup,
    FormControl,
    FormLabel,
    Input,
    HStack,
    Tooltip
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
import { MdStar, MdStarBorder, MdPhotoCamera } from 'react-icons/md';
import axios from 'axios';
import { toZonedTime, format } from 'date-fns-tz';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useLocation, useNavigate } from 'react-router-dom';
import { Accordion, AccordionItem, AccordionButton, AccordionPanel, AccordionIcon } from "@chakra-ui/react";


const MyOrders = ({ customerId, laundryId, laundryTimeZone }) => {
    const [orders, setOrders] = useState([]);
    const [lastKey, setLastKey] = useState(null);
    const [loading, setLoading] = useState(false);
    const [orderDetails, setOrderDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const toast = useToast();
    const [isCancelOrderLoading, setIsCancelOrderLoading] = useState(false);
    const initialLoadRef = useRef(true);
    const userAuthToken = localStorage.getItem('idToken');
    const isSmallScreen = useBreakpointValue({ base: true, md: false });
    const {
        isOpen: isAlertOpen,
        onOpen: onAlertOpen,
        onClose: onAlertClose,
    } = useDisclosure();
    const cancelRef = useRef();
    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const navigate = useNavigate();
    const {
        isOpen: isPaymentAlertOpen,
        onOpen: onPaymentAlertOpen,
        onClose: onPaymentAlertClose,
    } = useDisclosure();
    const [isProcessing, setIsProcessing] = useState(false);
    const stripe = useStripe();
    const elements = useElements();
    const [shouldOpenDrawer, setShouldOpenDrawer] = useState(false);
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const orderId = queryParams.get('order_id');
    const isOpenParam = queryParams.get('is_open');
    //Review Modal
    const {
        isOpen: isReviewModalOpen,
        onOpen: onReviewModalOpen,
        onClose: onReviewModalClose,
    } = useDisclosure();

    const handleOpenReviewModal = () => {
        onClose();
        setTimeout(() => {
            onReviewModalOpen();
        }, 200);
    };

    // Fetch Orders
    // State for cancellation reason and other explanation
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelRecurring, setIsCancelRecurring] = useState('');
    const [otherReason, setOtherReason] = useState('');
    
    // Available cancel types
    const cancelRecurringTypes = [
        'This order only',
        'This and future recurring orders'
    ];

    // Available cancellation reasons
    const cancellationOptions = [
        'Service no longer needed',
        'Order created by mistake',
        'Pickup/Delivery time no longer works',
        'Other'
    ];

    const fetchOrders = async (paginationKey) => {
        setLoading(true);
        try {
            const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/customer/get-orders-info`, {
                params: {
                    operation: 'getOrderDetails',
                    customerId: customerId,
                    laundryId: laundryId,
                    lastKey: paginationKey ? JSON.stringify(paginationKey) : null,
                },
                headers: {
                    'x-api-key': userAuthToken,
                },
            });
            const ordersData = response.data.body;
            console.log(ordersData);
            if (ordersData.status === 'success') {
                setOrders((prevOrders) => [...prevOrders, ...ordersData.data]);
                setLastKey(ordersData.lastKey ? JSON.parse(ordersData.lastKey) : null);
            } else {
                toast({
                    title: "Error Fetching Orders Info",
                    description: ordersData.message || 'Something went wrong',
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
            }
        } catch (error) {
            console.error('Error fetching orders:', error);
            toast({
                title: 'Error Fetching Orders',
                description: error.response?.data?.message || 'Unable to fetch orders. Please try again later.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoading(false);
        }
    };

    const fetchOrderDetails = async (orderId) => {
        setDetailsLoading(true);
        try {
            const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/customer/get-order-id-info`, {
                params: {
                    operation: 'getCustomerOrderInfo',
                    customerId: customerId,
                    orderId: orderId,
                },
                headers: {
                    'x-api-key': userAuthToken,
                },
            });

            const orderIdData = response.data.body;
            console.log("orderId:",orderIdData);
            if (response.data.statusCode === 200 && orderIdData.status === 'success') {
                setOrderDetails(orderIdData.data);
            } else {
                toast({
                    title: "Order Not Found",
                    description: orderIdData.message || 'No matching order for this ID.',
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
                navigate(`/${laundryId}/user/my-orders`);
            }
        } catch (error) {
            console.error('Error fetching order details:', error);
            toast({
                title: 'Error Fetching Order Details',
                description: error.response?.data?.message || 'Unable to fetch order details. Please try again later.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            navigate(`/${laundryId}/user/my-orders`);
        } finally {
            setDetailsLoading(false);
        }
    };

    // Cancel Order

    const handleCancelOrder = async () => {
        if (!isCancelRecurring) {
            toast({
                title: "Selection Required",
                description: "Please select the scope of your cancellation.",
                status: "warning",
                duration: 3000,
                isClosable: true,
            });
            return;
        }
        if (!cancelReason) {
            toast({
                title: "Selection Required",
                description: "Please select a reason for cancellation.",
                status: "warning",
                duration: 3000,
                isClosable: true,
            });
            return;
        }

        if (cancelReason === 'Other' && !otherReason.trim()) {
            toast({
                title: "Explanation Required",
                description: "Please provide an explanation for selecting 'Other'.",
                status: "warning",
                duration: 3000,
                isClosable: true,
            });
            return;
        }

        setIsCancelOrderLoading(true);
        try {
            const cancel_order_payload = {
                operation: "cancelOnlineOrder",
                customerId: customerId,
                orderId: selectedOrderId,
                laundryId: laundryId,
                cancelReason: cancelReason === 'Other' ? otherReason : cancelReason,
                isRecurring: isCancelRecurring == 'This order only' || isCancelRecurring == '' ? 'false' : 'true',
                address: orderDetails.address
            };

            const response = await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/customer/cancel-order`,
                cancel_order_payload,
                {
                    headers: {
                        'x-api-key': userAuthToken,
                    },
                }
            );

            const responseData = response.data;

            if (responseData.status === 'success') {
                toast({
                    title: "Success",
                    description: responseData.message,
                    status: "success",
                    duration: 5000,
                    isClosable: true,
                });
                setOrderDetails((prevDetails) => ({
                    ...prevDetails,
                    orderStatus: 'orderCanceled',
                }));
                setOrders((prevOrders) =>
                    prevOrders.map((order) =>
                        order.orderId === selectedOrderId ? { ...order, orderStatus: 'OrderCanceled' } : order
                    )
                );
                onClose();
            } else {
                toast({
                    title: "Error",
                    description: responseData.message || "Unable to cancel the order",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
            }
        } catch (error) {
            console.error('Error canceling order:', error);
            toast({
                title: "Error",
                description: error.response?.data?.message || 'Unable to cancel the order. Please try again later.',
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsCancelOrderLoading(false);
            onAlertClose();
            setCancelReason('');
            setIsCancelRecurring('');
            setOtherReason('');
        }
    };

    const handleCancelClick = (orderId) => {
        setSelectedOrderId(orderId);
        setCancelReason('');
        setIsCancelRecurring('');
        setOtherReason('');
        onAlertOpen();
    };

    // Cancel Order Button functionality enable function
    const displayCancelOrder = () => {
        const currentTime = toZonedTime(new Date(), laundryTimeZone);
        const pickupStartTimeString = `${orderDetails.pickupDate}T${orderDetails.pickupTimeInterval.split(' - ')[0]}:00`;
        const pickupStartTime = toZonedTime(new Date(pickupStartTimeString), laundryTimeZone);

        const timeDifferenceInHours = (pickupStartTime - currentTime) / (1000 * 60 * 60);

        return timeDifferenceInHours >= 6;
    };

    const handleCardPayment = async () => {
        if (!stripe || !elements) {
            toast({
                title: "Error",
                description: "Stripe is not properly loaded.",
                status: "error",
                duration: 5000,
                isClosable: true
            });
            return;
        }

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
            toast({
                title: "Incomplete Card Details",
                description: "Please enter your card details to proceed.",
                status: "error",
                duration: 5000,
                isClosable: true
            });
            return;
        }

        if (!orderDetails) return;

        try {
            setIsProcessing(true);
            const { paymentMethod, error } = await stripe.createPaymentMethod({
                type: "card",
                card: cardElement
            });

            if (error) {
                toast({
                    title: "Card Payment Failed",
                    status: "error",
                    description: error.message || "Failed to finalize payment.",
                    duration: 3000,
                    isClosable: true
                });
                return;
            }

            // Call your backend to capture the payment
            const response = await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/payment/instore-online-payment`,
                {
                    cardPaymentMethodId: paymentMethod.id,
                    customerId: customerId
                },
                {
                    params: {
                        operation: "captureInStoreOrderOnlinePayment",
                        orderId: orderDetails.orderId,
                        laundryId: laundryId
                    },
                    headers: { "x-api-key": process.env.REACT_APP_AWS_API_KEY }
                }
            );

            if (response.data.body?.status === "success") {
                toast({
                    title: "Card Payment Successful",
                    status: "success",
                    duration: 3000,
                    isClosable: true
                });
                setOrderDetails((prevDetails) => ({
                    ...prevDetails,
                    paymentStatus: "Paid"
                }));

                setOrders((prevOrders) =>
                    prevOrders.map((order) =>
                        order.orderId === orderDetails.orderId ? { ...order, paymentStatus: "Paid" } : order
                    )
                );

                onPaymentAlertClose();
                onClose();

                // Optionally refresh the orders or the single order details
            } else {
                toast({
                    title: "Card Payment Failed",
                    description: response.data.body?.message || "Failed to finalize payment.",
                    status: "error",
                    duration: 3000,
                    isClosable: true
                });
            }
        } catch (err) {
            console.error(err);
            toast({
                title: "Payment Error",
                description: err.message || "Failed to process card payment.",
                status: "error",
                duration: 5000,
                isClosable: true
            });
        } finally {
            setIsProcessing(false);
        }
    };

    useEffect(() => {
        if (initialLoadRef.current) {
            initialLoadRef.current = false;
            fetchOrders(null);
        }
    }, []);

    useEffect(() => {
        console.log("Route Query:", { orderId, isOpenParam });
        if (orderId && isOpenParam === 'true') {
            setShouldOpenDrawer(true);
            onOpen();
            fetchOrderDetails(orderId);
        } else {
            setShouldOpenDrawer(false);
        }
    }, [orderId, isOpenParam]);

    const handleOrderClick = (clickedOrderId) => {
        navigate(`/${laundryId}/user/my-orders?order_id=${clickedOrderId}&is_open=true`);
    };

    // Get color based on status
    const getOrderStatusColor = (status) => {
        switch (status) {
            case 'Delivered':
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

    const getOrderTypeColor = (type) => {
        switch (type) {
            case 'InStore':
                return 'purple.500';
            case 'Online':
                return 'teal.500';
            default:
                return 'gray.500';
        }
    };
    const ReviewForm = ({ employee }) => {
        const fileInputRef = useRef();
        const [reviewData, setReviewData] = useState({
            rating: 0,
            comments: '',
            photo: null,
        });
        console.log(orderDetails)
        const [isProcessingImage, setIsProcessingImage] = useState(false);
        const [isSubmitting, setIsSubmitting] = useState(false);

        // Validate image file
        const validateImageFile = (file) => {
            const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/heic'];
            const maxSize = 5 * 1024 * 1024; // 5MB

            if (!validTypes.includes(file.type)) {
                toast({
                    title: 'Invalid File Type',
                    description: 'Please upload a JPG, JPEG, PNG, or HEIC image',
                    status: 'error',
                    duration: 3000,
                    isClosable: true,
                });
                return false;
            }

            if (file.size > maxSize) {
                toast({
                    title: 'File Too Large',
                    description: 'Maximum image size is 5MB',
                    status: 'error',
                    duration: 3000,
                    isClosable: true,
                });
                return false;
            }

            return true;
        };

        // Convert file to Base64
        const convertFileToBase64 = (file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = (error) => reject(error);
        });

        // Handle image upload and processing
        const handleImageUpload = async (file) => {
            if (!file) return null;

            // Validate the file first
            if (!validateImageFile(file)) {
                return null;
            }

            setIsProcessingImage(true);
            try {
                const imageBase64 = await convertFileToBase64(file);

                // Update state with the processed image
                setReviewData(prev => ({
                    ...prev,
                    photo: file,
                    photoBase64: imageBase64
                }));

                // Show success notification
                toast({
                    title: 'Image Attached',
                    description: 'Your image is ready',
                    status: 'success',
                    duration: 2000,
                    isClosable: true,
                });

                return imageBase64;
            } catch (error) {
                console.error('Error processing image:', error);
                toast({
                    title: 'Image Processing Failed',
                    description: 'Failed to process your image',
                    status: 'error',
                    duration: 3000,
                    isClosable: true,
                });
                return null;
            } finally {
                setIsProcessingImage(false);
            }
        };

        const handleRatingChange = (newValue) => {
            setReviewData((prev) => ({...prev, rating: newValue}));
        };

        const handleCommentsChange = (e) => {
            setReviewData((prev) => ({...prev, comments: e.target.value}));
        };

        const handlePhotoChange = async (e) => {
            const file = e.target.files?.[0] || null;
            await handleImageUpload(file);
        };

        const handleSubmit = async () => {
            try {
                if (reviewData.rating === 0) {
                    toast({
                        title: 'Rating Required',
                        description: 'Please provide a rating before submitting',
                        status: 'warning',
                        duration: 3000,
                        isClosable: true,
                    });
                    return;
                }
                setIsSubmitting(true);

                let imageBase64 = null;
                if (reviewData.photo) {
                    imageBase64 = await handleImageUpload(reviewData.photo);
                    if (!imageBase64) return;
                }

                const payload = {
                    orderId: orderDetails.orderId,
                    customerId: customerId,
                    laundryId: laundryId,
                    employeeId: orderDetails.employee?.empId || orderDetails.tip?.tipReceiverId,
                    employeeRating: reviewData.rating,
                    orderDate: orderDetails.createdAt,
                    reviewComment: reviewData.comments,
                    ...(imageBase64 && { imageBase64 }),
                };

                const response = await axios.post(
                    `${process.env.REACT_APP_AWS_API_URL}/api/customer/create-review`,
                    payload,
                    {
                        headers: {
                            'x-api-key': userAuthToken,
                            'Content-Type': 'application/json',
                        },
                        params: {
                            operation: 'createReview',
                            laundryId: laundryId,
                        },
                    }
                );

                const responseBody =
                    typeof response.data.body === 'string'
                        ? JSON.parse(response.data.body)
                        : response.data.body;

                if (responseBody.status === 'success') {
                    toast({
                        title: 'Thanks for your feedback!',
                        description: responseBody.message || 'Your review has been submitted successfully',
                        status: 'success',
                        duration: 3000,
                        isClosable: true,
                    });

                    setOrderDetails((prev) => ({ ...prev, isReviewed: true }));
                    setOrders((prevOrders) =>
                        prevOrders.map((order) =>
                            order.orderId === orderDetails.orderId ? { ...order, isReviewed: true } : order
                        )
                    );

                    onReviewModalClose();
                } else {
                    throw new Error(responseBody.message || 'Failed to submit review');
                }
            } catch (error) {
                console.error('Error submitting review:', error);
                toast({
                    title: 'Error Submitting Review',
                    description:
                        error.response?.data?.body?.message ||
                        error.response?.data?.message ||
                        error.message ||
                        'Failed to submit review',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            } finally {
                setIsSubmitting(false);
            }
        };
        const StarRating = ({rating, onRatingChange}) => {
            const [hoverRating, setHoverRating] = useState(null);
            const starIndexes = [1, 2, 3, 4, 5];

            const display = hoverRating !== null ? hoverRating : rating;

            return (
                <Box display="flex">
                    {starIndexes.map((star) => (
                        <Box
                            as="span"
                            key={star}
                            cursor="pointer"
                            fontSize="2xl"
                            color={display >= star ? 'yellow.400' : 'gray.300'}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(null)}
                            onClick={() => onRatingChange(star)}
                            mx={0.5}
                        >
                            {display >= star ? <MdStar/> : <MdStarBorder/>}
                        </Box>
                    ))}
                </Box>
            );
        };
        const fullName = employee?.firstName && employee?.lastName &&
        employee.firstName !== "UU" && employee.lastName !== "UU"
            ? `${employee.firstName} ${employee.lastName}`
            : "your laundry specialist";

        const firstName = employee?.firstName &&
        employee.firstName.trim() &&
        employee.firstName !== "UU"
            ? employee.firstName
            : "them";

        return (
            <Box
                bg="gray.50"
                display="flex"
                alignItems="center"
                justifyContent="center"
                p={4}
            >
                <Box
                    bg="white"
                    w="100%"
                    borderRadius="md"
                    p={6}
                    textAlign="center"
                >
                    <Avatar
                        size="xl"
                        name={fullName}
                        src={null}
                        mb={4}
                        mx="auto"
                    />

                    <Heading fontSize="2xl" mb={2}>
                        How did {fullName} do?
                    </Heading>
                    <Text mb={1} color="gray.600">
                        {fullName} washed and folded your clothes with care.
                    </Text>
                    <Text mb={4} color="gray.600">
                        Take a moment to let {firstName} know what you think.
                    </Text>

                    <Box mb={4} display="flex" justifyContent="center">
                        <StarRating
                            rating={reviewData.rating}
                            onRatingChange={handleRatingChange}
                        />
                    </Box>

                    <Textarea
                        value={reviewData.comments}
                        onChange={handleCommentsChange}
                        placeholder="Your comments…"
                        mb={4}
                        resize="vertical"
                        minH="100px"
                        maxLength={800}
                    />

                    <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        hidden
                        onChange={handlePhotoChange}
                    />

                    <Button
                        leftIcon={isProcessingImage ? <Spinner size="sm"/> : <MdPhotoCamera/>}
                        variant="outline"
                        onClick={() => fileInputRef.current.click()}
                        mb={4}
                        w="100%"
                        isLoading={isProcessingImage}
                        loadingText="Processing Image"
                        isDisabled={isProcessingImage}
                    >
                        {reviewData.photo ? 'Change Photo' : 'Add a Photo'}
                    </Button>

                    {reviewData.photo && (
                        <Box mb={4} position="relative">
                            <Image
                                src={URL.createObjectURL(reviewData.photo)}
                                alt="Photo Preview"
                                maxH="150px"
                                borderRadius="md"
                                mx="auto"
                            />
                            <Button
                                position="absolute"
                                top={1}
                                right={1}
                                size="sm"
                                colorScheme="red"
                                variant="ghost"
                                onClick={() => setReviewData(prev => ({
                                    ...prev,
                                    photo: null,
                                    photoBase64: null
                                }))}
                            >
                                ×
                            </Button>
                        </Box>
                    )}

                    <Button
                        colorScheme="blue"
                        onClick={handleSubmit}
                        w="100%"
                        isLoading={isSubmitting}
                        loadingText="Submitting..."
                    >
                        Submit
                    </Button>
                </Box>
            </Box>
        );
    };
    return (
        <Box p={[2, 4]} w="100%" display="flex" flexDirection="column" bg="#EBF8FF" overflow="hidden">
            <Box p={[2, 4]} borderBottomWidth="1px" zIndex="1" position="sticky" top="0">
                <Text fontSize={["xl", "2xl"]} fontWeight="bold" textAlign="center" color="blue.700">
                    My Orders
                </Text>
            </Box>

            <Box p={[2, 4]} overflowY="auto" mt={[2, 10]} flex="1" bg="#EBF8FF">
                {loading && orders.length === 0 ? (
                    <Flex justify="center" align="center" h="50vh">
                        <Spinner size="xl" />
                    </Flex>
                ) : orders.length === 0 ? (
                    <Flex justify="center" align="center" h="50vh">
                        <Text fontSize={["md", "lg"]} fontWeight="bold" color="gray.600">
                            No Orders Found
                        </Text>
                    </Flex>
                ) : (
                    <VStack spacing={4} align="stretch" p={[2, 4]}>
                        {orders.map((order) => (
                            <Box
                                key={order.orderId}
                                borderWidth="1px"
                                borderRadius="lg"
                                p={[2, 4]}
                                bg="#ccf0ed"
                                _hover={{ bg: 'gray.200' }}
                                cursor="pointer"
                                width="100%"
                                onClick={() => handleOrderClick(order.orderId)}
                            >
                                <Flex
                                    direction={{ base: 'column', md: 'row' }}
                                    justify="space-between"
                                    align={{ base: 'flex-start', md: 'center' }}
                                    mb={[2, 4]}
                                >
                                    <Text fontSize={["md", "lg"]} fontWeight="bold" mb={{ base: 2, md: 0 }}>
                                        Order ID: {order.orderId}
                                    </Text>
                                    <Badge bgColor={getOrderTypeColor(order.orderType)} color="white" mt={{ base: 2, md: 0 }}>
                                        {order.orderType}
                                    </Badge>
                                </Flex>
                                <Flex
                                    direction={{ base: 'column', md: 'row' }}
                                    justify="space-between"
                                    align={{ base: 'flex-start', md: 'flex-start' }}
                                >
                                    <Box mb={{ base: 2, md: 0 }}>
                                        <Text fontSize={["sm", "md"]}>
                                            Date:{' '}
                                            {format(
                                                toZonedTime(new Date(order.createdAt), laundryTimeZone),
                                                'yyyy-MM-dd hh:mm a',
                                                { timeZone: laundryTimeZone }
                                            )}
                                        </Text>
                                        <Badge bgColor={getOrderStatusColor(order.orderStatus)} color="white" p={1} borderRadius="md">
                                            {order.orderStatus}
                                        </Badge>
                                    </Box>
                                    <Box textAlign={{ base: 'left', md: 'right' }}>
                                        <Text fontSize={["sm", "md"]}>Payment Status: {order.paymentStatus}</Text>
                                        <Text fontSize={["sm", "md"]} fontWeight="bold">
                                            Total Cost: ${order.totalCost}
                                        </Text>
                                    </Box>
                                </Flex>
                            </Box>
                        ))}
                        {lastKey && (
                            <Flex justify="center" mt={[2, 4]}>
                                <Button
                                    colorScheme="blue"
                                    onClick={() => fetchOrders(lastKey)}
                                    isLoading={loading}
                                    loadingText="Loading More"
                                >
                                    Load More
                                </Button>
                            </Flex>
                        )}
                    </VStack>
                )}
            </Box>

            <Drawer
                isOpen={isOpen && shouldOpenDrawer}
                onClose={() => {
                    navigate(`/${laundryId}/user/my-orders`);
                    onClose();
                }}
                size={isSmallScreen ? "md" : "sm"}
                placement={isSmallScreen ? "bottom" : "right"}
            >
                <DrawerOverlay />
                <DrawerContent maxH={isSmallScreen ? "80vh" : "100vh"} borderTopRadius={isSmallScreen ? "md" : "none"}>
                    <DrawerCloseButton variant="ghost" />
                    <DrawerHeader bg="blue.500" color="white" textAlign="center" fontSize={["xl", "2xl"]} fontWeight="bold">
                        Order Details
                    </DrawerHeader>
                    <DrawerBody bg="#ccf0ed" p={[2, 4]} overflowY="auto">
                        {detailsLoading ? (
                            <Flex justify="center" align="center" h="50vh">
                                <Spinner size="xl" />
                            </Flex>
                        ) : orderDetails ? (
                            <VStack spacing={[4, 6]} align="stretch">
                                <Box p={[2, 4]} borderWidth="1px" borderRadius=" basslg" bg="#ccf0ed" shadow="md">
                                    <Text fontSize={["lg", "xl"]} fontWeight="bold" color="blue.700" mb={[2, 4]}>
                                        Order Info
                                    </Text>
                                    <Grid templateColumns={["110px 1fr", "150px 1fr"]} rowGap={2}>
                                        <GridItem>
                                            <Text fontWeight="bold">Order ID:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>{orderDetails.orderId}</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text fontWeight="bold">Coupon:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>{orderDetails.coupon || 'Not Available'}</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text fontWeight="bold">Pickup Date/Time:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>
                                                {orderDetails.pickupDate} ({orderDetails.pickupTimeInterval})
                                            </Text>
                                        </GridItem>

                                        <GridItem>
                                            <Text fontWeight="bold">Dropoff Date/Time:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>
                                                {orderDetails.dropoffDate} ({orderDetails.dropoffTimeInterval})
                                            </Text>
                                        </GridItem>

<GridItem colSpan={[2]} mt={4}>
  <HStack 
    align="center" 
    spacing={2} 
    px={2} 
    py={1} 
    bg="white" 
    borderRadius="md" 
    border="1px solid #CBD5E0"
  >
    {/* <Text fontWeight="bold" fontSize="md">Uber</Text> */}
    {(orderDetails.pickupService === "Uber" || orderDetails.dropoffService === "Uber") && (
      <Accordion allowToggle flex="1" variant="unstyled">
        <AccordionItem border="none">
          <AccordionButton 
            _expanded={{ bg: "blue.50" }} 
            px={0} 
            py={1}
            _hover={{ bg: "blue.50" }}
          >
            <Box flex="1" textAlign="left" fontSize="md">
              🚗 Uber Details
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel 
            pb={4} 
            px={2} 
            bg="gray.50" 
            borderRadius="md" 
            mt={2}
          >
            {/* Uber Pickup Info */}
            {orderDetails.pickupService === "Uber" && (
              <Box mb={3}>
                <Text fontWeight="semibold" fontSize="sm" color="gray.700" mb={1}>Pickup</Text>
                <VStack align="start" spacing={1} pl={2}>
                  {orderDetails.pickupTrackingUrl && (
                    <HStack spacing={2}>
                      <Text fontSize="sm">📍 Tracking:</Text>
                      <a href={orderDetails.pickupTrackingUrl} target="_blank" rel="noopener noreferrer">
                        <Text fontSize="sm" color="blue.500" fontWeight="medium" _hover={{ textDecoration: "underline" }}>
                          View
                        </Text>
                      </a>
                    </HStack>
                  )}
                  {orderDetails.pickupStatus && (
                    <HStack spacing={2}>
                      <Text fontSize="sm">📦 Status:</Text>
                      <Badge 
                        colorScheme={orderDetails.pickupStatus.toLowerCase() === "delivered" ? "green" : "purple"} 
                        fontSize="0.75em" 
                        px={2}
                      >
                        {orderDetails.pickupStatus.toUpperCase()}
                      </Badge>
                    </HStack>
                  )}
                  {orderDetails.uberPickupFee && (
                    <HStack spacing={2}>
                      <Text fontSize="sm">💵 Fee:</Text>
                      <Text fontSize="sm">${orderDetails.uberPickupFee.toFixed(2)}</Text>
                    </HStack>
                  )}
                </VStack>
              </Box>
            )}
            {/* Divider */}
            <Box borderTop="1px solid #CBD5E0" mb={3} />
            {/* Uber Dropoff Info */}
            {orderDetails.dropoffService === "Uber" && (
              <Box>
                <Text fontWeight="semibold" fontSize="sm" color="gray.700" mb={1}>Dropoff</Text>
                <VStack align="start" spacing={1} pl={2}>
                  {orderDetails.dropoffTrackingUrl && (
                    <HStack spacing={2}>
                      <Text fontSize="sm">📍 Tracking:</Text>
                      <a href={orderDetails.dropoffTrackingUrl} target="_blank" rel="noopener noreferrer">
                        <Text fontSize="sm" color="blue.500" fontWeight="medium" _hover={{ textDecoration: "underline" }}>
                          View
                        </Text>
                      </a>
                    </HStack>
                  )}
                  {orderDetails.dropoffStatus && (
                    <HStack spacing={2}>
                      <Text fontSize="sm">📦 Status:</Text>
                      <Badge 
                        colorScheme={orderDetails.dropoffStatus.toLowerCase() === "delivered" ? "green" : "purple"} 
                        fontSize="0.75em" 
                        px={2}
                      >
                        {orderDetails.dropoffStatus.toUpperCase()}
                      </Badge>
                    </HStack>
                  )}
                  {orderDetails.uberDropoffFee && (
                    <HStack spacing={2}>
                      <Text fontSize="sm">💵 Fee:</Text>
                      <Text fontSize="sm">${orderDetails.uberDropoffFee.toFixed(2)}</Text>
                    </HStack>
                  )}
                </VStack>
              </Box>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    )}
  </HStack>
</GridItem>
                                     

                                        <GridItem>
                                            <Text fontWeight="bold">Special Instructions:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>{orderDetails.specialInstructions || 'No Special Instructions'}</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text fontWeight="bold">Laundry Bags:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>{orderDetails.laundryBags || 'N/A'}</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text fontWeight="bold">Status:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>{orderDetails.orderStatus}</Text>
                                        </GridItem>
                                        

                                        {orderDetails.pickupService === 'Uber' && orderDetails.uber?.uberFee && (
                                        <>
                                            <GridItem>
                                            <Text fontWeight="bold">Uber Fee:</Text>
                                            </GridItem>
                                            <GridItem>
                                            <Text>${(orderDetails.uber.uberFee / 100).toFixed(2)}</Text>
                                            </GridItem>
                                        </>
                                        )}
                                        <GridItem>
                                            <Text fontWeight="bold">Total Cost:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>${orderDetails.totalCost}</Text>
                                        </GridItem>
                                    </Grid>
                                    <Text fontWeight="bold" mt={[2, 4]} mb={[1, 2]}>Services:</Text>
                                    <Table variant="simple" size="sm" overflowX="auto">
                                        <Thead>
                                            <Tr>
                                                <Th>Service</Th>
                                                <Th>Weight/Count</Th>
                                                <Th>Unit Price</Th>
                                            </Tr>
                                        </Thead>
                                        <Tbody>
                                            {orderDetails.services.map((service, index) => (
                                                <Tr key={index}>
                                                    <Td>{service.serviceName}</Td>
                                                    <Td>{service.weightOrCount}</Td>
                                                    <Td>${service.servicePrice}</Td>
                                                </Tr>
                                            ))}
                                        </Tbody>
                                    </Table>
                                </Box>
                                <Box p={[2, 4]} borderWidth="1px" borderRadius="lg" bg="#ccf0ed" shadow="md">
                                    <Text fontSize={["lg", "xl"]} fontWeight="bold" color="blue.700" mb={[2, 4]}>
                                        Address
                                    </Text>
                                    <Grid templateColumns={["110px 1fr", "150px 1fr"]} rowGap={2}>
                                        <GridItem>
                                            <Text fontWeight="bold">Address:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>{orderDetails.address || 'Not Available'}</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text fontWeight="bold">Instructions:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>{orderDetails.addressInstructions || 'Not Available'}</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text fontWeight="bold">Door Number:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>{orderDetails.doorNumber || 'Not Available'}</Text>
                                        </GridItem>
                                    </Grid>
                                </Box>
                                <Box p={[2, 4]} borderWidth="1px" borderRadius="lg" bg="#ccf0ed" shadow="md">
                                    <Text fontSize={["lg", "xl"]} fontWeight="bold" color="blue.700" mb={4}>
                                        Payment
                                    </Text>
                                    <Grid templateColumns={["110px 1fr", "150px 1fr"]} rowGap={2}>
                                        <GridItem>
                                            <Text fontWeight="bold">Status:</Text>
                                        </GridItem>
                                        <GridItem>
                                            <Text>{orderDetails.paymentStatus}</Text>
                                        </GridItem>
                                        {orderDetails.tip ? (
                                            <>
                                                <GridItem>
                                                    <Text fontWeight="bold">Tip Type:</Text>
                                                </GridItem>
                                                <GridItem>
                                                    <Text>{orderDetails.tip.tipType}</Text>
                                                </GridItem>
                                                {orderDetails.tip.tipType === 'percentage' && (
                                                    <>
                                                        <GridItem>
                                                            <Text fontWeight="bold">Tip %:</Text>
                                                        </GridItem>
                                                        <GridItem>
                                                            <Text>{orderDetails.tip.tipPercentage}%</Text>
                                                        </GridItem>
                                                    </>
                                                )}
                                                {orderDetails.tip.tipType === 'amount' && (
                                                    <>
                                                        <GridItem>
                                                            <Text fontWeight="bold">Tip Amount:</Text>
                                                        </GridItem>
                                                        <GridItem>
                                                            <Text>${orderDetails.tip.tipAmount}</Text>
                                                        </GridItem>
                                                    </>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <GridItem>
                                                    <Text fontWeight="bold">Tip:</Text>
                                                </GridItem>
                                                <GridItem>
                                                    <Text color="gray.600">No Tip Applied</Text>
                                                </GridItem>
                                            </>
                                        )}
                                    </Grid>
                                    {orderDetails.finalPaymentIntentId && orderDetails.finalPaymentIntentId.length > 0 ? (
                                        orderDetails.finalPaymentIntentId.map((payment, index) => (
                                            <Card key={index} mt={[2, 3]} borderWidth="0.1px" shadow="sm">
                                                <CardBody>
                                                    <Flex>
                                                        <Text fontWeight="bold" mr={2}>Amount:</Text>
                                                        <Text>${payment.amount}</Text>
                                                    </Flex>
                                                    <Flex>
                                                        <Text fontWeight="bold" mr={2}>Payment Method:</Text>
                                                        <Text>{payment.paymentMethod}</Text>
                                                    </Flex>
                                                </CardBody>
                                            </Card>
                                        ))
                                    ) : (
                                        <Text mt={[2, 4]} color="gray.600" fontStyle="italic">
                                            No Payment Received Yet
                                        </Text>
                                    )}
                                </Box>

                                {/* Laundry Photos (pickup/scale) */}
                                {(orderDetails.imageUrl || orderDetails.weightImageUrl) && (
                                    <Box mt={4} p={3} bg="white" borderRadius="md" boxShadow="sm">
                                        <Text fontWeight="600" fontSize="sm" mb={2}>📷 Laundry Photos</Text>
                                        <HStack spacing={3} flexWrap="wrap">
                                            {orderDetails.imageUrl && (
                                                <Box>
                                                    <Text fontSize="xs" color="gray.500" mb={1}>Pickup</Text>
                                                    <Image src={orderDetails.imageUrl} alt="Pickup photo" maxH="150px" borderRadius="md" objectFit="cover" />
                                                </Box>
                                            )}
                                            {orderDetails.weightImageUrl && (
                                                <Box>
                                                    <Text fontSize="xs" color="gray.500" mb={1}>Weight</Text>
                                                    <Image src={orderDetails.weightImageUrl} alt="Weight photo" maxH="150px" borderRadius="md" objectFit="cover" />
                                                </Box>
                                            )}
                                        </HStack>
                                    </Box>
                                )}

                                {orderDetails.orderStatus === 'OrderSubmitted' && displayCancelOrder(orderDetails, laundryTimeZone) && (
                                    <Button
                                        colorScheme="red"
                                        size="lg"
                                        mt={[2, 4]}
                                        onClick={() => handleCancelClick(orderDetails.orderId)}
                                        isDisabled={detailsLoading || orderDetails.orderStatus === 'canceled'}
                                        isLoading={isCancelOrderLoading}
                                    >
                                        Cancel Order
                                    </Button>
                                )}
                                {/* Review Button - show for any non-canceled order that hasn't been reviewed */}
                                {!orderDetails.isReviewed && orderDetails.orderStatus !== 'OrderCanceled' && orderDetails.orderStatus !== 'OrderSubmitted' && (
                                    <Button
                                        colorScheme="blue"
                                        size="lg"
                                        mt={[2, 4]}
                                        onClick={handleOpenReviewModal}
                                        isDisabled={detailsLoading}
                                    >
                                        Review Order
                                    </Button>
                                )}
                            </VStack>
                        ) : (
                            <Text>No Details Found</Text>
                        )}
                    </DrawerBody>
                    {orderDetails && (
                        <DrawerFooter bg="#ccf0ed" borderTopWidth="1px" display="flex" justifyContent="center">
                            {orderDetails && (() => {
                                const { orderType, orderStatus, paymentStatus } = orderDetails;
                                if (orderType === 'Online' || orderStatus === 'Delivered' || orderStatus === 'OrderPickedUp') {
                                    return null;
                                }
                                const shouldEnablePayNow =
                                    orderStatus === 'ProcessingCompleted' && paymentStatus === 'Unpaid';
                                return (
                                    <Button
                                        colorScheme="blue"
                                        width="100%"
                                        onClick={onPaymentAlertOpen}
                                        isDisabled={!shouldEnablePayNow}
                                    >
                                        Pay Now
                                    </Button>
                                );
                            })()}
                        </DrawerFooter>
                    )}
                </DrawerContent>
            </Drawer>
            <AlertDialog
                isOpen={isAlertOpen}
                leastDestructiveRef={cancelRef}
                onClose={onAlertClose}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            Cancel Order
                        </AlertDialogHeader>
                        <AlertDialogBody>
                            <Text className="mb-4">Are you sure you want to cancel this order? This action cannot be undone.</Text>
                            <FormControl isRequired>
                                <FormLabel>Cancel Scope:</FormLabel>
                                <RadioGroup onChange={setIsCancelRecurring} value={isCancelRecurring}>
                                    <VStack align="start" spacing={2}>
                                        {cancelRecurringTypes.map((type) => (
                                            <Radio key={type} value={type}>
                                                {type}
                                            </Radio>
                                        ))}
                                    </VStack>
                                </RadioGroup>
                            </FormControl>
                            <FormControl isRequired>
                                <FormLabel>Please select the reason for cancellation:</FormLabel>
                                <RadioGroup onChange={setCancelReason} value={cancelReason}>
                                    <VStack align="start" spacing={2}>
                                        {cancellationOptions.map((reason) => (
                                            <Radio key={reason} value={reason}>
                                                {reason}
                                            </Radio>
                                        ))}
                                    </VStack>
                                </RadioGroup>
                                {cancelReason === 'Other' && (
                                    <FormControl isRequired mt={4}>
                                        <FormLabel>Please explain your reason:</FormLabel>
                                        <Input
                                            value={otherReason}
                                            onChange={(e) => setOtherReason(e.target.value)}
                                            placeholder="Enter your reason"
                                        />
                                    </FormControl>
                                )}
                            </FormControl>
                        </AlertDialogBody>
                        <AlertDialogFooter>
                            <Button ref={cancelRef} onClick={onAlertClose}>
                                No
                            </Button>
                            <Button
                                colorScheme="red"
                                onClick={handleCancelOrder}
                                ml={3}
                                isLoading={isCancelOrderLoading}
                            >
                                Yes, Cancel Order
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
            <AlertDialog
                isOpen={isPaymentAlertOpen}
                onClose={onPaymentAlertClose}
                leastDestructiveRef={cancelRef}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            Pay for Order {orderDetails?.orderId}
                        </AlertDialogHeader>
                        <AlertDialogBody>
                            {orderDetails && (() => {
                                const baseCost = orderDetails.totalCost || 0;
                                let tipAmount = 0;
                                if (orderDetails.tip?.tipType === 'percentage') {
                                    tipAmount = (orderDetails.tip.tipPercentage / 100) * baseCost;
                                } else {
                                    tipAmount = orderDetails.tip?.tipAmount || 0;
                                }
                                const totalPayable = baseCost + tipAmount;
                                return (
                                    <>
                                        <Text mb={[1, 2]}>Total Cost: ${baseCost.toFixed(2)}</Text>
                                        <Text mb={[1, 2]}>Tip Amount: ${tipAmount.toFixed(2)}</Text>
                                        <Text mb={[2, 4]} fontWeight="semibold">
                                            Amount to Pay: ${totalPayable.toFixed(2)}
                                        </Text>
                                    </>
                                );
                            })()}
                            <Box width="100%">
                                <Text mb={[1, 2]}>Enter Card Details</Text>
                                <Box border="1px solid #ccc" p={[2, 4]} borderRadius="fm" mb={2}>
                                    <CardElement
                                        options={{
                                            style: {
                                                base: {
                                                    fontSize: "16px",
                                                    color: "#424770",
                                                    "::placeholder": { color: "#aab7c4" },
                                                },
                                                invalid: { color: "#9e2146" },
                                            },
                                        }}
                                    />
                                </Box>
                                <Button
                                    colorScheme="blue"
                                    width="100%"
                                    onClick={handleCardPayment}
                                    isLoading={isProcessing}
                                >
                                    Submit Card Payment
                                </Button>
                            </Box>
                        </AlertDialogBody>
                        <AlertDialogFooter>
                            <Button ref={cancelRef} onClick={onPaymentAlertClose}>
                                Cancel
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>

            {/* Review Modal */}
            <Modal
                isOpen={isReviewModalOpen}
                onClose={onReviewModalClose}
                size="xl"
                isCentered
                scrollBehavior="inside"
            >
                <ModalOverlay />
                <ModalContent
                    maxH="calc(100vh - 40px)"
                    display="flex"
                    flexDirection="column"
                >
                    <ModalHeader
                        position="sticky"
                        top={0}
                        bg="white"
                        zIndex="sticky"
                        borderBottomWidth="1px"
                        pr={10}
                    >
                        Leave a Review
                        <ModalCloseButton
                            size="lg"
                            position="absolute"
                            right={4}
                            top={4}
                            _hover={{ bg: "gray.100" }}
                        />
                    </ModalHeader>
                    <ModalBody
                        p={6}
                        overflowY="auto"
                        flex="1"
                    >
                        <ReviewForm employee={orderDetails?.employee} />
                    </ModalBody>
                </ModalContent>
            </Modal>
        </Box>
    );
};

export default MyOrders;