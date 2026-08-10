import React, { useContext, useEffect, useState } from "react";
import { Box, Flex, useToast, Image } from "@chakra-ui/react";
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
import { LaundryContext } from "../Components/Contexts/LaundryContext";
import axios from "axios";

export default function AuthenticationPage() {
    const { laundryId } = useParams();
    const { laundryData } = useContext(LaundryContext);
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
    const refCode = searchParams.get('ref') || localStorage.getItem('pendingReferralCode') || '';
    const [otpTimer, setOtpTimer] = useState(180);
    const [commercialData, setCommercialData] = useState(null);
    const [referralCode, setReferralCode] = useState(refCode);

    const handleLoginSubmit = async (phone) => {
        setPhoneNumber(phone);
        setIsLoginLoading(true);
        try {
            const response = await handlePhoneNumberCheck(phone, laundryId);
            if (response.exists) {
                setCustomerFirstName(response.customerFirstName);
                setPendingAuth(phone, laundryId);
                const otpResponse = await initiateSignIn(phone, laundryId);
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
                // Save commercial account settings if user signed up as commercial
                if (commercialData && result.user?.sub) {
                    try {
                        const API_URL = process.env.REACT_APP_AWS_API_URL || '';
                        await axios.patch(`${API_URL}/api/admin/customer-commercial`, {
                            customerId: result.user.sub,
                            laundryId: laundryId,
                            billingEmail: commercialData.billingEmail,
                            isCommercial: true,
                        }, {
                            headers: { Authorization: `Bearer ${result.accessToken}` }
                        });
                    } catch (commercialError) {
                        console.error("Failed to save commercial settings:", commercialError);
                        // Don't block signup - commercial settings can be updated later
                    }
                    setCommercialData(null);
                }
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

    const handleSignupSubmit = async (phone, firstName, lastName, email, receivePhoneNotification, isCommercial, billingEmail, refCodeFromForm) => {
        setIsSignUpLoading(true);
        // Store referral code for passing in the API call
        if (refCodeFromForm) setReferralCode(refCodeFromForm);
        try {
            const { error } = await initiateSignUp(laundryId, email, phone, firstName, lastName, false, receivePhoneNotification, isCommercial, billingEmail, refCodeFromForm || referralCode || null);
            if (error) {
                if (error.includes("UsernameExistsException")) {
                    toast({ title: "Account exists", description: "Sending verification code...", status: "info", duration: 3000, isClosable: true });
                } else {
                    toast({ title: "Error", description: error, status: "error", duration: 4000, isClosable: true });
                    return;
                }
            }
            // Store commercial data for after OTP verification
            if (isCommercial && billingEmail) {
                setCommercialData({ isCommercial: true, billingEmail });
            } else {
                setCommercialData(null);
            }
            setPendingAuth(phone, laundryId);
            const otpResponse = await initiateSignIn(phone, laundryId);
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

    const loginBg = (() => {
        const bgMap = {
            blue: "linear-gradient(180deg, #EBF8FF 0%, #BEE3F8 50%, #90CDF4 100%)",
            green: "linear-gradient(180deg, #F0FFF4 0%, #C6F6D5 50%, #9AE6B4 100%)",
            purple: "linear-gradient(180deg, #FAF5FF 0%, #D6BCFA 50%, #B794F4 100%)",
            teal: "linear-gradient(180deg, #E6FFFA 0%, #81E6D9 50%, #4FD1C5 100%)",
            orange: "linear-gradient(180deg, #FFFAF0 0%, #FBD38D 50%, #F6AD55 100%)",
            red: "linear-gradient(180deg, #FFF5F5 0%, #FEB2B2 50%, #FC8181 100%)",
            pink: "linear-gradient(180deg, #FFF5F7 0%, #FBB6CE 50%, #F687B3 100%)",
            cyan: "linear-gradient(180deg, #EDFDFD 0%, #9DECF9 50%, #76E4F7 100%)",
        };
        return bgMap[laundryData?.themeColor] || bgMap.blue;
    })();

    return (
        <Flex
            minH="100vh"
            bg={loginBg}
            align="center"
            justify="center"
            p={4}
            direction="column"
        >
            {laundryData?.laundryLogo && (
                <Image
                    src={laundryData.laundryLogo}
                    alt={laundryData?.laundryName}
                    maxW="160px"
                    maxH="80px"
                    objectFit="contain"
                    mb={4}
                />
            )}
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
                    <SignupPage onSubmit={handleSignupSubmit} phoneNumber={phoneNumber} isSignUpLoading={isSignUpLoading} initialReferralCode={referralCode} laundryId={laundryId} />
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
