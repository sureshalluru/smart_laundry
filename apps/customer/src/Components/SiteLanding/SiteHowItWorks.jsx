import React from 'react';
import {
    Box,
    Container,
    Heading,
    Text,
    VStack,
    Circle,
    Flex,
    Icon,
} from '@chakra-ui/react';
import { FiCalendar, FiStar, FiSmile } from 'react-icons/fi';

const steps = [
    {
        number: '1',
        icon: FiCalendar,
        title: 'Schedule a Pickup',
        description:
            'Choose a day and time that works for you. We offer 7-day-a-week service with flexible time slots.',
    },
    {
        number: '2',
        icon: FiStar,
        title: 'We Clean Your Clothes',
        description:
            'Your laundry is washed, dried, and folded with care. Lights and darks separated. Eco-friendly detergent available.',
    },
    {
        number: '3',
        icon: FiSmile,
        title: 'Fresh Clothes Delivered',
        description:
            'We deliver your clean, neatly folded laundry right back to your door. Ready to wear or put away.',
    },
];

export default function SiteHowItWorks() {
    return (
        <Box id="how-it-works" py={{ base: 16, md: 20 }} bg="gray.50">
            <Container maxW="1200px">
                <VStack spacing={4} textAlign="center" mb={12}>
                    <Text
                        fontSize="sm"
                        fontWeight="600"
                        color="blue.500"
                        textTransform="uppercase"
                        letterSpacing="wide"
                    >
                        How It Works
                    </Text>
                    <Heading fontSize={{ base: '2xl', md: '4xl' }} color="gray.800">
                        Clean clothes in 3 simple steps
                    </Heading>
                </VStack>

                <Flex
                    direction={{ base: 'column', md: 'row' }}
                    gap={{ base: 8, md: 6 }}
                    justify="center"
                    align={{ base: 'stretch', md: 'flex-start' }}
                >
                    {steps.map((step, idx) => (
                        <VStack
                            key={step.number}
                            flex="1"
                            spacing={4}
                            textAlign="center"
                            position="relative"
                            maxW={{ md: '300px' }}
                        >
                            {/* Connector line (desktop only) */}
                            {idx < steps.length - 1 && (
                                <Box
                                    display={{ base: 'none', md: 'block' }}
                                    position="absolute"
                                    top="28px"
                                    left="60%"
                                    w="80%"
                                    h="2px"
                                    bg="blue.100"
                                    zIndex="0"
                                />
                            )}

                            <Circle
                                size="56px"
                                bg="blue.500"
                                color="white"
                                fontWeight="800"
                                fontSize="xl"
                                zIndex="1"
                                boxShadow="md"
                            >
                                {step.number}
                            </Circle>

                            <Icon as={step.icon} boxSize={6} color="blue.400" />

                            <Text fontSize="lg" fontWeight="700" color="gray.800">
                                {step.title}
                            </Text>
                            <Text fontSize="sm" color="gray.500" lineHeight="tall" px={2}>
                                {step.description}
                            </Text>
                        </VStack>
                    ))}
                </Flex>
            </Container>
        </Box>
    );
}
