import React from 'react';
import {
    Box,
    Container,
    Flex,
    HStack,
    VStack,
    Text,
    Icon,
    Divider,
    SimpleGrid,
} from '@chakra-ui/react';
import { FiMapPin, FiPhone, FiMail, FiClock } from 'react-icons/fi';

export default function SiteFooter({ config }) {
    const laundryName = config?.laundryName || 'Eco Spin Round Rock Laundry';
    const laundryAddress = config?.laundryAddress || '900 E Palm Valley Blvd, Ste 1006, Round Rock, TX 78664';
    return (
        <Box bg="gray.800" color="white" pt={{ base: 12, md: 16 }} pb={6}>
            <Container maxW="1200px">
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8} mb={8}>
                    {/* Brand */}
                    <VStack align="flex-start" spacing={3}>
                        <VStack align="flex-start" spacing={0}>
                            <Text fontSize="xl" fontWeight="800" color="blue.300">
                                Eco Spin
                            </Text>
                            <Text fontSize="md" fontWeight="700" color="white">
                                Round Rock Laundry
                            </Text>
                        </VStack>
                        <Text fontSize="sm" color="gray.400" lineHeight="tall">
                            Round Rock's trusted family-owned laundromat since 1980.
                            Self-service 24/7, wash & fold at $1.79/lb, and free pickup & delivery.
                        </Text>
                    </VStack>

                    {/* Contact */}
                    <VStack align="flex-start" spacing={3}>
                        <Text fontWeight="600" fontSize="sm" color="gray.300" textTransform="uppercase">
                            Contact
                        </Text>
                        <HStack spacing={2} color="gray.400">
                            <Icon as={FiMapPin} boxSize={4} />
                            <Text fontSize="sm">900 E Palm Valley Blvd, Ste 1006, Round Rock, TX 78664</Text>
                        </HStack>
                        <HStack spacing={2} color="gray.400">
                            <Icon as={FiPhone} boxSize={4} />
                            <Text fontSize="sm">(512) 782-0428</Text>
                        </HStack>
                        <HStack spacing={2} color="gray.400">
                            <Icon as={FiMail} boxSize={4} />
                            <Text fontSize="sm">info@roundrocklaundry.com</Text>
                        </HStack>
                    </VStack>

                    {/* Hours */}
                    <VStack align="flex-start" spacing={3}>
                        <Text fontWeight="600" fontSize="sm" color="gray.300" textTransform="uppercase">
                            Hours
                        </Text>
                        <HStack spacing={2} color="gray.400">
                            <Icon as={FiClock} boxSize={4} />
                            <Text fontSize="sm">Self-Service: Open 24/7</Text>
                        </HStack>
                        <Text fontSize="sm" color="gray.400">
                            Wash & Fold Drop-off: 7AM – 9PM
                        </Text>
                        <Text fontSize="sm" color="gray.400">
                            Free Pickup & Delivery: 7 Days a Week
                        </Text>
                        <Text fontSize="sm" color="gray.400">
                            25% Off Self-Service: Weekdays 8:30AM – 4:30PM
                        </Text>
                    </VStack>
                </SimpleGrid>

                <Divider borderColor="gray.700" />

                <Flex
                    pt={6}
                    direction={{ base: 'column', md: 'row' }}
                    justify="space-between"
                    align="center"
                    gap={2}
                >
                    <Text fontSize="xs" color="gray.500">
                        © {new Date().getFullYear()} {laundryName}. All rights reserved.
                    </Text>
                    <HStack spacing={4}>
                        <Text as="a" href="#" fontSize="xs" color="gray.500" _hover={{ color: 'gray.300' }}>
                            Privacy Policy
                        </Text>
                        <Text as="a" href="#" fontSize="xs" color="gray.500" _hover={{ color: 'gray.300' }}>
                            Terms of Service
                        </Text>
                    </HStack>
                </Flex>
            </Container>
        </Box>
    );
}
