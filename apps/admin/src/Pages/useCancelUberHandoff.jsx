import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, RadioGroup, Radio, Stack, useDisclosure, Portal, Box, Spinner
} from "@chakra-ui/react";
import { useState, useCallback } from "react";
import CancelUberDelivery from "./CancelUberDelivery";

export const useCancelUberHandoff = () => {
  const disc = useDisclosure();

  const [context, setContext] = useState({
    laundryId: "",
    orderId: "",
    deliveryId: "",
    kind: "pickup", // "pickup" | "dropoff"
  });
  const [handoff, setHandoff] = useState("LaundryDriver");

  // global overlay spinner while the request runs after the modal closes
  const [globalUberCancelLoading, setGlobalUberCancelLoading] = useState(false);

  const open = useCallback((opts) => {
    setContext(opts);           // { laundryId, orderId, deliveryId, kind }
    setHandoff("LaundryDriver");
    disc.onOpen();
  }, [disc]);

  const close = disc.onClose;

  const ModalUI = (
    <>
      {/* Modal for choosing who handles after cancellation */}
      <Modal isOpen={disc.isOpen} onClose={disc.onClose} isCentered size="sm">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            After canceling Uber {context.kind}, who handles it?
          </ModalHeader>

          <ModalBody>
            <RadioGroup value={handoff} onChange={setHandoff}>
              <Stack direction="column" spacing={2}>
                <Radio value="LaundryDriver">Laundry Driver (default)</Radio>
                <Radio value="Customer">Customer</Radio>
                {/* Future: <Radio value="ThirdParty">3rd-Party Courier</Radio> */}
              </Stack>
            </RadioGroup>
          </ModalBody>

          <ModalFooter gap={3}>
            <Button variant="ghost" onClick={close}>Close</Button>

            <CancelUberDelivery
              laundryId={context.laundryId}
              deliveryId={context.deliveryId}
              orderId={context.orderId}
              pickupService={context.kind === "pickup" ? handoff : undefined}
              dropoffService={context.kind === "dropoff" ? handoff : undefined}
              buttonText={`Cancel Uber ${context.kind === "pickup" ? "Pickup" : "Dropoff"}`}
              onClickBefore={() => {
                // close modal right away and show global spinner
                close();
                setGlobalUberCancelLoading(true);
              }}
              // Let the child tell us when its loading starts/ends (success or error)
              onLoadingChange={(isLoading) => {
                // when the request completes (isLoading === false), hide overlay
                if (!isLoading) setGlobalUberCancelLoading(false);
              }}
              onSuccess={context.onSuccess}
            />
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Full-screen overlay spinner while cancel is in-flight */}
      {globalUberCancelLoading && (
        <Portal>
          <Box
            position="fixed"
            inset="0"
            bg="blackAlpha.300"
            display="flex"
            alignItems="center"
            justifyContent="center"
            zIndex={2000} // on top of most UI
          >
            <Spinner size="xl" thickness="4px" speed="0.65s" />
          </Box>
        </Portal>
      )}
    </>
  );

  return { open, close, ModalUI };
};

// import {
//   Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
//   Button, RadioGroup, Radio, Stack, useDisclosure
// } from "@chakra-ui/react";
// import { useState, useCallback } from "react";
// import CancelUberDelivery from "./CancelUberDelivery";

// export const useCancelUberHandoff = () => {
//   const disc = useDisclosure();
//   const [context, setContext] = useState({
//     laundryId: "",
//     orderId: "",
//     deliveryId: "",
//     kind: "pickup", // "pickup" | "dropoff"
//   });
//   const [handoff, setHandoff] = useState("LaundryDriver");

//   const open = useCallback((opts) => {
//     setContext(opts);           // { laundryId, orderId, deliveryId, kind }
//     setHandoff("LaundryDriver");
//     disc.onOpen();
//   }, [disc]);

//   const close = disc.onClose;

//   const ModalUI = (
//     <Modal isOpen={disc.isOpen} onClose={disc.onClose} isCentered size="sm">
//       <ModalOverlay />
//       <ModalContent>
//         <ModalHeader>After canceling Uber {context.kind}, who handles it?</ModalHeader>
//         <ModalBody>
//           <RadioGroup value={handoff} onChange={setHandoff}>
//             <Stack direction="column" spacing={2}>
//               <Radio value="LaundryDriver">Laundry Driver (default)</Radio>
//               <Radio value="Customer">Customer</Radio>
//               {/* Future: <Radio value="ThirdParty">3rd-Party Courier</Radio> */}
//             </Stack>
//           </RadioGroup>
//         </ModalBody>
//         <ModalFooter gap={3}>
//   <Button variant="ghost" onClick={close}>Close</Button>

//   <CancelUberDelivery
//     laundryId={context.laundryId}
//     deliveryId={context.deliveryId}
//     orderId={context.orderId}
//     pickupService={context.kind === "pickup" ? handoff : undefined}
//     dropoffService={context.kind === "dropoff" ? handoff : undefined}
//     buttonText={`Cancel Uber ${context.kind === "pickup" ? "Pickup" : "Dropoff"}`}
//     onSuccess={() => {
//       // Already closed, so just show toast
//       // (CancelUberDelivery has its own success toast)
//     }}
//     onClickBefore={() => {
//       // close modal right when user presses confirm
//       close();
//     }}
//   />
// </ModalFooter>

//       </ModalContent>
//     </Modal>
//   );

//   return { open, close, ModalUI };
// };
