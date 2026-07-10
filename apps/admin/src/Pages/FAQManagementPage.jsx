import React, { useEffect, useState, useMemo } from 'react';
import {
    Box,
    Container,
    Heading,
    Text,
    Flex,
    Button,
    IconButton,
    Switch,
    Badge,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    Spinner,
    useDisclosure,
    useToast,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    ModalCloseButton,
    FormControl,
    FormLabel,
    Input,
    Textarea,
    Select,
    VStack,
    HStack,
    Collapse,
    Divider,
    Alert,
    AlertIcon,
} from '@chakra-ui/react';
import { AddIcon, EditIcon, ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const API_BASE = process.env.REACT_APP_AWS_API_URL;

function getAuthHeaders() {
    return { Authorization: `Bearer ${localStorage.getItem('idToken')}` };
}

/**
 * Resolve tokens in a template string using token data.
 */
function resolvePreview(template, tokens) {
    if (!template || !tokens || tokens.length === 0) return template || '';
    let resolved = template;
    for (const t of tokens) {
        const placeholder = `{{${t.token}}}`;
        const value = t.currentValue || '(no value)';
        resolved = resolved.split(placeholder).join(value);
    }
    return resolved;
}

const FAQManagementPage = () => {
    const { laundryId } = useParams();
    const toast = useToast();
    const { isOpen, onOpen, onClose } = useDisclosure();

    const [faqs, setFaqs] = useState([]);
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showTokenRef, setShowTokenRef] = useState(false);

    // Modal state
    const [editingFaq, setEditingFaq] = useState(null); // null = create mode
    const [question, setQuestion] = useState('');
    const [answerTemplate, setAnswerTemplate] = useState('');
    const [category, setCategory] = useState('');
    const [customCategory, setCustomCategory] = useState('');
    const [displayOrder, setDisplayOrder] = useState(0);

    // Fetch FAQs and tokens on mount
    useEffect(() => {
        if (laundryId) {
            fetchFAQs();
            fetchTokens();
        }
    }, [laundryId]);

    const fetchFAQs = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_BASE}/api/admin/faq/list`, {
                params: { laundryId },
                headers: getAuthHeaders(),
            });
            setFaqs(res.data.faqs || []);
        } catch (err) {
            toast({ title: 'Error loading FAQs', status: 'error', duration: 3000 });
        } finally {
            setLoading(false);
        }
    };

    const fetchTokens = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/admin/faq/available-tokens`, {
                params: { laundryId },
                headers: getAuthHeaders(),
            });
            setTokens(res.data.tokens || []);
        } catch (err) {
            // Non-critical, tokens are informational
        }
    };

    // Group FAQs by category
    const groupedFaqs = useMemo(() => {
        const groups = {};
        for (const faq of faqs) {
            const cat = faq.category || 'Uncategorized';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(faq);
        }
        // Sort within each group by displayOrder
        for (const cat of Object.keys(groups)) {
            groups[cat].sort((a, b) => a.displayOrder - b.displayOrder);
        }
        return groups;
    }, [faqs]);

    // Get existing categories for the dropdown
    const existingCategories = useMemo(() => {
        const cats = new Set(faqs.map(f => f.category).filter(Boolean));
        return Array.from(cats).sort();
    }, [faqs]);

    // Toggle FAQ enabled/disabled
    const handleToggle = async (faq) => {
        try {
            await axios.put(`${API_BASE}/api/admin/faq/update`, {
                faqId: faq.faqId,
                isEnabled: !faq.isEnabled,
            }, {
                params: { laundryId },
                headers: getAuthHeaders(),
            });
            setFaqs(prev =>
                prev.map(f => f.faqId === faq.faqId ? { ...f, isEnabled: !f.isEnabled } : f)
            );
        } catch (err) {
            toast({ title: 'Error updating FAQ', status: 'error', duration: 3000 });
        }
    };

    // Open modal for creating new FAQ
    const handleCreate = () => {
        setEditingFaq(null);
        setQuestion('');
        setAnswerTemplate('');
        setCategory('');
        setCustomCategory('');
        setDisplayOrder(0);
        setShowTokenRef(false);
        onOpen();
    };

    // Open modal for editing existing FAQ
    const handleEdit = (faq) => {
        setEditingFaq(faq);
        setQuestion(faq.question);
        setAnswerTemplate(faq.answerTemplate);
        // If category exists in the list, select it; otherwise put in custom
        if (existingCategories.includes(faq.category)) {
            setCategory(faq.category);
            setCustomCategory('');
        } else {
            setCategory('__custom__');
            setCustomCategory(faq.category);
        }
        setDisplayOrder(faq.displayOrder);
        setShowTokenRef(false);
        onOpen();
    };

    // Save (create or update)
    const handleSave = async () => {
        const finalCategory = category === '__custom__' ? customCategory.trim() : category;
        if (!question.trim()) {
            toast({ title: 'Question is required', status: 'warning', duration: 2000 });
            return;
        }
        if (!answerTemplate.trim()) {
            toast({ title: 'Answer is required', status: 'warning', duration: 2000 });
            return;
        }
        if (!finalCategory) {
            toast({ title: 'Category is required', status: 'warning', duration: 2000 });
            return;
        }

        setSaving(true);
        try {
            if (editingFaq) {
                // Update
                await axios.put(`${API_BASE}/api/admin/faq/update`, {
                    faqId: editingFaq.faqId,
                    question: question.trim(),
                    answerTemplate: answerTemplate.trim(),
                    category: finalCategory,
                    displayOrder,
                }, {
                    params: { laundryId },
                    headers: getAuthHeaders(),
                });
                toast({ title: 'FAQ updated', status: 'success', duration: 2000 });
            } else {
                // Create
                await axios.post(`${API_BASE}/api/admin/faq/create`, {
                    question: question.trim(),
                    answerTemplate: answerTemplate.trim(),
                    category: finalCategory,
                    displayOrder,
                }, {
                    params: { laundryId },
                    headers: getAuthHeaders(),
                });
                toast({ title: 'FAQ created', status: 'success', duration: 2000 });
            }
            onClose();
            fetchFAQs();
        } catch (err) {
            const detail = err.response?.data?.detail || 'Error saving FAQ';
            toast({ title: detail, status: 'error', duration: 4000 });
        } finally {
            setSaving(false);
        }
    };

    // Preview of the resolved answer
    const previewAnswer = useMemo(() => {
        return resolvePreview(answerTemplate, tokens);
    }, [answerTemplate, tokens]);

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minH="300px">
                <Spinner size="lg" />
            </Box>
        );
    }

    return (
        <Container maxW="container.xl" py={6}>
            <Flex justifyContent="space-between" alignItems="center" mb={6}>
                <Box>
                    <Heading size="lg" color="blue.700">FAQ Pages</Heading>
                    <Text color="gray.600" fontSize="sm">
                        Manage your customer-facing FAQ pages for SEO
                    </Text>
                </Box>
                <Button leftIcon={<AddIcon />} colorScheme="blue" onClick={handleCreate}>
                    Add New FAQ
                </Button>
            </Flex>

            {faqs.length === 0 ? (
                <Alert status="info" borderRadius="md">
                    <AlertIcon />
                    No FAQs found. Click "Add New FAQ" to create your first FAQ page.
                </Alert>
            ) : (
                Object.entries(groupedFaqs).map(([cat, catFaqs]) => (
                    <Box key={cat} mb={6}>
                        <Flex alignItems="center" mb={3}>
                            <Badge colorScheme="purple" fontSize="sm" px={2} py={1} borderRadius="md">
                                {cat}
                            </Badge>
                            <Text ml={2} fontSize="sm" color="gray.500">
                                {catFaqs.length} {catFaqs.length === 1 ? 'item' : 'items'}
                            </Text>
                        </Flex>
                        <Box overflowX="auto" bg="white" borderRadius="md" boxShadow="sm" border="1px" borderColor="gray.200">
                            <Table size="sm">
                                <Thead>
                                    <Tr>
                                        <Th>Question</Th>
                                        <Th>Order</Th>
                                        <Th>Enabled</Th>
                                        <Th>Actions</Th>
                                    </Tr>
                                </Thead>
                                <Tbody>
                                    {catFaqs.map(faq => (
                                        <Tr key={faq.faqId} opacity={faq.isEnabled ? 1 : 0.6}>
                                            <Td maxW="400px" isTruncated fontWeight="medium">
                                                {faq.question}
                                            </Td>
                                            <Td isNumeric>{faq.displayOrder}</Td>
                                            <Td>
                                                <Switch
                                                    isChecked={faq.isEnabled}
                                                    onChange={() => handleToggle(faq)}
                                                    colorScheme="green"
                                                    size="sm"
                                                />
                                            </Td>
                                            <Td>
                                                <IconButton
                                                    icon={<EditIcon />}
                                                    size="sm"
                                                    variant="ghost"
                                                    colorScheme="blue"
                                                    aria-label="Edit FAQ"
                                                    onClick={() => handleEdit(faq)}
                                                />
                                            </Td>
                                        </Tr>
                                    ))}
                                </Tbody>
                            </Table>
                        </Box>
                    </Box>
                ))
            )}

            {/* Create/Edit Modal */}
            <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
                <ModalOverlay />
                <ModalContent maxW={{ base: '95vw', md: '700px' }}>
                    <ModalHeader>{editingFaq ? 'Edit FAQ' : 'Create New FAQ'}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <VStack spacing={4} align="stretch">
                            <FormControl isRequired>
                                <FormLabel>Question</FormLabel>
                                <Input
                                    value={question}
                                    onChange={e => setQuestion(e.target.value)}
                                    placeholder="e.g., How much does wash and fold cost?"
                                />
                            </FormControl>

                            <FormControl isRequired>
                                <FormLabel>Answer Template</FormLabel>
                                <Textarea
                                    value={answerTemplate}
                                    onChange={e => setAnswerTemplate(e.target.value)}
                                    placeholder="Use {{tokens}} for dynamic values, e.g., Our price is {{price_wash_fold}} per pound."
                                    rows={5}
                                />
                                <Text fontSize="xs" color="gray.500" mt={1}>
                                    Use {'{{token_name}}'} syntax to insert dynamic tenant data
                                </Text>
                            </FormControl>

                            <FormControl isRequired>
                                <FormLabel>Category</FormLabel>
                                <Select
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                    placeholder="Select a category"
                                >
                                    {existingCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                    <option value="__custom__">+ New category...</option>
                                </Select>
                                {category === '__custom__' && (
                                    <Input
                                        mt={2}
                                        value={customCategory}
                                        onChange={e => setCustomCategory(e.target.value)}
                                        placeholder="Enter new category name"
                                    />
                                )}
                            </FormControl>

                            <FormControl>
                                <FormLabel>Display Order</FormLabel>
                                <Input
                                    type="number"
                                    value={displayOrder}
                                    onChange={e => setDisplayOrder(parseInt(e.target.value) || 0)}
                                    w="120px"
                                />
                            </FormControl>

                            <Divider />

                            {/* Preview Panel */}
                            {answerTemplate && (
                                <Box>
                                    <Text fontWeight="bold" fontSize="sm" mb={1} color="green.600">
                                        Preview (with current tenant data):
                                    </Text>
                                    <Box bg="green.50" p={3} borderRadius="md" fontSize="sm" whiteSpace="pre-wrap">
                                        {previewAnswer}
                                    </Box>
                                </Box>
                            )}

                            {/* Token Reference (collapsible) */}
                            <Box>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowTokenRef(!showTokenRef)}
                                    rightIcon={showTokenRef ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                >
                                    Available Tokens ({tokens.length})
                                </Button>
                                <Collapse in={showTokenRef}>
                                    <Box mt={2} bg="gray.50" p={3} borderRadius="md" maxH="200px" overflowY="auto">
                                        {tokens.length === 0 ? (
                                            <Text fontSize="sm" color="gray.500">No tokens available</Text>
                                        ) : (
                                            <Table size="xs" variant="simple">
                                                <Thead>
                                                    <Tr>
                                                        <Th fontSize="xs">Token</Th>
                                                        <Th fontSize="xs">Description</Th>
                                                        <Th fontSize="xs">Current Value</Th>
                                                    </Tr>
                                                </Thead>
                                                <Tbody>
                                                    {tokens.map(t => (
                                                        <Tr key={t.token}>
                                                            <Td fontSize="xs">
                                                                <Badge colorScheme="blue" fontSize="xs" fontFamily="mono">
                                                                    {t.placeholder}
                                                                </Badge>
                                                            </Td>
                                                            <Td fontSize="xs">{t.description}</Td>
                                                            <Td fontSize="xs" color="gray.600" maxW="150px" isTruncated>
                                                                {t.currentValue || '—'}
                                                            </Td>
                                                        </Tr>
                                                    ))}
                                                </Tbody>
                                            </Table>
                                        )}
                                    </Box>
                                </Collapse>
                            </Box>
                        </VStack>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" mr={3} onClick={onClose}>
                            Cancel
                        </Button>
                        <Button colorScheme="blue" onClick={handleSave} isLoading={saving}>
                            {editingFaq ? 'Update' : 'Create'}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Container>
    );
};

export default FAQManagementPage;
