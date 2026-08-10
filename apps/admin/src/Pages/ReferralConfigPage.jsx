import React, { useState, useEffect } from 'react';
import {
    Box, Container, Heading, Text, VStack, HStack, Button,
    FormControl, FormLabel, Switch, SimpleGrid, Card, CardBody,
    useToast, Spinner, Alert, AlertIcon, NumberInput, NumberInputField,
    NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper,
    InputGroup, InputLeftAddon, Divider
} from '@chakra-ui/react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { getUserRole } from '../utils/permissions';

const ReferralConfigPage = () => {
    const { laundryId } = useParams();
    const toast = useToast();
    const authToken = localStorage.getItem('accessToken') || localStorage.getItem('idToken');
    const role = localStorage.getItem('empRole') || getUserRole();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState({
        isActive: false,
        referrerRewardAmount: 5,
        refereeRewardAmount: 5,
        maxMonthlyReferrals: 10,
        creditExpirationDays: 90,
    });

    const isOwner = role === 'Admin';

    useEffect(() => {
        if (isOwner) {
            fetchConfig();
        } else {
            setLoading(false);
        }
    }, [laundryId]);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/referrals/config`,
                {
                    params: { laundryId },
                    headers: { Authorization: `Bearer ${authToken}` }
                }
            );
            const data = res.data;
            if (data) {
                setConfig({
                    isActive: data.isActive ?? false,
                    referrerRewardAmount: parseFloat(data.referrerRewardAmount) || 5,
                    refereeRewardAmount: parseFloat(data.refereeRewardAmount) || 5,
                    maxMonthlyReferrals: parseInt(data.maxMonthlyReferrals) || 10,
                    creditExpirationDays: parseInt(data.creditExpirationDays) || 90,
                });
            }
        } catch (err) {
            // If 404 or no config exists, show defaults (already set in state)
            if (err.response?.status !== 404) {
                toast({
                    title: 'Error loading config',
                    description: err.message,
                    status: 'error',
                    duration: 3000,
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/referrals/config`,
                {
                    laundryId,
                    isActive: config.isActive,
                    referrerRewardAmount: config.referrerRewardAmount,
                    refereeRewardAmount: config.refereeRewardAmount,
                    maxMonthlyReferrals: config.maxMonthlyReferrals,
                    creditExpirationDays: config.creditExpirationDays,
                },
                {
                    headers: { Authorization: `Bearer ${authToken}` }
                }
            );
            toast({
                title: 'Configuration saved',
                description: 'Referral program settings have been updated.',
                status: 'success',
                duration: 3000,
            });
        } catch (err) {
            toast({
                title: 'Error saving config',
                description: err.response?.data?.detail || err.message,
                status: 'error',
                duration: 3000,
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minH="300px">
                <Spinner size="xl" />
            </Box>
        );
    }

    if (!isOwner) {
        return (
            <Container maxW="container.md" py={8}>
                <Alert status="warning" borderRadius="md">
                    <AlertIcon />
                    <Text>Only owner-role employees can access the Referral Program configuration.</Text>
                </Alert>
            </Container>
        );
    }

    return (
        <Container maxW="container.md" py={6}>
            <VStack spacing={6} align="stretch">
                <Heading size="lg">Referral Program Configuration</Heading>
                <Text color="gray.600">
                    Configure your referral program rewards, limits, and status. Changes apply to all future referral events.
                </Text>

                <Card>
                    <CardBody>
                        <VStack spacing={6} align="stretch">
                            {/* Program Status Toggle */}
                            <FormControl display="flex" alignItems="center" justifyContent="space-between">
                                <FormLabel htmlFor="program-active" mb="0" fontSize="lg" fontWeight="bold">
                                    Program Active
                                </FormLabel>
                                <Switch
                                    id="program-active"
                                    size="lg"
                                    colorScheme="teal"
                                    isChecked={config.isActive}
                                    onChange={(e) => setConfig({ ...config, isActive: e.target.checked })}
                                />
                            </FormControl>

                            <Text fontSize="sm" color={config.isActive ? 'green.600' : 'gray.500'}>
                                {config.isActive
                                    ? 'The referral program is active. Rewards will be distributed for qualifying referrals.'
                                    : 'The referral program is inactive. Referrals will be tracked but no rewards will be issued.'}
                            </Text>

                            <Divider />

                            {/* Reward Amounts */}
                            <Heading size="sm">Reward Amounts</Heading>
                            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                                <FormControl>
                                    <FormLabel>Referrer Reward</FormLabel>
                                    <InputGroup>
                                        <InputLeftAddon>$</InputLeftAddon>
                                        <NumberInput
                                            min={0}
                                            max={100}
                                            precision={2}
                                            value={config.referrerRewardAmount}
                                            onChange={(_, val) => setConfig({ ...config, referrerRewardAmount: val || 0 })}
                                            w="100%"
                                        >
                                            <NumberInputField borderLeftRadius={0} />
                                            <NumberInputStepper>
                                                <NumberIncrementStepper />
                                                <NumberDecrementStepper />
                                            </NumberInputStepper>
                                        </NumberInput>
                                    </InputGroup>
                                    <Text fontSize="xs" color="gray.500" mt={1}>
                                        Amount the referrer earns per successful referral
                                    </Text>
                                </FormControl>

                                <FormControl>
                                    <FormLabel>Referee Reward</FormLabel>
                                    <InputGroup>
                                        <InputLeftAddon>$</InputLeftAddon>
                                        <NumberInput
                                            min={0}
                                            max={100}
                                            precision={2}
                                            value={config.refereeRewardAmount}
                                            onChange={(_, val) => setConfig({ ...config, refereeRewardAmount: val || 0 })}
                                            w="100%"
                                        >
                                            <NumberInputField borderLeftRadius={0} />
                                            <NumberInputStepper>
                                                <NumberIncrementStepper />
                                                <NumberDecrementStepper />
                                            </NumberInputStepper>
                                        </NumberInput>
                                    </InputGroup>
                                    <Text fontSize="xs" color="gray.500" mt={1}>
                                        Amount the new customer earns on sign-up referral
                                    </Text>
                                </FormControl>
                            </SimpleGrid>

                            <Divider />

                            {/* Limits */}
                            <Heading size="sm">Limits & Expiration</Heading>
                            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                                <FormControl>
                                    <FormLabel>Max Monthly Referrals</FormLabel>
                                    <NumberInput
                                        min={1}
                                        max={100}
                                        value={config.maxMonthlyReferrals}
                                        onChange={(_, val) => setConfig({ ...config, maxMonthlyReferrals: val || 1 })}
                                    >
                                        <NumberInputField />
                                        <NumberInputStepper>
                                            <NumberIncrementStepper />
                                            <NumberDecrementStepper />
                                        </NumberInputStepper>
                                    </NumberInput>
                                    <Text fontSize="xs" color="gray.500" mt={1}>
                                        Maximum referral rewards per customer per month
                                    </Text>
                                </FormControl>

                                <FormControl>
                                    <FormLabel>Credit Expiration (days)</FormLabel>
                                    <NumberInput
                                        min={1}
                                        max={365}
                                        value={config.creditExpirationDays}
                                        onChange={(_, val) => setConfig({ ...config, creditExpirationDays: val || 90 })}
                                    >
                                        <NumberInputField />
                                        <NumberInputStepper>
                                            <NumberIncrementStepper />
                                            <NumberDecrementStepper />
                                        </NumberInputStepper>
                                    </NumberInput>
                                    <Text fontSize="xs" color="gray.500" mt={1}>
                                        Days until reward credits expire after issuance
                                    </Text>
                                </FormControl>
                            </SimpleGrid>

                            <Divider />

                            {/* Save Button */}
                            <HStack justify="flex-end">
                                <Button
                                    colorScheme="teal"
                                    size="lg"
                                    onClick={handleSave}
                                    isLoading={saving}
                                    loadingText="Saving..."
                                >
                                    Save Configuration
                                </Button>
                            </HStack>
                        </VStack>
                    </CardBody>
                </Card>
            </VStack>
        </Container>
    );
};

export default ReferralConfigPage;
