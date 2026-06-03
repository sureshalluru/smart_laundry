import React from 'react';
import {
    Box,
    Flex,
    HStack,
    Button,
    Text,
    IconButton,
    VStack,
    Collapse,
    useDisclosure,
} from '@chakra-ui/react';
import { FiMenu, FiX } from 'react-icons/fi';

const navLinks = [
    { label: 'Services', href: '#services' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Location', href: '#location' },
    { label: 'About', href: '#about' },
];

export default function SiteNavbar({ config }) {
    const { isOpen, onToggle } = useDisclosure();
    const laundryId = config?.laundryId || '1';
    const laundryName = config?.laundryName || 'Eco Spin Round Rock Laundry';

    return (
        <Box
            as="nav"
            position="sticky"
            top="0"
            zIndex="1000"
            bg="white"
            borderBottom="1px solid"
            borderColor="gray.100"
            boxShadow="sm"
        >
            <Flex
                maxW="1200px"
                mx="auto"
                px={{ base: 4, md: 8 }}
                py={3}
                align="center"
                justify="space-between"
            >
                {/* Logo / Brand */}
                <HStack spacing={2}>
                    <Text fontSize={{ base: 'md', md: 'lg' }} fontWeight="800" color="blue.600">
                        {laundryName}
                    </Text>
                </HStack>

                {/* Desktop Nav */}
                <HStack spacing={6} display={{ base: 'none', md: 'flex' }}>
                    {navLinks.map((link) => (
                        <Box
                            key={link.label}
                            as="a"
                            href={link.href}
                            fontSize="sm"
                            fontWeight="500"
                            color="gray.600"
                            _hover={{ color: 'blue.500' }}
                            transition="color 0.2s"
                        >
                            {link.label}
                        </Box>
                    ))}
                </HStack>

                {/* CTA */}
                <Button
                    as="a"
                    href={`/${laundryId}/login`}
                    size="sm"
                    colorScheme="blue"
                    borderRadius="full"
                    px={5}
                    display={{ base: 'none', md: 'inline-flex' }}
                >
                    Schedule Pickup
                </Button>

                {/* Mobile Menu Toggle */}
                <IconButton
                    display={{ base: 'flex', md: 'none' }}
                    icon={isOpen ? <FiX /> : <FiMenu />}
                    onClick={onToggle}
                    variant="ghost"
                    aria-label="Menu"
                    size="sm"
                />
            </Flex>

            {/* Mobile Menu */}
            <Collapse in={isOpen} animateOpacity>
                <VStack
                    display={{ base: 'flex', md: 'none' }}
                    spacing={3}
                    pb={4}
                    px={4}
                    align="stretch"
                >
                    {navLinks.map((link) => (
                        <Box
                            key={link.label}
                            as="a"
                            href={link.href}
                            py={2}
                            fontSize="md"
                            fontWeight="500"
                            color="gray.700"
                            _hover={{ color: 'blue.500' }}
                            onClick={onToggle}
                        >
                            {link.label}
                        </Box>
                    ))}
                    <Button
                        as="a"
                        href={`/${laundryId}/login`}
                        colorScheme="blue"
                        borderRadius="full"
                        size="md"
                        onClick={onToggle}
                    >
                        Schedule Pickup
                    </Button>
                </VStack>
            </Collapse>
        </Box>
    );
}
