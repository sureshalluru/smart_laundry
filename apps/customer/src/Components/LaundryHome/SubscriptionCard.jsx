import React, { useState, useEffect } from 'react';
import {
    Box, Flex, Text, Badge, Button, VStack, HStack,
    Spinner, useToast, useDisclosure,
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
    Input,
} from '@chakra-ui/react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_AWS_API_URL;

const SubscriptionCard = ({ customerId, laundryId }) => {
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [newDate, setNewDate] = useState('');
    const toast = useToast();
    const { isOpen, onOpen, onClose } = useDisclosure();

    useEffect(() => {
        fetchSubscription();
    }, [customerId, laundryId]);

    const fetchSubscription = async () => {
        try {
            const token = localStorage.getItem('idToken');
            const res = await axios.get(`${API_URL}/api/frequency/active`, {
                params: { laundryId },
                headers: { Authorization: `Bearer ${token}` },
            });
            const frequencies = res.data?.body?.data || [];
            const mine = frequencies.find(f => f.customerId === customerId);
            setSubscription(mine || null);
        } catch {
            setSubscription(null);
        } finally {
            setLoading(false);
        }
    };

    const doAction = async (action, extraBody = {}) => {
        if (!subscription) return;
        setActionLoading(true);
        try {
            const token = localStorage.getItem('idToken');
            await axios.post(`${API_URL}/api/frequency/subscription/${action}`, {
                frequencyId: subscription.frequencyId,
                ...extraBody,
            }, { headers: { Authorization: `Bearer ${token}` } });
            toast({ title: 'Done!', status: 'success', duration: 2000 });
            fetchSubscription();
        } catch (err) {
            toast({ title: err.response?.data?.message || 'Failed', status: 'error', duration: 3000 });
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return <Flex justify="center" py={3}><Spinner size="sm" /></Flex>;
    if (!subscription) return null;

    const isPaused = subscription.isPaused || false;

    return (
        <Box borderWidth="1px" borderRadius="lg" p={4} mb={4} bg="white" shadow="sm">
            <Flex justify="space-between" align="center" mb={2}>
                <HStack>
                    <Text fontWeight="bold" textTransform="capitalize">{subscription.frequency} Subscription</Text>
                    <Badge colorScheme={isPaused ? 'purple' : 'green'}>{isPaused ? 'Paused' : 'Active'}</Badge>
                </HStack>
            </Flex>

            <Text fontSize="sm" color="gray.600" mb={1}>Next Pickup</Text>
            <Text fontWeight="bold" fontSize="lg" mb={3}>{subscription.futurePickupDate || '—'}</Text>

            <HStack spacing={2} wrap="wrap">
                {isPaused ? (
                    <Button size="sm" colorScheme="green" onClick={() => doAction('resume')} isLoading={actionLoading}>
                        Resume
                    </Button>
                ) : (
                    <>
                        <Button size="sm" colorScheme="purple" variant="outline" onClick={() => doAction('pause')} isLoading={actionLoading}>
                            Pause
                        </Button>
                        <Button size="sm" colorScheme="orange" variant="outline" onClick={() => doAction('skip')} isLoading={actionLoading}>
                            Skip Next
                        </Button>
                        <Button size="sm" colorScheme="blue" variant="outline" onClick={onOpen}>
                            Change Date
                        </Button>
                    </>
                )}
            </HStack>

            {/* Change Date Modal */}
            <Modal isOpen={isOpen} onClose={onClose} isCentered>
                <ModalOverlay />
                <ModalContent mx={4}>
                    <ModalHeader>Change Pickup Date</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <Text fontSize="sm" mb={2} color="gray.600">Select a new date for your next pickup:</Text>
                        <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" mr={3} onClick={onClose}>Cancel</Button>
                        <Button
                            colorScheme="blue"
                            isLoading={actionLoading}
                            isDisabled={!newDate}
                            onClick={() => { doAction('change-date', { newDate }); onClose(); }}
                        >
                            Confirm
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Box>
    );
};

export default SubscriptionCard;
