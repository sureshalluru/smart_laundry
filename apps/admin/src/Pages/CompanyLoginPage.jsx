import React, { useState } from 'react';
import {
    Box, Heading, Text, Button, Center, VStack,
    useColorModeValue, Alert, AlertIcon, Input, FormControl, FormLabel,
    Icon, Flex,
} from '@chakra-ui/react';
import { FiUsers } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useCompanyAuth } from '../Context/CompanyAuthContext';

export default function CompanyLoginPage() {
    const navigate = useNavigate();
    const { companyLogin } = useCompanyAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const result = await companyLogin(email, password);
            const companyId = result.user?.company_id;
            if (companyId) {
                navigate(`/company/${companyId}/dashboard`);
            }
        } catch (err) {
            const detail = err.response?.data?.detail || err.response?.data?.message || err.message || 'Invalid credentials';
            setError(detail);
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
                            <Box bg="purple.50" p={4} borderRadius="full">
                                <Icon as={FiUsers} boxSize={8} color="purple.500" />
                            </Box>
                        </Flex>

                        <Heading as="h1" size="xl" color="purple.600">
                            Company Admin
                        </Heading>

                        <Text fontSize="sm" color="gray.500">
                            Sign in to manage all your laundry locations from one dashboard.
                        </Text>

                        {error && (
                            <Alert status="error" borderRadius="md">
                                <AlertIcon />
                                {error}
                            </Alert>
                        )}

                        <FormControl isRequired>
                            <FormLabel>Email</FormLabel>
                            <Input
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                size="lg"
                            />
                        </FormControl>

                        <FormControl isRequired>
                            <FormLabel>Password</FormLabel>
                            <Input
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                size="lg"
                            />
                        </FormControl>

                        <Button
                            type="submit" size="lg" colorScheme="purple"
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
