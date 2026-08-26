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
    Link,
} from '@chakra-ui/react';
import { FiMessageCircle, FiX, FiSend } from 'react-icons/fi';
import axios from 'axios';

/**
 * ChatWidget — Floating chat bubble for customers.
 * Multi-tenant: uses laundryId to scope conversations.
 * Supports both logged-in and logged-out users.
 *
 * Mode: 'ai' — AI answers using tenant-specific data (no auth needed)
 * Mode: 'human' — Escalated to real admin chat (requires customerId)
 */
export default function ChatWidget({ customerId, laundryId, customerName, customerPhone }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [mode, setMode] = useState('ai');
    const [aiMessages, setAiMessages] = useState([]);
    const messagesEndRef = useRef(null);
    const pollRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Fetch messages (human mode only)
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

    // Poll for new messages every 5 seconds (human mode only)
    useEffect(() => {
        if (mode === 'human' && customerId && laundryId) {
            fetchMessages();
            pollRef.current = setInterval(fetchMessages, 5000);
            return () => clearInterval(pollRef.current);
        }
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [customerId, laundryId, mode]);

    // Scroll to bottom when messages change or chat opens
    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, aiMessages, isOpen]);

    // Add AI greeting when chat opens
    useEffect(() => {
        if (isOpen && mode === 'ai' && aiMessages.length === 0) {
            setAiMessages([{
                role: 'assistant',
                content: 'Hi! I can help you with information about our services, pricing, hours, and delivery. What would you like to know?',
            }]);
        }
    }, [isOpen]);

    // Clear unread when opening
    const handleOpen = () => {
        setIsOpen(true);
        setUnreadCount(0);
    };

    // Send message
    const handleSend = async () => {
        if (!newMessage.trim() || sending) return;
        const msg = newMessage.trim();
        setSending(true);

        if (mode === 'ai') {
            // Add user message to local AI conversation
            const updatedMessages = [...aiMessages, { role: 'user', content: msg }];
            setAiMessages(updatedMessages);
            setNewMessage('');

            try {
                const res = await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/chat/ai`, {
                    laundryId,
                    message: msg,
                    history: aiMessages, // Send previous history (before this message)
                });

                if (res.data.status === 'success') {
                    // If AI is not configured, fall back to human chat gracefully
                    if (res.data.noAi) {
                        setAiMessages(prev => [...prev, {
                            role: 'assistant',
                            content: "Hi! Our team typically replies within minutes. Send us your question and we'll get back to you shortly!",
                        }]);
                        setMode('human');
                        if (customerId) fetchMessages();
                    } else {
                        setAiMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);

                        // Handle escalation
                        if (res.data.escalate) {
                            setAiMessages(prev => [...prev, {
                                role: 'system',
                                content: 'Connecting you with a team member...',
                            }]);
                            setMode('human');

                            // If logged in, start the human chat flow
                            if (customerId) {
                                fetchMessages();
                            }
                        }
                    }
                }
            } catch (err) {
                setAiMessages(prev => [...prev, {
                    role: 'assistant',
                    content: "I'm having trouble right now. Please try again in a moment.",
                }]);
            }
        } else {
            // Human mode — requires customerId
            if (!customerId) {
                setAiMessages(prev => [...prev, {
                    role: 'system',
                    content: 'Please log in to chat with our team.',
                }]);
                setSending(false);
                setNewMessage('');
                return;
            }

            try {
                await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/chat/send`, {
                    customerId,
                    laundryId,
                    message: msg,
                    customerName,
                    customerPhone,
                });
                setNewMessage('');
                await fetchMessages();
            } catch (err) {
                // silent
            }
        }

        setSending(false);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Widget requires at least laundryId to render (AI mode works without customerId)
    if (!laundryId) return null;

    // Determine which messages to display
    const displayMessages = mode === 'ai' || (mode === 'human' && !customerId)
        ? aiMessages
        : messages;

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
                            <Text fontWeight="bold" fontSize="sm">
                                {mode === 'ai' ? 'AI Assistant' : 'Chat with us'}
                            </Text>
                            <Text fontSize="xs" opacity={0.8}>
                                {mode === 'ai' ? 'Ask about services, pricing & more' : 'We typically reply in minutes'}
                            </Text>
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
                        {displayMessages.length === 0 && (
                            <Text textAlign="center" color="gray.400" fontSize="sm" py={8}>
                                Send us a message and we'll get back to you shortly!
                            </Text>
                        )}

                        {/* AI mode messages */}
                        {(mode === 'ai' || (mode === 'human' && !customerId)) && aiMessages.map((msg, idx) => (
                            <Flex
                                key={idx}
                                justify={msg.role === 'user' ? 'flex-end' : 'flex-start'}
                            >
                                <Box
                                    maxW="80%"
                                    bg={msg.role === 'user' ? 'blue.500' : msg.role === 'system' ? 'orange.100' : 'white'}
                                    color={msg.role === 'user' ? 'white' : msg.role === 'system' ? 'orange.800' : 'gray.800'}
                                    px={3}
                                    py={2}
                                    borderRadius="lg"
                                    boxShadow="sm"
                                    border={msg.role !== 'user' ? '1px solid' : 'none'}
                                    borderColor={msg.role === 'system' ? 'orange.200' : 'gray.200'}
                                >
                                    <Text fontSize="sm" whiteSpace="pre-wrap">{msg.content}</Text>
                                    {msg.role === 'system' && !customerId && mode === 'human' && (
                                        <Link
                                            href="/login"
                                            color="blue.600"
                                            fontSize="xs"
                                            fontWeight="bold"
                                            mt={1}
                                            display="block"
                                        >
                                            Log in to continue →
                                        </Link>
                                    )}
                                </Box>
                            </Flex>
                        ))}

                        {/* Human mode messages (from DB) */}
                        {mode === 'human' && customerId && messages.map((msg) => (
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
                            placeholder={mode === 'ai' ? 'Ask a question...' : 'Type a message...'}
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
