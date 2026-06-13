import React, { useContext, useEffect, useState, useRef } from "react";
import {
    Box, VStack, Button, useToast, HStack, Text, Icon, Flex, Input
} from "@chakra-ui/react";
import { LaundryContext } from "../Contexts/LaundryContext";
import { FiShield } from "react-icons/fi";

export default function OTPValidationPage({ phoneNumber, onOTPSubmit, isOTPLoading, customerFirstName, otpTimer, setOtpTimer }) {
    const [otp, setOtp] = useState("");
    const toast = useToast();
    const { laundryData } = useContext(LaundryContext);

    useEffect(() => {
        let timer;
        if (otpTimer > 0) {
            timer = setInterval(() => setOtpTimer((prev) => prev - 1), 1000);
        }
        return () => clearInterval(timer);
    }, [otpTimer, setOtpTimer]);

    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
    };

    const handleOTPSubmit = () => {
        if (otp.length === 6) {
            onOTPSubmit(otp);
        } else {
            toast({
                title: "Incorrect OTP",
                description: "Please enter the 6-digit code.",
                status: "error",
                duration: 4000,
                isClosable: true,
            });
        }
    };

    // Only clear OTP after a successful verification (parent navigates away)
    // Don't clear on failure so user can retry

    return (
        <Box w="100%" maxW="400px" mx="auto" px={6} py={8}>
            <VStack spacing={6} align="stretch">
                {/* Header */}
                <VStack spacing={2} mb={2}>
                    <Flex
                        w="64px" h="64px" borderRadius="full"
                        bg="green.50" align="center" justify="center"
                    >
                        <Icon as={FiShield} boxSize={6} color="green.500" />
                    </Flex>
                    {customerFirstName && (
                        <Text fontSize="xl" fontWeight="700" color="gray.800">
                            Welcome back, {customerFirstName}!
                        </Text>
                    )}
                    <Text fontSize="sm" color="gray.500" textAlign="center">
                        We sent a 6-digit code to
                    </Text>
                    <Text fontSize="sm" fontWeight="600" color="gray.700">
                        {phoneNumber}
                    </Text>
                </VStack>

                {/* OTP Input - Simple single input */}
                <Box textAlign="center">
                    <Input
                        type="tel"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        size="lg"
                        textAlign="center"
                        fontSize="2xl"
                        fontWeight="bold"
                        letterSpacing="0.5em"
                        maxW="220px"
                        mx="auto"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        bg="white"
                        border="2px solid"
                        borderColor="gray.200"
                        _focus={{ borderColor: "blue.400" }}
                    />
                </Box>

                {/* Timer */}
                <Flex justify="center">
                    <Text fontSize="sm" color={otpTimer > 30 ? "gray.500" : "red.500"} fontWeight="500">
                        {otpTimer > 0 ? `Code expires in ${formatTime(otpTimer)}` : "Code expired. Please request a new one."}
                    </Text>
                </Flex>

                {/* Verify Button */}
                <Button
                    onClick={handleOTPSubmit}
                    isLoading={isOTPLoading}
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
                    isDisabled={otp.length < 6}
                >
                    Verify Code
                </Button>
            </VStack>
        </Box>
    );
}
