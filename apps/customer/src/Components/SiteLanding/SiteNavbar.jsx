import React from 'react';
import { Box, Flex, HStack, Button, Text, Icon, IconButton, VStack, Collapse, useDisclosure, Image } from '@chakra-ui/react';
import { FiMenu, FiX, FiMapPin } from 'react-icons/fi';

const baseNavLinks = [
    { label: 'Services', href: '#services' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Location', href: '#location' },
    { label: 'About', href: '#about' },
    { label: 'Admin', href: null, isAdmin: true },
];

export default function SiteNavbar({ config }) {
    const { isOpen, onToggle } = useDisclosure();
    const sc = config?.siteContent || {};
    const laundryId = config?.laundryId || '1';
    const laundryName = config?.laundryName || 'Laundry';
    const themeColor = sc.themeColor || 'blue';

    // Build nav links dynamically — only show Saree Rolling if tenant has it
    const services = config?.services || [];
    const serviceCategories = config?.serviceCategories || [];
    const hasSaree = services.some(s => s.serviceName?.toLowerCase().includes('saree')) ||
                     serviceCategories.some(c => c.categoryName?.toLowerCase().includes('saree'));
    const navLinks = hasSaree
        ? [...baseNavLinks.slice(0, 3), { label: 'Saree Rolling', href: `/${laundryId}/saree-rolling` }, ...baseNavLinks.slice(3)]
        : baseNavLinks;

    return (
        <Box as="nav" position="sticky" top="0" zIndex="1000" bg="white" borderBottom="1px solid" borderColor="gray.100" boxShadow="sm">
            <Flex maxW="1200px" mx="auto" px={{ base: 4, md: 8 }} py={3} align="center" justify="space-between">
                <HStack spacing={3}>
                    <VStack spacing={0} align="flex-start">
                        <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="800" color={`${themeColor}.600`}>
                            {laundryName}
                        </Text>
                        <HStack spacing={1}>
                            <Icon as={FiMapPin} color="gray.400" boxSize={3} />
                            <Text as="a" href={`https://www.google.com/maps/dir/?api=1&destination=${sc.mapsQuery || ''}`}
                                target="_blank" rel="noopener noreferrer" fontSize="xs" color="gray.400" _hover={{ color: `${themeColor}.500` }}>
                                {sc.address}, {sc.city}, {sc.state}
                            </Text>
                        </HStack>
                    </VStack>
                </HStack>

                <HStack spacing={6} display={{ base: 'none', md: 'flex' }}>
                    {navLinks.map((link) => (
                        <Box key={link.label} as="a"
                            href={link.isAdmin ? `/${laundryId}/admin` : link.href}
                            fontSize="sm" fontWeight="500"
                            color={link.isAdmin ? 'gray.400' : 'gray.600'}
                            _hover={{ color: `${themeColor}.500` }} transition="color 0.2s">
                            {link.label}
                        </Box>
                    ))}
                </HStack>

                <Button as="a" href={`/${laundryId}`} size="sm" colorScheme={themeColor} borderRadius="full" px={5} display={{ base: 'none', md: 'inline-flex' }}>
                    Schedule Pickup
                </Button>

                <IconButton display={{ base: 'flex', md: 'none' }} icon={isOpen ? <FiX /> : <FiMenu />} onClick={onToggle} variant="ghost" aria-label="Menu" size="sm" />
            </Flex>

            <Collapse in={isOpen} animateOpacity>
                <VStack display={{ base: 'flex', md: 'none' }} spacing={3} pb={4} px={4} align="stretch">
                    {navLinks.map((link) => (
                        <Box key={link.label} as="a" href={link.isAdmin ? `/${laundryId}/admin` : link.href} py={2} fontSize="md" fontWeight="500" color={link.isAdmin ? 'gray.400' : 'gray.700'} _hover={{ color: `${themeColor}.500` }} onClick={onToggle}>
                            {link.label}
                        </Box>
                    ))}
                    <Button as="a" href={`/${laundryId}`} colorScheme={themeColor} borderRadius="full" size="md" onClick={onToggle}>
                        Schedule Pickup
                    </Button>
                </VStack>
            </Collapse>
        </Box>
    );
}
