import React from 'react';
import {
    Box, Container, Heading, Text, Button, VStack, HStack, Badge, Icon, Flex,
} from '@chakra-ui/react';
import { FiTruck, FiClock, FiStar, FiMapPin, FiNavigation } from 'react-icons/fi';

const themeColors = {
    blue: { gradient: 'linear-gradient(135deg, #EBF8FF 0%, #BEE3F8 50%, #90CDF4 100%)', accent: 'blue.500', badge: 'blue' },
    green: { gradient: 'linear-gradient(135deg, #F0FFF4 0%, #C6F6D5 50%, #9AE6B4 100%)', accent: 'green.500', badge: 'green' },
    purple: { gradient: 'linear-gradient(135deg, #FAF5FF 0%, #E9D8FD 50%, #D6BCFA 100%)', accent: 'purple.500', badge: 'purple' },
    teal: { gradient: 'linear-gradient(135deg, #E6FFFA 0%, #B2F5EA 50%, #81E6D9 100%)', accent: 'teal.500', badge: 'teal' },
};

export default function SiteHero({ config }) {
    const sc = config?.siteContent || {};
    const laundryId = config?.laundryId || '1';
    const theme = themeColors[sc.themeColor] || themeColors.blue;

    return (
        <Box bg={theme.gradient} pt={{ base: 16, md: 24 }} pb={{ base: 16, md: 20 }} position="relative" overflow="hidden">
            <Box position="absolute" top="-100px" right="-100px" w="400px" h="400px" borderRadius="full" bg="rgba(255,255,255,0.15)" />
            <Box position="absolute" bottom="-60px" left="-60px" w="200px" h="200px" borderRadius="full" bg="rgba(255,255,255,0.1)" />

            <Container maxW="1200px" position="relative">
                <VStack spacing={6} textAlign="center" maxW="700px" mx="auto">
                    <Badge colorScheme={theme.badge} borderRadius="full" px={4} py={1} fontSize="sm" fontWeight="600">
                        {sc.tagline || 'Family-Owned Laundromat'}
                    </Badge>

                    <Heading fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }} fontWeight="800" color="gray.800" lineHeight="shorter"
                        dangerouslySetInnerHTML={{
                            __html: (sc.headline || 'Fresh, Clean Laundry <span>Delivered</span>').replace(
                                /<span>(.*?)<\/span>/g, `<span style="color:var(--chakra-colors-${sc.themeColor || 'blue'}-500)">$1</span>`
                            )
                        }}
                    />

                    <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.600" maxW="550px" lineHeight="tall">
                        {sc.subheadline || ''}
                    </Text>

                    <HStack spacing={4} pt={2} flexWrap="wrap" justify="center">
                        <Button as="a" href={`/${laundryId}/login`} size="lg" colorScheme={sc.themeColor || 'blue'} borderRadius="full" px={8} boxShadow="lg" _hover={{ transform: 'translateY(-2px)', boxShadow: 'xl' }}>
                            Schedule Free Pickup
                        </Button>
                        <Button as="a" href="#location" size="lg" variant="outline" borderColor="gray.400" color="gray.700" borderRadius="full" px={8} _hover={{ bg: 'white', borderColor: `${sc.themeColor || 'blue'}.400` }}>
                            Visit Our Location
                        </Button>
                    </HStack>

                    {/* Trust indicators */}
                    <Flex pt={6} gap={{ base: 4, md: 8 }} flexWrap="wrap" justify="center" color="gray.600">
                        {(sc.trustBadges || ['Free Delivery', 'Open 24/7', 'Modern Facility']).map((badge, i) => (
                            <HStack key={i} spacing={2}>
                                <Icon as={[FiTruck, FiClock, FiStar][i % 3]} color={theme.accent} />
                                <Text fontSize="sm" fontWeight="500">{badge}</Text>
                            </HStack>
                        ))}
                    </Flex>

                    {/* Address bar */}
                    <Box mt={6} bg="white" borderRadius="2xl" px={{ base: 4, md: 6 }} py={{ base: 3, md: 4 }} boxShadow="md" border="1px solid" borderColor={`${sc.themeColor || 'blue'}.100`} w="100%" maxW="520px">
                        <Flex align="center" justify="space-between" direction={{ base: 'column', sm: 'row' }} gap={3}>
                            <HStack spacing={3}>
                                <Box bg={`${sc.themeColor || 'blue'}.50`} borderRadius="full" p={2}>
                                    <Icon as={FiMapPin} color={theme.accent} boxSize={5} />
                                </Box>
                                <VStack align="flex-start" spacing={0}>
                                    <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="700" color="gray.800">
                                        {sc.address || ''}
                                    </Text>
                                    <Text fontSize="xs" color="gray.500">
                                        {sc.city || ''}, {sc.state || ''} {sc.zip || ''} — {(sc.hours || [])[0]?.time || 'Open'}
                                    </Text>
                                </VStack>
                            </HStack>
                            <Button as="a" href={`https://www.google.com/maps/dir/?api=1&destination=${sc.mapsQuery || ''}`} target="_blank" rel="noopener noreferrer" size="sm" colorScheme={sc.themeColor || 'blue'} variant="outline" borderRadius="full" leftIcon={<FiNavigation size={14} />} flexShrink={0}>
                                Get Directions
                            </Button>
                        </Flex>
                    </Box>
                </VStack>
            </Container>
        </Box>
    );
}
