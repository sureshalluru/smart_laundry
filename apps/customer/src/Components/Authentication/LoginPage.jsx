import React, { useContext, useState } from "react";
import {
    Box, VStack, FormControl, Input, Button, InputLeftAddon,
    InputGroup, useToast, Text, Icon, Flex
} from "@chakra-ui/react";
import { LaundryContext } from "../Contexts/LaundryContext";
import { FiPhone } from "react-icons/fi";

export default function LoginPage({ onLoginSubmit, isLoginLoading, initialPhoneNumber = "" }) {
    const strippedPhoneNumber = initialPhoneNumber.slice(-10);
    const [phoneNumber, setPhoneNumber] = useState(strippedPhoneNumber);
    const { laundryData } = useContext(LaundryContext);
    const toast = useToast();

    const handleLoginSubmit = () => {
        const digitsOnly = phoneNumber.replace(/\D/g, '');
        if (digitsOnly.length !== 10) {
            toast({
                title: "Invalid phone number",
                description: "Please enter a 10-digit US phone number.",
                status: "error",
                duration: 4000,
                isClosable: true,
            });
            return;
        }
        onLoginSubmit(`+1${digitsOnly}`);
    };

    return (
        <Box w="100%" maxW="400px" mx="auto" px={6} py={8}>
            <VStack spacing={6} align="stretch">
                {/* Logo / Brand */}
                <VStack spacing={2} mb={4}>
                    <Flex
                        w="64px" h="64px" borderRadius="full"
                        bg="blue.50" align="center" justify="center"
                    >
                        <Icon as={FiPhone} boxSize={6} color="blue.500" />
                    </Flex>
                    <Text fontSize="2xl" fontWeight="700" color="gray.800" textAlign="center">
                        {laundryData?.laundryName || "Smart Laundry"}
                    </Text>
                    <Text fontSize="sm" color="gray.500" textAlign="center">
                        Enter your phone number to get started
                    </Text>
                </VStack>

                {/* Phone Input */}
                <FormControl>
                    <InputGroup size="lg">
                        <InputLeftAddon
                            bg="gray.50" border="1px solid" borderColor="gray.200"
                            color="gray.600" fontWeight="500"
                        >
                            +1
                        </InputLeftAddon>
                        <Input
                            type="tel"
                            placeholder="(512) 555-0123"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            bg="white"
                            border="1px solid"
                            borderColor="gray.200"
                            _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px #63b3ed" }}
                            fontSize="lg"
                            onKeyPress={(e) => e.key === 'Enter' && handleLoginSubmit()}
                        />
                    </InputGroup>
                </FormControl>

                {/* Submit Button */}
                <Button
                    isLoading={isLoginLoading}
                    loadingText="Verifying..."
                    bg="linear-gradient(135deg, #4299E1 0%, #63B3ED 100%)"
                    color="white"
                    size="lg"
                    w="full"
                    borderRadius="xl"
                    fontWeight="600"
                    _hover={{ transform: "translateY(-1px)", boxShadow: "lg" }}
                    _active={{ transform: "translateY(0)" }}
                    transition="all 0.2s"
                    onClick={handleLoginSubmit}
                >
                    Continue
                </Button>

                <Text fontSize="xs" color="gray.400" textAlign="center" px={4}>
                    We'll send you a verification code to confirm your identity.
                </Text>
            </VStack>
        </Box>
    );
}
