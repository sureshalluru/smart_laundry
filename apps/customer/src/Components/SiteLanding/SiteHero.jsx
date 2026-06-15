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
    orange: { gradient: 'linear-gradient(135deg, #FFFAF0 0%, #FEEBC8 50%, #FBD38D 100%)', accent: 'orange.500', badge: 'orange' },
    red: { gradient: 'linear-gradient(135deg, #FFF5F5 0%, #FED7D7 50%, #FEB2B2 100%)', accent: 'red.500', badge: 'red' },
    pink: { gradient: 'linear-gradient(135deg, #FFF5F7 0%, #FED7E2 50%, #FBB6CE 100%)', accent: 'pink.500', badge: 'pink' },
    cyan: { gradient: 'linear-gradient(135deg, #EDFDFD 0%, #C4F1F9 50%, #9DECF9 100%)', accent: 'cyan.500', badge: 'cyan' },
};

// Free stock video URL (used if tenant provides their own via heroVideoUrl in site_content)

export default function SiteHero({ config }) {
    const sc = config?.siteContent || {};
    const laundryId = config?.laundryId || '1';
    const themeColor = sc.themeColor || 'blue';
    const theme = themeColors[themeColor] || themeColors.blue;
    const videoUrl = sc.heroVideoUrl || null;
    const useVideo = !!videoUrl; // Only use video if tenant provides a URL
    const [videoLoaded, setVideoLoaded] = React.useState(false);

    return (
        <Box position="relative" overflow="hidden" minH={{ base: '85vh', md: '90vh' }} display="flex" alignItems="center">
            {/* Theme gradient background — always visible as base/fallback */}
            <Box position="absolute" top="0" left="0" w="100%" h="100%" bg={theme.gradient} zIndex="0" />

            {/* Video Background — only if URL provided */}
            {useVideo && (
                <>
                    <Box as="video"
                        autoPlay muted loop playsInline
                        position="absolute" top="0" left="0" w="100%" h="100%"
                        objectFit="cover" zIndex="1"
                        onCanPlay={() => setVideoLoaded(true)}
                        onError={(e) => { e.target.style.display = 'none'; setVideoLoaded(false); }}
                    >
                        <source src={videoUrl} type="video/mp4" />
                    </Box>
                    {/* Dark overlay — only visible when video is playing */}
                    {videoLoaded && (
                        <Box position="absolute" top="0" left="0" w="100%" h="100%"
                            bg="linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.6) 100%)"
                            zIndex="2" />
                    )}
                </>
            )}

            <Container maxW="1200px" position="relative" zIndex="3" py={{ base: 16, md: 24 }}>
                <VStack spacing={6} textAlign="center" maxW="700px" mx="auto">
                    <Badge colorScheme={videoLoaded ? 'whiteAlpha' : theme.badge} borderRadius="full" px={4} py={1} fontSize="sm" fontWeight="600"
                        bg={videoLoaded ? 'whiteAlpha.200' : undefined} color={videoLoaded ? 'white' : undefined}>
                        {sc.tagline || 'Professional Laundry Service'}
                    </Badge>

                    <Heading fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }} fontWeight="800"
                        color={videoLoaded ? 'white' : 'gray.800'} lineHeight="shorter"
                        textShadow={videoLoaded ? '0 2px 20px rgba(0,0,0,0.3)' : 'none'}
                        dangerouslySetInnerHTML={{
                            __html: (sc.headline || 'Fresh, Clean Laundry <span>Delivered</span>').replace(
                                /<span>(.*?)<\/span>/g,
                                videoLoaded
                                    ? `<span style="color:var(--chakra-colors-${themeColor}-300)">$1</span>`
                                    : `<span style="color:var(--chakra-colors-${themeColor}-500)">$1</span>`
                            )
                        }}
                    />

                    <Text fontSize={{ base: 'md', md: 'lg' }} color={videoLoaded ? 'whiteAlpha.900' : 'gray.600'} maxW="550px" lineHeight="tall">
                        {sc.subheadline || 'Professional wash & fold service with free pickup and delivery. Your clothes deserve the best care.'}
                    </Text>

                    <HStack spacing={4} pt={2} flexWrap="wrap" justify="center">
                        <Button as="a" href={`/${laundryId}`} size="lg" colorScheme={themeColor} borderRadius="full" px={8}
                            boxShadow="lg" _hover={{ transform: 'translateY(-2px)', boxShadow: 'xl' }}>
                            Schedule Free Pickup
                        </Button>
                        <Button as="a" href="#location" size="lg" variant="outline"
                            borderColor={videoLoaded ? 'whiteAlpha.600' : 'gray.400'}
                            color={videoLoaded ? 'white' : 'gray.700'}
                            borderRadius="full" px={8}
                            _hover={{ bg: videoLoaded ? 'whiteAlpha.200' : 'white', borderColor: `${themeColor}.400` }}>
                            Visit Our Location
                        </Button>
                    </HStack>

                    {/* Trust indicators */}
                    <Flex pt={6} gap={{ base: 4, md: 8 }} flexWrap="wrap" justify="center" color={videoLoaded ? 'whiteAlpha.900' : 'gray.600'}>
                        {(sc.trustBadges || ['Free Delivery', 'Open 24/7', 'Modern Facility']).map((badge, i) => (
                            <HStack key={i} spacing={2}>
                                <Icon as={[FiTruck, FiClock, FiStar][i % 3]} color={videoLoaded ? `${themeColor}.300` : theme.accent} />
                                <Text fontSize="sm" fontWeight="500">{badge}</Text>
                            </HStack>
                        ))}
                    </Flex>

                    {/* Address bar */}
                    <Box mt={6} bg={videoLoaded ? 'whiteAlpha.200' : 'white'} backdropFilter={videoLoaded ? 'blur(10px)' : 'none'}
                        borderRadius="2xl" px={{ base: 4, md: 6 }} py={{ base: 3, md: 4 }}
                        boxShadow="md" border="1px solid" borderColor={videoLoaded ? 'whiteAlpha.300' : `${themeColor}.100`} w="100%" maxW="520px">
                        <Flex align="center" justify="space-between" direction={{ base: 'column', sm: 'row' }} gap={3}>
                            <HStack spacing={3}>
                                <Box bg={videoLoaded ? 'whiteAlpha.200' : `${themeColor}.50`} borderRadius="full" p={2}>
                                    <Icon as={FiMapPin} color={videoLoaded ? `${themeColor}.300` : theme.accent} boxSize={5} />
                                </Box>
                                <VStack align="flex-start" spacing={0}>
                                    <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="700" color={videoLoaded ? 'white' : 'gray.800'}>
                                        {sc.address || ''}
                                    </Text>
                                    <Text fontSize="xs" color={videoLoaded ? 'whiteAlpha.800' : 'gray.500'}>
                                        {sc.city || ''}, {sc.state || ''} {sc.zip || ''} — {(sc.hours || [])[0]?.time || 'Open'}
                                    </Text>
                                </VStack>
                            </HStack>
                            <Button as="a" href={`https://www.google.com/maps/dir/?api=1&destination=${sc.mapsQuery || ''}`} target="_blank" rel="noopener noreferrer"
                                size="sm" colorScheme={themeColor} variant={videoLoaded ? 'solid' : 'outline'} borderRadius="full" leftIcon={<FiNavigation size={14} />} flexShrink={0}>
                                Get Directions
                            </Button>
                        </Flex>
                    </Box>
                </VStack>
            </Container>
        </Box>
    );
}
