import React, { useState } from 'react';
import {
    VStack, HStack, Text, Input, Button, FormControl, FormLabel,
    Heading, Card, CardBody, Alert, AlertIcon, Badge, Box,
    InputGroup, InputRightElement, IconButton
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';

const KEY_FIELDS = [
    {
        provider: 'twilio',
        key_name: 'account_sid',
        label: 'Twilio Account SID',
        placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        validate: (v) => !v || v.startsWith('AC') ? '' : 'Twilio Account SID must start with "AC"',
    },
    {
        provider: 'twilio',
        key_name: 'auth_token',
        label: 'Twilio Auth Token',
        placeholder: 'Your auth token',
        validate: () => '',
    },
    {
        provider: 'twilio',
        key_name: 'phone_number',
        label: 'Twilio Phone Number',
        placeholder: '+15551234567',
        validate: (v) => !v || v.startsWith('+') ? '' : 'Phone number should start with "+"',
    },
    {
        provider: 'brevo',
        key_name: 'api_key',
        label: 'Brevo API Key',
        placeholder: 'xkeysib-...',
        validate: () => '',
    },
    {
        provider: 'anthropic',
        key_name: 'api_key',
        label: 'Anthropic API Key',
        placeholder: 'sk-ant-...',
        validate: () => '',
    },
    {
        provider: 'google_maps',
        key_name: 'api_key',
        label: 'Google Maps API Key',
        placeholder: 'AIza...',
        validate: () => '',
    },
];

const OnboardingApiKeysStep = ({ onSubmit, onSkip }) => {
    const [values, setValues] = useState({});
    const [errors, setErrors] = useState({});
    const [showValues, setShowValues] = useState({});

    const handleChange = (provider, key_name, value) => {
        const key = `${provider}:${key_name}`;
        setValues(prev => ({ ...prev, [key]: value }));

        // Clear error on change
        if (errors[key]) {
            setErrors(prev => ({ ...prev, [key]: '' }));
        }
    };

    const toggleShow = (key) => {
        setShowValues(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSubmit = () => {
        // Validate all filled fields
        const newErrors = {};
        let hasError = false;

        KEY_FIELDS.forEach(field => {
            const key = `${field.provider}:${field.key_name}`;
            const value = values[key] || '';
            if (value.trim()) {
                const error = field.validate(value.trim());
                if (error) {
                    newErrors[key] = error;
                    hasError = true;
                }
            }
        });

        setErrors(newErrors);
        if (hasError) return;

        // Build keys array with only non-empty values
        const keys = KEY_FIELDS
            .filter(field => {
                const key = `${field.provider}:${field.key_name}`;
                return values[key] && values[key].trim();
            })
            .map(field => ({
                provider: field.provider,
                key_name: field.key_name,
                value: values[`${field.provider}:${field.key_name}`].trim(),
            }));

        onSubmit(keys);
    };

    const hasAnyValues = Object.values(values).some(v => v && v.trim());

    return (
        <VStack spacing={4} align="stretch">
            <Heading size="md">🔑 API Keys (Optional)</Heading>
            <Text fontSize="sm" color="gray.600">
                If you have your own API keys for these services, enter them below.
                This is entirely optional — the platform works without them using shared infrastructure.
            </Text>

            <Alert status="info" borderRadius="md">
                <AlertIcon />
                <Text fontSize="sm">
                    You can skip this step and configure keys later from your admin panel under Settings → Integrations.
                </Text>
            </Alert>

            <Card variant="outline">
                <CardBody>
                    <VStack spacing={4} align="stretch">
                        <Box>
                            <Badge colorScheme="blue" mb={2}>Twilio (SMS)</Badge>
                            {KEY_FIELDS.filter(f => f.provider === 'twilio').map(field => {
                                const key = `${field.provider}:${field.key_name}`;
                                return (
                                    <FormControl key={key} mb={3} isInvalid={!!errors[key]}>
                                        <FormLabel fontSize="sm">{field.label}</FormLabel>
                                        <InputGroup size="sm">
                                            <Input
                                                type={showValues[key] ? 'text' : 'password'}
                                                placeholder={field.placeholder}
                                                value={values[key] || ''}
                                                onChange={e => handleChange(field.provider, field.key_name, e.target.value)}
                                            />
                                            <InputRightElement>
                                                <IconButton
                                                    size="xs"
                                                    variant="ghost"
                                                    icon={showValues[key] ? <ViewOffIcon /> : <ViewIcon />}
                                                    onClick={() => toggleShow(key)}
                                                    aria-label={showValues[key] ? 'Hide' : 'Show'}
                                                />
                                            </InputRightElement>
                                        </InputGroup>
                                        {errors[key] && (
                                            <Text fontSize="xs" color="red.500" mt={1}>{errors[key]}</Text>
                                        )}
                                    </FormControl>
                                );
                            })}
                        </Box>

                        <Box>
                            <Badge colorScheme="green" mb={2}>Brevo (Email)</Badge>
                            {KEY_FIELDS.filter(f => f.provider === 'brevo').map(field => {
                                const key = `${field.provider}:${field.key_name}`;
                                return (
                                    <FormControl key={key} mb={3} isInvalid={!!errors[key]}>
                                        <FormLabel fontSize="sm">{field.label}</FormLabel>
                                        <InputGroup size="sm">
                                            <Input
                                                type={showValues[key] ? 'text' : 'password'}
                                                placeholder={field.placeholder}
                                                value={values[key] || ''}
                                                onChange={e => handleChange(field.provider, field.key_name, e.target.value)}
                                            />
                                            <InputRightElement>
                                                <IconButton
                                                    size="xs"
                                                    variant="ghost"
                                                    icon={showValues[key] ? <ViewOffIcon /> : <ViewIcon />}
                                                    onClick={() => toggleShow(key)}
                                                    aria-label={showValues[key] ? 'Hide' : 'Show'}
                                                />
                                            </InputRightElement>
                                        </InputGroup>
                                    </FormControl>
                                );
                            })}
                        </Box>

                        <Box>
                            <Badge colorScheme="purple" mb={2}>Anthropic (AI)</Badge>
                            {KEY_FIELDS.filter(f => f.provider === 'anthropic').map(field => {
                                const key = `${field.provider}:${field.key_name}`;
                                return (
                                    <FormControl key={key} mb={3} isInvalid={!!errors[key]}>
                                        <FormLabel fontSize="sm">{field.label}</FormLabel>
                                        <InputGroup size="sm">
                                            <Input
                                                type={showValues[key] ? 'text' : 'password'}
                                                placeholder={field.placeholder}
                                                value={values[key] || ''}
                                                onChange={e => handleChange(field.provider, field.key_name, e.target.value)}
                                            />
                                            <InputRightElement>
                                                <IconButton
                                                    size="xs"
                                                    variant="ghost"
                                                    icon={showValues[key] ? <ViewOffIcon /> : <ViewIcon />}
                                                    onClick={() => toggleShow(key)}
                                                    aria-label={showValues[key] ? 'Hide' : 'Show'}
                                                />
                                            </InputRightElement>
                                        </InputGroup>
                                    </FormControl>
                                );
                            })}
                        </Box>

                        <Box>
                            <Badge colorScheme="orange" mb={2}>Google Maps</Badge>
                            {KEY_FIELDS.filter(f => f.provider === 'google_maps').map(field => {
                                const key = `${field.provider}:${field.key_name}`;
                                return (
                                    <FormControl key={key} mb={3} isInvalid={!!errors[key]}>
                                        <FormLabel fontSize="sm">{field.label}</FormLabel>
                                        <InputGroup size="sm">
                                            <Input
                                                type={showValues[key] ? 'text' : 'password'}
                                                placeholder={field.placeholder}
                                                value={values[key] || ''}
                                                onChange={e => handleChange(field.provider, field.key_name, e.target.value)}
                                            />
                                            <InputRightElement>
                                                <IconButton
                                                    size="xs"
                                                    variant="ghost"
                                                    icon={showValues[key] ? <ViewOffIcon /> : <ViewIcon />}
                                                    onClick={() => toggleShow(key)}
                                                    aria-label={showValues[key] ? 'Hide' : 'Show'}
                                                />
                                            </InputRightElement>
                                        </InputGroup>
                                    </FormControl>
                                );
                            })}
                        </Box>
                    </VStack>
                </CardBody>
            </Card>

            <HStack spacing={4} justify="flex-end">
                <Button variant="ghost" onClick={onSkip}>
                    Skip for Now
                </Button>
                {hasAnyValues && (
                    <Button colorScheme="blue" onClick={handleSubmit}>
                        Save Keys & Continue
                    </Button>
                )}
            </HStack>
        </VStack>
    );
};

export default OnboardingApiKeysStep;
