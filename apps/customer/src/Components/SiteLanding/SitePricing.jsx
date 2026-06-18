import React from 'react';
import {
    Box, Container, Heading, Text, VStack, HStack, Button, Badge, Icon,
    SimpleGrid, List, ListItem, ListIcon,
} from '@chakra-ui/react';
import { FiCheck } from 'react-icons/fi';
import { FaShoppingBag, FaWeight, FaTshirt } from 'react-icons/fa';

export default function SitePricing({ config }) {
    const laundryId = config?.laundryId || '1';
    const sc = config?.siteContent || {};
    const themeColor = sc.themeColor || 'blue';
    const services = config?.services || config?.laundryServices || [];

    // Determine what pricing types exist from actual services
    const perPoundServices = services.filter(s => s.inputWeight === true || s.inputWeight === 'true');
    const perPieceServices = services.filter(s => !s.inputWeight || s.inputWeight === false || s.inputWeight === 'false');
    const hasPerPound = perPoundServices.length > 0;
    const hasPerPiece = perPieceServices.length > 0;

    // Build pricing cards dynamically
    const pricingCards = [];

    if (hasPerPiece) {
        // Show per-piece/bag services as a card
        const cheapest = perPieceServices.reduce((min, s) => Math.min(min, parseFloat(s.price || 0)), Infinity);
        pricingCards.push({
            title: perPieceServices.length === 1 ? perPieceServices[0].serviceName : 'Flat Rate Services',
            price: `$${cheapest % 1 === 0 ? cheapest : cheapest.toFixed(2)}`,
            unit: perPieceServices.length > 1 ? ' starting' : '',
            icon: FaShoppingBag,
            popular: !hasPerPound, // Popular if it's the only option
            description: perPieceServices.length === 1
                ? perPieceServices[0].description || 'Simple flat rate pricing.'
                : 'Choose from our flat-rate services.',
            features: perPieceServices.slice(0, 5).map(s => `${s.serviceName} — $${parseFloat(s.price).toFixed(2)}`),
            cta: 'Get Started',
        });
    }

    if (hasPerPound) {
        const cheapestLb = perPoundServices.reduce((min, s) => Math.min(min, parseFloat(s.price || 0)), Infinity);
        pricingCards.push({
            title: 'Per Pound',
            price: `$${cheapestLb.toFixed(2)}`,
            unit: '/lb',
            icon: FaWeight,
            popular: hasPerPound && !hasPerPiece, // Popular if only option
            description: 'Pay based on the actual weight of your laundry.',
            features: [
                ...perPoundServices.slice(0, 3).map(s => `${s.serviceName} — $${parseFloat(s.price).toFixed(2)}/lb`),
                'Free pickup & delivery',
                'Same-day turnaround available',
            ],
            cta: 'Get Started',
        });
    }

    // If no services configured, show a generic card
    if (pricingCards.length === 0) {
        pricingCards.push({
            title: 'Laundry Service',
            price: 'Contact Us',
            unit: '',
            icon: FaTshirt,
            popular: true,
            description: 'Professional wash & fold service.',
            features: ['Wash, dry & fold', 'Free pickup & delivery', 'Same-day available'],
            cta: 'Get Started',
        });
    }

    // Mark first card as popular if none are
    if (!pricingCards.some(c => c.popular)) pricingCards[0].popular = true;

    return (
        <Box id="pricing" py={{ base: 16, md: 20 }} bg="white">
            <Container maxW="1200px">
                <VStack spacing={4} textAlign="center" mb={12}>
                    <Text fontSize="sm" fontWeight="600" color={`${themeColor}.500`} textTransform="uppercase" letterSpacing="wide">
                        Pricing
                    </Text>
                    <Heading fontSize={{ base: '2xl', md: '4xl' }} color="gray.800">
                        Simple, transparent pricing
                    </Heading>
                    <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.500" maxW="500px">
                        No hidden fees, no contracts. Choose what works for you.
                    </Text>
                </VStack>

                <SimpleGrid columns={{ base: 1, md: pricingCards.length > 1 ? 2 : 1 }} spacing={6} maxW={pricingCards.length > 1 ? '800px' : '450px'} mx="auto">
                    {pricingCards.map((plan) => (
                        <Box key={plan.title} bg={plan.popular ? `${themeColor}.50` : 'white'}
                            border="2px solid" borderColor={plan.popular ? `${themeColor}.300` : 'gray.200'}
                            borderRadius="2xl" p={{ base: 6, md: 8 }} position="relative"
                            transition="all 0.3s" _hover={{ boxShadow: 'xl', transform: 'translateY(-4px)' }}>
                            {plan.popular && pricingCards.length > 1 && (
                                <Badge position="absolute" top={-3} left="50%" transform="translateX(-50%)"
                                    colorScheme={themeColor} borderRadius="full" px={4} py={1} fontSize="xs" fontWeight="700">
                                    Most Popular
                                </Badge>
                            )}
                            <VStack spacing={5} align="stretch">
                                <HStack spacing={3}>
                                    <Box bg={plan.popular ? `${themeColor}.100` : 'gray.100'} borderRadius="lg" p={2}>
                                        <Icon as={plan.icon} boxSize={5} color={plan.popular ? `${themeColor}.500` : 'gray.500'} />
                                    </Box>
                                    <Text fontSize="lg" fontWeight="700" color="gray.800">{plan.title}</Text>
                                </HStack>
                                <HStack align="baseline" spacing={1}>
                                    <Text fontSize="4xl" fontWeight="800" color="gray.800">{plan.price}</Text>
                                    <Text fontSize="md" color="gray.500" fontWeight="500">{plan.unit}</Text>
                                </HStack>
                                <Text fontSize="sm" color="gray.500">{plan.description}</Text>
                                <List spacing={3}>
                                    {plan.features.map((feature) => (
                                        <ListItem key={feature} fontSize="sm" color="gray.600" display="flex" alignItems="center">
                                            <ListIcon as={FiCheck} color="green.400" boxSize={4} />
                                            {feature}
                                        </ListItem>
                                    ))}
                                </List>
                                <Button as="a" href={`/${laundryId}`} colorScheme={plan.popular ? themeColor : 'gray'}
                                    variant={plan.popular ? 'solid' : 'outline'} size="lg" borderRadius="full" mt={2}>
                                    {plan.cta}
                                </Button>
                            </VStack>
                        </Box>
                    ))}
                </SimpleGrid>

                {/* Self-service mention */}
                <Box mt={10} bg="gray.50" borderRadius="2xl" p={{ base: 5, md: 6 }} textAlign="center" maxW="600px" mx="auto">
                    <Text fontWeight="600" color="gray.700" mb={1}>Prefer to do it yourself?</Text>
                    <Text fontSize="sm" color="gray.500">
                        {sc.selfServiceNote || 'Visit our self-service laundromat with modern washers and dryers.'}
                    </Text>
                </Box>
            </Container>
        </Box>
    );
}
