import React, { useState } from 'react';
import {
    Box, Container, Heading, Text, VStack, HStack, Button, Input, Textarea,
    FormControl, FormLabel, Select, SimpleGrid, Badge, Divider,
    useToast, Stepper, Step, StepIndicator, StepStatus, StepTitle,
    StepDescription, StepSeparator, StepIcon, StepNumber, useSteps,
    IconButton, Table, Thead, Tbody, Tr, Th, Td, Checkbox, Card, CardBody,
    Alert, AlertIcon, InputGroup, InputLeftAddon, Spinner
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import axios from 'axios';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIMEZONES = [
    'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'
];

const THEME_COLORS = [
    { name: 'Blue', value: 'blue', bg: '#3182CE' },
    { name: 'Green', value: 'green', bg: '#38A169' },
    { name: 'Purple', value: 'purple', bg: '#805AD5' },
    { name: 'Teal', value: 'teal', bg: '#319795' },
    { name: 'Orange', value: 'orange', bg: '#DD6B20' },
    { name: 'Red', value: 'red', bg: '#E53E3E' },
    { name: 'Pink', value: 'pink', bg: '#D53F8C' },
    { name: 'Cyan', value: 'cyan', bg: '#00B5D8' },
];

const steps = [
    { title: 'Business Info', description: 'Your laundry details' },
    { title: 'Branding', description: 'Logo, colors & domain' },
    { title: 'Services', description: 'What you offer' },
    { title: 'Schedule', description: 'Operating hours' },
    { title: 'Payments', description: 'Stripe setup' },
    { title: 'Agreement', description: 'Service terms' },
    { title: 'Review', description: 'Confirm & launch' },
];

const OnboardingPage = () => {
    const toast = useToast();
    const { activeStep, setActiveStep } = useSteps({ index: 0, count: steps.length });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState(null);

    // Step 1: Business Info
    const [businessInfo, setBusinessInfo] = useState({
        laundryName: '', street: '', city: '', state: '', zipCode: '', country: 'USA',
        timezone: 'America/Chicago', contactPhone: '', contactEmail: '',
        ownerFirstName: '', ownerLastName: '', ownerPhone: '', ownerEmail: '',
        referredByName: '', referredByEmail: '',
    });

    // Email verification state
    const [emailVerified, setEmailVerified] = useState(false);
    const [emailVerificationToken, setEmailVerificationToken] = useState('');
    const [verificationCodeSent, setVerificationCodeSent] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [emailError, setEmailError] = useState('');
    const [emailVerifying, setEmailVerifying] = useState(false);
    const [codeSubmitting, setCodeSubmitting] = useState(false);

    // Address duplicate check state
    const [addressDuplicate, setAddressDuplicate] = useState(false);
    const [addressError, setAddressError] = useState('');

    // Step 2: Branding
    const [themeColor, setThemeColor] = useState('blue');
    const [logoBase64, setLogoBase64] = useState('');
    const [logoPreview, setLogoPreview] = useState('');
    const [customDomain, setCustomDomain] = useState('');
    const [tagline, setTagline] = useState('');

    // Step 3: Services
    const [services, setServices] = useState([
        { serviceName: 'Wash & Fold', price: '1.75', inputWeight: true, customerAccess: true },
    ]);

    // Step 3: Schedule
    const [schedule, setSchedule] = useState(
        DAYS_OF_WEEK.map(day => ({
            day, enabled: !['Sunday'].includes(day),
            startTime: '08:00', endTime: '17:00'
        }))
    );
    const [deliveryTimeInterval, setDeliveryTimeInterval] = useState(2);

    // Step 4: Payments
    const [stripePublicKey, setStripePublicKey] = useState('');
    const [stripePrivateKey, setStripePrivateKey] = useState('');

    // Step 5: Agreement
    const [agreementSigned, setAgreementSigned] = useState(false);
    const [signatureName, setSignatureName] = useState('');
    const [signatureDate] = useState(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

    // Handlers
    const updateBusiness = (field, value) => {
        setBusinessInfo(prev => ({ ...prev, [field]: value }));
        // Reset email verification if email changes
        if (field === 'ownerEmail') {
            setEmailVerified(false);
            setVerificationCodeSent(false);
            setVerificationCode('');
            setEmailError('');
            setEmailVerificationToken('');
        }
    };

    // Email verification handlers
    const handleVerifyEmail = async () => {
        setEmailVerifying(true); setEmailError('');
        try {
            const res = await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/platform/onboard/verify-email`, { email: businessInfo.ownerEmail });
            if (res.data.status === 'success') { setVerificationCodeSent(true); }
            else { setEmailError(res.data.message); }
        } catch (err) { setEmailError(err.response?.data?.detail || 'Failed to send code'); }
        finally { setEmailVerifying(false); }
    };

    const handleConfirmCode = async (code) => {
        setCodeSubmitting(true); setEmailError('');
        try {
            const res = await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/platform/onboard/confirm-code`, { email: businessInfo.ownerEmail.trim().toLowerCase(), code });
            if (res.data.status === 'success') { setEmailVerified(true); setEmailVerificationToken(res.data.token); setVerificationCodeSent(false); }
            else { setEmailError(res.data.message); }
        } catch (err) { setEmailError(err.response?.data?.detail || 'Verification failed'); }
        finally { setCodeSubmitting(false); }
    };

    const handleVerificationCodeChange = (e) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
        setVerificationCode(val);
        if (val.length === 6) {
            handleConfirmCode(val);
        }
    };

    // Address duplicate check handler
    const handleZipBlur = async () => {
        if (!businessInfo.street || !businessInfo.city || !businessInfo.state || !businessInfo.zipCode) return;
        try {
            const res = await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/platform/onboard/check-address`, {
                street: businessInfo.street, city: businessInfo.city, state: businessInfo.state, zipCode: businessInfo.zipCode
            });
            if (res.data.code === 'ADDRESS_DUPLICATE') { setAddressDuplicate(true); setAddressError(res.data.message); }
            else { setAddressDuplicate(false); setAddressError(''); }
        } catch (err) { /* silent fail for UX */ }
    };

    const addService = () => {
        setServices(prev => [...prev, { serviceName: '', price: '', inputWeight: true, customerAccess: true }]);
    };
    const removeService = (idx) => setServices(prev => prev.filter((_, i) => i !== idx));
    const updateService = (idx, field, value) => {
        setServices(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
    };

    const toggleDay = (idx, enabled) => {
        setSchedule(prev => prev.map((s, i) => i === idx ? { ...s, enabled } : s));
    };
    const updateScheduleTime = (idx, field, value) => {
        setSchedule(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const payload = {
                ...businessInfo,
                themeColor,
                logoBase64: logoBase64 || null,
                customDomain,
                tagline,
                services: services.filter(s => s.serviceName.trim()),
                deliveryTimeSlots: schedule.filter(s => s.enabled).map(s => ({
                    day: s.day, startTime: s.startTime, endTime: s.endTime
                })),
                deliveryTimeInterval,
                stripePublicKey,
                stripePrivateKey,
                serviceableZipCodes: businessInfo.zipCode ? [businessInfo.zipCode] : [],
                emailVerificationToken,
                agreement: {
                    signed: agreementSigned,
                    signatureName: signatureName,
                    signatureDate: signatureDate,
                    terms: 'Platform fee of $149/month applies when monthly revenue processed through the platform exceeds $2,999. Invoice sent at end of month, payment due within 30 days.',
                },
            };

            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/platform/onboard`,
                payload
            );

            if (response.data.status === 'success') {
                setResult(response.data);
                setActiveStep(7); // Move past the last step to show results
                toast({ title: 'Laundry created successfully!', status: 'success', duration: 5000 });
            } else {
                toast({ title: 'Error', description: response.data.message, status: 'error', duration: 5000 });
            }
        } catch (err) {
            const errorDetail = err.response?.data?.detail || err.response?.data?.message || err.message;
            const errorCode = err.response?.data?.code;
            if (err.response?.status === 400) {
                if (errorCode === 'EMAIL_VERIFICATION_REQUIRED' || errorCode === 'EMAIL_TOKEN_EXPIRED') {
                    setEmailError(errorDetail);
                    setEmailVerified(false);
                    setActiveStep(0);
                } else if (errorCode === 'EMAIL_DUPLICATE') {
                    setEmailError(errorDetail);
                    setActiveStep(0);
                } else if (errorCode === 'ADDRESS_DUPLICATE') {
                    setAddressDuplicate(true);
                    setAddressError(errorDetail);
                    setActiveStep(0);
                } else {
                    toast({ title: 'Error', description: errorDetail, status: 'error', duration: 5000 });
                }
            } else {
                toast({ title: 'Error', description: errorDetail, status: 'error', duration: 5000 });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const canProceed = () => {
        switch (activeStep) {
            case 0: return businessInfo.laundryName && businessInfo.ownerPhone && businessInfo.street && emailVerified && !addressDuplicate;
            case 1: return true; // Branding is optional
            case 2: return services.some(s => s.serviceName.trim());
            case 3: return schedule.some(s => s.enabled);
            case 4: return true; // Stripe optional at onboarding
            case 5: return agreementSigned && signatureName.trim().length > 2;
            default: return true;
        }
    };

    // Results page (after successful onboarding)
    if (result) {
        return (
            <Container maxW="container.md" py={10}>
                <VStack spacing={6} align="stretch">
                    <Box textAlign="center">
                        <Heading size="lg" color="green.600" mb={2}>🎉 Your Laundry is Live!</Heading>
                        <Text color="gray.600">Here are your access details. Save them securely.</Text>
                    </Box>

                    <Alert status="success" borderRadius="md">
                        <AlertIcon />
                        Your laundry shop has been created and is ready to use.
                    </Alert>

                    <Card>
                        <CardBody>
                            <VStack spacing={3} align="stretch">
                                <Heading size="sm">Shop Details</Heading>
                                <SimpleGrid columns={2} spacing={2}>
                                    <Text fontWeight="bold">Laundry ID:</Text>
                                    <Text>{result.laundry?.laundryId}</Text>
                                    <Text fontWeight="bold">Name:</Text>
                                    <Text>{result.laundry?.laundryName}</Text>
                                    <Text fontWeight="bold">Admin URL:</Text>
                                    <Text color="blue.500">{result.laundry?.adminUrl}</Text>
                                    <Text fontWeight="bold">Customer Site:</Text>
                                    <Text color="blue.500">{result.laundry?.customerUrl}</Text>
                                    <Text fontWeight="bold">Device Registration Code:</Text>
                                    <Badge colorScheme="purple" fontSize="md" p={1}>{result.laundry?.deviceRegistrationCode}</Badge>
                                </SimpleGrid>
                            </VStack>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardBody>
                            <VStack spacing={3} align="stretch">
                                <Heading size="sm">Owner Login</Heading>
                                <SimpleGrid columns={2} spacing={2}>
                                    <Text fontWeight="bold">Employee ID:</Text>
                                    <Badge colorScheme="blue" fontSize="md">{result.owner?.employeeId}</Badge>
                                    <Text fontWeight="bold">Passcode:</Text>
                                    <Badge colorScheme="orange" fontSize="md">{result.owner?.passcode}</Badge>
                                    <Text fontWeight="bold">Phone (login):</Text>
                                    <Text>{businessInfo.ownerPhone}</Text>
                                </SimpleGrid>
                            </VStack>
                        </CardBody>
                    </Card>

                    <Alert status="warning" borderRadius="md">
                        <AlertIcon />
                        Save these credentials securely. You'll need the Employee ID and Passcode to log into the admin panel.
                    </Alert>

                    <HStack spacing={4} justify="center">
                        <Button colorScheme="blue" onClick={() => window.open(`${result.laundry?.adminUrl}`, '_blank')}>
                            Open Admin Panel
                        </Button>
                        <Button variant="outline" onClick={() => window.open(`${result.laundry?.customerUrl}`, '_blank')}>
                            View Customer Site
                        </Button>
                    </HStack>
                </VStack>
            </Container>
        );
    }

    return (
        <Container maxW="container.lg" py={{ base: 4, md: 8 }} px={{ base: 4, md: 6 }}>
            <VStack spacing={{ base: 4, md: 6 }} align="stretch">
                {/* Hero image — only on first step */}
                {activeStep === 0 && (
                    <Box textAlign="center">
                        <Box mx="auto" mb={2} maxW={{ base: '100%', md: '700px' }} borderRadius="xl" overflow="hidden" boxShadow="md">
                            <img
                                src="https://laundry-images-store-prod.s3.us-east-1.amazonaws.com/onboard-hero.png"
                                alt="Smart Laundry Basket - All-in-One Laundromat Platform"
                                style={{ width: '100%', height: 'auto' }}
                            />
                        </Box>
                        <Heading size={{ base: 'sm', md: 'md' }} color="blue.700">Get Started in 2 Minutes</Heading>
                        <Text color="gray.600" mt={1} fontSize={{ base: 'xs', md: 'sm' }}>Free until $3K/month revenue. No contracts.</Text>
                    </Box>
                )}

                <Stepper index={activeStep} colorScheme="blue" size={{ base: 'xs', md: 'sm' }}>
                    {steps.map((step, index) => (
                        <Step key={index} onClick={() => index < activeStep && setActiveStep(index)}>
                            <StepIndicator>
                                <StepStatus complete={<StepIcon />} incomplete={<StepNumber />} active={<StepNumber />} />
                            </StepIndicator>
                            <Box flexShrink="0" display={{ base: 'none', md: 'block' }}>
                                <StepTitle>{step.title}</StepTitle>
                                <StepDescription>{step.description}</StepDescription>
                            </Box>
                            <StepSeparator />
                        </Step>
                    ))}
                </Stepper>

                <Divider />

                {/* Step 1: Business Info */}
                {activeStep === 0 && (
                    <VStack spacing={4} align="stretch">
                        <Heading size="md">Business Information</Heading>

                        <FormControl isRequired>
                            <FormLabel>Laundry Name</FormLabel>
                            <Input placeholder="e.g. Fresh & Clean Laundry" value={businessInfo.laundryName} onChange={e => updateBusiness('laundryName', e.target.value)} />
                        </FormControl>

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                            <FormControl isRequired>
                                <FormLabel>Street Address</FormLabel>
                                <Input placeholder="123 Main St" value={businessInfo.street} onChange={e => updateBusiness('street', e.target.value)} />
                            </FormControl>
                            <FormControl isRequired>
                                <FormLabel>City</FormLabel>
                                <Input placeholder="Austin" value={businessInfo.city} onChange={e => updateBusiness('city', e.target.value)} />
                            </FormControl>
                            <FormControl isRequired>
                                <FormLabel>State</FormLabel>
                                <Input placeholder="TX" value={businessInfo.state} onChange={e => updateBusiness('state', e.target.value)} />
                            </FormControl>
                            <FormControl isRequired>
                                <FormLabel>Zip Code</FormLabel>
                                <Input placeholder="78664" value={businessInfo.zipCode} onChange={e => updateBusiness('zipCode', e.target.value)} onBlur={handleZipBlur} />
                                {addressError && (
                                    <Text color="red.500" fontSize="sm" mt={1}>{addressError}</Text>
                                )}
                            </FormControl>
                        </SimpleGrid>

                        <FormControl>
                            <FormLabel>Time Zone</FormLabel>
                            <Select value={businessInfo.timezone} onChange={e => updateBusiness('timezone', e.target.value)}>
                                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace('America/', '').replace('_', ' ')}</option>)}
                            </Select>
                        </FormControl>

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                            <FormControl>
                                <FormLabel>Business Phone</FormLabel>
                                <Input placeholder="+15125551234" value={businessInfo.contactPhone} onChange={e => updateBusiness('contactPhone', e.target.value)} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Business Email</FormLabel>
                                <Input placeholder="info@laundry.com" value={businessInfo.contactEmail} onChange={e => updateBusiness('contactEmail', e.target.value)} />
                            </FormControl>
                        </SimpleGrid>

                        <Divider />
                        <Heading size="sm">Owner / Admin Account</Heading>

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                            <FormControl isRequired>
                                <FormLabel>First Name</FormLabel>
                                <Input value={businessInfo.ownerFirstName} onChange={e => updateBusiness('ownerFirstName', e.target.value)} />
                            </FormControl>
                            <FormControl isRequired>
                                <FormLabel>Last Name</FormLabel>
                                <Input value={businessInfo.ownerLastName} onChange={e => updateBusiness('ownerLastName', e.target.value)} />
                            </FormControl>
                            <FormControl isRequired>
                                <FormLabel>Phone (used for login)</FormLabel>
                                <Input placeholder="+15125551234" value={businessInfo.ownerPhone} onChange={e => updateBusiness('ownerPhone', e.target.value)} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Email</FormLabel>
                                <Input placeholder="owner@laundry.com" value={businessInfo.ownerEmail} onChange={e => updateBusiness('ownerEmail', e.target.value)} />
                            </FormControl>
                        </SimpleGrid>

                        {/* Email Verification UI */}
                        <Box>
                            <HStack spacing={3} mt={2}>
                                <Button
                                    size="sm"
                                    colorScheme="blue"
                                    onClick={handleVerifyEmail}
                                    isLoading={emailVerifying}
                                    loadingText="Sending..."
                                    isDisabled={!businessInfo.ownerEmail || emailVerified}
                                >
                                    Verify Email
                                </Button>
                                {emailVerified && (
                                    <Badge colorScheme="green" fontSize="sm" px={2} py={1}>✓ Email Verified</Badge>
                                )}
                            </HStack>

                            {verificationCodeSent && !emailVerified && (
                                <Box mt={3}>
                                    <Text fontSize="sm" color="gray.600" mb={1}>Enter the 6-digit code sent to your email:</Text>
                                    <HStack>
                                        <Input
                                            maxW="160px"
                                            placeholder="000000"
                                            value={verificationCode}
                                            onChange={handleVerificationCodeChange}
                                            isDisabled={codeSubmitting}
                                            maxLength={6}
                                            textAlign="center"
                                            letterSpacing="0.3em"
                                            fontWeight="bold"
                                        />
                                        {codeSubmitting && <Spinner size="sm" />}
                                    </HStack>
                                </Box>
                            )}

                            {emailError && (
                                <Alert status="error" mt={2} borderRadius="md" size="sm">
                                    <AlertIcon />
                                    <Text fontSize="sm">{emailError}</Text>
                                </Alert>
                            )}
                        </Box>

                        {/* Referral Section */}
                        <Box bg="blue.50" p={4} borderRadius="md" border="1px" borderColor="blue.100">
                            <Text fontWeight="bold" fontSize="sm" mb={1}>Referred by someone?</Text>
                            <Text fontSize="xs" color="gray.600" mb={3}>
                                If someone referred you to Smart Laundry, enter their name and email below. 
                                We pay 10% of your monthly subscription to the person who referred you — as long as you remain an active subscriber.
                            </Text>
                            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                                <FormControl>
                                    <FormLabel fontSize="sm">Referrer Name (optional)</FormLabel>
                                    <Input size="sm" placeholder="John Doe" value={businessInfo.referredByName} onChange={e => updateBusiness('referredByName', e.target.value)} />
                                </FormControl>
                                <FormControl>
                                    <FormLabel fontSize="sm">Referrer Email (optional)</FormLabel>
                                    <Input size="sm" placeholder="referrer@email.com" type="email" value={businessInfo.referredByEmail} onChange={e => updateBusiness('referredByEmail', e.target.value)} />
                                </FormControl>
                            </SimpleGrid>
                        </Box>
                    </VStack>
                )}

                {/* Step 2: Branding */}
                {activeStep === 1 && (
                    <VStack spacing={4} align="stretch">
                        <Heading size="md">Branding & Customization</Heading>
                        <Text fontSize="sm" color="gray.500">
                            Make the platform yours. Upload your logo, pick your brand color, and set your custom domain.
                        </Text>

                        {/* Logo Upload */}
                        <FormControl>
                            <FormLabel fontWeight="bold">Business Logo</FormLabel>
                            <Text fontSize="xs" color="gray.500" mb={2}>
                                Upload your logo (PNG or JPG, max 2MB). If you skip this, a default laundry logo will be used.
                            </Text>
                            <Input
                                type="file"
                                accept="image/png,image/jpeg,image/jpg"
                                p={1}
                                onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (!file) return;
                                    if (file.size > 2 * 1024 * 1024) {
                                        toast({ title: 'Logo too large', description: 'Max 2MB', status: 'error', duration: 3000 });
                                        return;
                                    }
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                        setLogoPreview(reader.result);
                                        setLogoBase64(reader.result.split(',')[1]);
                                    };
                                    reader.readAsDataURL(file);
                                }}
                            />
                            {logoPreview && (
                                <Box mt={3} p={3} bg="gray.50" borderRadius="md" textAlign="center">
                                    <img src={logoPreview} alt="Logo preview" style={{ maxHeight: '80px', margin: '0 auto' }} />
                                    <Button size="xs" mt={2} variant="ghost" colorScheme="red" onClick={() => { setLogoPreview(''); setLogoBase64(''); }}>
                                        Remove
                                    </Button>
                                </Box>
                            )}
                            {!logoPreview && (
                                <Box mt={2} p={3} bg="gray.50" borderRadius="md" textAlign="center">
                                    <Text fontSize="sm" color="gray.400">No logo uploaded — a default laundry icon will be used</Text>
                                </Box>
                            )}
                        </FormControl>

                        {/* Theme Color */}
                        <FormControl>
                            <FormLabel fontWeight="bold">Brand Color Theme</FormLabel>
                            <Text fontSize="xs" color="gray.500" mb={2}>
                                This color will be used on your customer-facing website and landing page.
                            </Text>
                            <SimpleGrid columns={{ base: 4, md: 8 }} spacing={3}>
                                {THEME_COLORS.map(color => (
                                    <Box
                                        key={color.value}
                                        w="100%" h="50px"
                                        bg={color.bg}
                                        borderRadius="md"
                                        cursor="pointer"
                                        border={themeColor === color.value ? '3px solid #1A202C' : '2px solid transparent'}
                                        onClick={() => setThemeColor(color.value)}
                                        display="flex" alignItems="center" justifyContent="center"
                                        transition="all 0.2s"
                                        _hover={{ transform: 'scale(1.05)' }}
                                    >
                                        <Text fontSize="xs" color="white" fontWeight="bold">{color.name}</Text>
                                    </Box>
                                ))}
                            </SimpleGrid>
                        </FormControl>

                        {/* Tagline */}
                        <FormControl>
                            <FormLabel fontWeight="bold">Tagline / Slogan</FormLabel>
                            <Input
                                placeholder="e.g. Fresh clothes, delivered to your door"
                                value={tagline}
                                onChange={e => setTagline(e.target.value)}
                                maxLength={100}
                            />
                            <Text fontSize="xs" color="gray.400" mt={1}>{tagline.length}/100 characters</Text>
                        </FormControl>

                        {/* Custom Domain */}
                        <FormControl>
                            <FormLabel fontWeight="bold">Custom Domain (optional)</FormLabel>
                            <Text fontSize="xs" color="gray.500" mb={2}>
                                If you have your own domain, enter it here. We'll configure it after setup. Otherwise your site will be available at our platform URL.
                            </Text>
                            <InputGroup>
                                <InputLeftAddon>https://</InputLeftAddon>
                                <Input
                                    placeholder="www.mylaundry.com"
                                    value={customDomain}
                                    onChange={e => setCustomDomain(e.target.value)}
                                />
                            </InputGroup>
                        </FormControl>
                    </VStack>
                )}

                {/* Step 3: Services */}
                {activeStep === 2 && (
                    <VStack spacing={4} align="stretch">
                        <HStack justify="space-between">
                            <Heading size="md">Services & Pricing</Heading>
                            <Button leftIcon={<AddIcon />} size="sm" colorScheme="blue" onClick={addService}>Add Service</Button>
                        </HStack>
                        <Text fontSize="sm" color="gray.500">Add the laundry services you offer. You can always add more later from the admin panel.</Text>

                        <Table size="sm" variant="simple">
                            <Thead>
                                <Tr>
                                    <Th>Service Name</Th>
                                    <Th>Price ($)</Th>
                                    <Th>Type</Th>
                                    <Th>Visible</Th>
                                    <Th></Th>
                                </Tr>
                            </Thead>
                            <Tbody>
                                {services.map((svc, idx) => (
                                    <Tr key={idx}>
                                        <Td>
                                            <Input size="sm" placeholder="e.g. Wash & Fold" value={svc.serviceName} onChange={e => updateService(idx, 'serviceName', e.target.value)} />
                                        </Td>
                                        <Td>
                                            <Input size="sm" type="number" step="0.25" placeholder="1.75" value={svc.price} onChange={e => updateService(idx, 'price', e.target.value)} />
                                        </Td>
                                        <Td>
                                            <Select size="sm" value={svc.inputWeight ? 'weight' : 'count'} onChange={e => updateService(idx, 'inputWeight', e.target.value === 'weight')}>
                                                <option value="weight">Per Pound</option>
                                                <option value="count">Per Piece</option>
                                            </Select>
                                        </Td>
                                        <Td>
                                            <Checkbox isChecked={svc.customerAccess} onChange={e => updateService(idx, 'customerAccess', e.target.checked)} />
                                        </Td>
                                        <Td>
                                            <IconButton size="xs" icon={<DeleteIcon />} colorScheme="red" variant="ghost" onClick={() => removeService(idx)} isDisabled={services.length <= 1} />
                                        </Td>
                                    </Tr>
                                ))}
                            </Tbody>
                        </Table>
                    </VStack>
                )}

                {/* Step 4: Schedule */}
                {activeStep === 3 && (
                    <VStack spacing={4} align="stretch">
                        <Heading size="md">Operating Schedule</Heading>
                        <Text fontSize="sm" color="gray.500">Set which days and hours you're available for pickup and delivery.</Text>

                        <FormControl maxW="250px">
                            <FormLabel>Time Slot Interval</FormLabel>
                            <Select value={deliveryTimeInterval} onChange={e => setDeliveryTimeInterval(Number(e.target.value))}>
                                <option value={1}>1 hour slots</option>
                                <option value={2}>2 hour slots</option>
                                <option value={3}>3 hour slots</option>
                                <option value={4}>4 hour slots</option>
                            </Select>
                        </FormControl>

                        <Table size="sm" variant="simple">
                            <Thead>
                                <Tr><Th>Day</Th><Th>Open</Th><Th>Start</Th><Th>End</Th></Tr>
                            </Thead>
                            <Tbody>
                                {schedule.map((slot, idx) => (
                                    <Tr key={slot.day}>
                                        <Td fontWeight="medium">{slot.day}</Td>
                                        <Td><Checkbox isChecked={slot.enabled} onChange={e => toggleDay(idx, e.target.checked)} /></Td>
                                        <Td><Input type="time" size="sm" w="120px" value={slot.startTime} isDisabled={!slot.enabled} onChange={e => updateScheduleTime(idx, 'startTime', e.target.value)} /></Td>
                                        <Td><Input type="time" size="sm" w="120px" value={slot.endTime} isDisabled={!slot.enabled} onChange={e => updateScheduleTime(idx, 'endTime', e.target.value)} /></Td>
                                    </Tr>
                                ))}
                            </Tbody>
                        </Table>
                    </VStack>
                )}

                {/* Step 5: Payments */}
                {activeStep === 4 && (
                    <VStack spacing={4} align="stretch">
                        <Heading size="md">Payment Setup (Stripe)</Heading>
                        <Text fontSize="sm" color="gray.500">
                            Connect your Stripe account to accept payments. You can set this up later from the admin panel if you don't have it ready.
                        </Text>

                        <Alert status="info" borderRadius="md">
                            <AlertIcon />
                            <Text fontSize="sm">Don't have a Stripe account? <a href="https://dashboard.stripe.com/register" target="_blank" rel="noopener noreferrer" style={{ color: '#3182CE', fontWeight: 'bold' }}>Create one here</a>. Then find your API keys under Developers → API Keys.</Text>
                        </Alert>

                        <FormControl>
                            <FormLabel>Stripe Publishable Key</FormLabel>
                            <Input placeholder="pk_live_..." value={stripePublicKey} onChange={e => setStripePublicKey(e.target.value)} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Stripe Secret Key</FormLabel>
                            <Input type="password" placeholder="sk_live_..." value={stripePrivateKey} onChange={e => setStripePrivateKey(e.target.value)} />
                        </FormControl>

                        <Text fontSize="xs" color="gray.500">Your keys are stored securely and never exposed to customers.</Text>
                    </VStack>
                )}

                {/* Step 6: Agreement */}
                {activeStep === 5 && (
                    <VStack spacing={4} align="stretch">
                        <Heading size="md">Service Agreement</Heading>
                        <Text fontSize="sm" color="gray.600">
                            Please review and sign the platform usage agreement below.
                        </Text>

                        <Card variant="outline" bg="gray.50">
                            <CardBody>
                                <VStack spacing={3} align="stretch" fontSize="sm">
                                    <Heading size="sm">Platform Service Agreement</Heading>
                                    <Divider />

                                    <Text fontWeight="bold">1. Platform Usage Fee</Text>
                                    <Text>
                                        A monthly platform fee of <strong>$149</strong> applies when the total revenue
                                        processed through this platform for your laundry exceeds <strong>$2,999</strong>
                                        in a calendar month. If your monthly revenue is $2,999 or below, no platform fee is charged.
                                    </Text>

                                    <Text fontWeight="bold">2. Billing & Payment</Text>
                                    <Text>
                                        An invoice for the platform fee will be sent via email at the end of each qualifying month.
                                        Payment is due within <strong>30 days</strong> of the invoice date.
                                    </Text>

                                    <Text fontWeight="bold">3. Free Tier</Text>
                                    <Text>
                                        You may use the platform at no cost as long as your monthly processed revenue
                                        remains at or below $2,999. There are no setup fees, no per-transaction fees,
                                        and no hidden charges.
                                    </Text>

                                    <Text fontWeight="bold">4. Cancellation</Text>
                                    <Text>
                                        You may cancel your use of the platform at any time. Any outstanding invoices
                                        remain due. No refunds will be issued for partial months.
                                    </Text>

                                    <Text fontWeight="bold">5. Data & Privacy</Text>
                                    <Text>
                                        Your customer data belongs to you. We will not share, sell, or use your customer
                                        data for any purpose other than operating this platform on your behalf.
                                    </Text>
                                </VStack>
                            </CardBody>
                        </Card>

                        <Divider />

                        <FormControl isRequired>
                            <FormLabel fontWeight="bold">Electronic Signature</FormLabel>
                            <Text fontSize="sm" color="gray.600" mb={2}>
                                Type your full legal name below to sign this agreement.
                            </Text>
                            <Input
                                placeholder="Your full name (e.g. John Smith)"
                                value={signatureName}
                                onChange={e => setSignatureName(e.target.value)}
                                fontStyle="italic"
                                fontSize="lg"
                            />
                        </FormControl>

                        <Text fontSize="xs" color="gray.500">Date: {signatureDate}</Text>

                        <Checkbox
                            isChecked={agreementSigned}
                            onChange={e => setAgreementSigned(e.target.checked)}
                            colorScheme="blue"
                            size="lg"
                        >
                            <Text fontSize="sm">
                                I agree to the Platform Service Agreement terms above. I understand that a $149/month
                                fee applies when my monthly revenue exceeds $2,999.
                            </Text>
                        </Checkbox>
                    </VStack>
                )}

                {/* Step 7: Review */}
                {activeStep === 6 && (
                    <VStack spacing={4} align="stretch">
                        <Heading size="md">Review & Launch</Heading>

                        <Card variant="outline">
                            <CardBody>
                                <SimpleGrid columns={2} spacing={2}>
                                    <Text fontWeight="bold">Business:</Text><Text>{businessInfo.laundryName}</Text>
                                    <Text fontWeight="bold">Address:</Text><Text>{businessInfo.street}, {businessInfo.city}, {businessInfo.state} {businessInfo.zipCode}</Text>
                                    <Text fontWeight="bold">Timezone:</Text><Text>{businessInfo.timezone}</Text>
                                    <Text fontWeight="bold">Owner:</Text><Text>{businessInfo.ownerFirstName} {businessInfo.ownerLastName}</Text>
                                    <Text fontWeight="bold">Phone:</Text><Text>{businessInfo.ownerPhone}</Text>
                                    <Text fontWeight="bold">Theme:</Text><Text><Badge colorScheme={themeColor}>{themeColor}</Badge></Text>
                                    <Text fontWeight="bold">Logo:</Text><Text>{logoBase64 ? '✅ Uploaded' : '📦 Default'}</Text>
                                    <Text fontWeight="bold">Domain:</Text><Text>{customDomain || 'Platform URL'}</Text>
                                    <Text fontWeight="bold">Tagline:</Text><Text>{tagline || '—'}</Text>
                                    <Text fontWeight="bold">Services:</Text><Text>{services.filter(s => s.serviceName).length} configured</Text>
                                    <Text fontWeight="bold">Schedule:</Text><Text>{schedule.filter(s => s.enabled).length} days/week</Text>
                                    <Text fontWeight="bold">Stripe:</Text><Text>{stripePublicKey ? '✅ Connected' : '⏳ Skip for now'}</Text>
                                    <Text fontWeight="bold">Agreement:</Text><Text>{agreementSigned ? '✅ Signed' : '❌ Not signed'}</Text>
                                </SimpleGrid>
                            </CardBody>
                        </Card>

                        <Button colorScheme="green" size="lg" onClick={handleSubmit} isLoading={isSubmitting} loadingText="Creating your laundry...">
                            🚀 Launch My Laundry
                        </Button>
                    </VStack>
                )}

                {/* Navigation */}
                {activeStep < 7 && (
                    <HStack justify="space-between" pt={4}>
                        <Button variant="ghost" onClick={() => setActiveStep(Math.max(0, activeStep - 1))} isDisabled={activeStep === 0}>
                            Back
                        </Button>
                        {activeStep < 6 && (
                            <Button colorScheme="blue" onClick={() => setActiveStep(activeStep + 1)} isDisabled={!canProceed()}>
                                Next
                            </Button>
                        )}
                    </HStack>
                )}
            </VStack>
        </Container>
    );
};

export default OnboardingPage;
