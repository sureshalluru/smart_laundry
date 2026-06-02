import React, {useState, useRef, useEffect} from "react";
import {
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
    Button, VStack, Box, Text, RadioGroup, Stack, Radio, Input,
    HStack, Spinner, useToast, AlertDialog, AlertDialogOverlay, Flex,
    AlertDialogContent, AlertDialogHeader, AlertDialogBody, AlertDialogFooter
} from "@chakra-ui/react";
import {CardElement, useStripe, useElements} from "@stripe/react-stripe-js";
import axios from "axios";
import {roundToTwo} from "../../utils/decimalUtils";

const PaymentModal = ({
                          isOpen,
                          onClose,
                          orderId,
                          laundryId,
                          empId,
                          onOrderClose,
                          totalCost,
                          subTotal,
                          discountPrice,
                          paymentMethod: originalPaymentMethod,
                          tip: originalTip,
                          setOrders,
                          setFilteredOrders,
                          setOrderStatusMap,
                          setIsEditMode,
                          stripeTerminalExists,
                          totalPaymentsReceived,
                          orderType,
                          setInitialStatus
                      }) => {
    const stripe = useStripe();
    const elements = useElements();
    const toast = useToast();
    const cancelRef = useRef();
    const authToken = localStorage.getItem('idToken');

    // Tip selection state
    const hasOriginalTip = originalTip?.tipAmount > 0;
    const initialTipMethod = hasOriginalTip
        ? (originalTip.tipType === "percentage" && [5, 10, 15].includes(originalTip.tipPercentage)
            ? String(originalTip.tipPercentage)
            : "custom")
        : "noTip";
    const [tipSelectionMethod, setTipSelectionMethod] = useState(initialTipMethod);
    const [method, setMethod] = useState("");
    const [customTipValue, setCustomTipValue] = useState(
        initialTipMethod === "custom" ? String(originalTip.tipAmount) : ""
    );

    // Refund confirmation state
    const [isRefundAlertOpen, setIsRefundAlertOpen] = useState(false);
    const [latestTerminalAmount, setLatestTerminalAmount] = useState(null);
    const [storedTerminalPaymentIntentId, setStoredTerminalPaymentIntentId] = useState(null);
    const [terminalStatusMsg, setTerminalStatusMsg] = useState("");
    const [isTerminalErrorModalOpen, setIsTerminalErrorModalOpen] = useState(false);
    const [isCashCheckConfirmOpen, setIsCashCheckConfirmOpen] = useState(false);
    const cashCheckCancelRef = useRef();


    const customTipInputRef = useRef(null);

    // Recompute tip
    const computeTip = () => {
        let tip = 0;
        let type = "noTip";
        let pct = 0;

        if (tipSelectionMethod === "noTip") {
            type = "noTip";
        } else if (["5", "10", "15"].includes(tipSelectionMethod)) {
            pct = Number(tipSelectionMethod);
            tip = roundToTwo(subTotal * (pct / 100));
            type = "percentage";
        } else if (tipSelectionMethod === "custom") {
            tip = parseFloat(customTipValue) || 0;
            type = "custom";
        }
        return {tipAmount: tip, tipType: type, tipPercentage: pct};
    };

    const {tipAmount: currentTip, tipType: currentTipType, tipPercentage: currentPct} = computeTip();
    const totalWithTip = roundToTwo(totalCost + currentTip);
    const outstanding = roundToTwo(totalWithTip - totalPaymentsReceived);


    // Helper to build tip_payload
    const buildTipPayload = (method) => {
        const payload = {
            tipType: currentTipType,
            tipAmount: currentTip,
            tipMethod: method,
            tipReceiverId: empId,
        };
        if (currentTipType === "percentage") payload.tipPercentage = currentPct;
        return payload;
    };

    // Unified complete payment
    const [isProcessing, setIsProcessing] = useState(false);
    const completePayment = async ({isCashRefund = false, cardPmId = null, terminalIntentId = null}) => {
        setIsProcessing(true);
        try {
            const methodForPayload = outstanding < 0
                ? originalPaymentMethod
                : method;
            const tip_payload = buildTipPayload(isCashRefund ? "Cash" : methodForPayload);
            const payload = {
                tip_payload,
                payment_updates: [],
                is_cash_refunded: outstanding < 0 && originalPaymentMethod === "Cash" && isCashRefund
            };
            if (outstanding < 0) {
                payload.is_cash_refunded = originalPaymentMethod === "Cash";
            } else if (outstanding > 0) {
                const intentId =
                    method === "Card" ? cardPmId : method === "Terminal" ? terminalIntentId : null;
                payload.payment_updates = [
                    {amount: outstanding, paymentMethod: method, paymentIntentId: intentId},
                ];
            }
            console.log(payload);
            console.log("captureInStorePaymentTest", orderId, laundryId, empId);
            const {data} = await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/payment/instore-payment`,
                payload,
                {
                    params: {
                        operation: "captureInStorePaymentTest",
                        orderId: orderId,
                        laundryId: laundryId,
                        empId: empId
                    },
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                    },
                }
            );
            if (data.body.status !== "success") throw new Error(data.body.message || "Failed");
            const updated = data.body.updatedOrder;
            setOrders((o) => o.map((x) => (x.orderId === updated.orderId ? updated : x)));
            setFilteredOrders((o) => o.map((x) => (x.orderId === updated.orderId ? updated : x)));
            setOrderStatusMap((m) => ({...m, [updated.orderId]: updated.orderStatus}));
            toast({title: "Payment Completed", status: "success"});
            setInitialStatus(updated.orderStatus);
            onClose();
            onOrderClose();
            setIsEditMode(false);
        } catch (e) {
            toast({title: "Error", description: e.message, status: "error"});
        } finally {
            setIsProcessing(false);
        }
    };

    useEffect(() => {
        if (tipSelectionMethod === "custom" && customTipInputRef.current) {
            customTipInputRef.current.focus();
        }
    }, [tipSelectionMethod]);

    // Handlers
    const handleCash = () => completePayment({isCashRefund: outstanding < 0});
    const handleCard = async () => {
        if (!stripe || !elements) return;
        setIsProcessing(true);
        try {
            const {paymentMethod, error} = await stripe.createPaymentMethod({
                type: "card",
                card: elements.getElement(CardElement)
            });
            if (error) throw error;
            await completePayment({cardPmId: paymentMethod.id});
        } catch (e) {
            toast({title: "Card Error", description: e.message, status: "error"});
            setIsProcessing(false);
        }
    };

    // Terminal
    const [isTerminalProcessing, setIsTerminalProcessing] = useState(false);
    const [terminalMsg, setTerminalMsg] = useState("");
    const [isTerminalError, setIsTerminalError] = useState(false);

    const [pollingInterval, setPollingInterval] = useState(null);

    const pollStatus = (pi) => {
        const start = Date.now();
        // Clear any existing interval first
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }

        const iv = setInterval(async () => {
            if (Date.now() - start > 60000) {
                clearInterval(iv);
                setIsTerminalProcessing(false);
                setTerminalMsg("");
                setIsTerminalError(true);
                setPollingInterval(null); // Clear the interval reference
                return;
            }
            try {
                const {data} = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-direct-payment-status`,
                    {
                        params: {
                            operation: "checkImmediateTerminalPaymentStatus",
                            laundryId: laundryId,
                            terminalPaymentIntentId: pi,
                            lastRun: false,
                        },
                        headers: {'Authorization': `Bearer ${authToken}`},
                    }
                );
                if (data.status === "success") {
                    clearInterval(iv);
                    setPollingInterval(null); // Clear the interval reference
                    await completePayment({terminalIntentId: pi});
                } else if (data.status !== "pending") {
                    clearInterval(iv);
                    setPollingInterval(null); // Clear the interval reference
                    setIsTerminalProcessing(false);
                    setIsTerminalError(true);
                }
            } catch (_) {
                clearInterval(iv);
                setPollingInterval(null); // Clear the interval reference
                setIsTerminalProcessing(false);
                setIsTerminalError(true);
            }
        }, 3000);

        setPollingInterval(iv); // Store the new interval reference
    };

    const handleTerminal = async () => {
        try {
            setIsTerminalProcessing(true);
            setLatestTerminalAmount(outstanding);
            setTerminalStatusMsg("Initiating Terminal Payment...");

            const initiateTerminalPayload = {
                orderPaymentOperation: "initiateImmediateTerminalPayment",
                amount: outstanding,
                laundryId: laundryId
            };

            if (storedTerminalPaymentIntentId) {
                initiateTerminalPayload.terminalPaymentIntentId = storedTerminalPaymentIntentId;
            }

            const terminalResponse = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-direct-payment`,
                initiateTerminalPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'X-Amz-Date': laundryId
                    }
                }
            );

            if (terminalResponse.data.status !== "success") {
                setTerminalStatusMsg("");
                setIsTerminalErrorModalOpen(true);
                toast({
                    title: "Terminal Payment Error",
                    description: terminalResponse.data.message || "Failed to initiate terminal payment.",
                    status: "error",
                    duration: 5000,
                    isClosable: true
                });
                setIsTerminalProcessing(false);
                return;
            }

            const {paymentIntentId} = terminalResponse.data;
            setStoredTerminalPaymentIntentId(paymentIntentId);
            setTerminalStatusMsg("Waiting for customer payment status...");
            pollTerminalPaymentStatus(paymentIntentId, outstanding);

        } catch (error) {
            setTerminalStatusMsg("");
            setIsTerminalErrorModalOpen(true);
            toast({
                title: "Terminal Payment Error",
                description: error.message || "An error occurred during terminal payment.",
                status: "error",
                duration: 5000,
                isClosable: true
            });
            setIsTerminalProcessing(false);
        }
    };
    const pollTerminalPaymentStatus = (paymentIntentId, terminalAmount) => {
        const pollStartTime = Date.now();
        const timeoutDuration = 60000;

        const interval = setInterval(async () => {
            if (Date.now() - pollStartTime >= timeoutDuration) {
                clearInterval(interval);
                try {
                    const finalResponse = await axios.get(
                        `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-direct-payment-status`,
                        {
                            params: {
                                operation: "checkImmediateTerminalPaymentStatus",
                                laundryId: laundryId,
                                terminalPaymentIntentId: paymentIntentId,
                                lastRun: true
                            },
                            headers: {'Authorization': `Bearer ${authToken}`}
                        }
                    );

                    if (finalResponse.data.status === "success") {
                        setTerminalStatusMsg("Payment Successful. Capturing payment...");
                        await completePayment({terminalIntentId: paymentIntentId});
                    } else {
                        setTerminalStatusMsg("");
                        if (finalResponse.data.reInitiate) {
                            setStoredTerminalPaymentIntentId(null);
                        }
                        setIsTerminalErrorModalOpen(true);
                    }
                } catch (error) {
                    setTerminalStatusMsg("");
                    setStoredTerminalPaymentIntentId(null);
                    setIsTerminalErrorModalOpen(true);
                }
                return;
            }

            try {
                const statusResponse = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-direct-payment-status`,
                    {
                        params: {
                            operation: "checkImmediateTerminalPaymentStatus",
                            laundryId: laundryId,
                            terminalPaymentIntentId: paymentIntentId,
                            lastRun: false
                        },
                        headers: {'Authorization': `Bearer ${authToken}`}
                    }
                );

                if (statusResponse.data.status === "success") {
                    clearInterval(interval);
                    setTerminalStatusMsg("Payment Successful. Capturing payment...");
                    await completePayment({terminalIntentId: paymentIntentId});
                } else if (["error", "cancelled"].includes(statusResponse.data.status)) {
                    clearInterval(interval);
                    setTerminalStatusMsg("");
                    if (statusResponse.data.reInitiate) {
                        setStoredTerminalPaymentIntentId(null);
                    }
                    setIsTerminalErrorModalOpen(true);
                } else if (statusResponse.data.status === "pending") {
                    setTerminalStatusMsg(`Payment is pending: ${statusResponse.data.payment_status || ""}`);
                }

            } catch (error) {
                clearInterval(interval);
                setTerminalStatusMsg("");
                setStoredTerminalPaymentIntentId(null);
                setIsTerminalErrorModalOpen(true);
            }
        }, 4000);
    };

    // Click logic
    const onCompleteClick = () => {
        if (outstanding < 0) {
            // Only show refund confirmation if original payment was cash
            if (originalPaymentMethod === "Cash") {
                return setIsRefundAlertOpen(true);
            } else {
                // For non-cash payments, just complete without confirmation
                return completePayment({isCashRefund: false});
            }
        }
        if (outstanding > 0) {
            if (method === "Card") return handleCard();
            if (method === "Terminal") return handleTerminal();
            return handleCash();
        }
        // Outstanding == 0 → finalize:
        return handleCash();
    };

    const tipOptions = [5, 10, 15].map(pct => {
        const tipAmount = roundToTwo((subTotal * pct) / 100);
        return {value: String(pct), label: `${pct}% ($${tipAmount})`};
    });


    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} size="md">
                <ModalOverlay/>
                <ModalContent
                    mx={{base: 2, sm: 4}}
                    my={{base: 8, md: 12}}
                    width={{base: "95vw", md: "600px"}}
                    maxH="calc(100vh - 64px)"
                    overflowY="auto"
                    borderRadius="lg"
                >
                    <Box fontSize="sm">
                        <ModalHeader px={4} pt={4} pb={2}>
                            <HStack justify="space-between" align="center">
                                <Text>🧾 Order Summary</Text>
                                <HStack spacing={2}>
                                    <Button onClick={onClose} size="sm" variant="outline">
                                        Cancel
                                    </Button>
                                    <Button
                                        colorScheme="blue"
                                        size="sm"
                                        onClick={onCompleteClick}
                                        isLoading={isProcessing || isTerminalProcessing}
                                        isDisabled={outstanding > 0 ? !method : false}
                                    >
                                        {outstanding < 0 ? "Refund Payment" : "Complete Payment"}
                                    </Button>
                                </HStack>
                            </HStack>
                        </ModalHeader>

                        <ModalBody px={4} pb={4}>
                            <VStack align="stretch" spacing={0}>
                                <Box borderWidth="1px" borderRadius="md" p={1} bg="gray.50">
                                    <VStack align="stretch" spacing={1}>
                                        <HStack justify="space-between">
                                            <Text fontWeight="medium">Subtotal:</Text>
                                            <Text>${roundToTwo(subTotal)}</Text>
                                        </HStack>

                                        <HStack justify="space-between">
                                            <Text fontWeight="medium">Discount:</Text>
                                            <Text color="red.600">- ${roundToTwo(discountPrice)}</Text>
                                        </HStack>
                                        <HStack justify="space-between">
                                            <Text fontWeight="medium">Total Cost (After Discount):</Text>
                                            <Text>${roundToTwo(totalCost)}</Text>
                                        </HStack>
                                        <HStack justify="space-between">
                                            <Text fontWeight="medium">Tip Amount:</Text>
                                            <Text>${roundToTwo(currentTip)}</Text>
                                        </HStack>

                                        <HStack justify="space-between">
                                            <Text fontWeight="semibold">Grand Total (with Tip):</Text>
                                            <Text fontWeight="semibold">${roundToTwo(totalWithTip)}</Text>
                                        </HStack>

                                        <HStack justify="space-between">
                                            <Text fontWeight="medium">Payments Received:</Text>
                                            <Text>${roundToTwo(totalPaymentsReceived)}</Text>
                                        </HStack>

                                        <Box borderTop="1px solid #ccc" pt={1} mt={2}>
                                            <HStack justify="space-between">
                                                <Text fontWeight="semibold" color="teal.600">Outstanding Amount:</Text>
                                                <Text fontWeight="semibold"
                                                      color={outstanding > 0 ? "red.500" : "green.500"}>
                                                    ${roundToTwo(outstanding)}
                                                </Text>
                                            </HStack>
                                        </Box>
                                    </VStack>
                                </Box>

                                <Box borderWidth="1px" borderRadius="md" p={0} bg="gray.50">
                                    <VStack align="stretch" spacing={0}>
                                        <RadioGroup onChange={setTipSelectionMethod} value={tipSelectionMethod}>
                                            <Flex direction="row" gap={1} wrap="nowrap" overflowX="auto" fontSize="sm">
                                                <Radio value="noTip" whiteSpace="nowrap">No Tip</Radio>
                                                {tipOptions.map((option) => (
                                                    <Radio key={option.value} value={option.value} whiteSpace="nowrap">
                                                        {option.label}
                                                    </Radio>
                                                ))}
                                                <Radio value="custom" whiteSpace="nowrap">Custom</Radio>
                                            </Flex>
                                        </RadioGroup>


                                        {tipSelectionMethod === "custom" && (
                                            <Input
                                                ref={customTipInputRef}
                                                mt={1}
                                                placeholder="Enter custom tip"
                                                value={customTipValue}
                                                onChange={(e) => setCustomTipValue(e.target.value)}
                                                size="sm"
                                                maxW="200px"
                                            />
                                        )}
                                    </VStack>
                                </Box>

                                {outstanding > 0 && (
                                    <Box borderWidth="1px" borderRadius="md" p={0} bg="gray.50">
                                        <VStack align="stretch" spacing={2}>

                                            <RadioGroup
                                                onChange={(val) => {
                                                    if (val === "Cash" && orderType?.toLowerCase() === "commercial") {
                                                        setIsCashCheckConfirmOpen(true); // prompt first
                                                    }
                                                    setMethod(val); // set method regardless
                                                }}
                                                value={method}
                                            >
                                                <Stack direction="row" wrap="wrap" spacing={3}>
                                                    <Radio
                                                        value="Cash">{orderType?.toLowerCase() === "commercial" ? "Cash / Check" : "Cash"}</Radio>
                                                    <Radio value="Card">Card</Radio>
                                                    {stripeTerminalExists && <Radio value="Terminal">Terminal</Radio>}
                                                </Stack>
                                            </RadioGroup>

                                            {method === "Card" && (
                                                <Box mt={2} border="1px solid #ccc" p={2} borderRadius="md" bg="white">
                                                    <CardElement/>
                                                </Box>
                                            )}
                                        </VStack>
                                    </Box>
                                )}
                            </VStack>
                        </ModalBody>
                    </Box>
                </ModalContent>
            </Modal>


            {/* Refund Confirmation */}
            <AlertDialog
                isOpen={isRefundAlertOpen}
                leastDestructiveRef={cancelRef}
                onClose={() => setIsRefundAlertOpen(false)}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader>Confirm Cash Refund</AlertDialogHeader>
                        <AlertDialogBody>
                            You need to refund <strong>${roundToTwo(Math.abs(outstanding))}</strong>to the
                            customer.<br/><br/>
                            Have you physically returned this amount in cash?
                        </AlertDialogBody>
                        <AlertDialogFooter>
                        <Button onClick={() => setIsRefundAlertOpen(false)}>No</Button>
                            <Button
                                colorScheme="green"
                                onClick={() => {
                                    setIsRefundAlertOpen(false);
                                    completePayment({isCashRefund: true});
                                }}
                                ml={3}
                            >
                                Yes, Refunded
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>

            {/* Terminal status & errors unchanged */}
            {terminalStatusMsg && (
                <Modal isOpen={true} onClose={() => {
                }} closeOnOverlayClick={false} isCentered>
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
            )}
            <Modal
                isOpen={isTerminalErrorModalOpen}
                onClose={() => setIsTerminalErrorModalOpen(false)}
                closeOnOverlayClick={false}
                isCentered
            >
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
                        <Button
                            colorScheme="green"
                            mr={3}
                            onClick={() => {
                                setIsTerminalErrorModalOpen(false);
                                // Retry with stored payment intent
                                handleTerminal();
                            }}
                        >
                            Retry Terminal Payment
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsTerminalErrorModalOpen(false);
                                setStoredTerminalPaymentIntentId(null);
                                setLatestTerminalAmount(null);
                                setIsTerminalProcessing(false);
                            }}
                        >
                            Other Options
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <AlertDialog
                isOpen={isCashCheckConfirmOpen}
                leastDestructiveRef={cashCheckCancelRef}
                onClose={() => {
                    setIsCashCheckConfirmOpen(false);
                    setMethod(""); // Reset if dialog closed
                }}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            Confirm Payment Receipt
                        </AlertDialogHeader>

                        <AlertDialogBody>
                            Have you received the <strong>cash</strong> or deposited the <strong>check</strong> from the
                            customer?
                        </AlertDialogBody>

                        <AlertDialogFooter>
                            <Button ref={cashCheckCancelRef} onClick={() => {
                                setIsCashCheckConfirmOpen(false);
                                setMethod(""); // Cancel => clear selection
                            }}>
                                No
                            </Button>
                            <Button colorScheme="green" onClick={() => {
                                setIsCashCheckConfirmOpen(false);
                                // Keep "Cash" as selected
                            }} ml={3}>
                                Yes
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>


        </>
    );
};

export default PaymentModal;
