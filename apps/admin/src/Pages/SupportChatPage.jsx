import React, { useState, useEffect, useRef } from 'react';
import { Box, VStack, HStack, Text, Input, Button, Flex, Badge } from '@chakra-ui/react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const SupportChatPage = () => {
    const { laundryId } = useParams();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);
    const authToken = localStorage.getItem('idToken');
    const pollRef = useRef(null);

    const fetchMessages = async () => {
        try {
            const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/chat/messages`, {
                params: { customerId: `laundry-${laundryId}`, laundryId: 'platform' }
            });
            if (res.data?.messages) setMessages(res.data.messages);
        } catch (err) { /* ok */ }
    };

    useEffect(() => {
        fetchMessages();
        pollRef.current = setInterval(fetchMessages, 5000);
        return () => clearInterval(pollRef.current);
    }, [laundryId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!newMessage.trim()) return;
        setSending(true);
        try {
            await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/chat/send`, {
                customerId: `laundry-${laundryId}`,
                laundryId: 'platform',
                message: newMessage.trim(),
                customerName: `Laundry ${laundryId} Owner`,
                customerPhone: '',
            });
            setNewMessage('');
            fetchMessages();
        } catch (err) { console.error(err); }
        finally { setSending(false); }
    };

    return (
        <Box h="calc(100vh - 60px)" display="flex" flexDirection="column" p={4}>
            <HStack mb={3}>
                <Text fontSize="lg" fontWeight="bold">💬 Platform Support</Text>
                <Badge colorScheme="green">Live Chat</Badge>
            </HStack>
            <Text fontSize="sm" color="gray.500" mb={3}>
                Chat with the Smart Laundry Basket team. We typically respond within minutes during business hours.
            </Text>

            {/* Messages */}
            <Box flex={1} overflowY="auto" bg="gray.50" borderRadius="lg" p={3} border="1px solid" borderColor="gray.200">
                {messages.length === 0 ? (
                    <Text color="gray.400" textAlign="center" py={10}>
                        No messages yet. Send a message to start the conversation.
                    </Text>
                ) : (
                    <VStack spacing={2} align="stretch">
                        {messages.map(msg => (
                            <Flex key={msg.messageId} justify={msg.senderType === 'customer' ? 'flex-end' : 'flex-start'}>
                                <Box
                                    maxW="75%"
                                    bg={msg.senderType === 'customer' ? 'blue.500' : 'white'}
                                    color={msg.senderType === 'customer' ? 'white' : 'gray.800'}
                                    px={3} py={2} borderRadius="lg"
                                    border={msg.senderType !== 'customer' ? '1px solid' : 'none'}
                                    borderColor="gray.200"
                                    boxShadow="sm"
                                >
                                    <Text fontSize="sm">{msg.message}</Text>
                                    <Text fontSize="xs" opacity={0.7} mt={1}>
                                        {msg.senderName} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </Box>
                            </Flex>
                        ))}
                        <div ref={messagesEndRef} />
                    </VStack>
                )}
            </Box>

            {/* Input */}
            <HStack mt={3}>
                <Input
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    size="md"
                />
                <Button colorScheme="blue" onClick={handleSend} isLoading={sending} px={6}>
                    Send
                </Button>
            </HStack>
        </Box>
    );
};

export default SupportChatPage;
