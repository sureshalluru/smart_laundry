import React, { useEffect, useState } from 'react';
import {
    Box, VStack, HStack, Text, Input, Button, Badge, Spinner, Flex,
    FormControl, FormLabel, useToast, Divider, IconButton, InputGroup,
    InputRightElement
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import axios from 'axios';

const PROVIDERS = [
    {
        id: 'twilio',
        label: 'Twilio (SMS)',
        keys: [
            { key_name: 'account_sid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
            { key_name: 'auth_token', label: 'Auth Token', placeholder: 'Your Twilio auth token' },
            { key_name: 'phone_number', label: 'Phone Number', placeholder: '+15551234567' },
            { key_name: 'verify_service_sid', label: 'Verify Service SID', placeholder: 'VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
        ]
    },
    {
        id: 'brevo',
        label: 'Brevo (Email)',
        keys: [
            { key_name: 'api_key', label: 'API Key', placeholder: 'xkeysib-...' },
        ]
    },
    {
        id: 'anthropic',
        label: 'Anthropic (AI)',
        keys: [
            { key_name: 'api_key', label: 'API Key', placeholder: 'sk-ant-...' },
        ]
    },
    {
        id: 'google_maps',
        label: 'Google Maps',
        keys: [
            { key_name: 'api_key', label: 'API Key', placeholder: 'AIza...' },
        ]
    },
    {
        id: 's3',
        label: 'S3 / AWS',
        keys: [
            { key_name: 'access_key_id', label: 'Access Key ID', placeholder: 'AKIA...' },
            { key_name: 'secret_access_key', label: 'Secret Access Key', placeholder: 'Your AWS secret' },
            { key_name: 'region', label: 'Region', placeholder: 'us-east-1' },
            { key_name: 'logo_bucket', label: 'Logo Bucket', placeholder: 'laundrylogos' },
            { key_name: 'review_bucket', label: 'Review Bucket', placeholder: 'laundry-review-images' },
            { key_name: 'tracking_bucket', label: 'Tracking Bucket', placeholder: 'laundry-item-tracking' },
        ]
    },
];

const IntegrationsTab = ({ laundryId }) => {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [storedKeys, setStoredKeys] = useState([]);
    const [editValues, setEditValues] = useState({});
    const [showValues, setShowValues] = useState({});
    const authToken = localStorage.getItem('idToken');

    useEffect(() => {
        fetchKeys();
    }, [laundryId]);

    const fetchKeys = async () => {
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/integrations`,
                {
                    params: { laundryId },
                    headers: { Authorization: `Bearer ${authToken}` }
                }
            );
            const keys = res.data?.body?.keys || [];
            setStoredKeys(keys);
        } catch (err) {
            console.error('Error fetching integrations:', err);
            toast({ title: 'Error loading integrations', status: 'error', duration: 3000 });
        } finally {
            setLoading(false);
        }
    };

    const getStoredKey = (provider, key_name) => {
        return storedKeys.find(k => k.provider === provider && k.key_name === key_name);
    };

    const handleEdit = (provider, key_name, value) => {
        setEditValues(prev => ({
            ...prev,
            [`${provider}:${key_name}`]: value
        }));
    };

    const toggleShow = (provider, key_name) => {
        const key = `${provider}:${key_name}`;
        setShowValues(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        const keysToUpdate = Object.entries(editValues)
            .filter(([_, value]) => value && value.trim())
            .map(([key, value]) => {
                const [provider, key_name] = key.split(':');
                return { provider, key_name, value: value.trim() };
            });

        if (keysToUpdate.length === 0) {
            toast({ title: 'No changes to save', status: 'info', duration: 2000 });
            return;
        }

        setSaving(true);
        try {
            const res = await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/integrations`,
                { laundryId, keys: keysToUpdate },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );
            const updatedKeys = res.data?.body?.keys || [];
            setStoredKeys(updatedKeys);
            setEditValues({});
            toast({ title: 'Keys saved successfully', status: 'success', duration: 3000 });
        } catch (err) {
            const detail = err.response?.data?.detail || 'Failed to save keys';
            const status = err.response?.status;
            if (status === 403) {
                toast({ title: 'Cannot modify managed key', description: detail, status: 'error', duration: 5000 });
            } else {
                toast({ title: 'Error saving keys', description: detail, status: 'error', duration: 3000 });
            }
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <Flex justify="center" p={8}><Spinner size="lg" /></Flex>;
    }

    const hasChanges = Object.values(editValues).some(v => v && v.trim());

    return (
        <Box p={4}>
            <Text fontSize="xl" fontWeight="bold" mb={2}>🔑 Integrations</Text>
            <Text fontSize="sm" color="gray.600" mb={6}>
                Manage your third-party API keys. Keys are encrypted at rest and never displayed in full.
            </Text>

            <VStack spacing={6} align="stretch">
                {PROVIDERS.map(provider => (
                    <Box
                        key={provider.id}
                        p={4}
                        bg="gray.50"
                        borderRadius="md"
                        border="1px solid"
                        borderColor="gray.200"
                    >
                        <Text fontWeight="bold" mb={3} fontSize="md">{provider.label}</Text>
                        <VStack spacing={3} align="stretch">
                            {provider.keys.map(keyDef => {
                                const stored = getStoredKey(provider.id, keyDef.key_name);
                                const editKey = `${provider.id}:${keyDef.key_name}`;
                                const isManaged = stored?.is_platform_managed;
                                const showVal = showValues[editKey];

                                return (
                                    <FormControl key={keyDef.key_name}>
                                        <HStack spacing={2} mb={1}>
                                            <FormLabel mb={0} fontSize="sm" fontWeight="medium">
                                                {keyDef.label}
                                            </FormLabel>
                                            {isManaged && (
                                                <Badge colorScheme="purple" fontSize="xs">
                                                    Managed by platform
                                                </Badge>
                                            )}
                                        </HStack>
                                        {stored && !editValues[editKey] && (
                                            <Text fontSize="xs" color="gray.500" mb={1}>
                                                Current: {stored.masked_value || 'No key configured'}
                                                {stored.updated_at && ` • Updated: ${new Date(stored.updated_at).toLocaleDateString()}`}
                                            </Text>
                                        )}
                                        <InputGroup size="sm">
                                            <Input
                                                type={showVal ? 'text' : 'password'}
                                                placeholder={stored ? 'Enter new value to replace' : keyDef.placeholder}
                                                value={editValues[editKey] || ''}
                                                onChange={e => handleEdit(provider.id, keyDef.key_name, e.target.value)}
                                                isDisabled={isManaged}
                                                bg="white"
                                            />
                                            <InputRightElement>
                                                <IconButton
                                                    size="xs"
                                                    variant="ghost"
                                                    icon={showVal ? <ViewOffIcon /> : <ViewIcon />}
                                                    onClick={() => toggleShow(provider.id, keyDef.key_name)}
                                                    aria-label={showVal ? 'Hide' : 'Show'}
                                                />
                                            </InputRightElement>
                                        </InputGroup>
                                    </FormControl>
                                );
                            })}
                        </VStack>
                    </Box>
                ))}
            </VStack>

            <Divider my={4} />

            <Button
                colorScheme="blue"
                onClick={handleSave}
                isLoading={saving}
                isDisabled={!hasChanges}
            >
                Save Changes
            </Button>
        </Box>
    );
};

export default IntegrationsTab;
