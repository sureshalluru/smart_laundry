import React from 'react';
import {
    Box,
    Container,
    Heading,
    Text,
    VStack,
    HStack,
    SimpleGrid,
    Icon,
    Flex,
    Badge,
} from '@chakra-ui/react';
import { FiMapPin, FiClock, FiWifi, FiCoffee, FiMonitor } from 'react-icons/fi';
import { FaCar, FaParking } from 'react-icons/fa';

const hours = [
    { day: 'Self-Service Laundromat', time: 'Open 24/7' },
    { day: 'Wash & Fold Drop-off', time: '7:00 AM – 9:00 PM' },
    { day: 'Weekday Discount (25% off)', time: '8:30 AM – 4:30 PM' },
];

const amenities = [
    { icon: FiWifi, label: 'Free WiFi' },
    { icon: FiCoffee, label: 'Morning Coffee' },
    { icon: FiMonitor, label: 'Widescreen TV' },
    { icon: FaCar, label: 'Drive-Through' },
    { icon: FaParking, label: 'Free Parking' },
];

export default function SiteLocation({ config }) {
    const laundryAddress = config?.laundryAddress || '900 E Palm Valley Blvd, Ste 1006, Round Rock, TX 78664';
    return (
        <Box id="location" py={{ base: 16, md: 20 }} bg="gray.50">
            <Container maxW="1200px">
                <VStack spacing={4} textAlign="center" mb={12}>
                    <Text
                        fontSize="sm"
                        fontWeight="600"
                        color="blue.500"
                        textTransform="uppercase"
                        letterSpacing="wide"
                    >
                        Visit Us
                    </Text>
                    <Heading fontSize={{ base: '2xl', md: '4xl' }} color="gray.800">
                        Our Location
                    </Heading>
                    <Text fontSize="sm" color="gray.500" maxW="600px">
                        Conveniently located in Round Rock, TX — right across from Shell Gas Station and Walgreens.
                    </Text>
                </VStack>

                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={8}>
                    {/* Map - static image with link to Google Maps */}
                    <Box
                        as="a"
                        href="https://www.google.com/maps/dir/?api=1&destination=900+E+Palm+Valley+Blvd+Ste+1006+Round+Rock+TX+78664"
                        target="_blank"
                        rel="noopener noreferrer"
                        borderRadius="2xl"
                        overflow="hidden"
                        boxShadow="md"
                        minH="300px"
                        display="block"
                        position="relative"
                        bg="blue.50"
                        _hover={{ boxShadow: 'lg', transform: 'translateY(-2px)' }}
                        transition="all 0.2s"
                    >
                        <img
                            src={`https://maps.googleapis.com/maps/api/staticmap?center=900+E+Palm+Valley+Blvd+Round+Rock+TX+78664&zoom=15&size=600x400&markers=color:blue%7C900+E+Palm+Valley+Blvd+Round+Rock+TX+78664&key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY || ''}`}
                            alt="Eco Spin Round Rock Laundry Map"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: '300px' }}
                        />
                        <Box
                            position="absolute"
                            bottom="0"
                            left="0"
                            right="0"
                            bg="rgba(0,0,0,0.6)"
                            color="white"
                            py={2}
                            px={4}
                            textAlign="center"
                        >
                            <Text fontSize="sm" fontWeight="600">Tap for Directions →</Text>
                        </Box>
                    </Box>

                    {/* Info */}
                    <VStack spacing={6} align="stretch">
                        {/* Address */}
                        <Box
                            bg="white"
                            borderRadius="2xl"
                            p={6}
                            boxShadow="sm"
                            border="1px solid"
                            borderColor="gray.100"
                        >
                            <HStack spacing={3} mb={3}>
                                <Box bg="blue.50" borderRadius="lg" p={2}>
                                    <Icon as={FiMapPin} color="blue.500" boxSize={5} />
                                </Box>
                                <Text fontWeight="700" color="gray.800">Address</Text>
                            </HStack>
                            <Text fontSize="md" color="gray.600" lineHeight="tall">
                                900 E Palm Valley Blvd, Ste 1006
                                <br />
                                Round Rock, TX 78664
                            </Text>
                            <Text fontSize="sm" color="gray.400" mt={2}>
                                Corner of Georgetown Ave & Palm Valley Blvd — across from Shell, Wag-a-Bag & Walgreens
                            </Text>
                        </Box>

                        {/* Hours */}
                        <Box
                            bg="white"
                            borderRadius="2xl"
                            p={6}
                            boxShadow="sm"
                            border="1px solid"
                            borderColor="gray.100"
                        >
                            <HStack spacing={3} mb={3}>
                                <Box bg="blue.50" borderRadius="lg" p={2}>
                                    <Icon as={FiClock} color="blue.500" boxSize={5} />
                                </Box>
                                <Text fontWeight="700" color="gray.800">Hours</Text>
                                <Badge colorScheme="green" borderRadius="full" fontSize="xs">
                                    Open 24hrs
                                </Badge>
                            </HStack>
                            <VStack spacing={2} align="stretch">
                                {hours.map((h) => (
                                    <Flex key={h.day} justify="space-between">
                                        <Text fontSize="sm" color="gray.600">{h.day}</Text>
                                        <Text fontSize="sm" fontWeight="600" color="gray.700">{h.time}</Text>
                                    </Flex>
                                ))}
                            </VStack>
                        </Box>

                        {/* Amenities */}
                        <Box
                            bg="white"
                            borderRadius="2xl"
                            p={6}
                            boxShadow="sm"
                            border="1px solid"
                            borderColor="gray.100"
                        >
                            <Text fontWeight="700" color="gray.800" mb={3}>Amenities</Text>
                            <Flex gap={3} flexWrap="wrap">
                                {amenities.map((a) => (
                                    <HStack
                                        key={a.label}
                                        bg="gray.50"
                                        borderRadius="full"
                                        px={3}
                                        py={1.5}
                                        spacing={2}
                                    >
                                        <Icon as={a.icon} color="blue.400" boxSize={4} />
                                        <Text fontSize="xs" fontWeight="500" color="gray.600">
                                            {a.label}
                                        </Text>
                                    </HStack>
                                ))}
                            </Flex>
                        </Box>
                    </VStack>
                </SimpleGrid>
            </Container>
        </Box>
    );
}
