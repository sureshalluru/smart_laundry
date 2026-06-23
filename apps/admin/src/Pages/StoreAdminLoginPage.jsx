import React, { useState, useEffect } from 'react';
import {
    Box, Heading, Text, Button, Center, VStack, Image,
    useColorModeValue, Alert, AlertIcon, Flex, Input, FormControl, FormLabel,
    Icon, HStack,
} from '@chakra-ui/react';
import { FiShield, FiMonitor } from 'react-icons/fi';
import { useAuth } from '../Context/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getUserRole } from '../utils/permissions';

// Generate a stable device fingerprint (persists in localStorage)
function getDeviceFingerprint() {
    let fp = localStorage.getItem('deviceFingerprint');
    if (!fp) {
        const nav = window.navigator;
        const screen = window.screen;
        const raw = [
            nav.userAgent,
            nav.language,
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            nav.hardwareConcurrency || '',
            Math.random().toString(36).substr(2, 8),
        ].join('|');
        // Simple hash
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            const char = raw.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        fp = 'dev-' + Math.abs(hash).toString(36) + '-' + Date.now().toString(36);
        localStorage.setItem('deviceFingerprint', fp);
    }
    return fp;
}

export default function StoreAdminLoginPage() {
    const auth = useAuth();
    const navigate = useNavigate();
    const [employeeId, setEmployeeId] = useState('');
    const [passcode, setPasscode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Device registration state
    const [showDeviceRegistration, setShowDeviceRegistration] = useState(false);
    const [registrationCode, setRegistrationCode] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [deviceRegistered, setDeviceRegistered] = useState(false);
    const [checkingDevice, setCheckingDevice] = useState(true);

    const deviceFingerprint = getDeviceFingerprint();

    // Extract laundryId from URL path (e.g., /2/admin -> "2")
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const urlLaundryId = pathParts.length > 0 && pathParts[1] === 'admin' ? pathParts[0] : null;

    useEffect(() => {
        // On mount, just mark checking as done (we'll verify on login)
        setCheckingDevice(false);
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const data = await auth.login({
                type: 'employee',
                employeeId,
                passcode,
                deviceFingerprint,
                laundryId: urlLaundryId,
            });
            // Store role in localStorage for quick access
            const role = getUserRole(); // decodes JWT that was just stored
            localStorage.setItem('empRole', role);

            const laundryId = data.user?.laundryId;
            if (laundryId) {
                // Redirect based on role
                switch (role) {
                    case 'Driver':
                        navigate(`/${laundryId}/driver/home`);
                        break;
                    case 'Employee':
                        navigate(`/${laundryId}/admin/active-orders`);
                        break;
                    case 'Manager':
                        navigate(`/${laundryId}/admin/active-orders`);
                        break;
                    case 'Admin':
                    default:
                        navigate(`/${laundryId}/admin/active-orders`);
                        break;
                }
            } else {
                navigate('/');
            }
        } catch (err) {
            const detail = err.response?.data?.detail || err.message || 'Login failed';
            if (detail.includes('DEVICE_NOT_REGISTERED') || detail.includes('device_not_registered')) {
                setShowDeviceRegistration(true);
                setError(null);
            } else {
                setError(detail);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegisterDevice = async (e) => {
        e.preventDefault();
        setIsRegistering(true);
        setError(null);
        try {
            // We need laundryId — derive from employeeId prefix or just try registration
            // The registration endpoint needs laundryId. Let's look it up from the employee.
            // First, let's try with a simple approach: employee enters code, we try all laundries
            // Better approach: ask for laundry ID or derive from emp prefix
            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/auth/register-device`,
                {
                    employeeId: employeeId,
                    deviceFingerprint,
                    deviceName: navigator.userAgent.substr(0, 100),
                    registrationCode,
                }
            );
            if (response.data.status === 'success') {
                setDeviceRegistered(true);
                setShowDeviceRegistration(false);
                setError(null);
                // Now retry login
                handleLogin(e);
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Invalid registration code');
        } finally {
            setIsRegistering(false);
        }
    };

    const bgColor = useColorModeValue('gray.50', 'gray.800');
    const cardBg = useColorModeValue('white', 'gray.700');
    const borderColor = useColorModeValue('gray.200', 'gray.600');

    return (
        <Center minH="100vh" bg={bgColor} p={4}>
            <Box
                p={8} maxW="md" w="full"
                borderWidth={1} borderColor={borderColor}
                borderRadius="2xl" boxShadow="xl" bg={cardBg}
            >
                {showDeviceRegistration ? (
                    // Device Registration Form
                    <form onSubmit={handleRegisterDevice}>
                        <VStack spacing={6} align="stretch" textAlign="center">
                            <Flex justify="center">
                                <Box bg="orange.50" p={4} borderRadius="full">
                                    <Icon as={FiMonitor} boxSize={8} color="orange.500" />
                                </Box>
                            </Flex>

                            <Heading as="h2" size="lg" color="orange.600">
                                New Device Detected
                            </Heading>

                            <Text fontSize="sm" color="gray.500">
                                This device hasn't been registered yet. Enter the registration code
                                provided by your administrator to authorize this device.
                            </Text>

                            {error && (
                                <Alert status="error" borderRadius="md">
                                    <AlertIcon />
                                    {error}
                                </Alert>
                            )}

                            <FormControl isRequired>
                                <FormLabel>Registration Code</FormLabel>
                                <Input
                                    placeholder="Enter device registration code"
                                    value={registrationCode}
                                    onChange={(e) => setRegistrationCode(e.target.value)}
                                    size="lg"
                                    textTransform="uppercase"
                                />
                            </FormControl>

                            <Button
                                type="submit" size="lg" colorScheme="orange"
                                isLoading={isRegistering} loadingText="Registering..."
                            >
                                Register Device
                            </Button>

                            <Button
                                variant="ghost" size="sm"
                                onClick={() => { setShowDeviceRegistration(false); setError(null); }}
                            >
                                ← Back to Login
                            </Button>
                        </VStack>
                    </form>
                ) : (
                    // Normal Login Form
                    <form onSubmit={handleLogin}>
                        <VStack spacing={6} align="stretch" textAlign="center">
                            <Flex justify="center">
                                <Image
                                    src="/admin/logo.png"
                                    alt="Smart Laundry Logo"
                                    boxSize="80px" objectFit="contain"
                                    fallback={<Box boxSize="80px" bg="blue.50" borderRadius="full" display="flex" alignItems="center" justifyContent="center"><Icon as={FiShield} boxSize={8} color="blue.500" /></Box>}
                                />
                            </Flex>

                            <Heading as="h1" size="xl" color="blue.600">
                                Smart Laundry Basket
                            </Heading>

                            <Text fontSize="sm" color="gray.500">
                                Sign in to manage orders, employees, and operations.
                            </Text>

                            {error && (
                                <Alert status="error" borderRadius="md">
                                    <AlertIcon />
                                    {error}
                                </Alert>
                            )}

                            <FormControl isRequired>
                                <FormLabel>Employee ID</FormLabel>
                                <Input
                                    placeholder="Enter your employee ID"
                                    value={employeeId}
                                    onChange={(e) => setEmployeeId(e.target.value)}
                                    size="lg"
                                />
                            </FormControl>

                            <FormControl isRequired>
                                <FormLabel>Passcode</FormLabel>
                                <Input
                                    type="password"
                                    placeholder="Enter your passcode"
                                    value={passcode}
                                    onChange={(e) => setPasscode(e.target.value)}
                                    size="lg"
                                />
                            </FormControl>

                            <Button
                                type="submit" size="lg" colorScheme="blue"
                                isLoading={isLoading} loadingText="Signing in..."
                            >
                                Sign In
                            </Button>

                            <HStack justify="center" spacing={1}>
                                <Icon as={FiShield} color="green.400" boxSize={3} />
                                <Text fontSize="xs" color="gray.400">
                                    Protected by device verification
                                </Text>
                            </HStack>
                        </VStack>
                    </form>
                )}
            </Box>
        </Center>
    );
}
