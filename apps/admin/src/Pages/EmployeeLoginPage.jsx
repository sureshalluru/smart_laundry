import React, { useState } from 'react';
import {
  Box,
  Button,
  Center,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Text,
  VStack,
  useColorModeValue,
  useToast,
  Icon,
} from '@chakra-ui/react';
import { FiUser } from 'react-icons/fi';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useEmployeeAuth } from '../Context/EmployeeAuthContext';

export default function EmployeeLoginPage() {
  const { laundryId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useEmployeeAuth();
  const toast = useToast();

  const [empId, setEmpId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const returnUrl = searchParams.get('returnUrl') || `/${laundryId}/admin/active-orders`;

  const bgColor = useColorModeValue('gray.50', 'gray.800');
  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!empId || !passcode) {
      toast({
        title: 'Missing Fields',
        description: 'Please enter both Employee ID and Passcode.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    if (passcode.length !== 4 || !/^\d{4}$/.test(passcode)) {
      toast({
        title: 'Invalid Passcode',
        description: 'Passcode must be exactly 4 digits.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    setIsLoading(true);
    try {
      await login(laundryId, empId, passcode);
      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
        status: 'success',
        duration: 2000,
        isClosable: true,
        position: 'top',
      });
      navigate(returnUrl, { replace: true });
    } catch (err) {
      const message = err.message || 'Invalid credentials. Please try again.';
      toast({
        title: 'Login Failed',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      // Clear passcode on failure, allow retry
      setPasscode('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Center minH="100vh" bg={bgColor} p={4}>
      <Box
        p={8}
        maxW="sm"
        w="full"
        borderWidth={1}
        borderColor={borderColor}
        borderRadius="2xl"
        boxShadow="xl"
        bg={cardBg}
      >
        <form onSubmit={handleSubmit}>
          <VStack spacing={6} align="stretch" textAlign="center">
            <Center>
              <Box bg="blue.50" p={4} borderRadius="full">
                <Icon as={FiUser} boxSize={8} color="blue.500" />
              </Box>
            </Center>

            <Heading as="h1" size="lg" color="blue.600">
              Employee Login
            </Heading>

            <Text fontSize="sm" color="gray.500">
              Enter your credentials to access order management.
            </Text>

            <FormControl isRequired>
              <FormLabel>Employee ID</FormLabel>
              <Input
                placeholder="Enter your employee ID"
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                size="lg"
                autoComplete="username"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Passcode</FormLabel>
              <Input
                type="password"
                placeholder="4-digit passcode"
                value={passcode}
                onChange={(e) => {
                  // Only allow digits, max 4
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPasscode(val);
                }}
                maxLength={4}
                inputMode="numeric"
                pattern="\d{4}"
                size="lg"
                autoComplete="current-password"
              />
            </FormControl>

            <Button
              type="submit"
              size="lg"
              colorScheme="blue"
              isLoading={isLoading}
              loadingText="Signing in..."
              minH="44px"
            >
              Sign In
            </Button>
          </VStack>
        </form>
      </Box>
    </Center>
  );
}
