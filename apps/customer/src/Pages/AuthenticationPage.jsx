import React, { useEffect, useState } from "react";
import { Box, Stack, Image, Flex, useToast, Text } from "@chakra-ui/react";
import LoginPage from "../Components/Authentication/LoginPage";
import SignupPage from "../Components/Authentication/SignupPage";
import OTPValidationPage from "../Components/Authentication/OTPValidationPage";
import Signing from "../images/Signup.png";
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
                } else {
                    toast({ title: "Error", description: "Unable to send OTP.", status: "error", duration: 5000, isClosable: true });
                }
            } else {
                setCurrentPage("signup");
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to check phone number.", status: "error", duration: 5000, isClosable: true });
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
                toast({ title: 'OTP verified!', status: 'success', duration: 3000, isClosable: true });
            } else if (result.nextStep?.additionalInfo) {
                const remaining = result.nextStep.additionalInfo.attemptsLeft || 0;
                if (remaining > 0) {
                    toast({ title: `Incorrect OTP. ${remaining} attempts left.`, status: 'warning', duration: 3000, isClosable: true });
                } else {
                    toast({ title: 'Too many failed attempts.', status: 'error', duration: 5000, isClosable: true });
                    setCurrentPage("login");
                }
            }
        } catch (error) {
            toast({ title: 'Error during OTP verification', description: error.message, status: 'error', duration: 5000, isClosable: true });
        } finally {
            setIsOTPLoading(false);
        }
    };

    const handleSignupSubmit = async (phone, firstName, lastName, email, receivePhoneNotification) => {
        setIsSignUpLoading(true);
        try {
            const { isSignUpComplete, nextStep, error } = await initiateSignUp(laundryId, email, phone, firstName, lastName, false, receivePhoneNotification);
            if (error) {
                if (error.includes("UsernameExistsException")) {
                    toast({ title: "User Already Exists", description: "Please verify your account to login.", status: "warning", duration: 5000, isClosable: true });
                    setPendingAuth(phone, laundryId);
                    const otpResponse = await initiateSignIn(phone);
                    if (!otpResponse.isSignedIn) {
                        setPhoneNumber(phone);
                        setCustomerFirstName(firstName);
                        setCurrentPage("otpValidation");
                    }
                } else {
                    toast({ title: "Sign Up Error", description: error, status: "error", duration: 5000, isClosable: true });
                }
                return;
            }
            if (nextStep === "CONFIRM_SIGN_UP") {
                setPendingAuth(phone, laundryId);
                const otpResponse = await initiateSignIn(phone);
                if (!otpResponse.isSignedIn) {
                    setPhoneNumber(phone);
                    setCustomerFirstName(firstName);
                    setCurrentPage("otpValidation");
                }
            }
        } catch (error) {
            toast({ title: "Sign Up Error", description: error.message, status: "error", duration: 5000, isClosable: true });
        } finally {
            setIsSignUpLoading(false);
        }
    };

    useEffect(() => {
        if (authStatus === "authenticated") {
            if (redirectTo) {
                navigate(redirectTo);
            } else {
                navigate(`/${laundryId}/user`);
            }
        }
    }, [authStatus, navigate, laundryId, redirectTo]);

    useEffect(() => {
        if (currentPage === "otpValidation") {
            setOtpTimer(180);
        }
    }, [currentPage]);

    return (
        <Box minHeight="100vh" display="flex" flexDirection={{ base: "column", md: "row" }} bg="#AADDD9">
            <Stack width={{ base: "100%", md: "50%" }} justify="center" alignSelf="center">
                <Image objectFit="cover" src={Signing} alt="Signup" />
            </Stack>
            <Flex width={{ base: "100%", md: "30%" }} alignItems="center" justifyContent="center">
                <Box width={{ base: "100%", md: "95%" }}>
                    {authStatus === "configuring" && <Text fontSize="xl">Loading...</Text>}
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
        </Box>
    );
}
