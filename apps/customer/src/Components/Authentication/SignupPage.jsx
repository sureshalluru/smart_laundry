import React, { useState, useEffect } from "react";
import {
    Box, VStack, FormControl, FormLabel, Input, Button,
    Switch, useToast, Text, Icon, Flex, HStack, Checkbox, Collapse
} from "@chakra-ui/react";
import { FiUserPlus, FiCheckCircle } from "react-icons/fi";

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export default function SignupPage({ onSubmit, phoneNumber, isSignUpLoading, initialReferralCode, laundryId }) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [receivePhoneNotification, setReceivePhoneNotification] = useState(true);
    const [isCommercial, setIsCommercial] = useState(false);
    const [billingEmail, setBillingEmail] = useState("");
    const [referralCode, setReferralCode] = useState(initialReferralCode || "");
    const [referralStatus, setReferralStatus] = useState(null); // null | { valid, referrerFirstName, reason }
    const [referralValidating, setReferralValidating] = useState(false);
    const toast = useToast();

    // Pre-fill referral code from props (URL param)
    useEffect(() => {
        if (initialReferralCode) {
            setReferralCode(initialReferralCode);
            validateReferralCode(initialReferralCode);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialReferralCode]);

    const validateReferralCode = async (code) => {
        if (!code || code.trim().length === 0) {
            setReferralStatus(null);
            return;
        }
        setReferralValidating(true);
        try {
            const res = await fetch(`${API_URL}/api/referrals/validate-code`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: code.trim(),
                    laundryId: laundryId,
                    phoneNumber: phoneNumber || "",
                    email: email || "",
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setReferralStatus(data);
            } else {
                setReferralStatus({ valid: false, reason: "validation_error" });
            }
        } catch (err) {
            console.error("Referral code validation error:", err);
            setReferralStatus({ valid: false, reason: "network_error" });
        } finally {
            setReferralValidating(false);
        }
    };

    const handleReferralBlur = () => {
        if (referralCode.trim()) {
            validateReferralCode(referralCode);
        } else {
            setReferralStatus(null);
        }
    };

    const handleSubmit = () => {
        if (firstName && lastName && email) {
            if (isCommercial && !billingEmail) {
                toast({
                    title: "Missing Billing Email",
                    description: "Billing email is required for commercial accounts.",
                    status: "error",
                    duration: 4000,
                    isClosable: true,
                });
                return;
            }
            onSubmit(phoneNumber, firstName, lastName, email, receivePhoneNotification, isCommercial, billingEmail, referralCode.trim() || null);
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

                {/* Referral Code (Optional) */}
                <FormControl>
                    <FormLabel fontSize="sm" color="gray.600" mb={1}>Referral Code (Optional)</FormLabel>
                    <Input
                        size="lg" placeholder="Enter referral code"
                        value={referralCode}
                        onChange={(e) => {
                            setReferralCode(e.target.value.toUpperCase());
                            if (!e.target.value.trim()) setReferralStatus(null);
                        }}
                        onBlur={handleReferralBlur}
                        bg="white" border="1px solid" borderColor="gray.200"
                        _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px #63b3ed" }}
                        isDisabled={referralValidating}
                    />
                    {referralValidating && (
                        <Text fontSize="xs" color="blue.500" mt={1}>Validating code...</Text>
                    )}
                    {referralStatus?.valid && (
                        <HStack mt={1} spacing={1}>
                            <Icon as={FiCheckCircle} color="green.500" boxSize={3} />
                            <Text fontSize="xs" color="green.600">
                                Referred by {referralStatus.referrerFirstName}
                            </Text>
                        </HStack>
                    )}
                    {referralStatus && !referralStatus.valid && (
                        <Text fontSize="xs" color="red.500" mt={1}>
                            {referralStatus.reason === "self_referral"
                                ? "You cannot use your own referral code."
                                : referralStatus.reason === "network_error"
                                ? "Could not validate code. You can still register."
                                : "Invalid referral code. You can still register without one."}
                        </Text>
                    )}
                </FormControl>

                {/* Commercial Account */}
                <Box>
                    <Checkbox
                        isChecked={isCommercial}
                        onChange={(e) => setIsCommercial(e.target.checked)}
                        colorScheme="blue"
                        size="md"
                    >
                        <Text fontSize="sm" color="gray.700">I'm a business / commercial account</Text>
                    </Checkbox>
                    <Collapse in={isCommercial} animateOpacity>
                        <FormControl mt={3} isRequired>
                            <FormLabel fontSize="sm" color="gray.600" mb={1}>Billing Email</FormLabel>
                            <Input
                                size="lg" type="email" placeholder="billing@company.com"
                                value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)}
                                bg="white" border="1px solid" borderColor="gray.200"
                                _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px #63b3ed" }}
                            />
                            <Text fontSize="xs" color="gray.500" mt={1}>
                                Invoices will be sent to this email address.
                            </Text>
                        </FormControl>
                    </Collapse>
                </Box>

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
                    isDisabled={isCommercial && !billingEmail}
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
