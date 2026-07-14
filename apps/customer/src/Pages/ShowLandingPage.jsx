import React from 'react';
import {
    Box, Container, Heading, Text, VStack, Button, Badge, SimpleGrid,
    Icon, HStack, Divider,
} from '@chakra-ui/react';
import { FiCheck, FiArrowRight, FiZap, FiGlobe, FiTruck, FiCamera, FiDollarSign, FiClock, FiUsers, FiMail } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

const features = [
    { icon: FiClock, title: "Live in 2 Minutes", desc: "Sign up and your customer website is ready instantly. No setup calls needed." },
    { icon: FiGlobe, title: "Free Customer Website", desc: "SEO-optimized landing pages, FAQ pages, and city pickup/delivery pages — included." },
    { icon: FiCamera, title: "AI Item Tracking", desc: "Snap photos at intake. AI counts items automatically. No manual logging." },
    { icon: FiTruck, title: "Route Optimization", desc: "Multi-driver routes optimized by Google Maps. Customers get live tracking." },
    { icon: FiDollarSign, title: "Free Until You Grow", desc: "No fees until you hit $3K/month revenue. Then just $149/mo. No per-transaction fees." },
    { icon: FiZap, title: "Effortless Operations", desc: "QR ticket printing, mobile weight entry, one-tap status updates, auto-notifications." },
];

const comparedTo = [
    { them: "$300+/month just for basic POS", us: "Free until $3K revenue" },
    { them: "Weeks of training and setup", us: "2-minute self-service signup" },
    { them: "Extra fees for every feature", us: "Everything included" },
    { them: "No website or SEO tools", us: "Full website + city SEO pages" },
    { them: "No AI, no tracking", us: "AI item tracking built in" },
    { them: "Per-transaction fees", us: "Zero transaction fees" },
];

