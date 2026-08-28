import React, { useState, useEffect, useRef } from 'react';
import {
    Box, VStack, HStack, Heading, Text, Button, Input, FormControl, FormLabel,
    SimpleGrid, Badge, Divider, useToast, Flex, IconButton,
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
    useDisclosure, Table, Thead, Tbody, Tr, Th, Td, Select, Spinner,
    Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody, DrawerCloseButton,
    Tabs, TabList, Tab, TabPanels, TabPanel,
} from '@chakra-ui/react';
import { FiPlus, FiRefreshCw, FiUsers, FiMonitor, FiKey, FiMessageCircle, FiMail, FiEye } from 'react-icons/fi';
import axios from 'axios';
import CompanyManagementSection from '../Components/PlatformAdmin/CompanyManagementSection';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export default function PlatformAdminPage() {
    const [platformKey, setPlatformKey] = useState(localStorage.getItem('platformKey') || '');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [laundries, setLaundries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedLaundry, setSelectedLaundry] = useState(null);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const toast = useToast();
    const [tabIndex, setTabIndex] = useState(() => parseInt(localStorage.getItem('platformAdminTab') || '0'));

    const headers = { 'x-platform-key': platformKey };

    const handleAuthError = () => {
        setIsAuthenticated(false);
        localStorage.removeItem('platformKey');
        setPlatformKey('');
        toast({ title: 'Invalid platform key', status: 'error' });
    };

    const handleTabChange = (index) => {
        setTabIndex(index);
        localStorage.setItem('platformAdminTab', String(index));
    };

    // Auth check
    const handleAuth = () => {
        localStorage.setItem('platformKey', platformKey);
        setIsAuthenticated(true);
        fetchLaundries();
    };

    const fetchLaundries = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/platform/laundries`, { headers });
            if (res.data.status === 'success') setLaundries(res.data.laundries);
        } catch (err) {
            if (err.response?.status === 403) {
                setIsAuthenticated(false);
                toast({ title: 'Invalid platform key', status: 'error' });
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (platformKey) { setIsAuthenticated(true); fetchLaundries(); }
    }, []);

    // Create laundry state
    const [newLaundry, setNewLaundry] = useState({
        laundryName: '', timezone: 'America/Chicago', street: '', city: '', state: '', zipCode: '',
        bagPrice: 30, ownerFirstName: '', ownerLastName: '', ownerEmail: '', ownerPhone: '',
        stripePublicKey: '', stripePrivateKey: '',
    });
    const [creating, setCreating] = useState(false);
    const [createResult, setCreateResult] = useState(null);

    const handleCreate = async () => {
        setCreating(true);
        try {
            const res = await axios.post(`${API_URL}/api/platform/laundries`, newLaundry, { headers });
            if (res.data.status === 'success') {
                setCreateResult(res.data);
                fetchLaundries();
                toast({ title: 'Laundry created!', status: 'success' });
            } else {
                toast({ title: res.data.message, status: 'error' });
            }
        } catch (err) {
            toast({ title: err.response?.data?.message || 'Error', status: 'error' });
        } finally {
            setCreating(false);
        }
    };

    const resetRegCode = async (laundryId) => {
        try {
            const res = await axios.post(`${API_URL}/api/platform/laundries/${laundryId}/reset-registration-code`, {}, { headers });
            if (res.data.status === 'success') {
                toast({ title: `New code: ${res.data.newCode}`, status: 'success', duration: 10000 });
                fetchLaundries();
            }
        } catch (err) {
            toast({ title: 'Error', status: 'error' });
        }
    };

    // Send owner credentials state
    const [sendingCredentials, setSendingCredentials] = useState({});
    const [credentialsModal, setCredentialsModal] = useState(null); // { laundryId, employees, regCode }

    const sendOwnerCredentials = async (laundryId, empId) => {
        setSendingCredentials(prev => ({ ...prev, [laundryId + (empId || '')]: true }));
        try {
            const res = await axios.post(
                `${API_URL}/api/platform/laundries/${laundryId}/send-owner-credentials`,
                empId ? { empId } : {},
                { headers }
            );
            if (res.data.status === 'success') {
                toast({ title: 'Credentials Sent', description: res.data.message, status: 'success', duration: 5000 });
            } else {
                toast({ title: 'Failed', description: res.data.message, status: 'error', duration: 5000 });
            }
        } catch (err) {
            toast({ title: 'Error', description: err.response?.data?.message || 'Failed to send', status: 'error' });
        } finally {
            setSendingCredentials(prev => ({ ...prev, [laundryId + (empId || '')]: false }));
        }
    };

    const handleDeleteLaundry = async (laundryId, laundryName) => {
        try {
            const res = await axios.delete(`${API_URL}/api/platform/laundries/${laundryId}`, { headers });
            if (res.data.status === 'success') {
                toast({ title: `"${laundryName}" deleted`, status: 'success', duration: 3000 });
                setLaundries(prev => prev.filter(l => l.laundryId !== laundryId));
            } else {
                toast({ title: 'Error', description: res.data.message, status: 'error', duration: 3000 });
            }
        } catch (err) {
            toast({ title: 'Delete failed', description: err.response?.data?.message || err.message, status: 'error', duration: 4000 });
        }
    };

    const viewOwnerCredentials = async (laundryId) => {
        try {
            const res = await axios.get(`${API_URL}/api/platform/laundries/${laundryId}/owner-credentials`, { headers });
            if (res.data.status === 'success') {
                setCredentialsModal({
                    laundryId,
                    employees: res.data.employees,
                    regCode: res.data.deviceRegistrationCode,
                });
            }
        } catch (err) {
            toast({ title: 'Error', description: 'Failed to retrieve credentials', status: 'error' });
        }
    };

    // Support Chat State
    const [chatOpen, setChatOpen] = useState(false);
    const [chatLaundry, setChatLaundry] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatSending, setChatSending] = useState(false);
    const [unreadCounts, setUnreadCounts] = useState({});
    const chatEndRef = useRef(null);
    const chatPollRef = useRef(null);

    // Prospect Chat State
    const [prospectConversations, setProspectConversations] = useState([]);
    const [prospectChatOpen, setProspectChatOpen] = useState(false);
    const [prospectChatConv, setProspectChatConv] = useState(null);
    const [prospectMessages, setProspectMessages] = useState([]);
    const [prospectInput, setProspectInput] = useState('');
    const [prospectSending, setProspectSending] = useState(false);
    const prospectEndRef = useRef(null);
    const prospectPollRef = useRef(null);

    // Fetch prospect conversations (from product page visitors)
    const fetchProspectConversations = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/chat/admin/conversations`, {
                params: { laundryId: 'platform' },
                headers: { Authorization: `Bearer ${platformKey}` }
            });
            if (res.data?.conversations) {
                // Filter to only prospect/visitor conversations (not laundry- prefixed)
                const prospects = res.data.conversations.filter(c =>
                    !c.customerId?.startsWith('laundry-')
                );
                setProspectConversations(prospects);
            }
        } catch (err) { /* ok */ }
    };

    const openProspectChat = (conv) => {
        setProspectChatConv(conv);
        setProspectChatOpen(true);
        fetchProspectMessages(conv.conversationId);
        if (prospectPollRef.current) clearInterval(prospectPollRef.current);
        prospectPollRef.current = setInterval(() => fetchProspectMessages(conv.conversationId), 5000);
    };

    const closeProspectChat = () => {
        setProspectChatOpen(false);
        if (prospectPollRef.current) clearInterval(prospectPollRef.current);
        fetchProspectConversations(); // Refresh to update unread counts
    };

    const fetchProspectMessages = async (conversationId) => {
        try {
            const res = await axios.get(`${API_URL}/api/chat/admin/messages`, {
                params: { conversationId, laundryId: 'platform' },
                headers: { Authorization: `Bearer ${platformKey}` }
            });
            if (res.data?.messages) setProspectMessages(res.data.messages);
        } catch (err) { /* ok */ }
    };

    const sendProspectReply = async () => {
        if (!prospectInput.trim() || !prospectChatConv) return;
        setProspectSending(true);
        try {
            await axios.post(`${API_URL}/api/chat/admin/send`, {
                conversationId: prospectChatConv.conversationId,
                message: prospectInput.trim(),
                senderName: 'Smart Laundry Basket',
            }, { headers: { Authorization: `Bearer ${platformKey}` } });
            setProspectInput('');
            setTimeout(() => fetchProspectMessages(prospectChatConv.conversationId), 500);
        } catch (err) {
            toast({ title: 'Send failed', status: 'error', duration: 2000 });
        } finally {
            setProspectSending(false);
        }
    };

    useEffect(() => {
        if (prospectEndRef.current) prospectEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [prospectMessages]);

    // Fetch unread counts for all tenants
    const fetchUnreadCounts = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/chat/admin/conversations`, {
                params: { laundryId: 'platform' },
                headers: { Authorization: `Bearer ${platformKey}` }
            });
            if (res.data?.conversations) {
                const counts = {};
                res.data.conversations.forEach(c => {
                    const lid = c.customerId?.replace('laundry-', '');
                    if (lid) counts[lid] = c.unreadCount || 0;
                });
                setUnreadCounts(counts);
            }
        } catch (err) { /* ok */ }
    };

    useEffect(() => {
        if (isAuthenticated) {
            fetchUnreadCounts();
            fetchProspectConversations();
            const interval = setInterval(fetchUnreadCounts, 15000);
            const prospectInterval = setInterval(fetchProspectConversations, 15000);
            return () => { clearInterval(interval); clearInterval(prospectInterval); };
        }
    }, [isAuthenticated]);

    const openChat = (laundry) => {
        setChatLaundry(laundry);
        setChatOpen(true);
        fetchChatMessages(laundry.laundryId);
        // Reset unread count locally
        setUnreadCounts(prev => ({ ...prev, [laundry.laundryId]: 0 }));
        if (chatPollRef.current) clearInterval(chatPollRef.current);
        chatPollRef.current = setInterval(() => fetchChatMessages(laundry.laundryId), 5000);
    };

    const closeChat = () => {
        setChatOpen(false);
        if (chatPollRef.current) clearInterval(chatPollRef.current);
    };

    const fetchChatMessages = async (lid) => {
        try {
            // First get the conversation to find conversationId
            const res = await axios.get(`${API_URL}/api/chat/messages`, {
                params: { customerId: `laundry-${lid}`, laundryId: 'platform' }
            });
            if (res.data?.messages) setChatMessages(res.data.messages);
            // If conversation exists, also call admin/messages to mark as read
            if (res.data?.conversationId) {
                await axios.get(`${API_URL}/api/chat/admin/messages`, {
                    params: { conversationId: res.data.conversationId, laundryId: 'platform' },
                    headers: { Authorization: `Bearer ${platformKey}` }
                }).catch(() => {});
            }
        } catch (err) { /* ok */ }
    };

    const sendChatMessage = async () => {
        if (!chatInput.trim() || !chatLaundry) return;
        setChatSending(true);
        try {
            const lid = chatLaundry.laundryId;
            // Check if conversation exists
            const msgRes = await axios.get(`${API_URL}/api/chat/messages`, {
                params: { customerId: `laundry-${lid}`, laundryId: 'platform' }
            });
            let convId = msgRes.data?.conversationId;

            if (!convId) {
                // Create conversation by sending a dummy init as "customer" then immediately reply as admin
                const initRes = await axios.post(`${API_URL}/api/chat/send`, {
                    customerId: `laundry-${lid}`,
                    laundryId: 'platform',
                    message: '(Support conversation started)',
                    customerName: chatLaundry.laundryName || `Laundry ${lid}`,
                    customerPhone: '',
                });
                convId = initRes.data?.conversationId;
            }

            if (convId) {
                // Send as admin
                await axios.post(`${API_URL}/api/chat/admin/send`, {
                    conversationId: convId,
                    message: chatInput.trim(),
                    senderName: 'Platform Support',
                }, { headers: { Authorization: `Bearer ${platformKey}` } });
            }

            setChatInput('');
            setTimeout(() => fetchChatMessages(lid), 500);
        } catch (err) { console.error(err); toast({ title: 'Send failed', status: 'error', duration: 2000 }); }
        finally { setChatSending(false); }
    };

    useEffect(() => {
        if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    if (!isAuthenticated) {
        return (
            <Box minH="100vh" bg="gray.900" display="flex" alignItems="center" justifyContent="center" p={4}>
                <Box bg="white" p={8} borderRadius="2xl" maxW="400px" w="full" boxShadow="2xl">
                    <VStack spacing={5}>
                        <Heading size="md" color="gray.800">Platform Admin</Heading>
                        <Text fontSize="sm" color="gray.500">Enter your platform admin key to continue.</Text>
                        <FormControl>
                            <Input
                                type="password"
                                placeholder="Platform admin key"
                                value={platformKey}
                                onChange={(e) => setPlatformKey(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                            />
                        </FormControl>
                        <Button colorScheme="blue" w="full" onClick={handleAuth}>Access</Button>
                    </VStack>
                </Box>
            </Box>
        );
    }

    return (
        <Box minH="100vh" bg="gray.50" p={{ base: 4, md: 8 }}>
            <Flex justify="space-between" align="center" mb={6}>
                <Heading size="lg" color="gray.800">Platform Admin</Heading>
            </Flex>

            <Tabs index={tabIndex} onChange={handleTabChange} colorScheme="blue">
                <TabList mb={4}>
                    <Tab>Laundries</Tab>
                    <Tab>Companies</Tab>
                    <Tab>
                        <HStack spacing={1}>
                            <FiMessageCircle />
                            <Text>Prospect Chats</Text>
                            {prospectConversations.length > 0 && prospectConversations.some(c => c.unreadAdmin > 0) && (
                                <Badge colorScheme="red" borderRadius="full" fontSize="xs" ml={1}>
                                    {prospectConversations.reduce((sum, c) => sum + (c.unreadAdmin || 0), 0)}
                                </Badge>
                            )}
                        </HStack>
                    </Tab>
                </TabList>
                <TabPanels>
                    <TabPanel p={0}>
                        <Flex justify="flex-end" mb={4}>
                            <HStack>
                                <IconButton icon={<FiRefreshCw />} onClick={fetchLaundries} size="sm" variant="ghost" />
                                <Button leftIcon={<FiPlus />} colorScheme="blue" size="sm" onClick={onOpen}>
                                    New Laundry
                                </Button>
                            </HStack>
                        </Flex>

                        {loading ? (
                            <Flex justify="center" py={10}><Spinner size="xl" /></Flex>
                        ) : (
                            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                                {laundries.map((l) => (
                        <Box key={l.laundryId} bg="white" borderRadius="xl" p={5} boxShadow="sm" border="1px solid" borderColor="gray.100">
                            <VStack align="stretch" spacing={3}>
                                <Flex justify="space-between" align="center">
                                    <Text fontWeight="700" fontSize="md">{l.laundryName}</Text>
                                    <Badge colorScheme="blue" fontSize="xs">ID: {l.laundryId}</Badge>
                                </Flex>
                                <Text fontSize="xs" color="gray.500">{l.address}</Text>
                                {l.ownerName && (
                                    <HStack fontSize="xs" color="gray.600" spacing={3}>
                                        <Text fontWeight="600">👤 {l.ownerName}</Text>
                                        {l.ownerEmail && <Text>{l.ownerEmail}</Text>}
                                        {l.ownerPhone && <Text>{l.ownerPhone}</Text>}
                                    </HStack>
                                )}
                                <Divider />
                                <HStack justify="space-between" fontSize="xs" color="gray.600">
                                    <HStack><FiUsers /><Text>{l.employeeCount} employees</Text></HStack>
                                    <Text>{l.activeOrders} active orders</Text>
                                </HStack>
                                <HStack justify="space-between" fontSize="xs">
                                    <Text fontWeight="600" color={l.monthlyRevenue >= 3000 ? 'green.600' : 'gray.600'}>
                                        💰 This Month: ${(l.monthlyRevenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                    </Text>
                                    {l.monthlyRevenue >= 3000 && (
                                        <Badge colorScheme="green" fontSize="xs">Billable</Badge>
                                    )}
                                </HStack>
                                <HStack justify="space-between" fontSize="xs">
                                    <HStack><FiKey /><Text color="orange.500">Code: {l.deviceRegistrationCode}</Text></HStack>
                                    <Button size="xs" variant="ghost" onClick={() => resetRegCode(l.laundryId)}>Reset</Button>
                                </HStack>
                                <HStack fontSize="xs" color="gray.500">
                                    <Badge colorScheme={l.hasStripe ? 'green' : 'red'} fontSize="xs">
                                        Stripe {l.hasStripe ? '✓' : '✗'}
                                    </Badge>
                                    <Badge colorScheme={l.hasTerminal ? 'green' : 'gray'} fontSize="xs">
                                        Terminal {l.hasTerminal ? '✓' : '—'}
                                    </Badge>
                                    <Text>${l.bagPrice}/bag</Text>
                                </HStack>
                                <Button size="xs" leftIcon={<FiMessageCircle />} colorScheme="cyan" variant="outline" onClick={() => openChat(l)} w="100%" position="relative">
                                    Chat with Owner
                                    {unreadCounts[l.laundryId] > 0 && (
                                        <Badge colorScheme="red" borderRadius="full" position="absolute" top="-6px" right="-6px" fontSize="xs" minW="18px" textAlign="center">
                                            {unreadCounts[l.laundryId]}
                                        </Badge>
                                    )}
                                </Button>
                                <HStack w="100%" spacing={2}>
                                    <Button size="xs" leftIcon={<FiEye />} colorScheme="purple" variant="outline" onClick={() => viewOwnerCredentials(l.laundryId)} flex={1}>
                                        View Credentials
                                    </Button>
                                    <Button size="xs" leftIcon={<FiMail />} colorScheme="orange" variant="outline"
                                        onClick={() => sendOwnerCredentials(l.laundryId)}
                                        isLoading={sendingCredentials[l.laundryId + '']}
                                        flex={1}>
                                        Send Credentials
                                    </Button>
                                </HStack>
                                <Button size="xs" colorScheme="red" variant="ghost" w="100%"
                                    onClick={() => {
                                        if (window.confirm(`DELETE "${l.laundryName}" and ALL its data? This cannot be undone.`)) {
                                            handleDeleteLaundry(l.laundryId, l.laundryName);
                                        }
                                    }}>
                                    🗑️ Delete Laundry
                                </Button>
                            </VStack>
                        </Box>
                    ))}
                </SimpleGrid>
            )}
                    </TabPanel>
                    <TabPanel p={0}>
                        <CompanyManagementSection platformKey={platformKey} onAuthError={handleAuthError} />
                    </TabPanel>
                    <TabPanel p={0}>
                        {/* Prospect Chats — messages from product page visitors */}
                        <VStack spacing={4} align="stretch">
                            <Flex justify="space-between" align="center">
                                <Text fontWeight="600" color="gray.700">Website visitor conversations (from smartlaundrybasket.ai chat)</Text>
                                <IconButton icon={<FiRefreshCw />} size="sm" variant="ghost" onClick={fetchProspectConversations} />
                            </Flex>
                            {prospectConversations.length === 0 ? (
                                <Box textAlign="center" py={10} bg="white" borderRadius="xl" border="1px solid" borderColor="gray.100">
                                    <Text color="gray.400">No prospect conversations yet.</Text>
                                    <Text fontSize="xs" color="gray.400" mt={1}>When visitors escalate from AI chat on the product page, their conversations appear here.</Text>
                                </Box>
                            ) : (
                                <VStack spacing={3} align="stretch">
                                    {prospectConversations.map(conv => (
                                        <Box key={conv.conversationId} bg="white" p={4} borderRadius="xl" border="1px solid"
                                            borderColor={conv.unreadAdmin > 0 ? 'blue.200' : 'gray.100'}
                                            cursor="pointer" _hover={{ boxShadow: 'md' }}
                                            onClick={() => openProspectChat(conv)}>
                                            <Flex justify="space-between" align="center">
                                                <HStack>
                                                    <FiMessageCircle color={conv.unreadAdmin > 0 ? '#3182CE' : '#A0AEC0'} />
                                                    <Text fontWeight="600" fontSize="sm">{conv.customerName || 'Website Visitor'}</Text>
                                                    {conv.unreadAdmin > 0 && (
                                                        <Badge colorScheme="blue" borderRadius="full" fontSize="xs">{conv.unreadAdmin} new</Badge>
                                                    )}
                                                </HStack>
                                                <Text fontSize="xs" color="gray.500">
                                                    {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                                </Text>
                                            </Flex>
                                        </Box>
                                    ))}
                                </VStack>
                            )}
                        </VStack>
                    </TabPanel>
                </TabPanels>
            </Tabs>

            {/* Create Laundry Modal */}
            <Modal isOpen={isOpen} onClose={() => { onClose(); setCreateResult(null); }} size="xl">
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Onboard New Laundry</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        {createResult ? (
                            <VStack spacing={4} align="stretch" bg="green.50" p={4} borderRadius="lg">
                                <Text fontWeight="700" color="green.700">✅ Laundry Created Successfully!</Text>
                                <Divider />
                                <Text fontSize="sm"><strong>Laundry ID:</strong> {createResult.laundry.laundryId}</Text>
                                <Text fontSize="sm"><strong>Admin URL:</strong> {createResult.laundry.adminUrl}</Text>
                                <Text fontSize="sm"><strong>Customer URL:</strong> {createResult.laundry.customerUrl}</Text>
                                <Text fontSize="sm"><strong>Device Reg Code:</strong> {createResult.laundry.deviceRegistrationCode}</Text>
                                <Divider />
                                <Text fontSize="sm" fontWeight="600">Owner Credentials:</Text>
                                <Text fontSize="sm"><strong>Employee ID:</strong> {createResult.owner.employeeId}</Text>
                                <Text fontSize="sm"><strong>Passcode:</strong> {createResult.owner.passcode}</Text>
                                <Text fontSize="xs" color="red.500" mt={2}>
                                    ⚠️ Save these credentials! The passcode cannot be retrieved later.
                                </Text>
                            </VStack>
                        ) : (
                            <VStack spacing={4} align="stretch">
                                <FormControl isRequired>
                                    <FormLabel fontSize="sm">Laundry Name</FormLabel>
                                    <Input value={newLaundry.laundryName} onChange={(e) => setNewLaundry({ ...newLaundry, laundryName: e.target.value })} />
                                </FormControl>
                                <HStack>
                                    <FormControl><FormLabel fontSize="sm">Street</FormLabel>
                                        <Input value={newLaundry.street} onChange={(e) => setNewLaundry({ ...newLaundry, street: e.target.value })} />
                                    </FormControl>
                                    <FormControl><FormLabel fontSize="sm">City</FormLabel>
                                        <Input value={newLaundry.city} onChange={(e) => setNewLaundry({ ...newLaundry, city: e.target.value })} />
                                    </FormControl>
                                </HStack>
                                <HStack>
                                    <FormControl><FormLabel fontSize="sm">State</FormLabel>
                                        <Input value={newLaundry.state} onChange={(e) => setNewLaundry({ ...newLaundry, state: e.target.value })} />
                                    </FormControl>
                                    <FormControl><FormLabel fontSize="sm">Zip Code</FormLabel>
                                        <Input value={newLaundry.zipCode} onChange={(e) => setNewLaundry({ ...newLaundry, zipCode: e.target.value })} />
                                    </FormControl>
                                    <FormControl><FormLabel fontSize="sm">Bag Price ($)</FormLabel>
                                        <Input type="number" value={newLaundry.bagPrice} onChange={(e) => setNewLaundry({ ...newLaundry, bagPrice: e.target.value })} />
                                    </FormControl>
                                </HStack>
                                <Divider />
                                <Text fontWeight="600" fontSize="sm">Owner Details</Text>
                                <HStack>
                                    <FormControl isRequired><FormLabel fontSize="sm">First Name</FormLabel>
                                        <Input value={newLaundry.ownerFirstName} onChange={(e) => setNewLaundry({ ...newLaundry, ownerFirstName: e.target.value })} />
                                    </FormControl>
                                    <FormControl><FormLabel fontSize="sm">Last Name</FormLabel>
                                        <Input value={newLaundry.ownerLastName} onChange={(e) => setNewLaundry({ ...newLaundry, ownerLastName: e.target.value })} />
                                    </FormControl>
                                </HStack>
                                <HStack>
                                    <FormControl><FormLabel fontSize="sm">Email</FormLabel>
                                        <Input value={newLaundry.ownerEmail} onChange={(e) => setNewLaundry({ ...newLaundry, ownerEmail: e.target.value })} />
                                    </FormControl>
                                    <FormControl><FormLabel fontSize="sm">Phone</FormLabel>
                                        <Input value={newLaundry.ownerPhone} onChange={(e) => setNewLaundry({ ...newLaundry, ownerPhone: e.target.value })} />
                                    </FormControl>
                                </HStack>
                                <Divider />
                                <Text fontWeight="600" fontSize="sm">Stripe (optional — can add later)</Text>
                                <FormControl><FormLabel fontSize="sm">Stripe Public Key</FormLabel>
                                    <Input value={newLaundry.stripePublicKey} onChange={(e) => setNewLaundry({ ...newLaundry, stripePublicKey: e.target.value })} placeholder="pk_..." />
                                </FormControl>
                                <FormControl><FormLabel fontSize="sm">Stripe Secret Key</FormLabel>
                                    <Input type="password" value={newLaundry.stripePrivateKey} onChange={(e) => setNewLaundry({ ...newLaundry, stripePrivateKey: e.target.value })} placeholder="sk_..." />
                                </FormControl>
                            </VStack>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        {!createResult && (
                            <Button colorScheme="blue" onClick={handleCreate} isLoading={creating} isDisabled={!newLaundry.laundryName || !newLaundry.ownerFirstName}>
                                Create Laundry
                            </Button>
                        )}
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Support Chat Drawer (tenant owners) */}
            <Drawer isOpen={chatOpen} onClose={closeChat} placement="right" size="md">

            {/* Prospect Chat Drawer (website visitors) */}
            <Drawer isOpen={prospectChatOpen} onClose={closeProspectChat} placement="right" size="md">
                <DrawerOverlay />
                <DrawerContent>
                    <DrawerCloseButton />
                    <DrawerHeader bg="blue.500" color="white" fontSize="md">
                        💬 {prospectChatConv?.customerName || 'Website Visitor'}
                    </DrawerHeader>
                    <DrawerBody display="flex" flexDirection="column" p={3} h="100%" overflow="hidden">
                        <Box flex={1} overflowY="auto" bg="gray.50" borderRadius="md" p={3} mb={3} minH="0">
                            {prospectMessages.length === 0 ? (
                                <Text color="gray.400" textAlign="center" py={10} fontSize="sm">No messages yet.</Text>
                            ) : (
                                <VStack spacing={2} align="stretch">
                                    {prospectMessages.map(msg => (
                                        <Flex key={msg.messageId} justify={msg.senderType === 'admin' ? 'flex-end' : 'flex-start'}>
                                            <Box maxW="80%" bg={msg.senderType === 'admin' ? 'blue.500' : 'white'}
                                                color={msg.senderType === 'admin' ? 'white' : 'gray.800'}
                                                px={3} py={2} borderRadius="lg" boxShadow="sm"
                                                border={msg.senderType !== 'admin' ? '1px solid' : 'none'} borderColor="gray.200">
                                                <Text fontSize="sm">{msg.message}</Text>
                                                <Text fontSize="xs" opacity={0.7} mt={1}>
                                                    {msg.senderName || (msg.senderType === 'admin' ? 'You' : 'Visitor')} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </Text>
                                            </Box>
                                        </Flex>
                                    ))}
                                    <div ref={prospectEndRef} />
                                </VStack>
                            )}
                        </Box>
                        <HStack flexShrink={0} pt={2} borderTop="1px solid" borderColor="gray.200">
                            <Input placeholder="Reply to visitor..." value={prospectInput} onChange={(e) => setProspectInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && sendProspectReply()} size="sm" />
                            <Button colorScheme="blue" size="sm" onClick={sendProspectReply} isLoading={prospectSending} px={5}>Send</Button>
                        </HStack>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>

            {/* Credentials Modal */}
            <Modal isOpen={!!credentialsModal} onClose={() => setCredentialsModal(null)} size="md">
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Owner Credentials</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        {credentialsModal && (
                            <VStack spacing={4} align="stretch">
                                <Box bg="orange.50" p={3} borderRadius="md">
                                    <HStack><FiKey /><Text fontWeight="600" fontSize="sm">Device Registration Code:</Text></HStack>
                                    <Text fontSize="lg" fontWeight="bold" color="orange.600" mt={1}>{credentialsModal.regCode}</Text>
                                </Box>
                                <Divider />
                                {credentialsModal.employees.map(emp => (
                                    <Box key={emp.empId} bg="gray.50" p={3} borderRadius="md" border="1px solid" borderColor="gray.200">
                                        <HStack justify="space-between" mb={2}>
                                            <Text fontWeight="600" fontSize="sm">{emp.firstName} {emp.lastName}</Text>
                                            <Badge colorScheme={emp.role === 'Admin' ? 'red' : 'blue'} fontSize="xs">{emp.role}</Badge>
                                        </HStack>
                                        <Table size="sm" variant="simple">
                                            <Tbody>
                                                <Tr><Td fontWeight="600" px={2} py={1}>Employee ID</Td><Td px={2} py={1} fontFamily="mono">{emp.empId}</Td></Tr>
                                                <Tr><Td fontWeight="600" px={2} py={1}>Passcode</Td><Td px={2} py={1} fontFamily="mono" fontSize="lg" color="blue.600">{emp.passcode}</Td></Tr>
                                                <Tr><Td fontWeight="600" px={2} py={1}>Email</Td><Td px={2} py={1}>{emp.email || '—'}</Td></Tr>
                                            </Tbody>
                                        </Table>
                                        {emp.email && (
                                            <Button size="xs" leftIcon={<FiMail />} colorScheme="orange" mt={2}
                                                onClick={() => sendOwnerCredentials(credentialsModal.laundryId, emp.empId)}
                                                isLoading={sendingCredentials[credentialsModal.laundryId + emp.empId]}>
                                                Email Credentials to {emp.firstName}
                                            </Button>
                                        )}
                                    </Box>
                                ))}
                                {credentialsModal.employees.length === 0 && (
                                    <Text color="gray.500" textAlign="center" py={4}>No admin employees found.</Text>
                                )}
                            </VStack>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button onClick={() => setCredentialsModal(null)}>Close</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
                <DrawerOverlay />
                <DrawerContent>
                    <DrawerCloseButton />
                    <DrawerHeader bg="cyan.500" color="white" fontSize="md">
                        💬 Chat with {chatLaundry?.laundryName || 'Tenant'}
                    </DrawerHeader>
                    <DrawerBody display="flex" flexDirection="column" p={3} h="100%" overflow="hidden">
                        <Box flex={1} overflowY="auto" bg="gray.50" borderRadius="md" p={3} mb={3} minH="0">
                            {chatMessages.length === 0 ? (
                                <Text color="gray.400" textAlign="center" py={10} fontSize="sm">No messages yet. Start the conversation.</Text>
                            ) : (
                                <VStack spacing={2} align="stretch">
                                    {chatMessages.map(msg => (
                                        <Flex key={msg.messageId} justify={msg.senderType === 'admin' ? 'flex-end' : 'flex-start'}>
                                            <Box maxW="80%" bg={msg.senderType === 'admin' ? 'cyan.500' : 'white'}
                                                color={msg.senderType === 'admin' ? 'white' : 'gray.800'}
                                                px={3} py={2} borderRadius="lg" boxShadow="sm"
                                                border={msg.senderType !== 'admin' ? '1px solid' : 'none'} borderColor="gray.200">
                                                <Text fontSize="sm">{msg.message}</Text>
                                                <Text fontSize="xs" opacity={0.7} mt={1}>
                                                    {msg.senderName} • {new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </Text>
                                            </Box>
                                        </Flex>
                                    ))}
                                    <div ref={chatEndRef} />
                                </VStack>
                            )}
                        </Box>
                        <HStack flexShrink={0} pt={2} borderTop="1px solid" borderColor="gray.200">
                            <Input placeholder="Type a message..." value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()} size="sm" />
                            <Button colorScheme="cyan" size="sm" onClick={sendChatMessage} isLoading={chatSending} px={5}>Send</Button>
                        </HStack>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </Box>
    );
}
