import React, { useState, useEffect } from 'react';
import {
    Box, Button, Heading, Text, Textarea, Input, VStack, HStack,
    Badge, Flex, useToast, SimpleGrid, Wrap, WrapItem, Spinner,
    Alert, AlertIcon, AlertDialog, AlertDialogOverlay, AlertDialogContent,
    AlertDialogHeader, AlertDialogBody, AlertDialogFooter,
    useDisclosure, FormControl, FormLabel, FormHelperText,
} from '@chakra-ui/react';
import { FiSend, FiUsers, FiRefreshCw } from 'react-icons/fi';
import axios from 'axios';

export default function SMSMarketingTab({ laundryId, authToken }) {
    const [segments, setSegments] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedSegment, setSelectedSegment] = useState('all');
    const [message, setMessage] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const cancelRef = React.useRef();
    const toast = useToast();

    // Fetch segments on mount
    useEffect(() => { fetchSegments(); }, [laundryId]);

    const fetchSegments = async () => {
        setLoading(true);
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/sms/segments`,
                { params: { laundryId }, headers: { Authorization: `Bearer ${authToken}` } }
            );
            if (res.data.status === 'success') setSegments(res.data.segments);
        } catch (err) {
            toast({ title: 'Failed to load segments', status: 'error', duration: 3000 });
        } finally { setLoading(false); }
    };

    const handleSend = async () => {
        onClose();
        setSending(true);
        setResult(null);
        try {
            const res = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/sms/blast`,
                { laundryId, message, segment: selectedSegment, promoCode },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );
            if (res.data.status === 'success') {
                setResult(res.data);
                toast({ title: `SMS sent to ${res.data.sent} customers`, status: 'success', duration: 5000 });
                setMessage('');
                setPromoCode('');
            } else {
                toast({ title: res.data.message || 'Send failed', status: 'error', duration: 4000 });
            }
        } catch (err) {
            toast({ title: 'Send failed', description: err.message, status: 'error', duration: 4000 });
        } finally { setSending(false); }
    };

    const segmentLabels = {
        all: 'All Customers',
        inactive_30: 'Inactive 30 Days',
        inactive_60: 'Inactive 60 Days',
        high_value: 'High Value ($100+)',
        new: 'New (Last 30 Days)',
        commercial: 'Commercial',
    };

    const selectedCount = segments[selectedSegment] || 0;

    return (
        <Box>
            <Flex justify="space-between" align="center" mb={4}>
                <Heading as="h2" size="md">SMS Marketing</Heading>
                <Button size="sm" leftIcon={<FiRefreshCw />} onClick={fetchSegments} variant="ghost">
                    Refresh
                </Button>
            </Flex>

            {loading ? (
                <Flex justify="center" py={8}><Spinner size="lg" color="blue.500" /></Flex>
            ) : (
                <VStack spacing={6} align="stretch">
                    {/* Segment Selection */}
                    <Box>
                        <Text fontWeight="bold" fontSize="sm" mb={2} color="gray.600">
                            Select Target Audience
                        </Text>
                        <Wrap spacing={3}>
                            {Object.entries(segmentLabels).map(([key, label]) => (
                                <WrapItem key={key}>
                                    <Button
                                        size="sm"
                                        borderRadius="full"
                                        variant={selectedSegment === key ? 'solid' : 'outline'}
                                        colorScheme={selectedSegment === key ? 'blue' : 'gray'}
                                        onClick={() => setSelectedSegment(key)}
                                    >
                                        {label} ({segments[key] || 0})
                                    </Button>
                                </WrapItem>
                            ))}
                        </Wrap>
                    </Box>

                    {/* Message Composer */}
                    <FormControl>
                        <FormLabel fontWeight="bold" fontSize="sm" color="gray.600">
                            Message
                        </FormLabel>
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Hi {name}! We have a special offer just for you..."
                            maxLength={300}
                            rows={4}
                            resize="vertical"
                        />
                        <Flex justify="space-between" mt={1}>
                            <FormHelperText>Use {'{name}'} to personalize with customer's first name</FormHelperText>
                            <Text fontSize="xs" color={message.length > 280 ? 'red.500' : 'gray.500'}>
                                {message.length}/300
                            </Text>
                        </Flex>
                    </FormControl>

                    {/* Promo Code */}
                    <FormControl>
                        <FormLabel fontWeight="bold" fontSize="sm" color="gray.600">
                            Promo Code (optional)
                        </FormLabel>
                        <Input
                            value={promoCode}
                            onChange={(e) => setPromoCode(e.target.value)}
                            placeholder="e.g. SAVE15"
                            maxW="200px"
                            size="sm"
                        />
                        <FormHelperText>Appended as &quot;Use code: {promoCode || 'CODE'}&quot; if provided</FormHelperText>
                    </FormControl>

                    {/* Preview */}
                    {message.trim() && (
                        <Alert status="info" borderRadius="md">
                            <AlertIcon />
                            <Box>
                                <Text fontSize="sm" fontWeight="bold">
                                    Ready to send to: {segmentLabels[selectedSegment]} ({selectedCount} customers)
                                </Text>
                                <Text fontSize="xs" color="gray.600" mt={1}>
                                    Preview: &quot;{message.replace('{name}', 'Sarah')}{promoCode ? ` Use code: ${promoCode}` : ''}&quot;
                                </Text>
                            </Box>
                        </Alert>
                    )}

                    {/* Send Button */}
                    <Button
                        colorScheme="blue"
                        size="lg"
                        leftIcon={<FiSend />}
                        onClick={onOpen}
                        isDisabled={!message.trim() || selectedCount === 0}
                        isLoading={sending}
                        loadingText="Sending..."
                        w={{ base: '100%', md: '250px' }}
                    >
                        Send SMS Blast
                    </Button>

                    {/* Result */}
                    {result && (
                        <Alert status="success" borderRadius="md">
                            <AlertIcon />
                            <Text fontSize="sm">
                                Sent: {result.sent} | Failed: {result.failed} | Total targeted: {result.total}
                            </Text>
                        </Alert>
                    )}

                    {/* Confirmation Dialog */}
                    <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose}>
                        <AlertDialogOverlay>
                            <AlertDialogContent>
                                <AlertDialogHeader>Confirm SMS Blast</AlertDialogHeader>
                                <AlertDialogBody>
                                    Send this message to <strong>{selectedCount} customers</strong>?
                                    This will use SMS credits and cannot be undone.
                                </AlertDialogBody>
                                <AlertDialogFooter>
                                    <Button ref={cancelRef} onClick={onClose}>Cancel</Button>
                                    <Button colorScheme="blue" onClick={handleSend} ml={3}>
                                        Send Now
                                    </Button>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialogOverlay>
                    </AlertDialog>
                </VStack>
            )}
        </Box>
    );
}
