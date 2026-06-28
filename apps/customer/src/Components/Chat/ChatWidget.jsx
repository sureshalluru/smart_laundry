import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    IconButton,
    VStack,
    HStack,
    Text,
    Input,
    Flex,
    Badge,
} from '@chakra-ui/react';
import { FiMessageCircle, FiX, FiSend } from 'react-icons/fi';
import axios from 'axios';

/**
 * ChatWidget — Floating chat bubble for customers.
 * Multi-tenant: uses customerId + laundryId to scope conversations.
 */
export default function ChatWidget({ customerId, laundryId, customerName, customerPhone }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef = useRef(null);
    const pollRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Fetch messages
    const fetchMessages = async () => {
        if (!customerId || !laundryId) return;
        try {
            const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/chat/messages`, {
                params: { customerId, laundryId },
            });
            if (res.data.status === 'success') {
                const prev = messages.length;
                setMessages(res.data.messages);
                // Count new admin messages as unread when chat is closed
                if (!isOpen && res.data.messages.length > prev) {
                    const newAdminMsgs = res.data.messages.slice(prev).filter(m => m.senderType === 'admin');
                    if (newAdminMsgs.length > 0) {
                        setUnreadCount(c => c + newAdminMsgs.length);
                    }
                }
            }
        } catch (err) {
            // silent
        }
    };

    // Poll for new messages every 5 seconds
    useEffect(() => {
        if (customerId && laundryId) {
            fetchMessages();
            pollRef.current = setInterval(fetchMessages, 5000);
            return () => clearInterval(pollRef.current);
        }
    }, [customerId, laundryId]);

    // Scroll to bottom when messages change or chat opens
    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, isOpen]);

    // Clear unread when opening
    const handleOpen = () => {
        setIsOpen(true);
        setUnreadCount(0);
    };

    // Send message
    const handleSend = async () => {
        if (!newMessage.trim() || sending) return;
        setSending(true);
        try {
            await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/chat/send`, {
                customerId,
                laundryId,
                message: newMessage.trim(),
                customerName,
                customerPhone,
            });
            setNewMessage('');
            await fetchMessages();
        } catch (err) {
            // silent
        } finally {
            setSending(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (!customerId || !laundryId) return null;

    return (
        <>
            {/* Chat Panel */}
            {isOpen && (
                <Box
                    position="fixed"
                    bottom={{ base: '0', md: '80px' }}
                    right={{ base: '0', md: '20px' }}
                    w={{ base: '100%', md: '380px' }}
                    h={{ base: '100vh', md: '500px' }}
                    bg="white"
                    borderRadius={{ base: '0', md: '2xl' }}
                    boxShadow="2xl"
                    border="1px solid"
                    borderColor="gray.200"
                    display="flex"
                    flexDirection="column"
                    overflow="hidden"
                    zIndex="1500"
                >
                    {/* Header */}
                    <Flex
                        bg="blue.600"
                        color="white"
                        px={4}
                        py={3}
                        align="center"
                        justify="space-between"
                    >
                        <VStack align="flex-start" spacing={0}>
                            <Text fontWeight="bold" fontSize="sm">Chat with us</Text>
                            <Text fontSize="xs" opacity={0.8}>We typically reply in minutes</Text>
                        </VStack>
                        <IconButton
                            icon={<FiX />}
                            size="sm"
                            variant="ghost"
                            color="white"
                            onClick={() => setIsOpen(false)}
                            aria-label="Close chat"
                            _hover={{ bg: 'blue.500' }}
                        />
                    </Flex>

                    {/* Messages */}
                    <VStack
                        flex="1"
                        overflow="auto"
                        px={3}
                        py={3}
                        spacing={2}
                        align="stretch"
                        bg="gray.50"
                    >
                        {messages.length === 0 && (
                            <Text textAlign="center" color="gray.400" fontSize="sm" py={8}>
                                Send us a message and we'll get back to you shortly!
                            </Text>
                        )}
                        {messages.map((msg) => (
                            <Flex
                                key={msg.messageId}
                                justify={msg.senderType === 'customer' ? 'flex-end' : 'flex-start'}
                            >
                                <Box
                                    maxW="80%"
                                    bg={msg.senderType === 'customer' ? 'blue.500' : 'white'}
                                    color={msg.senderType === 'customer' ? 'white' : 'gray.800'}
                                    px={3}
                                    py={2}
                                    borderRadius="lg"
                                    boxShadow="sm"
                                    border={msg.senderType === 'admin' ? '1px solid' : 'none'}
                                    borderColor="gray.200"
                                >
                                    <Text fontSize="sm" whiteSpace="pre-wrap">{msg.message}</Text>
                                    <Text
                                        fontSize="xs"
                                        opacity={0.6}
                                        mt={1}
                                        textAlign="right"
                                    >
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </Box>
                            </Flex>
                        ))}
                        <div ref={messagesEndRef} />
                    </VStack>

                    {/* Input */}
                    <HStack px={3} py={2} borderTop="1px solid" borderColor="gray.100" bg="white">
                        <Input
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Type a message..."
                            size="sm"
                            borderRadius="full"
                            flex="1"
                        />
                        <IconButton
                            icon={<FiSend />}
                            size="sm"
                            colorScheme="blue"
                            borderRadius="full"
                            onClick={handleSend}
                            isLoading={sending}
                            isDisabled={!newMessage.trim()}
                            aria-label="Send message"
                        />
                    </HStack>
                </Box>
            )}

            {/* Floating button */}
            {!isOpen && (
                <Box position="fixed" bottom="80px" right="20px" zIndex="1400">
                    <IconButton
                        icon={<FiMessageCircle />}
                        size="lg"
                        colorScheme="blue"
                        borderRadius="full"
                        boxShadow="lg"
                        onClick={handleOpen}
                        aria-label="Open chat"
                        w="56px"
                        h="56px"
                        fontSize="24px"
                    />
                    {unreadCount > 0 && (
                        <Badge
                            position="absolute"
                            top="-4px"
                            right="-4px"
                            colorScheme="red"
                            borderRadius="full"
                            fontSize="xs"
                            px={2}
                        >
                            {unreadCount}
                        </Badge>
                    )}
                </Box>
            )}
        </>
    );
}
