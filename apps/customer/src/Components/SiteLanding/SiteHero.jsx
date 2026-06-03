import React from 'react';
import {
    Box,
    Container,
    Heading,
    Text,
    Button,
    VStack,
    HStack,
    Badge,
    Icon,
    Flex,
} from '@chakra-ui/react';
import { FiTruck, FiClock, FiStar } from 'react-icons/fi';

export default function SiteHero({ config }) {
    const laundryId = config?.laundryId || '1';
    const laundryName = config?.laundryName || 'Eco Spin Round Rock Laundry';
    const bagPrice = config?.bagPrice || 30;

    return (
        <Box
            bg="linear-gradient(135deg, #EBF8FF 0%, #BEE3F8 50%, #90CDF4 100%)"
            pt={{ base: 16, md: 24 }}
            pb={{ base: 16, md: 20 }}
            position="relative"
            overflow="hidden"
        >
            {/* Decorative circle */}
            <Box
                position="absolute"
                top="-100px"
                right="-100px"
                w="400px"
                h="400px"
                borderRadius="full"
                bg="rgba(255,255,255,0.15)"
            />
            <Box
                position="absolute"
                bottom="-60px"
                left="-60px"
                w="200px"
                h="200px"
                borderRadius="full"
                bg="rgba(255,255,255,0.1)"
            />

            <Container maxW="1200px" position="relative">
                <VStack spacing={6} textAlign="center" maxW="700px" mx="auto">
                    <Badge
                        colorScheme="blue"
                        borderRadius="full"
                        px={4}
                        py={1}
                        fontSize="sm"
                        fontWeight="600"
                    >
                        Family-Owned Since 1980
                    </Badge>

                    <Heading
                        fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }}
                        fontWeight="800"
                        color="gray.800"
                        lineHeight="shorter"
                    >
                        Fresh, Clean Laundry{' '}
                        <Text as="span" color="blue.500">
                            Delivered
                        </Text>{' '}
                        to Your Door
                    </Heading>

                    <Text
                        fontSize={{ base: 'md', md: 'lg' }}
                        color="gray.600"
                        maxW="550px"
                        lineHeight="tall"
                    >
                        Round Rock's most trusted laundromat. Drop off, pick up, or let us come to you.
                        Wash & fold with free pickup and delivery at just $1.79/lb.
                    </Text>

                    <HStack spacing={4} pt={2} flexWrap="wrap" justify="center">
                        <Button
                            as="a"
                            href={`/${laundryId}/login`}
                            size="lg"
                            colorScheme="blue"
                            borderRadius="full"
                            px={8}
                            boxShadow="lg"
                            _hover={{ transform: 'translateY(-2px)', boxShadow: 'xl' }}
                        >
                            Schedule Free Pickup
                        </Button>
                        <Button
                            as="a"
                            href="#location"
                            size="lg"
                            variant="outline"
                            borderColor="gray.400"
                            color="gray.700"
                            borderRadius="full"
                            px={8}
                            _hover={{ bg: 'white', borderColor: 'blue.400' }}
                        >
                            Visit Our Location
                        </Button>
                    </HStack>

                    {/* Trust indicators */}
                    <Flex
                        pt={6}
                        gap={{ base: 4, md: 8 }}
                        flexWrap="wrap"
                        justify="center"
                        color="gray.600"
                    >
                        <HStack spacing={2}>
                            <Icon as={FiTruck} color="blue.500" />
                            <Text fontSize="sm" fontWeight="500">Free Pickup & Delivery</Text>
                        </HStack>
                        <HStack spacing={2}>
                            <Icon as={FiClock} color="blue.500" />
                            <Text fontSize="sm" fontWeight="500">Open 24/7</Text>
                        </HStack>
                        <HStack spacing={2}>
                            <Icon as={FiStar} color="blue.500" />
                            <Text fontSize="sm" fontWeight="500">120 lb Commercial Machines</Text>
                        </HStack>
                    </Flex>
                </VStack>
            </Container>
        </Box>
    );
}
