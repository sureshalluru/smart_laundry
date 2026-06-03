import React, { useEffect, useState } from "react";
import { Box, Flex, useToast } from "@chakra-ui/react";
import LoginPage from "../Components/Authentication/LoginPage";
import SignupPage from "../Components/Authentication/SignupPage";
import OTPValidationPage from "../Components/Authentication/OTPValidationPage";
import {
    handlePhoneNumberCheck,
    initiateSignUp,
    verifyOTP,
    initiateSignIn,
    setPendingAuth,
} from "../Services/aws/UserAuthenticationApiGateway";
import { useCustomerAuth } from "../Context/AuthContext";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

export default function AuthenticationPage() {
    const { laundryId } = useParams();
    const [currentPage, setCurrentPage] = useState("login");
    const [phoneNumber, setPhoneNumber] = useState("");
    const toast = useToast();
    const navigate = useNavigate();
    const { authStatus, onOTPVerified } = useCustomerAuth();
    const [isLoginLoading, setIsLoginLoading] = useState(false);
    const [isOTPLoading, setIsOTPLoading] = useState(false);
    const [isSignUpLoading, setIsSignUpLoading] = useState(false);
    const [customerFirstName, setCustomerFirstName] = useState("");
    const [searchParams] = useSearchParams();
    const redirectTo = searchParams.get('redirectTo') || '';
    const [otpTimer, setOtpTimer] = useState(180);

    const handleLoginSubmit = async (phone) => {
        setPhoneNumber(phone);
        setIsLoginLoading(true);
        try {
            const response = await handlePhoneNumberCheck(phone, laundryId);
            if (response.exists) {
                setCustomerFirstName(response.customerFirstName);
                setPendingAuth(phone, laundryId);
                const otpResponse = await initiateSignIn(phone);
                if (!otpResponse.isSignedIn) {
                    setCurrentPage("otpValidation");
                }
            } else {
                setCurrentPage("signup");
            }
        } catch (error) {
            toast({ title: "Error", description: "Something went wrong. Please try again.", status: "error", duration: 4000, isClosable: true });
        } finally {
            setIsLoginLoading(false);
        }
    };

    const handleOTPSubmit = async (otp) => {
        setIsOTPLoading(true);
        try {
            const result = await verifyOTP(otp);
            if (result.isSignedIn) {
                onOTPVerified(result);
                toast({ title: "Verified!", status: "success", duration: 2000, isClosable: true });
            } else if (result.nextStep?.additionalInfo) {
                const remaining = result.nextStep.additionalInfo.attemptsLeft || 0;
                if (remaining > 0) {
                    toast({ title: `Wrong code. ${remaining} tries left.`, status: "warning", duration: 3000, isClosable: true });
                } else {
                    toast({ title: "Too many attempts. Try again.", status: "error", duration: 4000, isClosable: true });
                    setCurrentPage("login");
                }
            }
        } catch (error) {
            toast({ title: "Verification failed", description: error.message, status: "error", duration: 4000, isClosable: true });
        } finally {
            setIsOTPLoading(false);
        }
    };

    const handleSignupSubmit = async (phone, firstName, lastName, email, receivePhoneNotification) => {
        setIsSignUpLoading(true);
        try {
            const { error } = await initiateSignUp(laundryId, email, phone, firstName, lastName, false, receivePhoneNotification);
            if (error) {
                if (error.includes("UsernameExistsException")) {
                    toast({ title: "Account exists", description: "Sending verification code...", status: "info", duration: 3000, isClosable: true });
                } else {
                    toast({ title: "Error", description: error, status: "error", duration: 4000, isClosable: true });
                    return;
                }
            }
            setPendingAuth(phone, laundryId);
            const otpResponse = await initiateSignIn(phone);
            if (!otpResponse.isSignedIn) {
                setPhoneNumber(phone);
                setCustomerFirstName(firstName);
                setCurrentPage("otpValidation");
            }
        } catch (error) {
            toast({ title: "Error", description: error.message, status: "error", duration: 4000, isClosable: true });
        } finally {
            setIsSignUpLoading(false);
        }
    };

    useEffect(() => {
        if (authStatus === "authenticated") {
            navigate(redirectTo || `/${laundryId}/user`);
        }
    }, [authStatus, navigate, laundryId, redirectTo]);

    useEffect(() => {
        if (currentPage === "otpValidation") setOtpTimer(180);
    }, [currentPage]);

    return (
        <Flex
            minH="100vh"
            bg="linear-gradient(180deg, #EBF8FF 0%, #BEE3F8 50%, #90CDF4 100%)"
            align="center"
            justify="center"
            p={4}
        >
            <Box
                bg="white"
                borderRadius="2xl"
                boxShadow="xl"
                w="100%"
                maxW="440px"
                overflow="hidden"
            >
                {authStatus === "configuring" && (
                    <Flex h="200px" align="center" justify="center">
                        <Box className="spinner" />
                    </Flex>
                )}
                {authStatus === "unauthenticated" && currentPage === "login" && (
                    <LoginPage onLoginSubmit={handleLoginSubmit} isLoginLoading={isLoginLoading} initialPhoneNumber={phoneNumber} />
                )}
                {authStatus === "unauthenticated" && currentPage === "signup" && (
                    <SignupPage onSubmit={handleSignupSubmit} phoneNumber={phoneNumber} isSignUpLoading={isSignUpLoading} />
                )}
                {authStatus === "unauthenticated" && currentPage === "otpValidation" && (
                    <OTPValidationPage
                        phoneNumber={phoneNumber}
                        onOTPSubmit={handleOTPSubmit}
                        isOTPLoading={isOTPLoading}
                        customerFirstName={customerFirstName}
                        otpTimer={otpTimer}
                        setOtpTimer={setOtpTimer}
                    />
                )}
            </Box>
        </Flex>
    );
}
