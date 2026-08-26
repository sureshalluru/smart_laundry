import React from 'react';
import { Box, Flex, Text, Button, Icon } from '@chakra-ui/react';
import { FiRepeat } from 'react-icons/fi';

/**
 * Compact reorder card shown on LaundryHomePage for returning customers.
 * Displays a summary of the last completed order with a one-tap reorder button.
 */
const ReorderCard = ({ lastOrder, onReorder, themeColor = 'blue' }) => {
    if (!lastOrder) return null;

    // Build service summary from order services
    const serviceSummary = (() => {
        const services = lastOrder.services || lastOrder.orderServices || [];
        if (services.length === 0) return 'Previous Order';
        const names = services.map(s => s.serviceName || s.name).filter(Boolean);
        if (names.length <= 2) return names.join(', ');
        return `${names[0]} + ${names.length - 1} more`;
    })();

    const total = lastOrder.grandTotal || lastOrder.total || '';

    return (
        <Box
            bg="white"
            borderRadius="xl"
            border="1px solid"
            borderColor={`${themeColor}.100`}
            boxShadow="sm"
            p={4}
            mb={4}
        >
            <Flex align="center" justify="space-between" gap={3}>
                <Flex align="center" gap={3} flex="1" minW={0}>
                    <Flex
                        align="center"
                        justify="center"
                        bg={`${themeColor}.50`}
                        borderRadius="lg"
                        w="40px"
                        h="40px"
                        flexShrink={0}
                    >
                        <Icon as={FiRepeat} color={`${themeColor}.500`} boxSize={5} />
                    </Flex>
                    <Box minW={0}>
                        <Text fontSize="sm" fontWeight="600" color="gray.800" noOfLines={1}>
                            {serviceSummary}
                        </Text>
                        {total && (
                            <Text fontSize="xs" color="gray.500">
                                ${parseFloat(total).toFixed(2)}
                            </Text>
                        )}
                    </Box>
                </Flex>
                <Button
                    size="sm"
                    colorScheme={themeColor}
                    borderRadius="lg"
                    leftIcon={<FiRepeat />}
                    onClick={onReorder}
                    flexShrink={0}
                >
                    Reorder
                </Button>
            </Flex>
        </Box>
    );
};

export default ReorderCard;
