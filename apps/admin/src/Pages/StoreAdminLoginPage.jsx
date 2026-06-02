import React, { useState } from 'react';
import {
    Box, Heading, Text, Button, Center, VStack, Image,
    useColorModeValue, Alert, AlertIcon, Flex, Input, FormControl, FormLabel
} from '@chakra-ui/react';
import { useAuth } from '../Context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function StoreAdminLoginPage() {
    const auth = useAuth();
    const navigate = useNavigate();
    const [employeeId, setEmployeeId] = useState('');
    const [passcode, setPasscode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const data = await auth.login({
                type: 'employee',
                employeeId,
                passcode,
            });
            // Redirect to the employee's laundry admin page
            const laundryId = data.user?.laundryId;
            if (laundryId) {
                navigate(`/${laundryId}/admin/active-orders`);
            } else {
                navigate('/');
            }
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Login failed');
        } finally {
            setIsLoading(false);
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
                <form onSubmit={handleLogin}>
                    <VStack spacing={6} align="stretch" textAlign="center">
                        <Flex justify="center">
                            <Image
                                src="/admin/logo.png"
                                alt="Smart Laundry Logo"
                                boxSize="80px" objectFit="contain"
                                fallback={<Box boxSize="80px" bg="gray.200" borderRadius="full" />}
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
                    </VStack>
                </form>
            </Box>
        </Center>
    );
}
