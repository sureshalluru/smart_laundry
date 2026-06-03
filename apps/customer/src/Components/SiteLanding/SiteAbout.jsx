import React from 'react';
import {
    Box,
    Container,
    Heading,
    Text,
    VStack,
    SimpleGrid,
    Icon,
} from '@chakra-ui/react';
import { FiHeart, FiUsers, FiShield, FiAward } from 'react-icons/fi';

const highlights = [
    {
        icon: FiHeart,
        title: 'Family Owned',
        description: 'Proudly serving Round Rock, Hutto, Georgetown and surrounding areas since 1980.',
    },
    {
        icon: FiUsers,
        title: 'Open 24/7',
        description: 'Self-service laundromat open around the clock, every day of the year.',
    },
    {
        icon: FiShield,
        title: '120 lb Machines',
        description: '12-load commercial washers and dryers — handle big loads in one go.',
    },
    {
        icon: FiAward,
        title: '25% Weekday Discount',
        description: 'Self-service customers save 25% Monday–Friday, 8:30 AM to 4:30 PM.',
    },
];

export default function SiteAbout({ config }) {
    const laundryName = config?.laundryName || 'Eco Spin Round Rock Laundry';
    return (
        <Box id="about" py={{ base: 16, md: 20 }} bg="white">
            <Container maxW="1200px">
                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={12} alignItems="center">
                    {/* Text */}
                    <VStack align="flex-start" spacing={5}>
                        <Text
                            fontSize="sm"
                            fontWeight="600"
                            color="blue.500"
                            textTransform="uppercase"
                            letterSpacing="wide"
                        >
                            About Us
                        </Text>
                        <Heading fontSize={{ base: '2xl', md: '3xl' }} color="gray.800">
                            {laundryName}
                        </Heading>
                        <Text color="gray.600" lineHeight="tall">
                            We are a family-owned, kids-friendly clean laundromat serving Round Rock
                            and surrounding communities since 1980. Our spacious 4,500+ sq ft facility
                            features 120 lb commercial washers and dryers, a comfortable waiting area
                            with free WiFi, complimentary morning coffee, and a widescreen TV.
                        </Text>
                        <Text color="gray.600" lineHeight="tall">
                            We offer self-serve laundromat (open 24/7), drive-through service, wash &amp; fold
                            at $1.79/lb, and free pickup and delivery for both residential and commercial clients.
                            Whether you need a quick wash or full-service laundry care, we're here 7 days a week.
                        </Text>
                        <Text color="gray.500" fontSize="sm" fontStyle="italic">
                            HEB Plus is only 1 mile away — drop off your clothes and make a quick grocery run!
                        </Text>
                    </VStack>

                    {/* Highlights grid */}
                    <SimpleGrid columns={2} spacing={4}>
                        {highlights.map((h) => (
                            <Box
                                key={h.title}
                                bg="blue.50"
                                borderRadius="2xl"
                                p={5}
                                transition="all 0.2s"
                                _hover={{ bg: 'blue.100' }}
                            >
                                <VStack align="flex-start" spacing={3}>
                                    <Icon as={h.icon} boxSize={6} color="blue.500" />
                                    <Text fontWeight="700" fontSize="sm" color="gray.800">
                                        {h.title}
                                    </Text>
                                    <Text fontSize="xs" color="gray.500" lineHeight="tall">
                                        {h.description}
                                    </Text>
                                </VStack>
                            </Box>
                        ))}
                    </SimpleGrid>
                </SimpleGrid>
            </Container>
        </Box>
    );
}
