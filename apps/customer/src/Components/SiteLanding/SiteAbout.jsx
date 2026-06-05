import React from 'react';
import { Box, Container, Heading, Text, VStack, SimpleGrid, Icon } from '@chakra-ui/react';
import { FiHeart, FiUsers, FiShield, FiAward } from 'react-icons/fi';

const highlightIcons = [FiHeart, FiUsers, FiShield, FiAward];

export default function SiteAbout({ config }) {
    const sc = config?.siteContent || {};
    const about = sc.about || {};
    const themeColor = sc.themeColor || 'blue';
    const highlights = about.highlights || [];

    return (
        <Box id="about" py={{ base: 16, md: 20 }} bg="white">
            <Container maxW="1200px">
                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={12} alignItems="center">
                    <VStack align="flex-start" spacing={5}>
                        <Text fontSize="sm" fontWeight="600" color={`${themeColor}.500`} textTransform="uppercase" letterSpacing="wide">About Us</Text>
                        <Heading fontSize={{ base: '2xl', md: '3xl' }} color="gray.800">
                            {about.title || config?.laundryName || 'Our Laundry'}
                        </Heading>
                        <Text color="gray.600" lineHeight="tall">{about.description || ''}</Text>
                        {about.description2 && <Text color="gray.600" lineHeight="tall">{about.description2}</Text>}
                    </VStack>

                    <SimpleGrid columns={2} spacing={4}>
                        {highlights.map((h, i) => (
                            <Box key={i} bg={`${themeColor}.50`} borderRadius="2xl" p={5} transition="all 0.2s" _hover={{ bg: `${themeColor}.100` }}>
                                <VStack align="flex-start" spacing={3}>
                                    <Icon as={highlightIcons[i % 4]} boxSize={6} color={`${themeColor}.500`} />
                                    <Text fontWeight="700" fontSize="sm" color="gray.800">{h.title}</Text>
                                    <Text fontSize="xs" color="gray.500" lineHeight="tall">{h.description}</Text>
                                </VStack>
                            </Box>
                        ))}
                    </SimpleGrid>
                </SimpleGrid>
            </Container>
        </Box>
    );
}
