import React, {useContext, useEffect, useState} from "react";
import {
    Stack,
    FormControl,
    FormLabel,
    Button,
    useToast,
    HStack,
    Text,
    Heading
} from "@chakra-ui/react";
import {LaundryContext} from "../Contexts/LaundryContext";

export default function OTPValidationPage({phoneNumber, onOTPSubmit, isOTPLoading, customerFirstName,otpTimer,setOtpTimer}) {
    const [otp, setOtp] = useState("");
    const toast = useToast(); // Use Chakra toast for error notifications
    const { laundryData } = useContext(LaundryContext);

    useEffect(() => {
        let timer;
        if (otpTimer > 0) {
            timer = setInterval(() => {
                setOtpTimer((prev) => prev - 1);
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [otpTimer,setOtpTimer]);

    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
    };

    // Make handleSubmit an async function
    const handleOTPSubmit = async () => {
        if (otp.length === 6) {
            onOTPSubmit(otp);
        } else {
            toast({
                title: 'Incorrect OTP',
                description: "Please enter a valid 6-digit OTP verification code",
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        }
    };
    useEffect(() => {
        if (!isOTPLoading) {
            setOtp('');
        }
    }, [isOTPLoading]);

    return (
        <Stack pl={7} pr={7} spacing={3}>
            <Heading  size={['md','lg']} color="blue.600" mb={4}>
                {laundryData?.laundryName}
            </Heading>
            {customerFirstName && (
                <Text fontSize={['md','lg']} fontWeight="bold">
                    Welcome {customerFirstName}!
                </Text>
            )}
            <FormControl id="otp">
                <FormLabel fontSize={['sm','lg']}>OTP Sent Successfully to {phoneNumber}</FormLabel>

                <HStack>
                    <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="one-time-code"
                        style={{
                            width: '100%',
                            fontSize: '1.5em',
                            padding: '0.5em',
                            letterSpacing: '0.5em',
                            textAlign: 'center',
                        }}
                        value={otp}
                        onChange={(e) => {
                            // Replace any non-digit characters with an empty string.
                            const numericValue = e.target.value.replace(/\D/g, '');
                            setOtp(numericValue);
                        }}
                        placeholder="------"
                        maxLength={6}
                    />
                </HStack>
            </FormControl>
            <Text fontSize={['md', 'lg']}>Time remaining: {formatTime(otpTimer)}</Text>
            <Button onClick={handleOTPSubmit}
                    isLoading={isOTPLoading}
                    loadingText='Verifying OTP'
                    fontSize={['md', 'lg']}
                    colorScheme='teal'>
                Validate OTP
            </Button>
        </Stack>
    );
}
