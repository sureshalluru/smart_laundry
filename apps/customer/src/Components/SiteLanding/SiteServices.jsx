import React from 'react';
import {
    Box,
    Container,
    Heading,
    Text,
    SimpleGrid,
    VStack,
    Icon,
} from '@chakra-ui/react';
import { FiDroplet, FiPackage, FiTruck, FiSun } from 'react-icons/fi';
import { FaShoppingBag } from 'react-icons/fa';

const services = [
    {
        icon: FiPackage,
        title: 'Wash & Fold',
        description: 'Drop off or schedule a pickup. We wash, dry, and neatly fold your clothes — ready to wear. $1.79/lb with free pickup & delivery.',
        color: 'blue.500',
        bg: 'blue.50',
    },
    {
        icon: FiDroplet,
        title: 'Self-Service Laundromat',
        description: 'Open 24/7 with 120 lb commercial washers and dryers. 25% off on weekdays 8:30 AM – 4:30 PM.',
        color: 'teal.500',
        bg: 'teal.50',
    },
    {
        icon: FiTruck,
        title: 'Free Pickup & Delivery',
        description: 'We pick up your laundry and deliver it fresh and clean — free for residential and commercial clients.',
        color: 'purple.500',
        bg: 'purple.50',
    },
    {
        icon: FaShoppingBag,
        title: 'Per Bag Service',
        description: 'Simple flat rate per bag. Fill it up, we handle the rest. No weighing, no surprises.',
        color: 'orange.500',
        bg: 'orange.50',
    },
    {
        icon: FiSun,
        title: 'Drive-Through Drop Off',
        description: 'In a rush? Use our convenient drive-through to drop off and pick up without leaving your car.',
        color: 'pink.500',
        bg: 'pink.50',
    },
];

export default function SiteServices({ config }) {
    return (
        <Box id="services" py={{ base: 16, md: 20 }} bg="white">
            <Container maxW="1200px">
                <VStack spacing={4} textAlign="center" mb={12}>
                    <Text
                        fontSize="sm"
                        fontWeight="600"
                        color="blue.500"
                        textTransform="uppercase"
                        letterSpacing="wide"
                    >
                        Our Services
                    </Text>
                    <Heading fontSize={{ base: '2xl', md: '4xl' }} color="gray.800">
                        Everything you need for fresh, clean clothes
                    </Heading>
                    <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.500" maxW="600px">
                        Whether you prefer to do it yourself or let us handle it, we have options for every need.
                    </Text>
                </VStack>

                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
                    {services.map((service) => (
                        <Box
                            key={service.title}
                            bg="white"
                            border="1px solid"
                            borderColor="gray.100"
                            borderRadius="2xl"
                            p={6}
                            transition="all 0.3s"
                            _hover={{
                                boxShadow: 'lg',
                                transform: 'translateY(-4px)',
                                borderColor: 'blue.100',
                            }}
                        >
                            <VStack align="flex-start" spacing={4}>
                                <Box bg={service.bg} borderRadius="xl" p={3}>
                                    <Icon as={service.icon} boxSize={6} color={service.color} />
                                </Box>
                                <Text fontSize="lg" fontWeight="700" color="gray.800">
                                    {service.title}
                                </Text>
                                <Text fontSize="sm" color="gray.500" lineHeight="tall">
                                    {service.description}
                                </Text>
                            </VStack>
                        </Box>
                    ))}
                </SimpleGrid>
            </Container>
        </Box>
    );
}
