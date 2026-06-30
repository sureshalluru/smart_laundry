import React from 'react';
import {
    Box, Text, RadioGroup, Radio, Stack, VStack, Input, FormControl, FormLabel,
    Button, HStack, Badge, Spinner, Alert, AlertIcon,
} from '@chakra-ui/react';

/**
 * MultiLocationOption — three-option radio group for the onboarding flow.
 * Allows users to choose: standalone laundry, create a new company, or join an existing one.
 */
export default function MultiLocationOption({
    value = 'none',
    onChange,
    // Create mode fields
    companyName,
    onCompanyNameChange,
    companyEmail,
    onCompanyEmailChange,
    // Join mode fields
    joinCode,
    onJoinCodeChange,
    joinStatus,
    maskedCompanyName,
    maskedEmail,
    onLookupJoinCode,
    onSendVerification,
    verificationCode,
    onVerificationCodeChange,
    onConfirmVerification,  // accepts optional code argument
    verificationError,
    companyVerified,
}) {
    return (
        <Box mt={4}>
            <Text fontWeight="bold" mb={2}>Multi-location?</Text>
            <Text fontSize="sm" color="gray.600" mb={3}>
                Is this laundry part of a multi-location company?
            </Text>

            <RadioGroup value={value} onChange={onChange}>
                <Stack spacing={3}>
                    <Radio value="none">No (standalone laundry)</Radio>
                    <Radio value="create">Yes — create a new company</Radio>
                    <Radio value="join">Yes — join an existing company</Radio>
                </Stack>
            </RadioGroup>

            {/* Create new company sub-form */}
            {value === 'create' && (
                <Box mt={4} p={4} bg="blue.50" borderRadius="md" border="1px" borderColor="blue.100">
                    <VStack spacing={3} align="stretch">
                        <Text fontWeight="semibold" fontSize="sm">New Company Details</Text>
                        <FormControl isRequired>
                            <FormLabel fontSize="sm">Company Name</FormLabel>
                            <Input
                                size="sm"
                                placeholder="e.g. Acme Laundry Co"
                                value={companyName || ''}
                                onChange={(e) => onCompanyNameChange && onCompanyNameChange(e.target.value)}
                            />
                        </FormControl>
                        <FormControl>
                            <FormLabel fontSize="sm">Company Contact Email</FormLabel>
                            <Input
                                size="sm"
                                placeholder="contact@company.com"
                                type="email"
                                value={companyEmail || ''}
                                onChange={(e) => onCompanyEmailChange && onCompanyEmailChange(e.target.value)}
                            />
                        </FormControl>
                    </VStack>
                </Box>
            )}

            {/* Join existing company sub-form */}
            {value === 'join' && (
                <Box mt={4} p={4} bg="green.50" borderRadius="md" border="1px" borderColor="green.100">
                    <VStack spacing={3} align="stretch">
                        <Text fontWeight="semibold" fontSize="sm">Join an Existing Company</Text>
                        <Text fontSize="xs" color="gray.600">
                            Enter the join code provided by your company owner.
                        </Text>
                        <HStack>
                            <Input
                                size="sm"
                                placeholder="e.g. ACME-7X4K"
                                value={joinCode || ''}
                                onChange={(e) => onJoinCodeChange && onJoinCodeChange(e.target.value)}
                                maxW="200px"
                                isDisabled={companyVerified}
                            />
                            <Button
                                size="sm"
                                colorScheme="green"
                                onClick={onLookupJoinCode}
                                isLoading={joinStatus === 'looking_up'}
                                isDisabled={!joinCode || companyVerified || joinStatus === 'looking_up'}
                            >
                                Look Up
                            </Button>
                        </HStack>

                        {/* Lookup result — masked company info */}
                        {joinStatus === 'found' && maskedCompanyName && !companyVerified && (
                            <Box p={3} bg="white" borderRadius="md" border="1px" borderColor="green.200">
                                <Text fontSize="sm"><strong>Company:</strong> {maskedCompanyName}</Text>
                                <Text fontSize="sm"><strong>Contact:</strong> {maskedEmail}</Text>
                                <Button
                                    size="sm"
                                    colorScheme="blue"
                                    mt={2}
                                    onClick={onSendVerification}
                                    isLoading={joinStatus === 'verifying'}
                                >
                                    Send Verification Code
                                </Button>
                            </Box>
                        )}

                        {/* Verification code input */}
                        {(joinStatus === 'verifying' || joinStatus === 'verified') && !companyVerified && (
                            <Box>
                                <Text fontSize="sm" color="gray.600" mb={1}>
                                    Enter the 6-digit code sent to the company's email:
                                </Text>
                                <HStack>
                                    <Input
                                        size="sm"
                                        maxW="160px"
                                        placeholder="000000"
                                        value={verificationCode || ''}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                            onVerificationCodeChange && onVerificationCodeChange(val);
                                            if (val.length === 6 && onConfirmVerification) {
                                                onConfirmVerification(val);
                                            }
                                        }}
                                        maxLength={6}
                                        textAlign="center"
                                        letterSpacing="0.3em"
                                        fontWeight="bold"
                                    />
                                    {joinStatus === 'verifying' && <Spinner size="sm" />}
                                </HStack>
                            </Box>
                        )}

                        {/* Verified badge */}
                        {companyVerified && (
                            <Badge colorScheme="green" fontSize="sm" px={2} py={1} w="fit-content">
                                ✓ Company Verified
                            </Badge>
                        )}

                        {/* Verification error */}
                        {verificationError && (
                            <Alert status="error" borderRadius="md" size="sm">
                                <AlertIcon />
                                <Text fontSize="sm">{verificationError}</Text>
                            </Alert>
                        )}

                        {/* Join status error */}
                        {joinStatus === 'error' && !verificationError && (
                            <Alert status="error" borderRadius="md" size="sm">
                                <AlertIcon />
                                <Text fontSize="sm">Invalid join code</Text>
                            </Alert>
                        )}
                    </VStack>
                </Box>
            )}
        </Box>
    );
}
