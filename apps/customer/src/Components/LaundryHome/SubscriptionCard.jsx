import React, { useState, useEffect } from 'react';
import {
    Box,
    Flex,
    Text,
    Badge,
    Button,
    VStack,
    HStack,
    Spinner,
    useToast,
    useDisclosure,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    ModalCloseButton,
    AlertDialog,
    AlertDialogBody,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogOverlay,
    Select,
    Tooltip,
    Divider,
} from '@chakra-ui/react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_AWS_API_URL;

// ─── RescheduleModal ───

const RescheduleModal = ({ isOpen, onClose, subscription, onSuccess }) => {
    const [selectedDate, setSelectedDate] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();

    const getDateOptions = () => {
        if (!subscription?.nextPickupDate) return [];
        const baseDate = new Date(subscription.nextPickupDate + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const options = [];

        for (let offset = -3; offset <= 3; offset++) {
            if (offset === 0) continue; // Skip current date
            const d = new Date(baseDate);
            d.setDate(d.getDate() + offset);
            // Only include future dates
            if (d > today) {
                options.push({
                    date: d.toISOString().split('T')[0],
                    label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                    offset: offset > 0 ? `+${offset}` : `${offset}`,
                });
            }
        }
        return options;
    };

    const handleConfirm = async () => {
        if (!selectedDate) {
            toast({ title: 'Please select a date', status: 'warning', duration: 2000 });
            return;
        }
        setIsLoading(true);
        try {
            const token = localStorage.getItem('idToken');
            await axios.post(`${API_URL}/api/frequency/subscription/reschedule`, {
                frequencyId: subscription.frequencyId,
                customerId: subscription.customerId,
                targetDate: selectedDate,
            }, { headers: { Authorization: `Bearer ${token}` } });

            toast({ title: 'Rescheduled!', status: 'success', duration: 3000 });
            onSuccess();
            onClose();
        } catch (err) {
            const detail = err.response?.data?.detail;
            toast({
                title: 'Reschedule failed',
                description: detail?.message || 'Please try again.',
                status: 'error',
                duration: 4000,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const dateOptions = getDateOptions();

    return (
        <Modal isOpen={isOpen} onClose={onClose} isCentered>
            <ModalOverlay />
            <ModalContent mx={4}>
                <ModalHeader>Reschedule Pickup</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    <Text mb={3} fontSize="sm" color="gray.600">
                        Move your next pickup within ±3 days of the scheduled date.
                    </Text>
                    <VStack spacing={2} align="stretch">
                        {dateOptions.map((opt) => (
                            <Button
                                key={opt.date}
                                variant={selectedDate === opt.date ? 'solid' : 'outline'}
                                colorScheme={selectedDate === opt.date ? 'blue' : 'gray'}
                                size="sm"
                                onClick={() => setSelectedDate(opt.date)}
                                justifyContent="space-between"
                            >
                                <Text>{opt.label}</Text>
                                <Badge ml={2} colorScheme="gray">{opt.offset} day{Math.abs(parseInt(opt.offset)) > 1 ? 's' : ''}</Badge>
                            </Button>
                        ))}
                    </VStack>
                </ModalBody>
                <ModalFooter>
                    <Button variant="ghost" mr={3} onClick={onClose}>Cancel</Button>
                    <Button
                        colorScheme="blue"
                        onClick={handleConfirm}
                        isLoading={isLoading}
                        isDisabled={!selectedDate}
                    >
                        Confirm
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

// ─── SkipConfirmDialog ───

const SkipConfirmDialog = ({ isOpen, onClose, subscription, onSuccess }) => {
    const [reason, setReason] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();
    const cancelRef = React.useRef();

    const reasons = ['Vacation', 'No laundry', 'Out of town', 'Other'];

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('idToken');
            await axios.post(`${API_URL}/api/frequency/subscription/skip`, {
                frequencyId: subscription.frequencyId,
                customerId: subscription.customerId,
                reason: reason || undefined,
            }, { headers: { Authorization: `Bearer ${token}` } });

            toast({ title: 'Skipped!', status: 'success', duration: 3000 });
            onSuccess();
            onClose();
        } catch (err) {
            const detail = err.response?.data?.detail;
            toast({
                title: 'Skip failed',
                description: detail?.message || 'Please try again.',
                status: 'error',
                duration: 4000,
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Calculate next date after skip for display
    const getNextAfterSkip = () => {
        if (!subscription?.nextPickupDate || !subscription?.frequency) return '';
        const base = new Date(subscription.nextPickupDate + 'T00:00:00');
        const freq = subscription.frequency.toLowerCase().replace(/[-\s]/g, '');
        let days = 14;
        if (freq === 'weekly') days = 7;
        else if (freq === 'monthly') days = 30;
        base.setDate(base.getDate() + days);
        return base.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    return (
        <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose} isCentered>
            <AlertDialogOverlay>
                <AlertDialogContent mx={4}>
                    <AlertDialogHeader>Skip This Pickup?</AlertDialogHeader>
                    <AlertDialogBody>
                        <Text mb={3}>
                            Your next pickup after skipping will be <strong>{getNextAfterSkip()}</strong>.
                        </Text>
                        <Select
                            placeholder="Reason (optional)"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            size="sm"
                        >
                            {reasons.map((r) => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </Select>
                    </AlertDialogBody>
                    <AlertDialogFooter>
                        <Button ref={cancelRef} onClick={onClose}>Cancel</Button>
                        <Button colorScheme="orange" onClick={handleConfirm} isLoading={isLoading} ml={3}>
                            Skip
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialogOverlay>
        </AlertDialog>
    );
};

// ─── PauseModal ───

const PauseModal = ({ isOpen, onClose, subscription, onSuccess }) => {
    const [weeks, setWeeks] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();

    const getResumeDate = (w) => {
        const d = new Date();
        d.setDate(d.getDate() + w * 7);
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('idToken');
            await axios.post(`${API_URL}/api/frequency/subscription/pause`, {
                frequencyId: subscription.frequencyId,
                customerId: subscription.customerId,
                weeks: weeks,
            }, { headers: { Authorization: `Bearer ${token}` } });

            toast({ title: `Paused for ${weeks} week${weeks > 1 ? 's' : ''}!`, status: 'success', duration: 3000 });
            onSuccess();
            onClose();
        } catch (err) {
            const detail = err.response?.data?.detail;
            toast({
                title: 'Pause failed',
                description: detail?.message || 'Please try again.',
                status: 'error',
                duration: 4000,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} isCentered>
            <ModalOverlay />
            <ModalContent mx={4}>
                <ModalHeader>Pause Subscription</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    <Text mb={3} fontSize="sm" color="gray.600">
                        Choose how long to pause. You can resume early anytime.
                    </Text>
                    <VStack spacing={2} align="stretch">
                        {[1, 2, 3, 4].map((w) => (
                            <Button
                                key={w}
                                variant={weeks === w ? 'solid' : 'outline'}
                                colorScheme={weeks === w ? 'purple' : 'gray'}
                                size="sm"
                                onClick={() => setWeeks(w)}
                                justifyContent="space-between"
                            >
                                <Text>{w} week{w > 1 ? 's' : ''}</Text>
                                <Text fontSize="xs" color={weeks === w ? 'white' : 'gray.500'}>
                                    Resume {getResumeDate(w)}
                                </Text>
                            </Button>
                        ))}
                    </VStack>
                </ModalBody>
                <ModalFooter>
                    <Button variant="ghost" mr={3} onClick={onClose}>Cancel</Button>
                    <Button colorScheme="purple" onClick={handleConfirm} isLoading={isLoading}>
                        Pause
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};


// ─── Main SubscriptionCard Component ───

const SubscriptionCard = ({ customerId, laundryId }) => {
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const toast = useToast();

    const {
        isOpen: isRescheduleOpen,
        onOpen: onRescheduleOpen,
        onClose: onRescheduleClose,
    } = useDisclosure();
    const {
        isOpen: isSkipOpen,
        onOpen: onSkipOpen,
        onClose: onSkipClose,
    } = useDisclosure();
    const {
        isOpen: isPauseOpen,
        onOpen: onPauseOpen,
        onClose: onPauseClose,
    } = useDisclosure();

    const fetchDetails = async () => {
        try {
            const token = localStorage.getItem('idToken');
            const response = await axios.get(`${API_URL}/api/frequency/subscription/details`, {
                params: { frequencyId: subscription?.frequencyId || '', customerId },
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.data?.status === 'success') {
                setSubscription({ ...response.data.data, customerId });
            } else {
                setSubscription(null);
            }
        } catch {
            setSubscription(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchInitial = async () => {
        try {
            const token = localStorage.getItem('idToken');
            // First get active frequency for this customer
            const freqResponse = await axios.get(`${API_URL}/api/frequency/active`, {
                params: { laundryId },
                headers: { Authorization: `Bearer ${token}` },
            });
            const frequencies = freqResponse.data?.body?.data || [];
            const myFreq = frequencies.find(f => f.customerId === customerId);
            if (!myFreq) {
                setSubscription(null);
                setLoading(false);
                return;
            }

            // Now get details
            const detailsResponse = await axios.get(`${API_URL}/api/frequency/subscription/details`, {
                params: { frequencyId: myFreq.frequencyId, customerId },
                headers: { Authorization: `Bearer ${token}` },
            });
            if (detailsResponse.data?.status === 'success') {
                setSubscription({ ...detailsResponse.data.data, customerId });
            } else {
                setSubscription(null);
            }
        } catch {
            setSubscription(null);
        } finally {
            setLoading(false);
        }
    };

    const refreshDetails = async () => {
        if (!subscription?.frequencyId) return;
        try {
            const token = localStorage.getItem('idToken');
            const response = await axios.get(`${API_URL}/api/frequency/subscription/details`, {
                params: { frequencyId: subscription.frequencyId, customerId },
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.data?.status === 'success') {
                setSubscription({ ...response.data.data, customerId });
            }
        } catch {
            // Silent refresh failure
        }
    };

    const handleUndoReschedule = async () => {
        if (!subscription) return;
        setActionLoading(true);
        try {
            const token = localStorage.getItem('idToken');
            await axios.post(`${API_URL}/api/frequency/subscription/undo-reschedule`, {
                frequencyId: subscription.frequencyId,
                customerId: subscription.customerId,
            }, { headers: { Authorization: `Bearer ${token}` } });

            toast({ title: 'Reverted to original date', status: 'success', duration: 3000 });
            refreshDetails();
        } catch (err) {
            const detail = err.response?.data?.detail;
            toast({
                title: 'Undo failed',
                description: detail?.message || 'Please try again.',
                status: 'error',
                duration: 4000,
            });
        } finally {
            setActionLoading(false);
        }
    };

    const handleResume = async () => {
        if (!subscription) return;
        setActionLoading(true);
        try {
            const token = localStorage.getItem('idToken');
            await axios.post(`${API_URL}/api/frequency/subscription/resume`, {
                frequencyId: subscription.frequencyId,
                customerId: subscription.customerId,
            }, { headers: { Authorization: `Bearer ${token}` } });

            toast({ title: 'Resumed!', status: 'success', duration: 3000 });
            refreshDetails();
        } catch (err) {
            const detail = err.response?.data?.detail;
            toast({
                title: 'Resume failed',
                description: detail?.message || 'Please try again.',
                status: 'error',
                duration: 4000,
            });
        } finally {
            setActionLoading(false);
        }
    };

    useEffect(() => {
        fetchInitial();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customerId, laundryId]);

    if (loading) {
        return (
            <Flex justify="center" py={4}>
                <Spinner size="sm" />
            </Flex>
        );
    }

    if (!subscription) return null;

    const { status, frequency, nextPickupDate, originalPickupDate, isRescheduled, isPaused,
        pauseResumeDate, pickupTimeInterval, isWithinCutoff, consecutiveSkips, upcomingDates } = subscription;

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const getStatusBadge = () => {
        switch (status) {
            case 'paused':
                return <Badge colorScheme="purple">Paused</Badge>;
            case 'rescheduled':
                return <Badge colorScheme="blue">Rescheduled</Badge>;
            default:
                return <Badge colorScheme="green">Active</Badge>;
        }
    };

    const actionsDisabled = isWithinCutoff || actionLoading;

    return (
        <Box
            borderWidth="1px"
            borderRadius="lg"
            p={4}
            mb={4}
            bg="white"
            shadow="sm"
        >
            {/* Header */}
            <Flex justify="space-between" align="center" mb={3}>
                <HStack spacing={2}>
                    <Text fontWeight="bold" fontSize="md" textTransform="capitalize">
                        {frequency} Subscription
                    </Text>
                    {getStatusBadge()}
                </HStack>
                {consecutiveSkips >= 2 && (
                    <Badge colorScheme="red" fontSize="xs">{consecutiveSkips} skips</Badge>
                )}
            </Flex>

            {/* Next Pickup / Status Info */}
            {isPaused ? (
                <Box mb={3}>
                    <Text fontSize="sm" color="gray.600">Paused until</Text>
                    <Text fontWeight="bold" fontSize="lg">{formatDate(pauseResumeDate)}</Text>
                </Box>
            ) : (
                <Box mb={3}>
                    <Text fontSize="sm" color="gray.600">Next pickup</Text>
                    {isRescheduled && originalPickupDate && (
                        <Text fontSize="sm" as="s" color="gray.400">{formatDate(originalPickupDate)}</Text>
                    )}
                    <Text fontWeight="bold" fontSize="lg">{formatDate(nextPickupDate)}</Text>
                    {pickupTimeInterval && (
                        <Text fontSize="xs" color="gray.500">{pickupTimeInterval}</Text>
                    )}
                </Box>
            )}

            {/* Timeline: next 4 dates */}
            {!isPaused && upcomingDates && upcomingDates.length > 0 && (
                <Box mb={3}>
                    <Text fontSize="xs" color="gray.500" mb={1}>Upcoming</Text>
                    <HStack spacing={2} overflowX="auto">
                        {upcomingDates.slice(0, 4).map((d, i) => (
                            <Badge key={i} variant="subtle" colorScheme={i === 0 ? 'blue' : 'gray'} fontSize="xs">
                                {formatDate(d)}
                            </Badge>
                        ))}
                    </HStack>
                </Box>
            )}

            <Divider mb={3} />

            {/* Cutoff Warning */}
            {isWithinCutoff && !isPaused && (
                <Text fontSize="xs" color="orange.500" mb={2}>
                    Changes locked — pickup is being prepared
                </Text>
            )}

            {/* Action Buttons */}
            <Flex wrap="wrap" gap={2}>
                {isPaused ? (
                    <Button
                        size="sm"
                        colorScheme="green"
                        onClick={handleResume}
                        isLoading={actionLoading}
                    >
                        Resume Now
                    </Button>
                ) : isRescheduled ? (
                    <Tooltip label={isWithinCutoff ? 'Changes locked — pickup is being prepared' : ''} isDisabled={!isWithinCutoff}>
                        <Button
                            size="sm"
                            colorScheme="gray"
                            onClick={handleUndoReschedule}
                            isDisabled={actionsDisabled}
                            isLoading={actionLoading}
                        >
                            Undo Reschedule
                        </Button>
                    </Tooltip>
                ) : (
                    <>
                        <Tooltip label={isWithinCutoff ? 'Changes locked — pickup is being prepared' : ''} isDisabled={!isWithinCutoff}>
                            <Button
                                size="sm"
                                colorScheme="blue"
                                variant="outline"
                                onClick={onRescheduleOpen}
                                isDisabled={actionsDisabled}
                            >
                                Reschedule
                            </Button>
                        </Tooltip>
                        <Tooltip label={isWithinCutoff ? 'Changes locked — pickup is being prepared' : ''} isDisabled={!isWithinCutoff}>
                            <Button
                                size="sm"
                                colorScheme="orange"
                                variant="outline"
                                onClick={onSkipOpen}
                                isDisabled={actionsDisabled}
                            >
                                Skip
                            </Button>
                        </Tooltip>
                        <Tooltip label={isWithinCutoff ? 'Changes locked — pickup is being prepared' : ''} isDisabled={!isWithinCutoff}>
                            <Button
                                size="sm"
                                colorScheme="purple"
                                variant="outline"
                                onClick={onPauseOpen}
                                isDisabled={actionsDisabled}
                            >
                                Pause
                            </Button>
                        </Tooltip>
                    </>
                )}
            </Flex>

            {/* Modals */}
            <RescheduleModal
                isOpen={isRescheduleOpen}
                onClose={onRescheduleClose}
                subscription={subscription}
                onSuccess={refreshDetails}
            />
            <SkipConfirmDialog
                isOpen={isSkipOpen}
                onClose={onSkipClose}
                subscription={subscription}
                onSuccess={refreshDetails}
            />
            <PauseModal
                isOpen={isPauseOpen}
                onClose={onPauseClose}
                subscription={subscription}
                onSuccess={refreshDetails}
            />
        </Box>
    );
};

export default SubscriptionCard;
