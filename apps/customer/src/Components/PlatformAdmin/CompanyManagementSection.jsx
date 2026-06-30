import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, VStack, HStack, Text, Button, Spinner, Badge, Flex, IconButton,
    Table, Thead, Tbody, Tr, Th, Td, useToast,
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
    Input, FormControl, FormLabel, useDisclosure, Divider, Tag, TagLabel, Wrap, WrapItem,
    AlertDialog, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader, AlertDialogBody, AlertDialogFooter,
    Select,
} from '@chakra-ui/react';
import { FiRefreshCw, FiPlus, FiArrowLeft, FiTrash2, FiX, FiMail } from 'react-icons/fi';
import axios from 'axios';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export default function CompanyManagementSection({ platformKey, onAuthError }) {
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [formMode, setFormMode] = useState('list'); // 'list' | 'create' | 'edit'
    const toast = useToast();

    // Create company modal state
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [createName, setCreateName] = useState('');
    const [createEmail, setCreateEmail] = useState('');
    const [createPhone, setCreatePhone] = useState('');
    const [creating, setCreating] = useState(false);

    // Edit company modal state
    const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [updating, setUpdating] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Delete company state
    const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
    const [deletingId, setDeletingId] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const cancelRef = useRef();

    // Regenerate code state
    const [regenerating, setRegenerating] = useState(false);

    // Location assignment state
    const [allLaundries, setAllLaundries] = useState([]);
    const [selectedLaundryId, setSelectedLaundryId] = useState('');
    const [assigning, setAssigning] = useState(false);
    const [removingLocationId, setRemovingLocationId] = useState(null);

    // Company admin state
    const [companyAdmins, setCompanyAdmins] = useState([]);
    const [showAddAdmin, setShowAddAdmin] = useState(false);
    const [adminEmail, setAdminEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [adminFirstName, setAdminFirstName] = useState('');
    const [adminLastName, setAdminLastName] = useState('');
    const [creatingAdmin, setCreatingAdmin] = useState(false);

    const headers = { 'x-platform-key': platformKey };

    const fetchCompanies = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/platform/companies`, { headers });
            if (res.data.status === 'success') {
                setCompanies(res.data.companies || []);
            }
        } catch (err) {
            if (err.response?.status === 403) {
                onAuthError();
            } else {
                toast({ title: 'Failed to load companies', status: 'error', duration: 3000 });
            }
        } finally {
            setLoading(false);
        }
    }, [platformKey]);

    useEffect(() => {
        fetchCompanies();
    }, [fetchCompanies]);

    const fetchAllLaundries = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/platform/laundries`, { headers });
            if (res.data.status === 'success') {
                setAllLaundries(res.data.laundries || []);
            }
        } catch (err) {
            console.error("Failed to fetch laundries for assignment dropdown:", err);
        }
    }, [platformKey]);

    const refreshCompanyDetail = async (companyId) => {
        try {
            const res = await axios.get(`${API_URL}/api/platform/companies/${companyId}`, { headers });
            if (res.data.status === 'success') {
                const detail = res.data.company;
                setSelectedCompany(detail);
                setEditName(detail.companyName || '');
                setEditEmail(detail.contactEmail || '');
                setEditPhone(detail.contactPhone || '');
            }
        } catch (err) {
            // Silently fail
        }
    };

    const resetCreateForm = () => {
        setCreateName('');
        setCreateEmail('');
        setCreatePhone('');
    };

    const handleCloseModal = () => {
        resetCreateForm();
        onClose();
    };

    const handleCompanyClick = async (company) => {
        setSelectedCompany(company);
        setLoadingDetail(true);
        setSelectedLaundryId('');
        setShowAddAdmin(false);
        setCompanyAdmins([]);
        onEditOpen();
        try {
            const [companyRes] = await Promise.all([
                axios.get(`${API_URL}/api/platform/companies/${company.companyId}`, { headers }),
                fetchAllLaundries(),
                fetchCompanyAdmins(company.companyId),
            ]);
            if (companyRes.data.status === 'success') {
                const detail = companyRes.data.company;
                setSelectedCompany(detail);
                setEditName(detail.companyName || '');
                setEditEmail(detail.contactEmail || '');
                setEditPhone(detail.contactPhone || '');
            }
        } catch (err) {
            if (err.response?.status === 403) {
                onAuthError();
            } else {
                toast({ title: 'Failed to load company details', status: 'error', duration: 3000 });
                onEditClose();
            }
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleCloseEditModal = () => {
        setSelectedCompany(null);
        setEditName('');
        setEditEmail('');
        setEditPhone('');
        onEditClose();
    };

    const handleUpdateCompany = async () => {
        if (!selectedCompany) return;
        if (!editName.trim()) {
            toast({ title: 'Company name cannot be empty', status: 'warning', duration: 3000 });
            return;
        }
        setUpdating(true);
        try {
            const res = await axios.put(
                `${API_URL}/api/platform/companies/${selectedCompany.companyId}`,
                {
                    company_name: editName,
                    contact_email: editEmail,
                    contact_phone: editPhone,
                },
                { headers }
            );
            if (res.data.status === 'success') {
                toast({ title: 'Company updated successfully', status: 'success', duration: 3000 });
                fetchCompanies();
                handleCloseEditModal();
            } else {
                toast({ title: res.data.message || 'Update failed', status: 'error', duration: 4000 });
            }
        } catch (err) {
            if (err.response?.status === 403) {
                onAuthError();
            } else {
                const message = err.response?.data?.detail || err.response?.data?.message || 'Failed to update company';
                toast({ title: message, status: 'error', duration: 4000 });
            }
        } finally {
            setUpdating(false);
        }
    };

    const handleCreateCompany = async () => {
        if (!createName.trim()) return;
        setCreating(true);
        try {
            const res = await axios.post(`${API_URL}/api/platform/companies`, {
                company_name: createName,
                contact_email: createEmail,
                contact_phone: createPhone,
            }, { headers });
            const joinCode = res.data.joinCode || res.data.join_code || '';
            toast({
                title: `Company created! Join code: ${joinCode}`,
                status: 'success',
                duration: 5000,
            });
            handleCloseModal();
            fetchCompanies();
        } catch (err) {
            const message = err.response?.data?.detail || err.response?.data?.message || 'Failed to create company';
            toast({ title: message, status: 'error', duration: 4000 });
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteClick = (e, companyId) => {
        e.stopPropagation();
        setDeletingId(companyId);
        onDeleteOpen();
    };

    const handleDeleteConfirm = async () => {
        if (!deletingId) return;
        setDeleting(true);
        try {
            await axios.delete(`${API_URL}/api/platform/companies/${deletingId}`, { headers });
            toast({ title: 'Company deleted successfully', status: 'success', duration: 3000 });
            onDeleteClose();
            setDeletingId(null);
            // Close edit modal if the deleted company was being edited
            if (selectedCompany && selectedCompany.companyId === deletingId) {
                handleCloseEditModal();
            }
            fetchCompanies();
        } catch (err) {
            if (err.response?.status === 403) {
                onAuthError();
            } else {
                const message = err.response?.data?.detail || err.response?.data?.message || 'Failed to delete company';
                toast({ title: message, status: 'error', duration: 4000 });
            }
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteCancel = () => {
        onDeleteClose();
        setDeletingId(null);
    };

    const handleSendCredentials = async (e, companyId) => {
        e.stopPropagation();
        try {
            const res = await axios.post(
                `${API_URL}/api/platform/companies/${companyId}/send-admin-credentials`,
                {},
                { headers }
            );
            if (res.data.status === 'success') {
                toast({ title: res.data.message, status: 'success', duration: 4000 });
            } else {
                toast({ title: res.data.message || 'Failed to send email', status: 'error', duration: 4000 });
            }
        } catch (err) {
            if (err.response?.status === 403) {
                onAuthError();
            } else {
                const message = err.response?.data?.detail || err.response?.data?.message || 'Failed to send credentials';
                toast({ title: message, status: 'error', duration: 4000 });
            }
        }
    };

    const fetchCompanyAdmins = async (companyId) => {
        try {
            const res = await axios.get(`${API_URL}/api/platform/companies/${companyId}/admins`, { headers });
            if (res.data.status === 'success') {
                setCompanyAdmins(res.data.admins || []);
            }
        } catch (err) {
            console.error("Failed to fetch company admins:", err);
        }
    };

    const handleCreateAdmin = async () => {
        if (!selectedCompany || !adminEmail || !adminPassword) return;
        setCreatingAdmin(true);
        try {
            const res = await axios.post(
                `${API_URL}/api/platform/companies/${selectedCompany.companyId}/admins`,
                { email: adminEmail, password: adminPassword, firstName: adminFirstName, lastName: adminLastName },
                { headers }
            );
            if (res.data.status === 'success') {
                toast({ title: 'Company admin created!', status: 'success', duration: 3000 });
                setAdminEmail(''); setAdminPassword(''); setAdminFirstName(''); setAdminLastName('');
                setShowAddAdmin(false);
                fetchCompanyAdmins(selectedCompany.companyId);
            } else {
                toast({ title: res.data.message || 'Failed to create admin', status: 'error', duration: 4000 });
            }
        } catch (err) {
            const message = err.response?.data?.detail || err.response?.data?.message || 'Failed to create admin';
            toast({ title: message, status: 'error', duration: 4000 });
        } finally {
            setCreatingAdmin(false);
        }
    };

    const handleAssignLocation = async () => {
        if (!selectedCompany || !selectedLaundryId) {
            console.warn("Assign blocked: selectedCompany=", selectedCompany?.companyId, "selectedLaundryId=", selectedLaundryId);
            return;
        }
        setAssigning(true);
        try {
            const res = await axios.put(
                `${API_URL}/api/platform/companies/${selectedCompany.companyId}/locations`,
                { laundryId: selectedLaundryId },
                { headers }
            );
            toast({ title: 'Location assigned successfully', status: 'success', duration: 3000 });
            setSelectedLaundryId('');
            await refreshCompanyDetail(selectedCompany.companyId);
            fetchCompanies();
        } catch (err) {
            console.error("Assign location error:", err);
            if (err.response?.status === 409) {
                toast({ title: 'Laundry already belongs to another company', status: 'error', duration: 4000 });
            } else if (err.response?.status === 403) {
                onAuthError();
            } else {
                const message = err.response?.data?.detail || err.response?.data?.message || 'Failed to assign location';
                toast({ title: message, status: 'error', duration: 4000 });
            }
        } finally {
            setAssigning(false);
        }
    };

    const handleRemoveLocation = async (laundryId) => {
        if (!selectedCompany) return;
        setRemovingLocationId(laundryId);
        try {
            await axios.delete(
                `${API_URL}/api/platform/companies/${selectedCompany.companyId}/locations/${laundryId}`,
                { headers }
            );
            toast({ title: 'Location removed successfully', status: 'success', duration: 3000 });
            await refreshCompanyDetail(selectedCompany.companyId);
            fetchCompanies();
        } catch (err) {
            if (err.response?.status === 403) {
                onAuthError();
            } else {
                const message = err.response?.data?.detail || err.response?.data?.message || 'Failed to remove location';
                toast({ title: message, status: 'error', duration: 4000 });
            }
        } finally {
            setRemovingLocationId(null);
        }
    };

    const handleRegenerateCode = async () => {
        if (!selectedCompany) return;
        setRegenerating(true);
        try {
            const res = await axios.post(
                `${API_URL}/api/platform/companies/${selectedCompany.companyId}/regenerate-code`,
                {},
                { headers }
            );
            if (res.data.status === 'success') {
                const newCode = res.data.joinCode || res.data.join_code || '';
                setSelectedCompany(prev => ({ ...prev, joinCode: newCode }));
                toast({ title: `Join code regenerated: ${newCode}`, status: 'success', duration: 4000 });
                fetchCompanies();
            } else {
                toast({ title: res.data.message || 'Failed to regenerate code', status: 'error', duration: 4000 });
            }
        } catch (err) {
            if (err.response?.status === 403) {
                onAuthError();
            } else {
                const message = err.response?.data?.detail || err.response?.data?.message || 'Failed to regenerate code';
                toast({ title: message, status: 'error', duration: 4000 });
            }
        } finally {
            setRegenerating(false);
        }
    };

    // Compute unassigned laundries: filter out those already assigned to this company
    const assignedLaundryIds = new Set((selectedCompany?.locations || []).map(loc => loc.laundryId));
    const unassignedLaundries = allLaundries.filter(l => !assignedLaundryIds.has(l.laundryId));

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString();
    };

    return (
        <Box>
            <Flex justify="space-between" align="center" mb={4}>
                <Text fontWeight="700" fontSize="lg" color="gray.800">Companies</Text>
                <HStack>
                    <Button
                        leftIcon={<FiPlus />}
                        size="sm"
                        colorScheme="blue"
                        onClick={onOpen}
                    >
                        Create Company
                    </Button>
                    <IconButton
                        icon={<FiRefreshCw />}
                        onClick={fetchCompanies}
                        size="sm"
                        variant="ghost"
                        aria-label="Refresh companies"
                        isLoading={loading}
                    />
                </HStack>
            </Flex>

            {loading ? (
                <Flex justify="center" py={10}>
                    <Spinner size="xl" />
                </Flex>
            ) : (
                <Box overflowX="auto" bg="white" borderRadius="xl" boxShadow="sm" border="1px solid" borderColor="gray.100">
                    <Table variant="simple" size="sm">
                        <Thead>
                            <Tr>
                                <Th>Name</Th>
                                <Th>Email</Th>
                                <Th>Phone</Th>
                                <Th>Locations</Th>
                                <Th>Join Code</Th>
                                <Th>Created</Th>
                                <Th></Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {companies.length === 0 ? (
                                <Tr>
                                    <Td colSpan={7} textAlign="center" py={8} color="gray.500">
                                        No companies found.
                                    </Td>
                                </Tr>
                            ) : (
                                companies.map((company) => (
                                    <Tr key={company.companyId} _hover={{ bg: 'gray.50' }} cursor="pointer" onClick={() => handleCompanyClick(company)}>
                                        <Td fontWeight="600">{company.companyName}</Td>
                                        <Td>{company.contactEmail || '—'}</Td>
                                        <Td>{company.contactPhone || '—'}</Td>
                                        <Td>
                                            <Badge colorScheme="blue">{company.locationCount ?? 0}</Badge>
                                        </Td>
                                        <Td>
                                            <Text fontFamily="mono" fontSize="xs" color="orange.600">
                                                {company.joinCode || '—'}
                                            </Text>
                                        </Td>
                                        <Td fontSize="xs" color="gray.500">{formatDate(company.createdAt)}</Td>
                                        <Td>
                                            <HStack spacing={1}>
                                                <IconButton
                                                    icon={<FiMail />}
                                                    size="sm"
                                                    variant="ghost"
                                                    colorScheme="blue"
                                                    aria-label="Send admin credentials email"
                                                    title="Send login credentials to company admin"
                                                    onClick={(e) => handleSendCredentials(e, company.companyId)}
                                                />
                                                <IconButton
                                                    icon={<FiTrash2 />}
                                                    size="sm"
                                                    variant="ghost"
                                                    colorScheme="red"
                                                    aria-label="Delete company"
                                                    onClick={(e) => handleDeleteClick(e, company.companyId)}
                                                />
                                            </HStack>
                                        </Td>
                                    </Tr>
                                ))
                            )}
                        </Tbody>
                    </Table>
                </Box>
            )}

            {/* Create Company Modal */}
            <Modal isOpen={isOpen} onClose={handleCloseModal} isCentered>
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Create Company</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <VStack spacing={4}>
                            <FormControl isRequired>
                                <FormLabel>Company Name</FormLabel>
                                <Input
                                    placeholder="Enter company name"
                                    value={createName}
                                    onChange={(e) => setCreateName(e.target.value)}
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Contact Email</FormLabel>
                                <Input
                                    type="email"
                                    placeholder="contact@company.com"
                                    value={createEmail}
                                    onChange={(e) => setCreateEmail(e.target.value)}
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Contact Phone</FormLabel>
                                <Input
                                    type="tel"
                                    placeholder="+1 (555) 123-4567"
                                    value={createPhone}
                                    onChange={(e) => setCreatePhone(e.target.value)}
                                />
                            </FormControl>
                        </VStack>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" mr={3} onClick={handleCloseModal}>
                            Cancel
                        </Button>
                        <Button
                            colorScheme="blue"
                            onClick={handleCreateCompany}
                            isLoading={creating}
                            isDisabled={!createName.trim() || creating}
                        >
                            Create
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Edit Company Modal */}
            <Modal isOpen={isEditOpen} onClose={handleCloseEditModal} isCentered size="lg">
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Company Details</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        {loadingDetail ? (
                            <Flex justify="center" py={8}>
                                <Spinner size="lg" />
                            </Flex>
                        ) : selectedCompany ? (
                            <VStack spacing={4} align="stretch">
                                <FormControl isRequired>
                                    <FormLabel>Company Name</FormLabel>
                                    <Input
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                    />
                                </FormControl>
                                <FormControl>
                                    <FormLabel>Contact Email</FormLabel>
                                    <Input
                                        type="email"
                                        value={editEmail}
                                        onChange={(e) => setEditEmail(e.target.value)}
                                    />
                                </FormControl>
                                <FormControl>
                                    <FormLabel>Contact Phone</FormLabel>
                                    <Input
                                        type="tel"
                                        value={editPhone}
                                        onChange={(e) => setEditPhone(e.target.value)}
                                    />
                                </FormControl>

                                <Divider />

                                <Box>
                                    <Text fontWeight="600" fontSize="sm" mb={1}>Join Code</Text>
                                    <HStack>
                                        <Text fontFamily="mono" fontSize="sm" color="orange.600">
                                            {selectedCompany.joinCode || '—'}
                                        </Text>
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            colorScheme="orange"
                                            leftIcon={<FiRefreshCw />}
                                            onClick={handleRegenerateCode}
                                            isLoading={regenerating}
                                            isDisabled={regenerating}
                                        >
                                            Regenerate
                                        </Button>
                                    </HStack>
                                </Box>

                                <Box>
                                    <Text fontWeight="600" fontSize="sm" mb={2}>Assigned Locations</Text>
                                    {selectedCompany.locations && selectedCompany.locations.length > 0 ? (
                                        <Wrap spacing={2} mb={3}>
                                            {selectedCompany.locations.map((loc) => (
                                                <WrapItem key={loc.laundryId}>
                                                    <Tag size="md" colorScheme="blue" borderRadius="full">
                                                        <TagLabel>{loc.laundryName}</TagLabel>
                                                        <IconButton
                                                            icon={<FiX />}
                                                            size="xs"
                                                            variant="ghost"
                                                            colorScheme="blue"
                                                            ml={1}
                                                            aria-label={`Remove ${loc.laundryName}`}
                                                            isLoading={removingLocationId === loc.laundryId}
                                                            onClick={() => handleRemoveLocation(loc.laundryId)}
                                                            minW="auto"
                                                            h="auto"
                                                            p={0}
                                                        />
                                                    </Tag>
                                                </WrapItem>
                                            ))}
                                        </Wrap>
                                    ) : (
                                        <Text fontSize="sm" color="gray.500" mb={3}>No locations assigned.</Text>
                                    )}
                                    <HStack>
                                        <Select
                                            placeholder="Select laundry to assign"
                                            size="sm"
                                            value={selectedLaundryId}
                                            onChange={(e) => setSelectedLaundryId(e.target.value)}
                                        >
                                            {unassignedLaundries.map((l) => (
                                                <option key={l.laundryId} value={l.laundryId}>
                                                    {l.laundryName}
                                                </option>
                                            ))}
                                        </Select>
                                        <Button
                                            size="sm"
                                            colorScheme="green"
                                            onClick={handleAssignLocation}
                                            isLoading={assigning}
                                            isDisabled={!selectedLaundryId || assigning}
                                        >
                                            Assign
                                        </Button>
                                    </HStack>
                                </Box>

                                <Divider />

                                <Box>
                                    <HStack justify="space-between" mb={2}>
                                        <Text fontWeight="600" fontSize="sm">Company Admins</Text>
                                        <Button size="xs" colorScheme="purple" onClick={() => setShowAddAdmin(!showAddAdmin)}>
                                            {showAddAdmin ? 'Cancel' : '+ Add Admin'}
                                        </Button>
                                    </HStack>
                                    <Text fontSize="xs" color="gray.500" mb={2}>
                                        Admins can log in at /company/login to see the rollup dashboard.
                                    </Text>
                                    {companyAdmins.length > 0 ? (
                                        <VStack spacing={1} align="stretch" mb={3}>
                                            {companyAdmins.map((admin) => (
                                                <HStack key={admin.adminId} p={2} bg="purple.50" borderRadius="md" fontSize="sm">
                                                    <Text fontWeight="500">{admin.firstName} {admin.lastName}</Text>
                                                    <Text color="gray.600">({admin.email})</Text>
                                                </HStack>
                                            ))}
                                        </VStack>
                                    ) : (
                                        <Text fontSize="sm" color="gray.500" mb={3}>No admins yet. Create one to enable company login.</Text>
                                    )}
                                    {showAddAdmin && (
                                        <Box p={3} bg="purple.50" borderRadius="md" border="1px" borderColor="purple.100">
                                            <VStack spacing={2} align="stretch">
                                                <HStack>
                                                    <Input size="sm" placeholder="First name" value={adminFirstName} onChange={(e) => setAdminFirstName(e.target.value)} />
                                                    <Input size="sm" placeholder="Last name" value={adminLastName} onChange={(e) => setAdminLastName(e.target.value)} />
                                                </HStack>
                                                <Input size="sm" type="email" placeholder="Email (used for login)" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
                                                <Input size="sm" type="password" placeholder="Password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
                                                <Button size="sm" colorScheme="purple" onClick={handleCreateAdmin} isLoading={creatingAdmin} isDisabled={!adminEmail || !adminPassword}>
                                                    Create Admin
                                                </Button>
                                            </VStack>
                                        </Box>
                                    )}
                                </Box>
                            </VStack>
                        ) : null}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" mr={3} onClick={handleCloseEditModal} leftIcon={<FiArrowLeft />}>
                            Back to List
                        </Button>
                        <Button
                            colorScheme="red"
                            variant="outline"
                            mr={3}
                            onClick={(e) => { handleDeleteClick(e, selectedCompany?.companyId); }}
                            isDisabled={!selectedCompany || loadingDetail}
                            leftIcon={<FiTrash2 />}
                        >
                            Delete
                        </Button>
                        <Button
                            colorScheme="blue"
                            onClick={handleUpdateCompany}
                            isLoading={updating}
                            isDisabled={!editName.trim() || updating || loadingDetail}
                        >
                            Save
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                isOpen={isDeleteOpen}
                leastDestructiveRef={cancelRef}
                onClose={handleDeleteCancel}
                isCentered
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            Delete Company
                        </AlertDialogHeader>
                        <AlertDialogBody>
                            Are you sure you want to delete this company? All assigned locations will be unlinked (not deleted).
                        </AlertDialogBody>
                        <AlertDialogFooter>
                            <Button ref={cancelRef} onClick={handleDeleteCancel}>
                                Cancel
                            </Button>
                            <Button
                                colorScheme="red"
                                onClick={handleDeleteConfirm}
                                ml={3}
                                isLoading={deleting}
                            >
                                Delete
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
        </Box>
    );
}
