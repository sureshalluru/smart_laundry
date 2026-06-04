import React, { useState, useEffect, useRef } from 'react';
import {
    Box, VStack, HStack, Text, Flex, Input, IconButton, Badge,
    Divider, Spinner, Button,
} from '@chakra-ui/react';
import { FiSend, FiRefreshCw } from 'react-icons/fi';
import axios from 'axios';

/**
 * ChatPage — Admin chat view. Shows all conversations for the laundry.
 */
export default function ChatPage({ laundryId }) {
    const [conversations, setConversations] = useState([]);
    const [selectedConv, setSelectedConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);
    const authToken = localStorage.getItem('idToken');
    const pollRef = useRef(null);

    const apiHeaders = { Authorization: `Bearer ${authToken}` };

    // Fetch conversations
    const fetchConversations = async () => {
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/chat/admin/conversations`,
                { params: { laundryId }, headers: apiHeaders }
            );
            if (res.data.status === 'success') {
                setConversations(res.data.conversations);
            }
        } catch (err) {
            console.error('Error fetching conversations:', err);
        }
    };

    // Fetch messages for selected conversation
    const fetchMessages = async (convId) => {
        if (!convId) return;
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/chat/admin/messages`,
                { params: { conversationId: convId, laundryId }, headers: apiHeaders }
            );
            if (res.data.status === 'success') {
                setMessages(res.data.messages);
            }
        } catch (err) {
            console.error('Error fetching messages:', err);
        }
    };

    // Poll
    useEffect(() => {
        fetchConversations();
        pollRef.current = setInterval(() => {
            fetchConversations();
            if (selectedConv) fetchMessages(selectedConv.conversationId);
        }, 5000);
        return () => clearInterval(pollRef.current);
    }, [laundryId]);

    useEffect(() => {
        if (selectedConv) {
            fetchMessages(selectedConv.conversationId);
        }
    }, [selectedConv?.conversationId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Send message
    const handleSend = async () => {
        if (!newMessage.trim() || !selectedConv || sending) return;
        setSending(true);
        try {
            await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/chat/admin/send`,
                {
                    conversationId: selectedConv.conversationId,
                    message: newMessage.trim(),
                    senderName: 'Admin',
                },
                { headers: apiHeaders }
            );
            setNewMessage('');
            await fetchMessages(selectedConv.conversationId);
            await fetchConversations();
        } catch (err) {
            console.error('Error sending message:', err);
        } finally {
            setSending(false);
        }
    };

    const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

    return (
        <Box h="calc(100vh - 60px)" display="flex" flexDirection={{ base: 'column', md: 'row' }}>
            {/* Conversation list */}
            <Box
                w={{ base: '100%', md: '320px' }}
                borderRight={{ md: '1px solid' }}
                borderColor="gray.200"
                overflow="auto"
                bg="white"
                display={{ base: selectedConv ? 'none' : 'block', md: 'block' }}
            >
                <Flex px={4} py={3} align="center" justify="space-between" borderBottom="1px solid" borderColor="gray.100">
                    <HStack>
                        <Text fontWeight="bold" fontSize="lg">Chats</Text>
                        {totalUnread > 0 && (
                            <Badge colorScheme="red" borderRadius="full">{totalUnread}</Badge>
                        )}
                    </HStack>
                    <IconButton
                        icon={<FiRefreshCw />}
                        size="sm"
                        variant="ghost"
                        onClick={fetchConversations}
                        aria-label="Refresh"
                    />
                </Flex>

                <VStack spacing={0} align="stretch">
                    {conversations.length === 0 && (
                        <Text p={4} color="gray.400" textAlign="center" fontSize="sm">
                            No conversations yet
                        </Text>
                    )}
                    {conversations.map((conv) => (
                        <Box
                            key={conv.conversationId}
                            px={4}
                            py={3}
                            cursor="pointer"
                            bg={selectedConv?.conversationId === conv.conversationId ? 'blue.50' : 'white'}
                            borderBottom="1px solid"
                            borderColor="gray.50"
                            _hover={{ bg: 'gray.50' }}
                            onClick={() => setSelectedConv(conv)}
                        >
                            <Flex justify="space-between" align="center">
                                <VStack align="flex-start" spacing={0} flex="1">
                                    <HStack>
                                        <Text fontWeight="600" fontSize="sm">{conv.customerName}</Text>
                                        {conv.unreadCount > 0 && (
                                            <Badge colorScheme="blue" borderRadius="full" fontSize="xs">
                                                {conv.unreadCount}
                                            </Badge>
                                        )}
                                    </HStack>
                                    <Text fontSize="xs" color="gray.500" noOfLines={1}>
                                        {conv.lastMessage}
                                    </Text>
                                </VStack>
                                <Text fontSize="xs" color="gray.400">
                                    {new Date(conv.lastMessageAt).toLocaleDateString()}
                                </Text>
                            </Flex>
                        </Box>
                    ))}
                </VStack>
            </Box>

            {/* Message area */}
            <Box flex="1" display="flex" flexDirection="column" bg="gray.50">
                {selectedConv ? (
                    <>
                        {/* Chat header */}
                        <Flex
                            px={4}
                            py={3}
                            bg="white"
                            borderBottom="1px solid"
                            borderColor="gray.100"
                            align="center"
                            justify="space-between"
                        >
                            <VStack align="flex-start" spacing={0}>
                                <Text fontWeight="bold" fontSize="sm">{selectedConv.customerName}</Text>
                                <Text fontSize="xs" color="gray.500">{selectedConv.customerPhone}</Text>
                            </VStack>
                            <Button
                                size="xs"
                                variant="ghost"
                                display={{ base: 'block', md: 'none' }}
                                onClick={() => setSelectedConv(null)}
                            >
                                ← Back
                            </Button>
                        </Flex>

                        {/* Messages */}
                        <VStack flex="1" overflow="auto" px={4} py={3} spacing={2} align="stretch">
                            {messages.map((msg) => (
                                <Flex
                                    key={msg.messageId}
                                    justify={msg.senderType === 'admin' ? 'flex-end' : 'flex-start'}
                                >
                                    <Box
                                        maxW="75%"
                                        bg={msg.senderType === 'admin' ? 'blue.500' : 'white'}
                                        color={msg.senderType === 'admin' ? 'white' : 'gray.800'}
                                        px={3}
                                        py={2}
                                        borderRadius="lg"
                                        boxShadow="sm"
                                        border={msg.senderType === 'customer' ? '1px solid' : 'none'}
                                        borderColor="gray.200"
                                    >
                                        <Text fontSize="sm" whiteSpace="pre-wrap">{msg.message}</Text>
                                        <Text fontSize="xs" opacity={0.6} mt={1} textAlign="right">
                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    </Box>
                                </Flex>
                            ))}
                            <div ref={messagesEndRef} />
                        </VStack>

                        {/* Input */}
                        <HStack px={4} py={3} bg="white" borderTop="1px solid" borderColor="gray.100">
                            <Input
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Type a reply..."
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
                                aria-label="Send"
                            />
                        </HStack>
                    </>
                ) : (
                    <Flex flex="1" align="center" justify="center">
                        <Text color="gray.400">Select a conversation</Text>
                    </Flex>
                )}
            </Box>
        </Box>
    );
}
