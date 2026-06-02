// reusable/EmpCredentialModal.jsx
import React, { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Button,
  useDisclosure,
  useToast,
  InputGroup,
  InputLeftAddon
} from '@chakra-ui/react';

export const EmpCredentialModal = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  empPrefix
}) => {
  const [empId, setEmpId] = useState('');
  const [passcode, setPasscode] = useState('');
  const toast = useToast();

  const handleSubmit = () => {
    if (!empId || !passcode) {
      toast({
        title: 'Missing Fields',
        description: 'Please enter both Emp ID and Passcode.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
        position: 'top',
      });
      return;
    }
    onSubmit(empId, passcode);
  };

  const handleClose = () => {
    setEmpId('');
    setPasscode('');
    onClose();
  };

  
  

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered motionPreset="slideInBottom">
      <ModalOverlay />
      <ModalContent maxW={{ base: '90%', md: '400px' }}>
        <ModalHeader>Enter Employee Credentials</ModalHeader>
        <ModalBody>
          <InputGroup mb={4}>
              <InputLeftAddon>{empPrefix}</InputLeftAddon>
              <Input
                  placeholder="EmpId"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
              />
          </InputGroup>
          <Input
            placeholder="Passcode"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="blue" onClick={handleSubmit} isLoading={isLoading}>
            Submit
          </Button>
          <Button variant="ghost" onClick={handleClose} ml={3}>
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// export default EmpCredentialModal;
