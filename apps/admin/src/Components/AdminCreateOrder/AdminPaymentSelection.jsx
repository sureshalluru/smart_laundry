import React, {useState, useEffect} from "react";
import {
    Box,
    Button,
    Heading,
    Radio,
    RadioGroup,
    useToast,
    Text,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    HStack,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure,
    FormLabel,
    FormControl,
    Divider,
    Spinner,
    Flex,
    Grid,
    GridItem,
    Badge,
    Stack,
    useBreakpointValue
} from "@chakra-ui/react";
import {useNavigate} from "react-router-dom";
import {FaMoneyBillWave, FaCreditCard, FaPrint} from "react-icons/fa";
import axios from "axios";
import {CardElement, useStripe, useElements} from '@stripe/react-stripe-js';
import TipSelector from "./TipSelector";
import {roundToTwo} from "../../utils/decimalUtils";
import {generateBagTagHtml} from "../../utils/ticketPrint";
import {printViaIframe} from "../../utils/printUtils";


export default function PaymentSelection({
                                             customerId,
                                             laundryId,
                                             address,
                                             specialInstructions,
                                             saveSpecialInstructions,
                                             services,
                                             pickupDateUTC,
                                             pickupTime,
                                             dropoffDateUTC,
                                             dropoffTime,
                                             doorNumber,
                                             deliveryInstructions,
                                             promoCode,
                                             laundryBags,
                                             promoValidated,
                                             discountPrice,
                                             stripeTerminalExists,
                                             finalTotalPrice,
                                             isCommercialOrder,
                                         }) {
    const isMobile = useBreakpointValue({base: true, md: false});
    // Responsive sizing variables
    const headingSize = isMobile ? "lg" : "xl";
    const subHeadingSize = isMobile ? "sm" : "md";
    const textSize = isMobile ? "sm" : "md";
    const smallTextSize = isMobile ? "xs" : "sm";
    const buttonSize = isMobile ? "md" : "lg";

    // Responsive spacing variables
    const boxPadding = isMobile ? 2 : 4;
    const sectionSpacing = isMobile ? 4 : 6;
    const formSpacing = isMobile ? 2 : 3;
    const gridGap = isMobile ? 3 : 4;
    const [showAllServices, setShowAllServices] = useState(false);
    const displayedServices = showAllServices ? services : services.slice(0, 3);
    const stripe = useStripe();
    const elements = useElements();
    const [paymentOption, setPaymentOption] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [localCalculatedTotal, setLocalCalculatedTotal] = useState(0);
    const [orderId, setOrderId] = useState(null); // Store the order ID
    const [terminalStatusMsg, setTerminalStatusMsg] = useState("");
    const [storedTerminalPaymentIntentId, setStoredTerminalPaymentIntentId] = useState(null);
    const {isOpen, onOpen, onClose} = useDisclosure(); // Order Success modal state
    const {
        isOpen: isCashModalOpen,
        onOpen: openCashModal,
        onClose: closeCashModal,
    } = useDisclosure(); // Cash confirmation modal
    const {
        isOpen: isTerminalModalOpen,
        onOpen: openTerminalModal,
        onClose: closeTerminalModal,
    } = useDisclosure(); // Terminal payment confirmation modal
    const {
        isOpen: isTerminalStatusOpen,
        onOpen: onOpenTerminalStatus,
        onClose: onCloseTerminalStatus
    } = useDisclosure();

    // Terminal Error Modal (for terminal payment errors)
    const {
        isOpen: isTerminalErrorModalOpen,
        onOpen: openTerminalErrorModal,
        onClose: closeTerminalErrorModal,
    } = useDisclosure();
    const toast = useToast();
    const navigate = useNavigate();
    // Calculate subtotal (before any discounts)
    const subTotal = roundToTwo(
        services.reduce((sum, service) => sum + parseFloat(service.cost || 0), 0)
    );


    // Calculate displayed values
    const displayedTotal = promoValidated
        ? roundToTwo(finalTotalPrice)
        : subTotal;


    const displayedDiscount = promoValidated ? roundToTwo(discountPrice) : 0;


    const cardStyle = {
        style: {
            base: {
                color: "#32325d",
                fontFamily: 'Arial, sans-serif',
                fontSmoothing: "antialiased",
                fontSize: isMobile ? "14px" : "16px",
                "::placeholder": {
                    color: "#aab7c4"
                }
            },
            invalid: {
                color: "#fa755a",
                iconColor: "#fa755a"
            }
        }
    };
    // The parent's tip state can still store tipMethod if we want:
    const [tip, setTip] = useState({
        tipOption: "noTip",  // default to 'No Tip'
        tipType: "noTip",
        tipPercentage: 0,
        tipAmount: "0.00",
        customTip: "",
        tipMethod: "", // "Cash" or "Card", we will set it ourselves in this file
    });

    const displayedTip = parseFloat(tip.tipAmount) || 0; // Ensure it's a number
    const [taxRate, setTaxRate] = useState(0);
    const displayedTax = roundToTwo(displayedTotal * (taxRate / 100));
    const displayedGrandTotal = roundToTwo(displayedTotal + displayedTip + displayedTax);

    // Fetch tax rate
    useEffect(() => {
        const fetchTax = async () => {
            try {
                const res = await fetch(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/delivery-schedule?laundryId=${laundryId}`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('idToken')}` }
                });
                const data = await res.json();
                const rate = data?.body?.taxRate || data?.taxRate || 0;
                setTaxRate(rate);
            } catch (e) { /* no tax */ }
        };
        if (laundryId) fetchTax();
    }, [laundryId]);


    const authToken = localStorage.getItem('idToken');


    useEffect(() => {
        // Calculate the total cost whenever services change
        const calculateTotalCost = () => {
            const total = services.reduce((sum, service) => sum + parseFloat(service.cost || 0), 0);
            setLocalCalculatedTotal(roundToTwo(total));
        };
        calculateTotalCost();
        // Update the tip amount dynamically (0 for noTip defualt selection)
        const calculatedTip = roundToTwo((subTotal * 0) / 100);


        setTip(prevTip => ({
            ...prevTip,
            tipAmount: calculatedTip
        }));
    }, [services, subTotal]);
    // Open/close terminal status modal based on terminalStatusMsg changes.
    useEffect(() => {
        if (terminalStatusMsg) {
            onOpenTerminalStatus();
        } else {
            onCloseTerminalStatus();
        }
    }, [terminalStatusMsg, onOpenTerminalStatus, onCloseTerminalStatus]);
    // Terminal Payment Flow:
    const handleTerminalPayment = async (existingPaymentIntentId = null) => {
        try {
            setIsPlacingOrder(true);
            setTerminalStatusMsg("Initiating Terminal Payment...");
            const initiateTerminalPayload = {
                orderPaymentOperation: "initiateTerminalPayment",
                amount: displayedGrandTotal,
                laundryId: laundryId
            };
            // If re-initiating, include the existing payment intent id.
            if (existingPaymentIntentId) {
                initiateTerminalPayload.terminalPaymentIntentId = existingPaymentIntentId;
            }


            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-payment`,
                initiateTerminalPayload,
                {
                    headers: {
                        // "x-api-key": adminAuthToken,
                        'X-Amz-Date': laundryId,
                        'Authorization': `Bearer ${authToken}`

                    }
                }
            );
            if (response.data.status !== "success") {
                toast({
                    title: "Unable to Trigger the Terminal",
                    description: response.data.message || "Failed to trigger terminal.",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
                setIsPlacingOrder(false);
                setTerminalStatusMsg("");
                openTerminalErrorModal();

                return;
            }
            const {paymentIntentId} = response.data;
            // Store the payment intent id for potential re-initiations.
            setStoredTerminalPaymentIntentId(paymentIntentId);
            toast({
                title: "Terminal Triggered",
                status: "info",
                duration: 3000,
                isClosable: true,
            });
            setTerminalStatusMsg("Waiting for customer payment status...");
            // Directly start polling for payment status without immediate verification:
            pollPaymentStatus(paymentIntentId, true);
        } catch (error) {
            toast({
                title: "Terminal Payment Error",
                description: error.message,
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            setTerminalStatusMsg("");
            openTerminalErrorModal();

        } finally {
            setIsPlacingOrder(false);

        }
    };

// Polling function remains the same except for updating the status messages.
    const pollPaymentStatus = (paymentIntentId, isTerminalPayment) => {
        const pollStartTime = Date.now();
        const timeoutDuration = 60000; // 1 minute timeout (60,000 ms)

        const interval = setInterval(async () => {
            // If timeout is reached, perform final check with lastRun = true.
            if (Date.now() - pollStartTime >= timeoutDuration) {
                clearInterval(interval);
                try {
                    const finalResponse = await axios.get(
                        `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-payment-status`,
                        {
                            params: {
                                operation: "checkTerminalPaymentStatus",
                                laundryId: laundryId,
                                terminalPaymentIntentId: paymentIntentId,
                                lastRun: true,
                            },
                            headers: {
                                // 'x-api-key': adminAuthToken
                                'Authorization': `Bearer ${authToken}`

                            },
                        }
                    );

                    if (finalResponse.data.status === "success") {
                        toast({
                            title: "Payment Successful",
                            description: "Payment confirmed on final check.",
                            status: "success",
                            duration: 3000,
                            isClosable: true,
                        });
                        setTerminalStatusMsg("Placing Order...");
                        await handlePlaceOrder(true, paymentIntentId, isTerminalPayment);
                        setTerminalStatusMsg("");
                    } else if (finalResponse.data.status === "error" || finalResponse.data.status === "cancelled") {
                        clearInterval(interval);
                        // If backend indicates reInitiation is required, clear the stored PaymentIntent ID.
                        if (finalResponse.data.reInitiate) {
                            setStoredTerminalPaymentIntentId(null);
                        }
                        toast({
                            title: "Payment Cancelled",
                            description: "Payment timed out and was cancelled.",
                            status: "error",
                            duration: 5000,
                            isClosable: true,
                        });
                        setTerminalStatusMsg("");
                        openTerminalErrorModal();
                    } else {
                        // Any other response is treated as an error.
                        toast({
                            title: "Payment Error",
                            description: finalResponse.data.message || "Unexpected response during final check.",
                            status: "error",
                            duration: 5000,
                            isClosable: true,
                        });
                        setTerminalStatusMsg("");
                        openTerminalErrorModal();
                    }
                } catch (error) {
                    console.error("Error during final check", error);
                    setStoredTerminalPaymentIntentId(null);
                    toast({
                        title: "Final Check Error",
                        description: "An error occurred during the final payment check.",
                        status: "error",
                        duration: 5000,
                        isClosable: true,
                    });
                    setTerminalStatusMsg("");
                    openTerminalErrorModal();
                }
                return;
            }

            try {
                const statusResponse = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-payment-status`,
                    {
                        params: {
                            operation: "checkTerminalPaymentStatus",
                            laundryId: laundryId,
                            terminalPaymentIntentId: paymentIntentId,
                            lastRun: false,
                        },
                        headers: {
                            // 'x-api-key': adminAuthToken
                            'Authorization': `Bearer ${authToken}`

                        },
                    }
                );

                // Handle backend responses accordingly
                if (statusResponse.data.status === "success") {
                    clearInterval(interval);
                    setTerminalStatusMsg("Confirming Payment...");
                    toast({
                        title: "Payment Successful",
                        description: "Payment confirmed.",
                        status: "success",
                        duration: 3000,
                        isClosable: true,
                    });
                    setTerminalStatusMsg("Placing Order...");
                    await handlePlaceOrder(true, paymentIntentId, isTerminalPayment);
                    setTerminalStatusMsg("");
                } else if (
                    statusResponse.data.status === "error" ||
                    statusResponse.data.status === "cancelled"
                ) {
                    clearInterval(interval);
                    // If backend indicates reInitiation is required, clear the stored PaymentIntent ID.
                    if (statusResponse.data.reInitiate) {
                        setStoredTerminalPaymentIntentId(null);
                    }
                    toast({
                        title: "Payment Failed",
                        description: statusResponse.data.message || "Terminal payment failed.",
                        status: "error",
                        duration: 5000,
                        isClosable: true,
                    });
                    setTerminalStatusMsg("");
                    openTerminalErrorModal();
                } else if (statusResponse.data.status === "pending") {
                    // Payment is still pending; update status message and continue polling.
                    setTerminalStatusMsg(`Payment is pending : ${statusResponse.data.payment_status}`);
                }
            } catch (error) {
                clearInterval(interval);
                setStoredTerminalPaymentIntentId(null);
                console.error("Error while polling payment status", error);
                toast({
                    title: "Payment Status Error",
                    description: "Error checking terminal payment status. Please try again or choose another option.",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
                setTerminalStatusMsg("");
                openTerminalErrorModal();
            }
        }, 4000);
    };

    // Decide if we do immediate tip calculation or not
    const isImmediateCalc = paymentOption === "PayNow";

    const handlePlaceOrder = async (isPayNow, paymentMethodId, isTerminalPayment = false) => {
        // If "PayNow" and payment method is "Cash", we might want to set tipMethod = "Cash"
        // Otherwise "Card" or empty — up to you
        const finalTipMethod = paymentMethod === "Cash" ? "Cash" : "Card";

        // Merge the final tipMethod into tip object
        const finalTip = {
            ...tip,
            tipMethod: finalTipMethod,
        };

        try {
            setIsPlacingOrder(true);

            const inStoreOrderPayload = {
                operation: isCommercialOrder ? "CommercialLaundryOrders" : "inStorePlaceOrder",
                customerId: customerId,
                laundryId: laundryId,
                orderType: isCommercialOrder ? "Commercial" : "InStore",
                // pay_by_invoice is true for commercial accounts (net-terms) OR when
                // the operator chose "Send Invoice" for a call-in customer. The latter
                // stays order_type=InStore, so it is gated: delivery only after paid.
                payByInvoice: isCommercialOrder || paymentOption === "Invoice",
                address: address,
                doorNumber: doorNumber,
                addressInstructions: deliveryInstructions,
                specialInstructions: specialInstructions,
                saveSpecialInstructions: saveSpecialInstructions,
                services: services.map((service) => ({
                    service: service.service,
                    weightOrCount: service.count,
                    servicePrice: service.basePrice,
                })),
                pickupDate: pickupDateUTC,
                pickupTimeInterval: pickupTime,
                dropoffDate: dropoffDateUTC,
                dropoffTimeInterval: dropoffTime,
                coupon: promoValidated ? promoCode : '',
                subTotal: roundToTwo(subTotal),
                totalCost: roundToTwo(displayedTotal),
                grandTotal: roundToTwo(displayedGrandTotal),
                tip: {
                    tipType: finalTip.tipType,
                    tipPercentage: finalTip.tipPercentage,
                    tipAmount: roundToTwo(Number(finalTip.tipAmount)),
                    tipMethod: finalTip.tipMethod,  // 'Cash' or 'Card'
                    tipReceiverId: '',
                },
                discountedPrice: roundToTwo(discountPrice),
                isPayNow: isPayNow,
                laundryBags: laundryBags,
                cardPaymentMethodId: paymentMethodId,
                isTerminalPayment: isTerminalPayment,
            };

            // If it's a terminal payment, add terminalPaymentIntentId to the payload.
            if (isTerminalPayment) {
                inStoreOrderPayload.terminalPaymentIntentId = paymentMethodId;
            }
            console.log(inStoreOrderPayload);
            const orderResponse = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/instore-place-order`,
                inStoreOrderPayload,
                {
                    headers: {
                        // 'x-api-key': adminAuthToken,
                        'X-Amz-Date': laundryId,
                        'Authorization': `Bearer ${authToken}`
                    },
                }
            );

            if (orderResponse.data.status === 'success') {
                toast({
                    title: 'Order Placed Successfully',
                    status: 'success',
                    duration: 3000,
                    isClosable: true,
                });
                setOrderId(orderResponse.data.orderId); // Set the order ID
                onOpen(); // Open the success modal

            } else {
                toast({
                    title: "Failed to Place Order",
                    description: orderResponse.data.message || "Failed to place the order.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: error.message || "Failed to place the order.",
                status: 'error',
                duration: 3000,
                isClosable: true,
            });
        } finally {
            setIsPlacingOrder(false);
        }
    };

    const handlePayNow = async () => {
        if (paymentMethod === 'Cash') {
            openCashModal(); // Show cash confirmation modal
        } else if (paymentMethod === 'Card') {
            const cardElement = elements.getElement(CardElement);
            if (!cardElement) {
                toast({
                    title: "Incomplete Card Details",
                    description: "Please enter your card details to proceed.",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
                return;
            }
            try {
                setIsPlacingOrder(true);
                const {error, paymentMethod: cardPaymentMethod} = await stripe.createPaymentMethod({
                    type: 'card',
                    card: cardElement,
                    // billing_details: {
                    //     name: name,
                    //     phone: phone,
                    //     address: {
                    //         line1: address.line1,
                    //         line2: address.line2,
                    //         city: address.city,
                    //         state: address.state,
                    //         postal_code: address.postal_code,
                    //         country: address.country,
                    //     }
                    // }
                });
                if (error) {
                    toast({
                        title: "Error creating payment method",
                        description: error.message || "Invalid card details. Please check and try again.",
                        status: "error",
                        duration: 5000,
                        isClosable: true,
                    });
                    return;
                }
                await handlePlaceOrder(true, cardPaymentMethod.id);
            } catch (error) {
                toast({
                    title: "Order Creation Failed",
                    description: "Failed to create the order.Please try again or choose Cash.",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
            } finally {
                setIsPlacingOrder(false);
            }
        }
    };

    const handleSubmit = () => {
        if (!paymentOption) {
            toast({
                title: "Payment Option Required",
                description: "Please select a payment option to proceed.",
                status: "warning",
                duration: 5000,
                isClosable: true,
            });
            return;
        }
        if (paymentOption === 'PayNow' && !paymentMethod) {
            toast({
                title: "Payment Method Required",
                description: "Please select a payment method to proceed.",
                status: "warning",
                duration: 5000,
                isClosable: true,
            });
            return;
        }
        if (paymentOption === 'PayLater' || paymentOption === 'Invoice') {
            // No card taken now. For "Invoice" the payload flags payByInvoice so
            // an invoice is emailed at Processing Completed and delivery is gated
            // until it's paid.
            handlePlaceOrder(false, '');
        } else if (paymentOption === 'PayNow') {
            // If Terminal Payment is selected, open the confirmation modal.
            if (paymentMethod === 'Terminal') {
                openTerminalModal();
                return;
            }
            handlePayNow();
        }
    };


    const handleTerminalConfirmation = (confirm) => {
        closeTerminalModal();
        if (confirm) {
            // If re-initiating, pass the stored payment intent id (if available)
            handleTerminalPayment(storedTerminalPaymentIntentId || null);
        }
    };
    const handleCashConfirmation = (isCashCollected) => {
        if (isCashCollected) {
            handlePlaceOrder(true, '');
        }
        closeCashModal(); // Close the cash confirmation modal
    };
    const handleViewOrders = () => {
        navigate(`/${laundryId}/admin/active-orders`);
    };

    // Print one scannable bag tag per bag. Each tag's QR opens the same employee
    // order page as the receipt QR, so a scanned bag resolves back to its order.
    const printBagTags = () => {
        if (!orderId) return;
        const htmlContent = generateBagTagHtml({
            orderId,
            laundryId,
            userDomain: null, // uses window.location.origin fallback
            bags: laundryBags || 1,
            intakeDate: new Date().toLocaleDateString(),
        });
        printViaIframe(htmlContent);
    };
    return (
        <Box width="100%" position="relative" maxWidth="1200px" p={isMobile ? 2 : 3}  mx="auto">
            <Heading mb={sectionSpacing} fontSize={headingSize}>Review and Payment</Heading>

            <Flex
                direction={{base: "column", md: "row"}}
                gap={sectionSpacing}
                align="flex-start"
            >
                {/* Left Column - Order Details */}
                <Box
                    flex={{md: 1}}
                    width="100%"
                >
                    <Box
                        p={boxPadding}
                        borderRadius="md"
                        boxShadow="sm"
                        mb={sectionSpacing}
                        borderWidth="1px"
                    >
                        <Heading size={subHeadingSize} mb={4}>Order Details</Heading>

                        <Grid
                            templateColumns={{base: "1fr", sm: "repeat(2, 1fr)"}}
                            gap={gridGap}
                            mb={4}
                        >
                            <GridItem>
                                <Text fontSize={textSize}><strong>Pickup:</strong> {pickupDateUTC} at {pickupTime}</Text>
                            </GridItem>
                            <GridItem>
                                <Text fontSize={textSize}><strong>Drop-off:</strong> {dropoffDateUTC} at {dropoffTime}</Text>
                            </GridItem>
                            <GridItem colSpan={{base: 1, sm: 2}}>
                                <Text fontSize={textSize}><strong>Address:</strong> {address || "No Address Provided"}</Text>
                            </GridItem>
                            <GridItem colSpan={{base: 1, sm: 2}}>
                                <Text fontSize={textSize}><strong>Instructions:</strong> {specialInstructions || "None"}</Text>
                            </GridItem>
                            <GridItem>
                                <Text fontSize={textSize}><strong>Bags:</strong> {laundryBags || "None"}</Text>
                            </GridItem>
                        </Grid>

                        <Divider my={4}/>

                        <Heading size="sm" mb={3} fontSize={subHeadingSize}>
                            Services ({services.length})
                        </Heading>

                        <Box
                            maxH={showAllServices ? "none" : "300px"}
                            overflowY="auto"
                            position="relative"
                        >
                            <Table variant="simple" size="sm" mb={4}>
                                <Thead position="sticky" top={0} bg="white" zIndex={1}>
                                    <Tr bg="gray.100">
                                        <Th fontSize={smallTextSize}>Service</Th>
                                        <Th isNumeric fontSize={smallTextSize}>Price</Th>
                                        <Th isNumeric fontSize={smallTextSize}>Qty</Th>
                                        <Th isNumeric fontSize={smallTextSize}>Total</Th>
                                    </Tr>
                                </Thead>
                                <Tbody>
                                    {displayedServices.map((service, index) => (
                                        <Tr key={index}>
                                            <Td fontSize={textSize}>{service.service}</Td>
                                            <Td isNumeric fontSize={textSize}>${service.basePriceDisplay}</Td>
                                            <Td isNumeric fontSize={textSize}>{service.count}</Td>
                                            <Td isNumeric fontSize={textSize}>${service.cost}</Td>
                                        </Tr>
                                    ))}
                                </Tbody>
                            </Table>
                        </Box>

                        {services.length > 3 && (
                            <Button
                                size="sm"
                                variant="ghost"
                                colorScheme="blue"
                                onClick={() => setShowAllServices(!showAllServices)}
                                width="full"
                                fontSize={smallTextSize}
                            >
                                {showAllServices ? "Show Less" : `Show All (${services.length})`}
                            </Button>
                        )}
                    </Box>
                </Box>

                {/* Right Column - Order Summary and Payment */}
                <Box
                    flex={{md: 1}}
                    width="100%"
                    position={{md: "sticky"}}
                    top={{md: "20px"}}
                    alignSelf="flex-start"
                >
                    {/* Order Summary Panel */}
                    <Box
                        borderWidth="1px"
                        borderRadius="lg"
                        p={boxPadding}
                        mb={sectionSpacing}
                        boxShadow="md"
                    >
                        <Flex justifyContent="space-between" alignItems="center" mb={2}>
                            <Heading size={subHeadingSize} fontSize={isMobile ? "md" : "lg"}>Order Summary</Heading>
                        </Flex>

                        <Stack spacing={formSpacing} mb={2}>
                            <Flex justifyContent="space-between" fontSize={textSize}>
                                <Text>Subtotal</Text>
                                <Text>${roundToTwo(subTotal)}</Text>
                            </Flex>

                            {promoValidated && (
                                <>
                                    <Flex justifyContent="space-between" fontSize={textSize}>
                                        <Text>Discount</Text>
                                        <Text color="green.500">-${roundToTwo(displayedDiscount)}</Text>
                                    </Flex>
                                    <Flex justifyContent="space-between" align="center" fontSize={textSize}>
                                        <Text>Promo Code</Text>
                                        <Badge colorScheme="green" fontSize={smallTextSize}>{promoCode}</Badge>
                                    </Flex>
                                </>
                            )}
                        </Stack>

                        <Divider my={2}/>

                        {/* Tip Selector */}
                        <Box mb={2}>
                            <Text fontWeight="semibold" mb={1} fontSize={textSize}>Add Tip</Text>
                            <TipSelector
                                totalCost={subTotal}
                                tip={tip}
                                setTip={setTip}
                                isImmediateCalculation={isImmediateCalc}
                                textSize={textSize}
                                smallTextSize={smallTextSize}
                            />
                        </Box>

                        <Divider my={3}/>

                        <Stack spacing={formSpacing} mb={0}>
                            <Flex justifyContent="space-between" fontSize={textSize}>
                                <Text>Tip</Text>
                                <Text>${roundToTwo(displayedTip)}</Text>
                            </Flex>

                            {taxRate > 0 && (
                                <Flex justifyContent="space-between" fontSize={textSize} color="gray.600">
                                    <Text>Tax ({taxRate}%)</Text>
                                    <Text>${roundToTwo(displayedTax)}</Text>
                                </Flex>
                            )}

                            <Divider/>

                            <Flex justifyContent="space-between" fontWeight="bold" fontSize={textSize}>
                                <Text> Grand Total</Text>
                                <Text>${roundToTwo(displayedGrandTotal)}</Text>

                            </Flex>
                        </Stack>
                    </Box>

                    {/* Payment Options Section */}
                    <Box
                        borderWidth="1px"
                        borderRadius="lg"
                        p={boxPadding}
                        mb={sectionSpacing}
                        boxShadow="md"
                    >
                        <Heading size={subHeadingSize} mb={3}>Payment Method</Heading>
                        <RadioGroup onChange={setPaymentOption} value={paymentOption}>
                            <HStack spacing={3} mb={3}>
                                {!isCommercialOrder && (
                                    <Radio value="PayNow" size="md">
                                        <Box ml={2}>
                                            <Text fontWeight="medium" fontSize={textSize}>Pay Now</Text>
                                            <Text fontSize={smallTextSize} color="gray.500">Pay immediately</Text>
                                        </Box>
                                    </Radio>
                                )}
                                <Radio value="PayLater" size="md">
                                    <Box ml={2}>
                                        <Text fontWeight="medium" fontSize={textSize}>Pay Later</Text>
                                        <Text fontSize={smallTextSize} color="gray.500">Pay at pickup</Text>
                                    </Box>
                                </Radio>
                                {!isCommercialOrder && (
                                    <Radio value="Invoice" size="md">
                                        <Box ml={2}>
                                            <Text fontWeight="medium" fontSize={textSize}>Send Invoice</Text>
                                            <Text fontSize={smallTextSize} color="gray.500">Email an invoice; deliver after it's paid</Text>
                                        </Box>
                                    </Radio>
                                )}
                            </HStack>
                        </RadioGroup>

                        {paymentOption === "Invoice" && (
                            <Text fontSize={smallTextSize} color="gray.600" mt={1}>
                                No card is taken now. An invoice is emailed when the order reaches
                                "Processing Completed"; the order can be delivered once the invoice is paid.
                            </Text>
                        )}

                        {isCommercialOrder && (
                            <Text fontSize={smallTextSize} color="gray.600" mt={1}>
                                Commercial orders must be paid later.
                            </Text>
                        )}

                        {paymentOption === "PayNow" && (
                            <Box mt={4}>
                                <RadioGroup onChange={setPaymentMethod} value={paymentMethod}>
                                    <Stack
                                        direction={{base: "column", md: "row"}}
                                        spacing={2}
                                        align={{base: "flex-start", md: "center"}}
                                    >
                                        <Radio value="Cash" size="md">
                                            <HStack ml={2} spacing={2}>
                                                <FaMoneyBillWave size={isMobile ? "16px" : "18px"}/>
                                                <Box>
                                                    <Text fontSize={textSize}>Cash</Text>
                                                    <Text fontSize={smallTextSize} color="gray.500">Cash Payment</Text>
                                                </Box>
                                            </HStack>
                                        </Radio>
                                        <Radio value="Card" size="md">
                                            <HStack ml={2} spacing={2}>
                                                <FaCreditCard size={isMobile ? "16px" : "18px"}/>
                                                <Box>
                                                    <Text fontSize={textSize}>Card</Text>
                                                    <Text fontSize={smallTextSize} color="gray.500">Credit/Debit card</Text>
                                                </Box>
                                            </HStack>
                                        </Radio>
                                        <Radio value="Terminal" size="md" isDisabled={!stripeTerminalExists}>
                                            <HStack ml={2} spacing={2}>
                                                <Box>
                                                    <Text fontSize={textSize}>Terminal</Text>
                                                    <Text fontSize={smallTextSize} color="gray.500">Card terminal</Text>
                                                </Box>
                                            </HStack>
                                        </Radio>
                                    </Stack>
                                </RadioGroup>

                                {paymentMethod === 'Card' && (
                                    <Box mt={4}>
                                        <FormControl>
                                            <FormLabel fontSize={textSize}>Card Details</FormLabel>
                                            <Box
                                                borderWidth="1px"
                                                borderRadius="md"
                                                p={3}
                                                bg="gray.50"
                                            >
                                                <CardElement options={cardStyle}/>
                                            </Box>
                                        </FormControl>
                                    </Box>
                                )}
                            </Box>
                        )}
                    </Box>

                    {/* Place Order Button */}
                    <Box
                        position={{base: "sticky", md: "static"}}
                        pb={{base: 3, md: 0}}
                        zIndex={1}
                        borderTopWidth={{base: "1px", md: 0}}
                        borderTopColor="gray.200"
                    >
                        <Button
                            colorScheme="blue"
                            size={buttonSize}
                            width="100%"
                            isDisabled={!paymentOption || (paymentOption === "PayNow" && !paymentMethod)}
                            isLoading={isPlacingOrder}
                            onClick={handleSubmit}
                            fontSize={textSize}
                            py={isMobile ? 2 : 4}
                        >
                            Place Order (${roundToTwo(displayedGrandTotal)})
                        </Button>
                    </Box>
                </Box>
            </Flex>
            <Modal isOpen={isOpen} onClose={onClose} closeOnOverlayClick={false}>
                <ModalOverlay/>
                <ModalContent>
                    <ModalHeader>Order Placed Successfully</ModalHeader>
                    <ModalBody>
                        <Text>Order has been successfully placed</Text>
                        {orderId && (
                            <Text fontWeight="bold" mt={2}>
                                Order ID: {orderId}
                            </Text>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button leftIcon={<FaPrint/>} colorScheme="teal" mr={3} onClick={printBagTags}>
                            Print Bag Tags
                        </Button>
                        <Button colorScheme="blue" onClick={handleViewOrders}>
                            View Orders
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            <Modal isOpen={isCashModalOpen} onClose={closeCashModal} closeOnOverlayClick={false}>
                <ModalOverlay/>
                <ModalContent>
                    <ModalHeader>Confirm Cash Payment</ModalHeader>
                    <ModalBody>
                        <Text>Did you collect the cash from the customer?</Text>
                    </ModalBody>
                    <ModalFooter>
                        <Button colorScheme="green" mr={3} onClick={() => handleCashConfirmation(true)}>
                            Yes
                        </Button>
                        <Button variant="ghost" onClick={() => handleCashConfirmation(false)}>
                            No
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <Modal isOpen={isTerminalModalOpen} onClose={closeTerminalModal} closeOnOverlayClick={false}>
                <ModalOverlay/>
                <ModalContent>
                    <ModalHeader>Initiate Terminal Payment</ModalHeader>
                    <ModalBody>
                        <Text>Do you want to initiate the terminal payment?</Text>
                    </ModalBody>
                    <ModalFooter>
                        <Button colorScheme="green" mr={3} onClick={() => handleTerminalConfirmation(true)}>
                            Yes
                        </Button>
                        <Button variant="ghost" onClick={() => handleTerminalConfirmation(false)}>
                            No
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Terminal Error Options Modal */}
            <Modal isOpen={isTerminalErrorModalOpen} onClose={closeTerminalErrorModal} closeOnOverlayClick={false}>
                <ModalOverlay/>
                <ModalContent>
                    <ModalHeader>Terminal Payment Error</ModalHeader>
                    <ModalBody>
                        <Text>
                            There was an error processing the terminal payment. Would you like to retry the terminal
                            payment or choose another payment option?
                        </Text>
                    </ModalBody>
                    <ModalFooter>
                        <Button colorScheme="green" mr={3} onClick={() => {
                            closeTerminalErrorModal();
                            handleTerminalPayment(storedTerminalPaymentIntentId || null);
                        }}>
                            Retry Terminal Payment
                        </Button>
                        <Button variant="ghost" onClick={() => {
                            closeTerminalErrorModal();
                            setPaymentMethod(""); // Clear Terminal selection to allow choosing another option
                            setStoredTerminalPaymentIntentId(null);
                        }}>
                            Other Options
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            {/*
                ----- Terminal Status Modal -----
                Shows a spinner and the current status message.
                Opens automatically when terminalStatusMsg is non-empty.
            */}
            <Modal
                isOpen={isTerminalStatusOpen}
                onClose={() => {
                }}
                closeOnOverlayClick={false}
                isCentered
            >
                <ModalOverlay/>
                <ModalContent>
                    <ModalHeader>Terminal Status</ModalHeader>
                    <ModalBody>
                        <HStack spacing={3}>
                            <Spinner size="sm"/>
                            <Text>{terminalStatusMsg}</Text>
                        </HStack>
                    </ModalBody>
                    <ModalFooter>
                        <Button colorScheme="blue" isDisabled>
                            Processing
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Box>
    );
}
