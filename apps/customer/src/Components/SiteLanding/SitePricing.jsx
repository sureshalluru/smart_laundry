import React from 'react';
import {
    Box,
    Container,
    Heading,
    Text,
    VStack,
    HStack,
    Button,
    Badge,
    Icon,
    SimpleGrid,
    List,
    ListItem,
    ListIcon,
} from '@chakra-ui/react';
import { FiCheck } from 'react-icons/fi';
import { FaShoppingBag, FaWeight } from 'react-icons/fa';

const plans = [
    {
        title: 'Per Bag',
        price: '$30',
        unit: '/bag',
        description: 'Simple flat rate per 13-gallon trash bag. Larger bags $45.',
        icon: FaShoppingBag,
        popular: true,
        features: [
            '13-gallon trash bag — $30/bag',
            'Larger than 13-gallon — $45/bag',
            'Wash, dry & fold included',
            'Free pickup & delivery',
            'Same-day turnaround available',
        ],
        cta: 'Choose Per Bag',
    },
    {
        title: 'Per Pound',
        price: '$1.79',
        unit: '/lb',
        description: 'Pay only for what you wash. Great for lighter loads.',
        icon: FaWeight,
        popular: false,
        features: [
            'Choose specific services',
            'Wash, dry & fold included',
            'Free pickup & delivery',
            'Custom preferences available',
            'Eco-friendly detergent option',
        ],
        cta: 'Choose Per Pound',
    },
];

export default function SitePricing({ config }) {
    const bagPrice = config?.bagPrice || 30;
    const laundryId = config?.laundryId || '1';
    const sc = config?.siteContent || {};
    const themeColor = sc.themeColor || 'blue';
    return (
        <Box id="pricing" py={{ base: 16, md: 20 }} bg="white">
            <Container maxW="1200px">
                <VStack spacing={4} textAlign="center" mb={12}>
                    <Text
                        fontSize="sm"
                        fontWeight="600"
                        color={`${themeColor}.500`}
                        textTransform="uppercase"
                        letterSpacing="wide"
                    >
                        Pricing
                    </Text>
                    <Heading fontSize={{ base: '2xl', md: '4xl' }} color="gray.800">
                        Simple, transparent pricing
                    </Heading>
                    <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.500" maxW="500px">
                        Choose the option that works best for you. No hidden fees, no contracts.
                    </Text>
                </VStack>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} maxW="800px" mx="auto">
                    {plans.map((plan) => (
                        <Box
                            key={plan.title}
                            bg={plan.popular ? 'blue.50' : 'white'}
                            border="2px solid"
                            borderColor={plan.popular ? 'blue.300' : 'gray.200'}
                            borderRadius="2xl"
                            p={{ base: 6, md: 8 }}
                            position="relative"
                            transition="all 0.3s"
                            _hover={{
                                boxShadow: 'xl',
                                transform: 'translateY(-4px)',
                            }}
                        >
                            {plan.popular && (
                                <Badge
                                    position="absolute"
                                    top={-3}
                                    left="50%"
                                    transform="translateX(-50%)"
                                    colorScheme="blue"
                                    borderRadius="full"
                                    px={4}
                                    py={1}
                                    fontSize="xs"
                                    fontWeight="700"
                                >
                                    Most Popular
                                </Badge>
                            )}

                            <VStack spacing={5} align="stretch">
                                <HStack spacing={3}>
                                    <Box
                                        bg={plan.popular ? 'blue.100' : 'gray.100'}
                                        borderRadius="lg"
                                        p={2}
                                    >
                                        <Icon
                                            as={plan.icon}
                                            boxSize={5}
                                            color={plan.popular ? 'blue.500' : 'gray.500'}
                                        />
                                    </Box>
                                    <Text fontSize="lg" fontWeight="700" color="gray.800">
                                        {plan.title}
                                    </Text>
                                </HStack>

                                <HStack align="baseline" spacing={1}>
                                    <Text fontSize="4xl" fontWeight="800" color="gray.800">
                                        {plan.price}
                                    </Text>
                                    <Text fontSize="md" color="gray.500" fontWeight="500">
                                        {plan.unit}
                                    </Text>
                                </HStack>

                                <Text fontSize="sm" color="gray.500">
                                    {plan.description}
                                </Text>

                                <List spacing={3}>
                                    {plan.features.map((feature) => (
                                        <ListItem
                                            key={feature}
                                            fontSize="sm"
                                            color="gray.600"
                                            display="flex"
                                            alignItems="center"
                                        >
                                            <ListIcon
                                                as={FiCheck}
                                                color="green.400"
                                                boxSize={4}
                                            />
                                            {feature}
                                        </ListItem>
                                    ))}
                                </List>

                                <Button
                                    as="a"
                                    href={`/${laundryId}`}
                                    onClick={() => localStorage.setItem('selectedPricingType', plan.title === 'Per Bag' ? 'per_bag' : 'per_pound')}
                                    colorScheme={plan.popular ? 'blue' : 'gray'}
                                    variant={plan.popular ? 'solid' : 'outline'}
                                    size="lg"
                                    borderRadius="full"
                                    mt={2}
                                >
                                    {plan.cta}
                                </Button>
                            </VStack>
                        </Box>
                    ))}
                </SimpleGrid>

                {/* Self-service mention */}
                <Box
                    mt={10}
                    bg="gray.50"
                    borderRadius="2xl"
                    p={{ base: 5, md: 6 }}
                    textAlign="center"
                    maxW="600px"
                    mx="auto"
                >
                    <Text fontWeight="600" color="gray.700" mb={1}>
                        Prefer to do it yourself?
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                        {sc.selfServiceNote || 'Visit our self-service laundromat with modern washers and dryers.'}
                    </Text>
                </Box>
            </Container>
        </Box>
    );
}
