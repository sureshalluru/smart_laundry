import React from 'react';
import { Box, Container, Heading, Text, VStack, HStack, SimpleGrid, Icon, Flex, Badge } from '@chakra-ui/react';
import { FiMapPin, FiClock, FiWifi, FiCoffee, FiMonitor } from 'react-icons/fi';
import { FaCar, FaParking } from 'react-icons/fa';

const amenityIcons = { 'Free WiFi': FiWifi, 'Morning Coffee': FiCoffee, 'Widescreen TV': FiMonitor, 'Drive-Through': FaCar, 'Free Parking': FaParking, 'Comfortable Seating': FiMonitor, 'Vending Machines': FiCoffee, 'Card & Coin Machines': FiMonitor };

export default function SiteLocation({ config }) {
    const sc = config?.siteContent || {};
    const themeColor = sc.themeColor || 'blue';
    const hours = sc.hours || [];
    const amenities = sc.amenities || [];

    return (
        <Box id="location" py={{ base: 16, md: 20 }} bg="gray.50">
            <Container maxW="1200px">
                <VStack spacing={4} textAlign="center" mb={12}>
                    <Text fontSize="sm" fontWeight="600" color={`${themeColor}.500`} textTransform="uppercase" letterSpacing="wide">Visit Us</Text>
                    <Heading fontSize={{ base: '2xl', md: '4xl' }} color="gray.800">Our Location</Heading>
                    <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.500" maxW="600px">
                        Conveniently located in {sc.city || 'your area'}
                    </Text>
                </VStack>

                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={8}>
                    {/* Map */}
                    <Box as="a" href={`https://www.google.com/maps/dir/?api=1&destination=${sc.mapsQuery || ''}`} target="_blank" rel="noopener noreferrer"
                        borderRadius="2xl" overflow="hidden" boxShadow="md" minH="300px" display="block" position="relative" bg={`${themeColor}.50`}
                        _hover={{ boxShadow: 'lg', transform: 'translateY(-2px)' }} transition="all 0.2s">
                        <img src={`https://maps.googleapis.com/maps/api/staticmap?center=${sc.mapsQuery || ''}&zoom=15&size=600x400&markers=color:${themeColor === 'green' ? 'green' : 'blue'}%7C${sc.mapsQuery || ''}&key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY || ''}`}
                            alt="Location" style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: '300px' }} />
                        <Box position="absolute" bottom="0" left="0" right="0" bg="rgba(0,0,0,0.6)" color="white" py={2} px={4} textAlign="center">
                            <Text fontSize="sm" fontWeight="600">Tap for Directions →</Text>
                        </Box>
                    </Box>

                    {/* Info */}
                    <VStack spacing={6} align="stretch">
                        <Box bg="white" borderRadius="2xl" p={6} boxShadow="sm" border="1px solid" borderColor="gray.100">
                            <HStack spacing={3} mb={3}>
                                <Box bg={`${themeColor}.50`} borderRadius="lg" p={2}><Icon as={FiMapPin} color={`${themeColor}.500`} boxSize={5} /></Box>
                                <Text fontWeight="700" color="gray.800">Address</Text>
                            </HStack>
                            <Text fontSize="md" color="gray.600">{sc.address}<br />{sc.city}, {sc.state} {sc.zip}</Text>
                            {sc.phone && <Text fontSize="sm" color="gray.500" mt={2}>📞 {sc.phone}</Text>}
                        </Box>

                        <Box bg="white" borderRadius="2xl" p={6} boxShadow="sm" border="1px solid" borderColor="gray.100">
                            <HStack spacing={3} mb={3}>
                                <Box bg={`${themeColor}.50`} borderRadius="lg" p={2}><Icon as={FiClock} color={`${themeColor}.500`} boxSize={5} /></Box>
                                <Text fontWeight="700" color="gray.800">Hours</Text>
                                <Badge colorScheme="green" borderRadius="full" fontSize="xs">Open</Badge>
                            </HStack>
                            <VStack spacing={2} align="stretch">
                                {hours.map((h, i) => (
                                    <Flex key={i} justify="space-between">
                                        <Text fontSize="sm" color="gray.600">{h.label}</Text>
                                        <Text fontSize="sm" fontWeight="600" color="gray.700">{h.time}</Text>
                                    </Flex>
                                ))}
                            </VStack>
                        </Box>

                        <Box bg="white" borderRadius="2xl" p={6} boxShadow="sm" border="1px solid" borderColor="gray.100">
                            <Text fontWeight="700" color="gray.800" mb={3}>Amenities</Text>
                            <Flex gap={3} flexWrap="wrap">
                                {amenities.map((a) => (
                                    <HStack key={a} bg="gray.50" borderRadius="full" px={3} py={1.5} spacing={2}>
                                        <Icon as={amenityIcons[a] || FiCoffee} color={`${themeColor}.400`} boxSize={4} />
                                        <Text fontSize="xs" fontWeight="500" color="gray.600">{a}</Text>
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
