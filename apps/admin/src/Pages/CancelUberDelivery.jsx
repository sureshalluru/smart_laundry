import { Button, Spinner, useToast } from "@chakra-ui/react";
import { useState } from "react";

const CancelUberDelivery = ({
  laundryId,
  deliveryId,
  orderId,
  pickupService,
  dropoffService,
  buttonText = "Cancel Uber Delivery",
  onClickBefore,          // () => void   (close modal immediately)
  onSuccess,              // (payload) => void  (refresh single order, etc.)
  onLoadingChange,        // (bool) => void (optional: parent can show a global loader)
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const cancelUberDelivery = async () => {
    try {
      // Close the modal right away if parent passed a handler
      onClickBefore?.();

      setIsLoading(true);
      onLoadingChange?.(true);

      const res = await fetch(
        `${process.env.REACT_APP_AWS_API_URL}/api/uber/cancel-uber-delivery?operation=cancel-delivery&laundryId=${encodeURIComponent(
          laundryId
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            delivery_id: deliveryId,
            order_id: orderId,
            pickupService,
            dropoffService,
          }),
        }
      );

      // API GW/Lambda envelope: {statusCode, body}
      const data = await res.json().catch(() => ({}));
      const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;

      if (!res.ok) {
        const errMsg = parsed?.error || parsed?.message || `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      const uberResult = parsed?.result?.uberResult;
      const id = uberResult?.id ?? deliveryId;
      const status = uberResult?.status ?? "canceled";
      const feeCents = uberResult?.fee;
      const tracking = uberResult?.tracking_url;

      toast({
        title: "Uber delivery canceled",
        description:
          `Delivery ${id} → ${status}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      onSuccess?.(parsed); // let parent refresh order, etc.
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "There was an error canceling the Uber delivery.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  };

  return (
    <Button
      mt={3}
      size="sm"
      colorScheme="red"
      isLoading={isLoading}
      loadingText="Canceling"
      onClick={cancelUberDelivery}
      rightIcon={isLoading ? <Spinner size="xs" /> : null}
    >
      {buttonText}
    </Button>
  );
};

export default CancelUberDelivery;

// import { Button, Spinner, useToast } from "@chakra-ui/react";
// import { useState } from "react";

// const CancelUberDelivery = ({ laundryId, deliveryId, orderId, pickupService, dropoffService }) => {
//     const [isLoading, setIsLoading] = useState(false);
//     const toast = useToast();

//     const cancelUberDelivery = async () => {
//         console.log("call uber cancel");
//         console.log("laundryId", laundryId);
//         console.log("deliveryId", deliveryId);
//         setIsLoading(true);
//         try {
//             const res = await fetch(`${process.env.REACT_APP_AWS_API_URL}/api/uber/cancel-uber-delivery?operation=cancel-delivery&laundryId=${laundryId}`, {
//                 method: 'POST',
//                 headers: {
//                     'Content-Type': 'application/json',
//                 },
//                 body: JSON.stringify({
//                     delivery_id: deliveryId,
//                     order_id: orderId,
//                     pickupService: pickupService,
//                     dropoffService: dropoffService
//                 }),
//             });

//             // Lambda behind API Gateway often returns an envelope:
//             // { statusCode: 200, body: "<json string>" }
//             const data = await res.json().catch(() => ({}));
//             const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;

//             if (!res.ok) {
//                 // Try to surface server-provided error
//                 const errMsg = parsed?.error || parsed?.message || `HTTP ${res.status}`;
//                 throw new Error(errMsg);
//             }

//             // parsed -> { message, result: { uberResult, orderUpdate?, frequencyUpdate? } }
//             const uberResult = parsed?.result?.uberResult;
//             const id = uberResult?.id ?? deliveryId;
//             const status = uberResult?.status ?? "canceled";
//             const feeCents = uberResult?.fee;
//             const tracking = uberResult?.tracking_url;

//             toast({
//                 title: "Uber delivery canceled",
//                 description:
//                 `Delivery ${id} → ${status}` +
//                 (typeof feeCents === "number" ? ` • Fee: ${feeCents}¢` : "") +
//                 (tracking ? ` • Track: ${tracking}` : ""),
//                 status: "success",
//                 duration: 5000,
//                 isClosable: true,
//             });

//         } catch (error) {
//             console.error(error);
//             toast({
//                 title: "Error",
//                 description: "There was an error canceling the Uber delivery.",
//                 status: "error",
//                 duration: 3000,
//                 isClosable: true,
//             });
//         } finally {
//             setIsLoading(false);
//         }
//     };

//     return (
//         <Button
//             mt={3}
//             size="sm"
//             colorScheme="red"
//             isLoading={isLoading}
//             loadingText="Canceling"
//             onClick={cancelUberDelivery}
//             rightIcon={isLoading ? <Spinner size="xs" /> : null}
//         >
//             Cancel Uber Delivery
//         </Button>
//     );
// };

// export default CancelUberDelivery;
