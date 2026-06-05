import React from 'react';
import {
    Box,
    Heading,
    Text,
    VStack,
    HStack,
    Icon,
    Badge,
    useBreakpointValue,
} from '@chakra-ui/react';
import { FaShoppingBag, FaWeight } from 'react-icons/fa';

/**
 * PricingChoice — First step in the order flow.
 * Customer picks "Per Bag" (flat rate) or "Per Pound" (service-based).
 * Mobile-first, card-based selection inspired by HappyNest.
 */
export default function PricingChoice({ pricingType, setPricingType, bagPrice, onContinue }) {
    const cardPadding = useBreakpointValue({ base: 5, md: 6 });
    const iconSize = useBreakpointValue({ base: 8, md: 10 });

    const options = [
        {
            id: 'per_bag',
            title: 'Per Bag',
            subtitle: `$${(bagPrice || 30).toFixed(0)} / bag (13-gal)`,
            description: 'Simple flat rate per bag. 13-gallon trash bag $30, larger bags $45.',
            icon: FaShoppingBag,
            color: 'blue.500',
            badgeText: 'Popular',
            badgeColor: 'blue',
        },
        {
            id: 'per_pound',
            title: 'Per Pound',
            subtitle: 'Priced by weight',
            description: 'Choose specific services and pay by the pound or piece.',
            icon: FaWeight,
            color: 'purple.500',
            badgeText: null,
            badgeColor: null,
        },
    ];

    return (
        <VStack spacing={5} align="stretch" w="100%" maxW="480px" mx="auto" py={4}>
            <VStack spacing={1} textAlign="center">
                <Heading size={{ base: 'md', md: 'lg' }} color="gray.800">
                    How would you like to be charged?
                </Heading>
                <Text fontSize={{ base: 'sm', md: 'md' }} color="gray.500">
                    Choose your preferred pricing option
                </Text>
            </VStack>

            <VStack spacing={4}>
                {options.map((opt) => {
                    const isSelected = pricingType === opt.id;
                    return (
                        <Box
                            key={opt.id}
                            as="button"
                            onClick={() => {
                                setPricingType(opt.id);
                                onContinue(opt.id);
                            }}
                            w="100%"
                            textAlign="left"
                            p={cardPadding}
                            borderRadius="2xl"
                            border="2px solid"
                            borderColor={isSelected ? 'blue.400' : 'gray.200'}
                            bg={isSelected ? 'blue.50' : 'white'}
                            boxShadow={isSelected ? 'md' : 'sm'}
                            transition="all 0.2s"
                            _hover={{
                                borderColor: 'blue.300',
                                boxShadow: 'md',
                                transform: 'translateY(-2px)',
                            }}
                            _active={{ transform: 'translateY(0)' }}
                            cursor="pointer"
                        >
                            <HStack spacing={4} align="flex-start">
                                <Box
                                    bg={isSelected ? 'blue.100' : 'gray.100'}
                                    borderRadius="xl"
                                    p={3}
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="center"
                                >
                                    <Icon
                                        as={opt.icon}
                                        boxSize={iconSize}
                                        color={isSelected ? 'blue.500' : 'gray.500'}
                                    />
                                </Box>
                                <VStack align="flex-start" spacing={1} flex="1">
                                    <HStack>
                                        <Text
                                            fontSize={{ base: 'lg', md: 'xl' }}
                                            fontWeight="bold"
                                            color="gray.800"
                                        >
                                            {opt.title}
                                        </Text>
                                        {opt.badgeText && (
                                            <Badge
                                                colorScheme={opt.badgeColor}
                                                borderRadius="full"
                                                px={2}
                                                fontSize="xs"
                                            >
                                                {opt.badgeText}
                                            </Badge>
                                        )}
                                    </HStack>
                                    <Text
                                        fontSize={{ base: 'md', md: 'lg' }}
                                        fontWeight="600"
                                        color={opt.color}
                                    >
                                        {opt.subtitle}
                                    </Text>
                                    <Text fontSize="sm" color="gray.500" lineHeight="short">
                                        {opt.description}
                                    </Text>
                                </VStack>
                            </HStack>
                        </Box>
                    );
                })}
            </VStack>
        </VStack>
    );
}
