import React, { useState } from "react";
import {
    Box, VStack, FormControl, FormLabel, Input, Button,
    Switch, useToast, Text, Icon, Flex, HStack
} from "@chakra-ui/react";
import { FiUserPlus } from "react-icons/fi";

export default function SignupPage({ onSubmit, phoneNumber, isSignUpLoading }) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [receivePhoneNotification, setReceivePhoneNotification] = useState(true);
    const toast = useToast();

    const handleSubmit = () => {
        if (firstName && lastName && email) {
            onSubmit(phoneNumber, firstName, lastName, email, receivePhoneNotification);
        } else {
            toast({
                title: "Missing Information",
                description: "Please fill in all fields.",
                status: "error",
                duration: 4000,
                isClosable: true,
            });
        }
    };

    return (
        <Box w="100%" maxW="400px" mx="auto" px={6} py={6}>
            <VStack spacing={5} align="stretch">
                {/* Header */}
                <VStack spacing={2} mb={2}>
                    <Flex
                        w="64px" h="64px" borderRadius="full"
                        bg="blue.50" align="center" justify="center"
                    >
                        <Icon as={FiUserPlus} boxSize={6} color="blue.500" />
                    </Flex>
                    <Text fontSize="xl" fontWeight="700" color="gray.800">
                        Create your account
                    </Text>
                    <Text fontSize="sm" color="gray.500" textAlign="center">
                        Quick signup to start scheduling your laundry
                    </Text>
                </VStack>

                {/* Form */}
                <HStack spacing={3}>
                    <FormControl>
                        <FormLabel fontSize="sm" color="gray.600" mb={1}>First Name</FormLabel>
                        <Input
                            size="lg" placeholder="John"
                            value={firstName} onChange={(e) => setFirstName(e.target.value)}
                            bg="white" border="1px solid" borderColor="gray.200"
                            _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px #63b3ed" }}
                        />
                    </FormControl>
                    <FormControl>
                        <FormLabel fontSize="sm" color="gray.600" mb={1}>Last Name</FormLabel>
                        <Input
                            size="lg" placeholder="Doe"
                            value={lastName} onChange={(e) => setLastName(e.target.value)}
                            bg="white" border="1px solid" borderColor="gray.200"
                            _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px #63b3ed" }}
                        />
                    </FormControl>
                </HStack>

                <FormControl>
                    <FormLabel fontSize="sm" color="gray.600" mb={1}>Email</FormLabel>
                    <Input
                        size="lg" type="email" placeholder="john@example.com"
                        value={email} onChange={(e) => setEmail(e.target.value)}
                        bg="white" border="1px solid" borderColor="gray.200"
                        _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px #63b3ed" }}
                    />
                </FormControl>

                <FormControl>
                    <FormLabel fontSize="sm" color="gray.600" mb={1}>Phone</FormLabel>
                    <Input size="lg" value={phoneNumber} isReadOnly bg="gray.50" color="gray.600" />
                </FormControl>

                {/* Notification Toggle */}
                <HStack justify="space-between" py={2} px={1}>
                    <Text fontSize="sm" color="gray.600">Get SMS order updates</Text>
                    <Switch
                        isChecked={receivePhoneNotification}
                        onChange={(e) => setReceivePhoneNotification(e.target.checked)}
                        colorScheme="blue"
                        size="md"
                    />
                </HStack>

                {/* Register Button */}
                <Button
                    onClick={handleSubmit}
                    isLoading={isSignUpLoading}
                    loadingText="Creating account..."
                    bg="linear-gradient(135deg, #4299E1 0%, #63B3ED 100%)"
                    color="white"
                    size="lg"
                    w="full"
                    borderRadius="xl"
                    fontWeight="600"
                    _hover={{ transform: "translateY(-1px)", boxShadow: "lg" }}
                    _active={{ transform: "translateY(0)" }}
                    transition="all 0.2s"
                >
                    Create Account
                </Button>
            </VStack>
        </Box>
    );
}
