// components/InvoiceModal.jsx
import {React, useRef, useEffect, useState} from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, Button, Text, Textarea, useToast, Checkbox, Stack
} from '@chakra-ui/react';
import axios from 'axios';
import { emailInvoiceToCustomer } from './emailInvoice'; 

const InvoiceModal = ({
  isOpen,
  onClose,
  order,
  paymentInstructions,
  setPaymentInstructions,
  laundryId,
  onPrintInvoice,
  sendEmail,
  setSendEmail,
  invoiceRef,
  empId
}) => {
  const toast = useToast();
  const authToken = localStorage.getItem('idToken');

  const typingTimeout = useRef(null);
  const [localInstructions, setLocalInstructions] = useState(paymentInstructions);
  const [saveInstructions, setSaveInstructions] = useState(false);


  useEffect(() => {
    if (isOpen) {
      setLocalInstructions(paymentInstructions || "");
    }
  }, [isOpen, paymentInstructions]);
  
  const savePaymentInstructions = async () => {
    console.log("empId in invoice modal: ", empId);
    try {
      const response = await axios.put(
        `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-order`,
        {
          servicesToAdd: [],
          servicesToUpdate: [],
          servicesToRemove: [],
          productsToAdd: [],
          productsToUpdate: [],
          productsToRemove: [],
          coupon: null,
          laundryBags: [],
          orderStatus: order.orderStatus,
          paymentInstructions: localInstructions, // Include this in payload
        },
        {
          params: {
            operation: "updateOrder",
            orderId: order.orderId,
            laundryId,
            empId: empId, // Add if required
          },
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );
  
      if (response.data?.statusCode === 200) {
        toast({
          title: "Instructions Saved",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      } else {
        throw new Error(response?.data?.body?.message || "Unknown error");
      }
    } catch (err) {
      toast({
        title: "Failed to save instructions",
        description: err.message,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };
  

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Edit Payment Instructions</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text mb={2}>Do you want to edit payment instructions before printing the invoice?</Text>
          
          <Textarea
  value={localInstructions}
  onChange={(e) => setLocalInstructions(e.target.value)}
  placeholder="Enter payment instructions..."
  size="sm"
  minH="120px"
/>

          <Checkbox
            mt={4}
            isChecked={saveInstructions}
            onChange={(e) => setSaveInstructions(e.target.checked)}
          >
            Save Instructions
          </Checkbox>
        </ModalBody>
        <ModalFooter display="flex" justifyContent="center">
  <Stack
    direction="row"
    spacing={2}
    width="100%"
    justify="center"
    flexWrap="wrap"
  >
    <Button
      size="sm"
      flex="1 1 auto"
      maxW="32%"
      colorScheme="blue"
      onClick={async () => {
        if (saveInstructions) {
          await savePaymentInstructions(); // ✅ Now valid
        }
      
        setPaymentInstructions(localInstructions);
        onPrintInvoice({ ...order, paymentInstructions: localInstructions });
        onClose();
      }}
      
    >
      🖨️ Print
    </Button>

    <Button
      size="sm"
      flex="1 1 auto"
      maxW="32%"
      colorScheme="green"
      onClick={async () => {
        setPaymentInstructions(localInstructions);
        if (saveInstructions) {
          await savePaymentInstructions(); // Save if checkbox is checked
        }
        await emailInvoiceToCustomer({ order: { ...order, paymentInstructions: localInstructions  }, invoiceRef, laundryId });
        onClose();
      }}
    >
      📧 Email
    </Button>

    <Button
      size="sm"
      flex="1 1 auto"
      maxW="32%"
      colorScheme="purple"
      onClick={async () => {
        setPaymentInstructions(localInstructions);
        if (saveInstructions) {
          await savePaymentInstructions(); // Save if checkbox is checked
        }
        await emailInvoiceToCustomer({ order: { ...order, paymentInstructions: localInstructions  }, invoiceRef, laundryId });
        onPrintInvoice({ ...order, paymentInstructions: localInstructions });
        onClose();
      }}
    >
      🖨️📧 Both
    </Button>
  </Stack>
</ModalFooter>


      </ModalContent>
    </Modal>
  );
};

export default InvoiceModal;
