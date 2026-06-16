import React from 'react';
import {
    Box, Container, Heading, Text, VStack, HStack, Button, SimpleGrid,
    Image, Badge, Icon, Flex, Card, CardBody, Divider, List, ListItem, ListIcon
} from '@chakra-ui/react';
import { FiCheck, FiClock, FiMapPin, FiPhone } from 'react-icons/fi';
import { useParams } from 'react-router-dom';

const SareeRollingPage = () => {
    const { laundryId } = useParams();

    const services = [
        {
            name: "Saree Rolling (Non-Silk)",
            price: "$10",
            description: "Professional rolling for polyester, georgette, chiffon, and other non-silk sarees. Crisp folds, ready to drape.",
            badge: "Most Popular",
            badgeColor: "green",
        },
        {
            name: "Saree Rolling (Silk/Cotton)",
            price: "$12",
            description: "Gentle care for silk pattu, Kanchipuram, Banarasi, and cotton sarees. Acid-free tissue paper between folds.",
            badge: "Premium Care",
            badgeColor: "purple",
        },
        {
            name: "Saree Rolling + Pre-Pleating",
            price: "$38",
            description: "Complete service: professional rolling, polishing, ironing, AND pre-pleated pallu & waist pleats. Ready to wear in minutes.",
            badge: "Full Service",
            badgeColor: "orange",
        },
    ];

    return (
        <Box bg="white" minH="100vh">
            {/* Hero Section */}
            <Box
                bg="linear-gradient(135deg, #FFF8E1 0%, #FFECB3 50%, #FFE082 100%)"
                py={{ base: 12, md: 20 }}
                position="relative"
                overflow="hidden"
            >
                <Container maxW="1200px">
                    <Flex direction={{ base: 'column', md: 'row' }} align="center" gap={8}>
                        <VStack align={{ base: 'center', md: 'flex-start' }} spacing={5} flex="1" textAlign={{ base: 'center', md: 'left' }}>
                            <Badge colorScheme="orange" fontSize="sm" px={3} py={1} borderRadius="full">
                                Saree Care Specialists
                            </Badge>
                            <Heading fontSize={{ base: '3xl', md: '5xl' }} color="gray.800" lineHeight="shorter">
                                Professional Saree Rolling & Pre-Pleating
                            </Heading>
                            <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.600" maxW="500px">
                                Expert care for your precious ethnic wear. From everyday polyester to 
                                heirloom Kanchipuram silks — rolled, polished, and ready to drape beautifully.
                            </Text>
                            <HStack spacing={4} pt={2}>
                                <Button as="a" href={`/${laundryId || '1'}`} size="lg" colorScheme="orange" borderRadius="full" px={8}>
                                    Schedule Pickup
                                </Button>
                                <Button as="a" href="#pricing" size="lg" variant="outline" borderColor="orange.400" color="orange.700" borderRadius="full" px={8}>
                                    View Pricing
                                </Button>
                            </HStack>
                        </VStack>
                        <Box flex="1" maxW="500px">
                            <Image
                                src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&h=400&fit=crop"
                                alt="Beautiful draped sarees"
                                borderRadius="2xl"
                                boxShadow="2xl"
                                objectFit="cover"
                                w="100%"
                                h={{ base: '250px', md: '350px' }}
                            />
                        </Box>
                    </Flex>
                </Container>
            </Box>

            {/* What We Do */}
            <Container maxW="1200px" py={{ base: 12, md: 16 }}>
                <VStack spacing={12}>
                    <VStack spacing={3} textAlign="center">
                        <Heading fontSize={{ base: '2xl', md: '3xl' }} color="gray.800">
                            What We Do
                        </Heading>
                        <Text color="gray.600" maxW="700px" fontSize="lg">
                            Your sarees deserve the same care as the moments they're worn for. 
                            We handle everything — from everyday rolling to wedding-ready pre-pleating.
                        </Text>
                    </VStack>

                    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} w="100%">
                        <Card borderRadius="xl" overflow="hidden" boxShadow="md" _hover={{ transform: 'translateY(-4px)', boxShadow: 'xl' }} transition="all 0.3s">
                            <Image
                                src="https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400&h=250&fit=crop"
                                alt="Saree rolling process"
                                h="200px" objectFit="cover"
                            />
                            <CardBody>
                                <Heading size="md" mb={2}>Rolling & Polishing</Heading>
                                <Text color="gray.600" fontSize="sm">
                                    Each saree is carefully steamed, polished to restore sheen, 
                                    and rolled on acid-free tubes to prevent creasing and preserve fabric quality.
                                </Text>
                            </CardBody>
                        </Card>

                        <Card borderRadius="xl" overflow="hidden" boxShadow="md" _hover={{ transform: 'translateY(-4px)', boxShadow: 'xl' }} transition="all 0.3s">
                            <Image
                                src="https://images.unsplash.com/photo-1594040226829-7f251ab46d80?w=400&h=250&fit=crop"
                                alt="Ironing and pressing"
                                h="200px" objectFit="cover"
                            />
                            <CardBody>
                                <Heading size="md" mb={2}>Ironing & Pressing</Heading>
                                <Text color="gray.600" fontSize="sm">
                                    Temperature-controlled pressing for each fabric type. 
                                    Silk gets low heat with protective cloth; cotton gets crisp steam pressing.
                                </Text>
                            </CardBody>
                        </Card>

                        <Card borderRadius="xl" overflow="hidden" boxShadow="md" _hover={{ transform: 'translateY(-4px)', boxShadow: 'xl' }} transition="all 0.3s">
                            <Image
                                src="https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=400&h=250&fit=crop"
                                alt="Pre-pleated saree ready to wear"
                                h="200px" objectFit="cover"
                            />
                            <CardBody>
                                <Heading size="md" mb={2}>Pre-Pleating</Heading>
                                <Text color="gray.600" fontSize="sm">
                                    Get your saree pre-pleated and ready to wear in minutes. 
                                    Perfect for weddings, festivals, and special occasions when you want to look your best without the hassle.
                                </Text>
                            </CardBody>
                        </Card>
                    </SimpleGrid>
                </VStack>
            </Container>

            {/* Pricing */}
            <Box id="pricing" bg="gray.50" py={{ base: 12, md: 16 }}>
                <Container maxW="1200px">
                    <VStack spacing={8}>
                        <VStack spacing={3} textAlign="center">
                            <Heading fontSize={{ base: '2xl', md: '3xl' }}>Simple, Transparent Pricing</Heading>
                            <Text color="gray.600">No hidden fees. Drop off or schedule a free pickup.</Text>
                        </VStack>

                        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} w="100%">
                            {services.map((svc) => (
                                <Card key={svc.name} borderRadius="xl" boxShadow="md" border="2px solid" borderColor="transparent"
                                    _hover={{ borderColor: 'orange.200', boxShadow: 'xl' }} transition="all 0.3s">
                                    <CardBody textAlign="center" p={8}>
                                        <Badge colorScheme={svc.badgeColor} mb={3} fontSize="xs">{svc.badge}</Badge>
                                        <Heading size="md" mb={2}>{svc.name}</Heading>
                                        <Text fontSize="4xl" fontWeight="800" color="orange.500" mb={3}>{svc.price}</Text>
                                        <Text color="gray.600" fontSize="sm" mb={4}>{svc.description}</Text>
                                        <Button as="a" href={`/${laundryId || '1'}`} colorScheme="orange" borderRadius="full" w="100%">
                                            Book Now
                                        </Button>
                                    </CardBody>
                                </Card>
                            ))}
                        </SimpleGrid>
                    </VStack>
                </Container>
            </Box>

            {/* Why Choose Us */}
            <Container maxW="1200px" py={{ base: 12, md: 16 }}>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={10} alignItems="center">
                    <Box>
                        <Heading fontSize={{ base: '2xl', md: '3xl' }} mb={6}>
                            Why Customers Trust Us With Their Sarees
                        </Heading>
                        <List spacing={4}>
                            <ListItem display="flex" alignItems="flex-start">
                                <ListIcon as={FiCheck} color="green.500" mt={1} />
                                <Text><strong>24/7 Drop-off:</strong> Drop your sarees anytime at our facility — we're always open.</Text>
                            </ListItem>
                            <ListItem display="flex" alignItems="flex-start">
                                <ListIcon as={FiCheck} color="green.500" mt={1} />
                                <Text><strong>Free Pickup & Delivery:</strong> We come to you. Schedule online in 30 seconds.</Text>
                            </ListItem>
                            <ListItem display="flex" alignItems="flex-start">
                                <ListIcon as={FiCheck} color="green.500" mt={1} />
                                <Text><strong>Fabric-Specific Care:</strong> Different treatment for silk, cotton, georgette, and synthetics.</Text>
                            </ListItem>
                            <ListItem display="flex" alignItems="flex-start">
                                <ListIcon as={FiCheck} color="green.500" mt={1} />
                                <Text><strong>Wedding-Ready:</strong> Pre-pleated sarees for stress-free dressing on your big day.</Text>
                            </ListItem>
                            <ListItem display="flex" alignItems="flex-start">
                                <ListIcon as={FiCheck} color="green.500" mt={1} />
                                <Text><strong>Same-Day Available:</strong> Need it today? We offer same-day turnaround.</Text>
                            </ListItem>
                        </List>
                    </Box>
                    <Box>
                        <Image
                            src="https://images.unsplash.com/photo-1604881991720-f91add269bed?w=500&h=400&fit=crop"
                            alt="Colorful sarees on display"
                            borderRadius="2xl"
                            boxShadow="xl"
                            objectFit="cover"
                            w="100%"
                            h={{ base: '300px', md: '400px' }}
                        />
                    </Box>
                </SimpleGrid>
            </Container>

            {/* Location & CTA */}
            <Box bg="orange.50" py={{ base: 10, md: 14 }}>
                <Container maxW="800px" textAlign="center">
                    <VStack spacing={4}>
                        <Heading fontSize={{ base: 'xl', md: '2xl' }}>Visit Us or Schedule a Free Pickup</Heading>
                        <HStack spacing={2} color="gray.600">
                            <Icon as={FiMapPin} />
                            <Text>900 E Palm Valley Blvd, Suite 1006-1007, Round Rock, TX 78664</Text>
                        </HStack>
                        <HStack spacing={2} color="gray.600">
                            <Icon as={FiClock} />
                            <Text>Open 24/7</Text>
                        </HStack>
                        <HStack spacing={2} color="gray.600">
                            <Icon as={FiPhone} />
                            <Text>(512) 717-4498</Text>
                        </HStack>
                        <Divider maxW="200px" borderColor="orange.200" />
                        <Button as="a" href={`/${laundryId || '1'}`} size="lg" colorScheme="orange" borderRadius="full" px={10}>
                            Schedule Your Saree Pickup
                        </Button>
                    </VStack>
                </Container>
            </Box>
        </Box>
    );
};

export default SareeRollingPage;
