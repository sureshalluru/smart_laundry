import React from 'react';
import { Box, Container, Flex, HStack, VStack, Text, Icon, Divider, SimpleGrid } from '@chakra-ui/react';
import { FiMapPin, FiPhone, FiMail, FiClock } from 'react-icons/fi';

export default function SiteFooter({ config }) {
    const sc = config?.siteContent || {};
    const laundryName = config?.laundryName || 'Laundry';
    const themeColor = sc.themeColor || 'blue';
    const hours = sc.hours || [];

    return (
        <Box bg="gray.800" color="white" pt={{ base: 12, md: 16 }} pb={6}>
            <Container maxW="1200px">
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8} mb={8}>
                    <VStack align="flex-start" spacing={3}>
                        <Text fontSize="xl" fontWeight="800" color={`${themeColor}.300`}>{laundryName}</Text>
                        <Text fontSize="sm" color="gray.400" lineHeight="tall">
                            {sc.about?.description?.slice(0, 120) || 'Your trusted local laundromat.'}...
                        </Text>
                    </VStack>

                    <VStack align="flex-start" spacing={3}>
                        <Text fontWeight="600" fontSize="sm" color="gray.300" textTransform="uppercase">Contact</Text>
                        <HStack spacing={2} color="gray.400"><Icon as={FiMapPin} boxSize={4} /><Text fontSize="sm">{sc.address}, {sc.city}, {sc.state} {sc.zip}</Text></HStack>
                        {sc.phone && <HStack spacing={2} color="gray.400"><Icon as={FiPhone} boxSize={4} /><Text fontSize="sm">{sc.phone}</Text></HStack>}
                        {sc.email && <HStack spacing={2} color="gray.400"><Icon as={FiMail} boxSize={4} /><Text fontSize="sm">{sc.email}</Text></HStack>}
                    </VStack>

                    <VStack align="flex-start" spacing={3}>
                        <Text fontWeight="600" fontSize="sm" color="gray.300" textTransform="uppercase">Hours</Text>
                        {hours.map((h, i) => (
                            <HStack key={i} spacing={2} color="gray.400">
                                {i === 0 && <Icon as={FiClock} boxSize={4} />}
                                <Text fontSize="sm">{h.label}: {h.time}</Text>
                            </HStack>
                        ))}
                    </VStack>
                </SimpleGrid>

                <Divider borderColor="gray.700" />
                <Flex pt={6} direction={{ base: 'column', md: 'row' }} justify="space-between" align="center" gap={2}>
                    <Text fontSize="xs" color="gray.500">© {new Date().getFullYear()} {laundryName}. All rights reserved.</Text>
                </Flex>
            </Container>
        </Box>
    );
}
