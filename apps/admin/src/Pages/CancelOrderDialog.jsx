import React, { useRef, useState, useMemo } from "react";
import axios from "axios";
import {
  AlertDialog, AlertDialogBody, AlertDialogFooter, AlertDialogHeader,
  AlertDialogContent, AlertDialogOverlay, Button, Text, Input, VStack,
  Radio, RadioGroup, FormControl, FormLabel, useToast
} from "@chakra-ui/react";

/**
 * CancelOrderDialog
 *
 * Props:
 * - isOpen: boolean
 * - onClose: () => void   // will be ignored while loading
 * - apiBaseUrl: string    // e.g., process.env.REACT_APP_AWS_API_URL
 * - authToken: string     // x-api-key value
 * - order: {
 *     orderId: string,
 *     customerId?: string,
 *     orderStatus?: string,
 *     customerAddress?: object,
 *     address?: object
 *   }
 * - laundryId: string
 *
 * - onCanceled: (payload: {
 *     orderId: string,
 *     cancelReason: string,
 *     isRecurring: 'true' | 'false'
 *   }) => void
 *   // use this to update local UI state in the parent (selected order + list)
 */
export default function CancelOrderDialog({
  isOpen,
  onClose,
  apiBaseUrl,
  authToken,
  order,
  laundryId,
  onCanceled,
}) {
  const toast = useToast();
  const cancelRef = useRef();

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelRecurring, setIsCancelRecurring] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [otherReason, setOtherReason] = useState("");

  const cancelRecurringTypes = useMemo(
    () => ["This order only", "All future orders"],
    []
  );
  const cancellationOptions = useMemo(
    () => [
      "Service no longer needed",
      "Order created by mistake",
      "Pickup/Delivery time no longer works",
      "Other",
    ],
    []
  );

  const guardedClose = () => {
    if (!isSubmitting) {
      // reset when closing
      setIsCancelRecurring("");
      setCancelReason("");
      setOtherReason("");
      onClose?.();
    }
  };

  const handleSubmit = async () => {
    // validations
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
    if (cancelReason === "Other" && !otherReason.trim()) {
      toast({
        title: "Explanation Required",
        description: "Please provide an explanation for selecting 'Other'.",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const finalReason =
        cancelReason === "Other" ? otherReason.trim() : cancelReason;

      const payload = {
        operation: "cancelOnlineOrder",
        customerId: order?.customerId || "",
        orderId: order?.orderId,
        laundryId,
        cancelReason: finalReason,
        empId: localStorage.getItem('empId') || '',
        isRecurring:
          isCancelRecurring === "This order only" || isCancelRecurring === ""
            ? "false"
            : "true",
        address: order?.customerAddress || order?.address || {},
      };
      console.log("cancel order api call", payload);
      const authToken = localStorage.getItem('idToken');
      console.log(authToken);
      const res = await axios.put(
        `${apiBaseUrl}/api/admin/cancel-order-admin`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          },
        }
      );

      const responseData = res.data;
      if (responseData.status === "success") {
        toast({
          title: "Success",
          description: responseData.message || "Order canceled successfully.",
          status: "success",
          duration: 5000,
          isClosable: true,
        });

        // notify parent to update local state
        onCanceled?.({
          orderId: order?.orderId,
          cancelReason: finalReason,
          isRecurring: payload.isRecurring,
        });

        guardedClose();
      } else {
        toast({
          title: "Error",
          description: responseData.message || "Unable to cancel the order.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error("Error canceling order:", error);
      toast({
        title: "Error",
        description:
          error?.response?.data?.message ||
          "Unable to cancel the order. Please try again later.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={guardedClose}
      isCentered
    >
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            Cancel Order
          </AlertDialogHeader>

          <AlertDialogBody>
            <Text mb={4}>
              Are you sure you want to cancel this order? This action cannot be undone.
            </Text>

            <FormControl isRequired mb={4}>
              <FormLabel>Cancel Scope</FormLabel>
              <RadioGroup
                onChange={setIsCancelRecurring}
                value={isCancelRecurring}
              >
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
              <FormLabel>Reason for cancellation</FormLabel>
              <RadioGroup onChange={setCancelReason} value={cancelReason}>
                <VStack align="start" spacing={2}>
                  {cancellationOptions.map((reason) => (
                    <Radio key={reason} value={reason}>
                      {reason}
                    </Radio>
                  ))}
                </VStack>
              </RadioGroup>

              {cancelReason === "Other" && (
                <FormControl isRequired mt={4}>
                  <FormLabel>Explain your reason</FormLabel>
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
            <Button ref={cancelRef} onClick={guardedClose} isDisabled={isSubmitting}>
              No
            </Button>
            <Button
              colorScheme="red"
              onClick={handleSubmit}
              ml={3}
              isLoading={isSubmitting}
              loadingText="Canceling..."
            >
              Yes, Cancel Order
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}
