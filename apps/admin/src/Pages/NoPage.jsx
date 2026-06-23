import React from 'react';
import {
    Box,
    Heading,
    Text,
    Button,
    VStack,
    useToast,
    Flex,
    Icon
} from '@chakra-ui/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../Context/AuthContext';
import { FaHome, FaSignOutAlt, FaExclamationTriangle } from 'react-icons/fa';

const NoPage = () => {
    const navigate = useNavigate();
    const { laundryId } = useParams();
    const auth = useAuth();
    const toast = useToast();

    // If there's a stale/invalid token, clear it and redirect to login
    // But if there's NO token at all, don't redirect (the auth flow will show login)
    React.useEffect(() => {
        const token = localStorage.getItem('idToken');
        if (token && !auth.isAuthenticated) {
            // Stale token — clear and redirect to same laundry's login
            localStorage.removeItem('idToken');
            localStorage.removeItem('empRole');
            const pathParts = window.location.pathname.split('/').filter(Boolean);
            const currentLaundryId = pathParts.length > 0 && !isNaN(pathParts[0]) ? pathParts[0] : null;
            window.location.href = currentLaundryId ? `/${currentLaundryId}/admin` : '/slb';
        }
    }, []);

    const handleGoToHome = () => {
        if (laundryId) {
            navigate(`/${laundryId}/admin`);
        } else {
            const userLaundryId = auth.user?.profile?.['custom:laundryId'];
            if (userLaundryId) {
                navigate(`/${userLaundryId}/admin`);
            } else {
                toast({
                    title: "Cannot determine your laundry",
                    description: "Please sign out and try again",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
            }
        }
    };

    const signOutRedirect = () => {
        auth.logout();
        localStorage.removeItem('idToken');
        // Stay on the same laundry's login page
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        const currentLaundryId = pathParts.length > 0 && !isNaN(pathParts[0]) ? pathParts[0] : null;
        window.location.href = currentLaundryId ? `/${currentLaundryId}/admin` : '/slb';
    };

    return (
        <Flex
            minH="100vh"
            align="center"
            justify="center"
            bg="gray.50"
            px={4}
        >
            <Box
                textAlign="center"
                p={8}
                bg="white"
                borderRadius="lg"
                boxShadow="md"
                maxW="md"
                w="full"
            >
                <VStack spacing={6}>
                    <Icon as={FaExclamationTriangle} w={12} h={12} color="red.500" />
                    <Heading as="h1" size="xl" color="gray.800">
                        Page Not Found
                    </Heading>
                    <Text fontSize="lg" color="gray.600">
                        The page you're looking for doesn't exist or you don't have access to it.
                    </Text>

                    <VStack spacing={4} w="full" mt={6}>
                        {auth.isAuthenticated && (laundryId || auth.user?.profile?.['custom:laundryId']) ? (
                            <Button
                                leftIcon={<FaHome />}
                                colorScheme="blue"
                                onClick={handleGoToHome}
                                w="full"
                                size="lg"
                            >
                                Go to My Dashboard
                            </Button>
                        ) : null}

                        {auth.isAuthenticated && (
                            <Button
                                leftIcon={<FaSignOutAlt />}
                                variant="outline"
                                colorScheme="red"
                                onClick={signOutRedirect}
                                w="full"
                                size="lg"
                            >
                                Sign Out
                            </Button>
                        )}
                    </VStack>

                    {process.env.NODE_ENV === 'development' && (
                        <Box mt={4} p={3} bg="gray.100" borderRadius="md">
                            <Text fontSize="sm" color="gray.700">
                                Current path: {window.location.pathname}
                            </Text>
                            {laundryId && (
                                <Text fontSize="sm" color="gray.700">
                                    Laundry ID in URL: {laundryId}
                                </Text>
                            )}
                            {auth.user?.profile?.['custom:laundryId'] && (
                                <Text fontSize="sm" color="gray.700">
                                    Your laundry ID: {auth.user.profile['custom:laundryId']}
                                </Text>
                            )}
                            <Text fontSize="sm" color="gray.700">
                                Auth Status: {auth.isAuthenticated ? "Authenticated" : "Not Authenticated"}
                            </Text>
                        </Box>
                    )}
                </VStack>
            </Box>
        </Flex>
    );
};

export default NoPage;