const ShowLandingPage = () => {
    const navigate = useNavigate();

    return (
        <Box bg="gray.50" minH="100vh">
            {/* Hero */}
            <Box bg="blue.600" color="white" py={{ base: 10, md: 16 }} textAlign="center">
                <Container maxW="700px">
                    <Badge colorScheme="yellow" fontSize="sm" px={3} py={1} borderRadius="full" mb={4}>
                        🎉 CLA Show 2025 Exclusive
                    </Badge>
                    <Heading fontSize={{ base: '2xl', md: '4xl' }} mb={3} lineHeight="1.2">
                        Your Laundry Deserves Better Software
                    </Heading>
                    <Text fontSize={{ base: 'md', md: 'lg' }} opacity={0.9} mb={6}>
                        We help you get your first customer and keep them coming back — with AI garment tracking that builds trust and smart engagement that drives repeat business.
                    </Text>
                    <Button
                        size="lg"
                        colorScheme="yellow"
                        color="gray.800"
                        rightIcon={<FiArrowRight />}
                        onClick={() => navigate('/onboard')}
                        px={8}
                        fontSize="lg"
                        boxShadow="lg"
                        _hover={{ transform: 'translateY(-2px)', boxShadow: 'xl' }}
                    >
                        Get Started Free — 2 Min Setup
                    </Button>
                    <Text fontSize="xs" mt={3} opacity={0.7}>No credit card. No commitment. Cancel anytime.</Text>
                </Container>
            </Box>

            {/* What You Get */}
            <Container maxW="900px" py={12}>
                <VStack spacing={8}>
                    <VStack spacing={2} textAlign="center">
                        <Heading fontSize={{ base: 'xl', md: '2xl' }}>We Help You Get Customers. Then Keep Them.</Heading>
                        <Text color="gray.600" fontSize="sm">From your first order to a loyal base — one platform handles it all.</Text>
                    </VStack>

                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} w="full">
                        {features.map((f, i) => (
                            <HStack key={i} align="start" bg="white" p={4} borderRadius="lg" border="1px solid" borderColor="gray.200" boxShadow="sm">
                                <Icon as={f.icon} boxSize={5} color="blue.500" mt={1} flexShrink={0} />
                                <Box>
                                    <Text fontWeight="bold" fontSize="sm">{f.title}</Text>
                                    <Text fontSize="xs" color="gray.600">{f.desc}</Text>
                                </Box>
                            </HStack>
                        ))}
                    </SimpleGrid>
                </VStack>
            </Container>

            {/* vs Competition */}
            <Box bg="white" py={12}>
                <Container maxW="700px">
                    <VStack spacing={6}>
                        <VStack spacing={1} textAlign="center">
                            <Heading fontSize={{ base: 'xl', md: '2xl' }}>Why Owners Are Switching</Heading>
                            <Text color="gray.500" fontSize="sm">From Cents, Curbside, CleanCloud, Kansflow...</Text>
                        </VStack>

                        <Box w="full" overflowX="auto">
                            <SimpleGrid columns={2} w="full" spacing={0}>
                                <Box bg="red.50" p={3} fontWeight="bold" fontSize="sm" borderBottom="2px solid" borderColor="red.200">
                                    ❌ What They Charge
                                </Box>
                                <Box bg="green.50" p={3} fontWeight="bold" fontSize="sm" borderBottom="2px solid" borderColor="green.200">
                                    ✅ What We Do
                                </Box>
                                {comparedTo.map((row, i) => (
                                    <React.Fragment key={i}>
                                        <Box p={3} fontSize="xs" bg={i % 2 === 0 ? 'red.25' : 'white'} borderBottom="1px solid" borderColor="gray.100">
                                            {row.them}
                                        </Box>
                                        <Box p={3} fontSize="xs" fontWeight="500" color="green.700" bg={i % 2 === 0 ? 'green.25' : 'white'} borderBottom="1px solid" borderColor="gray.100">
                                            {row.us}
                                        </Box>
                                    </React.Fragment>
                                ))}
                            </SimpleGrid>
                        </Box>
                    </VStack>
                </Container>
            </Box>

            {/* Pricing */}
            <Container maxW="600px" py={12} textAlign="center">
                <VStack spacing={4}>
                    <Badge colorScheme="red" fontSize="md" px={4} py={1} borderRadius="full">
                        ⏰ CLA Show Only — Limited Time
                    </Badge>
                    <Heading fontSize={{ base: 'xl', md: '2xl' }}>Lifetime Deal — Sign Up Today</Heading>

                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} w="full">
                        {/* Lifetime Deal */}
                        <Box bg="white" p={6} borderRadius="xl" border="3px solid" borderColor="green.400" boxShadow="lg" position="relative">
                            <Badge colorScheme="green" position="absolute" top={-3} left="50%" transform="translateX(-50%)" px={3} py={1} borderRadius="full" fontSize="xs">
                                SHOW SPECIAL
                            </Badge>
                            <Text fontSize="4xl" fontWeight="800" color="green.600" mt={2}>$100</Text>
                            <Text fontSize="lg" fontWeight="bold" color="gray.700">/month</Text>
                            <Text fontSize="xs" color="gray.500" mb={3}>Locked in forever. Never increases.</Text>
                            <Divider my={3} />
                            <VStack spacing={1} align="start" fontSize="xs">
                                <HStack><Icon as={FiCheck} color="green.500" boxSize={3} /><Text>Full platform forever</Text></HStack>
                                <HStack><Icon as={FiCheck} color="green.500" boxSize={3} /><Text>All future updates included</Text></HStack>
                                <HStack><Icon as={FiCheck} color="green.500" boxSize={3} /><Text>Unlimited orders</Text></HStack>
                                <HStack><Icon as={FiCheck} color="green.500" boxSize={3} /><Text>Priority setup support</Text></HStack>
                            </VStack>
                        </Box>

                        {/* Regular Pricing */}
                        <Box bg="white" p={6} borderRadius="xl" border="1px solid" borderColor="gray.200" opacity={0.8}>
                            <Text fontSize="xs" color="gray.400" fontWeight="bold" mt={2}>REGULAR PRICING</Text>
                            <Text fontSize="4xl" fontWeight="800" color="gray.400" textDecoration="line-through">$149</Text>
                            <Text fontSize="lg" fontWeight="bold" color="gray.400">/month</Text>
                            <Text fontSize="xs" color="gray.400" mb={3}>After $3K/month revenue</Text>
                            <Divider my={3} />
                            <Text fontSize="xs" color="gray.500" textAlign="center">
                                Why pay $149 when you can lock in $100/month forever by signing up today?
                            </Text>
                        </Box>
                    </SimpleGrid>

                    <Text fontSize="xs" color="gray.600" mt={2}>
                        This $100/month rate is exclusively available at the CLA Show. After the event, standard $149/month pricing applies.
                    </Text>
                </VStack>
            </Container>

            {/* Customer Engagement */}
            <Box bg="purple.50" py={12}>
                <Container maxW="700px">
                    <VStack spacing={6} textAlign="center">
                        <Icon as={FiUsers} boxSize={10} color="purple.500" />
                        <Heading fontSize={{ base: 'xl', md: '2xl' }}>Get Your First Customer. Keep Them Forever.</Heading>
                        <Text color="gray.600" fontSize="sm" maxW="500px">
                            We don't just process orders. We help you bring in your first pickup customer with a ready-made website, then keep them coming back with AI tracking that builds trust and smart engagement that drives repeat orders.
                        </Text>

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} w="full" textAlign="left">
                            <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
                                <HStack mb={2}><Icon as={FiGlobe} color="purple.500" /><Text fontWeight="bold" fontSize="sm">SEO That Brings Your First Customer</Text></HStack>
                                <Text fontSize="xs" color="gray.600">
                                    Your site launches with dedicated city pickup/delivery pages for every zip code you serve, FAQ pages, and a landing page — all optimized for Google. Customers searching "laundry pickup in [your city]" find you organically.
                                </Text>
                            </Box>
                            <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
                                <HStack mb={2}><Icon as={FiCamera} color="purple.500" /><Text fontWeight="bold" fontSize="sm">AI Garment Tracking = Trust</Text></HStack>
                                <Text fontSize="xs" color="gray.600">
                                    Customers see exactly what items were received and returned — photo proof with AI counts. No more "where's my shirt?" calls. Trust keeps them coming back.
                                </Text>
                            </Box>
                            <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
                                <HStack mb={2}><Icon as={FiMail} color="purple.500" /><Text fontWeight="bold" fontSize="sm">Smart Re-Engagement</Text></HStack>
                                <Text fontSize="xs" color="gray.600">
                                    Automatically remind dormant customers to come back. Weekly nudges for new signups, monthly win-back messages, holiday promos — all on autopilot.
                                </Text>
                            </Box>
                            <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
                                <HStack mb={2}><Icon as={FiZap} color="purple.500" /><Text fontWeight="bold" fontSize="sm">Subscribe & Save = Recurring Revenue</Text></HStack>
                                <Text fontSize="xs" color="gray.600">
                                    Customers sign up for weekly or bi-weekly pickups. Orders auto-generate, payments auto-charge. Predictable income without chasing anyone.
                                </Text>
                            </Box>
                        </SimpleGrid>
                    </VStack>
                </Container>
            </Box>

            {/* Final CTA */}
            <Container maxW="500px" py={10} textAlign="center">
                <Button
                    size="lg"
                    colorScheme="blue"
                    rightIcon={<FiArrowRight />}
                    onClick={() => navigate('/onboard')}
                    w="full"
                    fontSize="lg"
                >
                    Start Free Now — Lock In $100/mo Forever
                </Button>
                <Text fontSize="xs" color="gray.500" mt={2}>Takes 2 minutes. Your site goes live immediately.</Text>
            </Container>

            {/* CTA Footer */}
            <Box bg="blue.700" color="white" py={10} textAlign="center">
                <Container maxW="600px">
                    <Heading fontSize={{ base: 'lg', md: 'xl' }} mb={2}>Still Deciding?</Heading>
                    <Text fontSize="sm" opacity={0.9} mb={4}>
                        Book a free 15-minute call. We'll show you the platform live and answer any questions.
                    </Text>
                    <HStack justify="center" spacing={4} flexWrap="wrap">
                        <Button
                            as="a"
                            href="https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0VrdVjQuZ3xf_TFkqNK-C4oHkD0hgROG7ARrpInHo8ZB4q5X2lM5KTAfel88aCzzzpWbxtu1lR"
                            target="_blank"
                            variant="outline"
                            borderColor="white"
                            color="white"
                            _hover={{ bg: 'whiteAlpha.200' }}
                            size="md"
                        >
                            Book a Demo Call
                        </Button>
                        <Button
                            colorScheme="yellow"
                            color="gray.800"
                            size="md"
                            onClick={() => navigate('/onboard')}
                        >
                            Sign Up Free
                        </Button>
                    </HStack>
                    <Text fontSize="xs" mt={4} opacity={0.6}>
                        Smart Laundry Basket — Built by laundry operators, for laundry operators.
                    </Text>
                </Container>
            </Box>
        </Box>
    );
};

export default ShowLandingPage;
