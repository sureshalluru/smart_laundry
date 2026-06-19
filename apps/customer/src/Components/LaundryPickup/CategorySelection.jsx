import React from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Heading,
    Icon,
    SimpleGrid,
    Badge,
} from '@chakra-ui/react';
import { FaShoppingBag, FaWeight, FaTshirt, FaSprayCan } from 'react-icons/fa';

/**
 * CategorySelection — Shows category cards for the customer to pick from.
 * Displayed when a laundry has multiple service categories configured.
 */
export default function CategorySelection({ categories, services, onSelect, themeColor = 'blue' }) {
    // Only show categories that have at least one service
    const activeCategories = categories
        .filter(cat => services.some(s => s.categoryId === cat.categoryId))
        .sort((a, b) => a.displayOrder - b.displayOrder);

    // Pick an icon based on category name (simple heuristic)
    const getIcon = (name) => {
        const lower = (name || '').toLowerCase();
        if (lower.includes('pound') || lower.includes('weight')) return FaWeight;
        if (lower.includes('bag')) return FaShoppingBag;
        if (lower.includes('dry') || lower.includes('clean')) return FaSprayCan;
        return FaTshirt;
    };

    return (
        <VStack spacing={5} align="stretch" w="100%" py={2}>
            <Box textAlign="center" mb={2}>
                <Heading size="md" color="gray.800" mb={1}>
                    Choose a Service
                </Heading>
                <Text fontSize="sm" color="gray.500">
                    Select the type of service you need
                </Text>
            </Box>

            <SimpleGrid columns={{ base: 1, md: Math.min(activeCategories.length, 2) }} spacing={4}>
                {activeCategories.map((cat, idx) => {
                    const catServices = services.filter(s => s.categoryId === cat.categoryId);
                    const cheapest = catServices.reduce((min, s) => Math.min(min, parseFloat(s.price || 0)), Infinity);
                    const hasWeight = catServices.some(s => s.inputWeight === true || s.inputWeight === 'true');
                    const unit = hasWeight ? '/lb' : '';

                    return (
                        <Box
                            key={cat.categoryId}
                            as="button"
                            onClick={() => onSelect(cat)}
                            bg={idx === 0 ? `${themeColor}.50` : 'white'}
                            border="2px solid"
                            borderColor={idx === 0 ? `${themeColor}.300` : 'gray.200'}
                            borderRadius="2xl"
                            p={{ base: 5, md: 6 }}
                            textAlign="left"
                            transition="all 0.2s"
                            _hover={{ boxShadow: 'lg', transform: 'translateY(-2px)', borderColor: `${themeColor}.400` }}
                            w="100%"
                        >
                            <VStack spacing={3} align="stretch">
                                <HStack spacing={3}>
                                    <Box bg={`${themeColor}.100`} borderRadius="lg" p={2}>
                                        <Icon as={getIcon(cat.categoryName)} boxSize={5} color={`${themeColor}.500`} />
                                    </Box>
                                    <Text fontSize="lg" fontWeight="700" color="gray.800">
                                        {cat.categoryName}
                                    </Text>
                                </HStack>

                                <HStack align="baseline" spacing={1}>
                                    <Text fontSize="2xl" fontWeight="800" color="gray.800">
                                        ${cheapest % 1 === 0 ? cheapest : cheapest.toFixed(2)}
                                    </Text>
                                    <Text fontSize="sm" color="gray.500">{unit} starting</Text>
                                </HStack>

                                <Box>
                                    {catServices.slice(0, 3).map(s => (
                                        <HStack key={s.serviceName} justify="space-between" py={1}>
                                            <Text fontSize="sm" color="gray.600">{s.serviceName}</Text>
                                            <Badge colorScheme={themeColor} variant="subtle" fontSize="xs">
                                                ${parseFloat(s.price).toFixed(2)}{hasWeight ? '/lb' : ''}
                                            </Badge>
                                        </HStack>
                                    ))}
                                    {catServices.length > 3 && (
                                        <Text fontSize="xs" color="gray.400" mt={1}>
                                            +{catServices.length - 3} more services
                                        </Text>
                                    )}
                                </Box>
                            </VStack>
                        </Box>
                    );
                })}
            </SimpleGrid>
        </VStack>
    );
}
