import React from 'react';
import { Box, Container, Heading, Text, SimpleGrid, VStack, Icon } from '@chakra-ui/react';
import { FiPackage, FiDroplet, FiTruck, FiSun } from 'react-icons/fi';
import { FaShoppingBag } from 'react-icons/fa';

const iconMap = { package: FiPackage, droplet: FiDroplet, truck: FiTruck, sun: FiSun, bag: FaShoppingBag };

export default function SiteServices({ config }) {
    const sc = config?.siteContent || {};
    const services = sc.services || [];
    const themeColor = sc.themeColor || 'blue';

    return (
        <Box id="services" py={{ base: 16, md: 20 }} bg="white">
            <Container maxW="1200px">
                <VStack spacing={4} textAlign="center" mb={12}>
                    <Text fontSize="sm" fontWeight="600" color={`${themeColor}.500`} textTransform="uppercase" letterSpacing="wide">
                        Our Services
                    </Text>
                    <Heading fontSize={{ base: '2xl', md: '4xl' }} color="gray.800">
                        Everything you need for fresh, clean clothes
                    </Heading>
                </VStack>

                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
                    {services.map((service) => (
                        <Box key={service.title} bg="white" border="1px solid" borderColor="gray.100" borderRadius="2xl" p={6}
                            transition="all 0.3s" _hover={{ boxShadow: 'lg', transform: 'translateY(-4px)', borderColor: `${themeColor}.100` }}>
                            <VStack align="flex-start" spacing={4}>
                                <Box bg={`${service.color || themeColor}.50`} borderRadius="xl" p={3}>
                                    <Icon as={iconMap[service.icon] || FiPackage} boxSize={6} color={`${service.color || themeColor}.500`} />
                                </Box>
                                <Text fontSize="lg" fontWeight="700" color="gray.800">{service.title}</Text>
                                <Text fontSize="sm" color="gray.500" lineHeight="tall">{service.description}</Text>
                            </VStack>
                        </Box>
                    ))}
                </SimpleGrid>
            </Container>
        </Box>
    );
}
