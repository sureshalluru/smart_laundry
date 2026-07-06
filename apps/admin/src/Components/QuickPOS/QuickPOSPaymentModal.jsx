import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, VStack, Box, Text, Input, HStack, Flex, Divider, Spinner,
  AlertDialog, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader,
  AlertDialogBody, AlertDialogFooter, useToast
} from "@chakra-ui/react";
import { Elements, useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import axios from "axios";
import { roundToTwo } from "../../utils/decimalUtils";
import { useAdminSession } from "../../hooks/useAdminSession";

/**
 * Compute tip based on selection method, custom value, and subtotal.
 * Exported for testability.
 */
export const computeTip = (tipSelectionMethod, customTipValue, subtotal) => {
  if (tipSelectionMethod === "noTip") {
    return { tipAmount: 0, tipType: "noTip", tipPercentage: 0 };
  }
  if (["5", "10", "15"].includes(tipSelectionMethod)) {
    const pct = Number(tipSelectionMethod);
    return {
      tipAmount: roundToTwo(subtotal * (pct / 100)),
      tipType: "percentage",
      tipPercentage: pct,
    };
  }
  if (tipSelectionMethod === "custom") {
    return {
      tipAmount: parseFloat(customTipValue) || 0,
      tipType: "custom",
      tipPercentage: 0,
    };
  }
  return { tipAmount: 0, tipType: "noTip", tipPercentage: 0 };
};

/**
 * Determine the initial tip selection method from the parent's initialTip prop.
 */
const getInitialTipMethod = (initialTip) => {
  if (!initialTip) return "noTip";
  const { tipOption, tipType, tipPercentage, tipAmount } = initialTip;

  // If parent explicitly set a tipOption, use it
  if (tipOption === "noTip" || tipType === "noTip") return "noTip";
  if (tipOption === "custom" || tipType === "custom") return "custom";
  if (["5", "10", "15"].includes(tipOption)) return tipOption;
  if (tipType === "percentage" && [5, 10, 15].includes(tipPercentage)) {
    return String(tipPercentage);
  }

  // Fallback: if there's a tip amount but no recognized type, treat as custom
  if (parseFloat(tipAmount) > 0) return "custom";

  return "noTip";
};

export default function QuickPOSPaymentModal({
  isOpen,
  onClose,
  onPaymentSuccess,
  cart = [],
  subtotal = 0,
  bags = 1,
  customerPhone = "",
  customerName = "",
  customerId = "",
  isCommercial = false,
  initialTip = null,
  needBy = "asap",
  laundryId = "",
  stripeTerminalExists = false,
  stripePublicKey = "",
}) {
  // Tip state — initialized from parent's current tip selection
  const [tipSelectionMethod, setTipSelectionMethod] = useState(() =>
    getInitialTipMethod(initialTip)
  );
  const [customTipValue, setCustomTipValue] = useState(() => {
    if (initialTip && (initialTip.tipOption === "custom" || initialTip.tipType === "custom")) {
      return initialTip.customTip || String(initialTip.tipAmount || "");
    }
    return "";
  });

  // Resync tip state from parent whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setTipSelectionMethod(getInitialTipMethod(initialTip));
      if (initialTip && (initialTip.tipOption === "custom" || initialTip.tipType === "custom")) {
        setCustomTipValue(initialTip.customTip || String(initialTip.tipAmount || ""));
      } else {
        setCustomTipValue("");
      }
      setMethod("");
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Payment method state
  const [method, setMethod] = useState("");

  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTerminalProcessing, setIsTerminalProcessing] = useState(false);

  // Terminal payment state
  const [terminalStatusMsg, setTerminalStatusMsg] = useState("");
  const [storedTerminalPaymentIntentId, setStoredTerminalPaymentIntentId] = useState(null);
  const [isTerminalError, setIsTerminalError] = useState(false);

  // Cash confirmation dialog state
  const [isCashConfirmOpen, setIsCashConfirmOpen] = useState(false);
  const cashConfirmCancelRef = useRef(null);

  const customTipInputRef = useRef(null);
  const toast = useToast();
  const stripe = useStripe();
  const elements = useElements();
  const { getEmpId } = useAdminSession();
  const authToken = localStorage.getItem("idToken");

  // Focus custom tip input when custom is selected
  useEffect(() => {
    if (tipSelectionMethod === "custom" && customTipInputRef.current) {
      customTipInputRef.current.focus();
    }
  }, [tipSelectionMethod]);

  // Compute current tip values reactively
  const { tipAmount: currentTip, tipType: currentTipType, tipPercentage: currentPct } =
    computeTip(tipSelectionMethod, customTipValue, subtotal);

  // Grand total = subtotal + tip
  const grandTotal = roundToTwo(subtotal + currentTip);

  // Tip percentage options with computed amounts
  const tipOptions = [5, 10, 15].map((pct) => {
    const amount = roundToTwo((subtotal * pct) / 100);
    return { value: String(pct), label: `${pct}%`, amount };
  });

  // Payment method options
  const stripeReady = !!stripe && !!elements;
  const paymentMethods = [
    { key: "Cash", label: "💵 Cash", color: "green", disabled: false },
    { key: "Card", label: "💳 Card", color: "blue", disabled: !stripeReady },
    ...(stripeTerminalExists
      ? [{ key: "Terminal", label: "📱 Terminal", color: "teal", disabled: false }]
      : []),
    { key: "PayLater", label: "🕐 Pay Later", color: "orange", disabled: false },
  ];

  /**
   * Build the inStorePlaceOrder payload for order submission.
   */
  const buildOrderPayload = ({ isCash, isPayNow, isTerminalPayment, cardPaymentMethodId }) => {
    const empId = getEmpId() || localStorage.getItem("empId") || "";
    const tipMethod = isCash ? "Cash" : "Card";

    return {
      operation: "inStorePlaceOrder",
      customerId: customerId || "",
      laundryId: laundryId,
      address: "",
      doorNumber: "",
      addressInstructions: "",
      specialInstructions: "",
      saveSpecialInstructions: false,
      services: cart.map((item) => ({
        service: item.serviceName,
        weightOrCount: item.isWeight ? (parseFloat(item.inputWeight) || 0) : item.quantity,
        servicePrice: item.price,
      })),
      pickupDate: new Date().toISOString().split("T")[0],
      pickupTimeInterval: "",
      dropoffDate: needBy === "asap"
        ? new Date(Date.now() + 86400000).toISOString().split("T")[0]
        : needBy,
      dropoffTimeInterval: "",
      coupon: "",
      subTotal: roundToTwo(subtotal),
      totalCost: roundToTwo(subtotal),
      grandTotal: grandTotal,
      tip: {
        tipType: currentTipType,
        tipPercentage: currentPct,
        tipAmount: currentTip,
        tipMethod: tipMethod,
        tipReceiverId: empId,
      },
      discountedPrice: 0,
      isPayNow: isPayNow,
      isCash: isCash,
      laundryBags: bags,
      cardPaymentMethodId: cardPaymentMethodId,
      isTerminalPayment: isTerminalPayment,
      customerPhone: customerPhone.startsWith("+1") ? customerPhone : `+1${customerPhone}`,
      orderType: isCommercial ? "Commercial" : "InStore",
      payByInvoice: isCommercial,
    };
  };

  /**
   * Submit the order to the instore-place-order API.
   */
  const submitOrder = async (payloadOverrides) => {
    setIsProcessing(true);
    try {
      const payload = buildOrderPayload(payloadOverrides);
      const res = await axios.post(
        `${process.env.REACT_APP_AWS_API_URL}/api/admin/instore-place-order`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "X-Amz-Date": laundryId,
          },
        }
      );
      const orderId = res.data?.orderId || res.data?.body?.orderId || "Created";
      onPaymentSuccess(orderId);
    } catch (err) {
      toast({
        title: "Order failed",
        description:
          err.response?.data?.message ||
          err.response?.data?.body?.message ||
          err.message,
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Complete Payment handler — routes to the correct payment flow
  const handleCompletePayment = async () => {
    if (method === "Cash") {
      setIsCashConfirmOpen(true);
      return;
    }
    if (method === "PayLater") {
      submitOrder({
        isCash: false,
        isPayNow: false,
        isTerminalPayment: false,
        cardPaymentMethodId: "",
      });
      return;
    }
    if (method === "Card") {
      if (!stripe || !elements) return;
      setIsProcessing(true);
      try {
        const { paymentMethod, error } = await stripe.createPaymentMethod({
          type: "card",
          card: elements.getElement(CardElement),
        });
        if (error) {
          toast({
            title: "Card Error",
            description: error.message,
            status: "error",
            duration: 4000,
            isClosable: true,
          });
          setIsProcessing(false);
          return;
        }
        await submitOrder({
          isCash: false,
          isPayNow: true,
          isTerminalPayment: false,
          cardPaymentMethodId: paymentMethod.id,
        });
      } catch (err) {
        toast({
          title: "Card Error",
          description: err.message,
          status: "error",
          duration: 4000,
          isClosable: true,
        });
        setIsProcessing(false);
      }
      return;
    }
    if (method === "Terminal") {
      handleTerminalPayment();
      return;
    }
  };

  /**
   * Initiate terminal payment and start polling.
   */
  const handleTerminalPayment = async () => {
    setIsTerminalProcessing(true);
    setTerminalStatusMsg("Initiating terminal payment...");
    setIsTerminalError(false);

    try {
      const payload = {
        orderPaymentOperation: "initiateImmediateTerminalPayment",
        amount: grandTotal,
        laundryId: laundryId,
      };
      if (storedTerminalPaymentIntentId) {
        payload.terminalPaymentIntentId = storedTerminalPaymentIntentId;
      }

      const res = await axios.post(
        `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-direct-payment`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "X-Amz-Date": laundryId,
          },
        }
      );

      if (res.data.status !== "success") {
        setTerminalStatusMsg("");
        setIsTerminalProcessing(false);
        setIsTerminalError(true);
        return;
      }

      const { paymentIntentId } = res.data;
      setStoredTerminalPaymentIntentId(paymentIntentId);
      setTerminalStatusMsg("Waiting for customer payment...");
      pollTerminalStatus(paymentIntentId);
    } catch (err) {
      setTerminalStatusMsg("");
      setIsTerminalProcessing(false);
      setIsTerminalError(true);
    }
  };

  /**
   * Poll terminal payment status every 4 seconds with a 60-second timeout.
   */
  const pollTerminalStatus = (paymentIntentId) => {
    const pollStartTime = Date.now();
    const timeoutDuration = 60000;

    const interval = setInterval(async () => {
      if (Date.now() - pollStartTime >= timeoutDuration) {
        clearInterval(interval);
        // Do a final check
        try {
          const { data } = await axios.get(
            `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-direct-payment-status`,
            {
              params: {
                operation: "checkImmediateTerminalPaymentStatus",
                laundryId: laundryId,
                terminalPaymentIntentId: paymentIntentId,
                lastRun: true,
              },
              headers: { Authorization: `Bearer ${authToken}` },
            }
          );
          if (data.status === "success") {
            setTerminalStatusMsg("Payment successful. Submitting order...");
            await submitOrder({
              isCash: false,
              isPayNow: true,
              isTerminalPayment: true,
              cardPaymentMethodId: "",
            });
            setIsTerminalProcessing(false);
            setTerminalStatusMsg("");
          } else {
            if (data.reInitiate) {
              setStoredTerminalPaymentIntentId(null);
            }
            setTerminalStatusMsg("");
            setIsTerminalProcessing(false);
            setIsTerminalError(true);
          }
        } catch (_) {
          setStoredTerminalPaymentIntentId(null);
          setTerminalStatusMsg("");
          setIsTerminalProcessing(false);
          setIsTerminalError(true);
        }
        return;
      }

      try {
        const { data } = await axios.get(
          `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-direct-payment-status`,
          {
            params: {
              operation: "checkImmediateTerminalPaymentStatus",
              laundryId: laundryId,
              terminalPaymentIntentId: paymentIntentId,
              lastRun: false,
            },
            headers: { Authorization: `Bearer ${authToken}` },
          }
        );

        if (data.status === "success") {
          clearInterval(interval);
          setTerminalStatusMsg("Payment successful. Submitting order...");
          await submitOrder({
            isCash: false,
            isPayNow: true,
            isTerminalPayment: true,
            cardPaymentMethodId: "",
          });
          setIsTerminalProcessing(false);
          setTerminalStatusMsg("");
        } else if (["error", "cancelled"].includes(data.status)) {
          clearInterval(interval);
          if (data.reInitiate) {
            setStoredTerminalPaymentIntentId(null);
          }
          setTerminalStatusMsg("");
          setIsTerminalProcessing(false);
          setIsTerminalError(true);
        } else if (data.status === "pending") {
          setTerminalStatusMsg(
            data.payment_status ? `Status: ${data.payment_status}` : "Waiting for customer payment..."
          );
        }
      } catch (_) {
        clearInterval(interval);
        setStoredTerminalPaymentIntentId(null);
        setTerminalStatusMsg("");
        setIsTerminalProcessing(false);
        setIsTerminalError(true);
      }
    }, 4000);
  };

  /**
   * Retry terminal payment — re-initiates with stored intent ID.
   */
  const handleTerminalRetry = () => {
    setIsTerminalError(false);
    handleTerminalPayment();
  };

  /**
   * Handle "Other Options" from terminal error — reset method so user can pick again.
   */
  const handleTerminalOtherOptions = () => {
    setIsTerminalError(false);
    setStoredTerminalPaymentIntentId(null);
    setIsTerminalProcessing(false);
    setMethod("");
  };

  /**
   * Cash confirmation callback — submit the order as cash paid.
   */
  const handleCashConfirm = () => {
    setIsCashConfirmOpen(false);
    submitOrder({
      isCash: true,
      isPayNow: true,
      isTerminalPayment: false,
      cardPaymentMethodId: "",
    });
  };

  const isPaymentDisabled = !method || isProcessing || isTerminalProcessing;

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      closeOnOverlayClick={!(isProcessing || isTerminalProcessing)}
    >
      <ModalOverlay />
      <ModalContent
        mx={{ base: 2, sm: 4 }}
        my={{ base: 8, md: 12 }}
        width={{ base: "95vw", md: "500px" }}
        maxH="calc(100vh - 64px)"
        overflowY="auto"
        borderRadius="lg"
      >
        <ModalHeader px={4} pt={4} pb={2}>
          <Text fontSize="lg" fontWeight="bold">
            💳 Payment
          </Text>
        </ModalHeader>

        <ModalBody px={4} pb={4}>
          <VStack align="stretch" spacing={4}>
            {/* Order Summary Section */}
            <Box borderWidth="1px" borderRadius="md" p={3} bg="gray.50">
              <Text fontWeight="semibold" mb={2} fontSize="sm">
                Order Summary
              </Text>
              <VStack align="stretch" spacing={1}>
                <HStack justify="space-between">
                  <Text fontSize="sm">Subtotal:</Text>
                  <Text fontSize="sm" fontWeight="medium">
                    ${roundToTwo(subtotal).toFixed(2)}
                  </Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="sm">Tip:</Text>
                  <Text fontSize="sm" fontWeight="medium">
                    ${roundToTwo(currentTip).toFixed(2)}
                  </Text>
                </HStack>
                <Divider my={1} />
                <HStack justify="space-between">
                  <Text fontSize="md" fontWeight="bold">
                    Grand Total:
                  </Text>
                  <Text fontSize="md" fontWeight="bold" color="green.600">
                    ${grandTotal.toFixed(2)}
                  </Text>
                </HStack>
              </VStack>
            </Box>

            {/* Tip Selection Section */}
            <Box borderWidth="1px" borderRadius="md" p={3} bg="gray.50">
              <Text fontWeight="semibold" mb={2} fontSize="sm">
                Tip
              </Text>
              <Flex gap={2} wrap="wrap">
                {tipOptions.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={tipSelectionMethod === option.value ? "solid" : "outline"}
                    colorScheme={tipSelectionMethod === option.value ? "blue" : "gray"}
                    onClick={() => setTipSelectionMethod(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={tipSelectionMethod === "custom" ? "solid" : "outline"}
                  colorScheme={tipSelectionMethod === "custom" ? "orange" : "gray"}
                  onClick={() => setTipSelectionMethod("custom")}
                >
                  Custom
                </Button>
                <Button
                  size="sm"
                  variant={tipSelectionMethod === "noTip" ? "solid" : "outline"}
                  colorScheme={tipSelectionMethod === "noTip" ? "gray" : "gray"}
                  onClick={() => setTipSelectionMethod("noTip")}
                >
                  No Tip
                </Button>
              </Flex>

              {/* Custom Tip Input */}
              {tipSelectionMethod === "custom" && (
                <Input
                  ref={customTipInputRef}
                  mt={2}
                  placeholder="Enter tip amount"
                  value={customTipValue}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    setCustomTipValue(val);
                  }}
                  size="sm"
                  maxW="200px"
                  type="text"
                />
              )}
            </Box>

            {/* Payment Method Selection */}
            <Box borderWidth="1px" borderRadius="md" p={3} bg="gray.50">
              <Text fontWeight="semibold" mb={2} fontSize="sm">
                Payment Method
              </Text>
              <Flex gap={2} wrap="wrap">
                {paymentMethods.map((pm) => (
                  <Button
                    key={pm.key}
                    size="sm"
                    variant={method === pm.key ? "solid" : "outline"}
                    colorScheme={method === pm.key ? pm.color : "gray"}
                    onClick={() => setMethod(pm.key)}
                    isDisabled={pm.disabled}
                  >
                    {pm.label}
                  </Button>
                ))}
              </Flex>
              {!stripeReady && (
                <Text fontSize="xs" color="red.500" mt={1}>
                  Card payments unavailable
                </Text>
              )}

              {/* Stripe CardElement — shown when Card is selected */}
              {method === "Card" && stripeReady && (
                <Box mt={3} border="1px solid" borderColor="gray.300" p={3} borderRadius="md" bg="white">
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
              )}
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter px={4} pt={0} pb={4}>
          <HStack spacing={3} w="100%" justify="flex-end">
            <Button
              variant="outline"
              size="md"
              onClick={onClose}
              isDisabled={isProcessing || isTerminalProcessing}
            >
              Cancel
            </Button>
            <Button
              colorScheme="green"
              size="md"
              onClick={handleCompletePayment}
              isLoading={isProcessing || isTerminalProcessing}
              isDisabled={isPaymentDisabled}
            >
              Complete Payment
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>

    {/* Cash Confirmation AlertDialog */}
    <AlertDialog
      isOpen={isCashConfirmOpen}
      leastDestructiveRef={cashConfirmCancelRef}
      onClose={() => setIsCashConfirmOpen(false)}
    >
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            Confirm Cash Payment
          </AlertDialogHeader>
          <AlertDialogBody>
            Has cash been collected?
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={cashConfirmCancelRef} onClick={() => setIsCashConfirmOpen(false)}>
              No
            </Button>
            <Button colorScheme="green" onClick={handleCashConfirm} ml={3}>
              Yes, Collected
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>

    {/* Terminal Status Modal — shown while polling */}
    {isTerminalProcessing && terminalStatusMsg && (
      <Modal isOpen={true} onClose={() => {}} closeOnOverlayClick={false} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Terminal Payment</ModalHeader>
          <ModalBody>
            <HStack spacing={3}>
              <Spinner size="sm" color="teal.500" />
              <Text>{terminalStatusMsg}</Text>
            </HStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="teal" isDisabled>
              Processing...
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    )}

    {/* Terminal Error Modal — shown on error/timeout */}
    {isTerminalError && (
      <Modal isOpen={true} onClose={() => setIsTerminalError(false)} closeOnOverlayClick={false} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Terminal Payment Error</ModalHeader>
          <ModalBody>
            <Text>
              There was an error processing the terminal payment. Would you like to retry or choose another payment method?
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="green" mr={3} onClick={handleTerminalRetry}>
              Retry
            </Button>
            <Button variant="ghost" onClick={handleTerminalOtherOptions}>
              Other Options
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    )}
    </>
  );
}


/**
 * Wrapper component that provides the Stripe Elements context.
 * Use this wrapper when rendering QuickPOSPaymentModal to enable Card payments.
 */
export function QuickPOSPaymentModalWrapper(props) {
  const stripePromise = useMemo(
    () => (props.stripePublicKey ? loadStripe(props.stripePublicKey) : null),
    [props.stripePublicKey]
  );

  return (
    <Elements stripe={stripePromise}>
      <QuickPOSPaymentModal {...props} />
    </Elements>
  );
}
