/**
 * DemoCustomerLogin — auto-logs in the demo customer and redirects to My Orders.
 * Mounts, calls the demo endpoint, stores auth, and navigates.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Spinner, Text } from '@chakra-ui/react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export default function DemoCustomerLogin() {
    const navigate = useNavigate();
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;

        async function loginDemo() {
            try {
                const response = await axios.post(`${API_URL}/api/demo/customer-login`);
                if (cancelled) return;

                const data = response.data;
                if (data.status === 'success') {
                    // Store auth in the same format the customer app expects
                    localStorage.setItem('customerAuth', JSON.stringify(data));
                    localStorage.setItem('idToken', data.accessToken);
                    axios.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;

                    // Redirect to the demo customer's orders page
                    navigate('/999/user/my-orders', { replace: true });
                } else {
                    setError('Demo login failed. Please try again.');
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.response?.data?.detail || 'Demo login failed. Please try again.');
                }
            }
        }

        loginDemo();
        return () => { cancelled = true; };
    }, [navigate]);

    if (error) {
        return (
            <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minH="100vh" p={4}>
                <Text color="red.500" fontSize="lg">{error}</Text>
            </Box>
        );
    }

    return (
        <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minH="100vh">
            <Spinner size="xl" thickness="4px" speed="0.65s" color="blue.500" />
            <Text mt={4} fontSize="lg" color="gray.600">Setting up your demo experience...</Text>
        </Box>
    );
}
