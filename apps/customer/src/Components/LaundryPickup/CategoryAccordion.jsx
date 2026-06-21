import React from 'react';
import {
  Box,
  Flex,
  Text,
  Badge,
  VStack,
  Collapse,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { getCategoryBadgeCount } from './cartUtils';
import WeightServiceRow from './WeightServiceRow';
import PieceServiceRow from './PieceServiceRow';

/**
 * CategoryAccordion — Controlled accordion with single-expanded behavior.
 *
 * Renders one collapsible section per category group. Only one section
 * can be expanded at a time (controlled by parent). Collapsed sections
 * with items in cart show a badge count.
 */
export default function CategoryAccordion({
  groups,
  expandedCategoryId,
  onToggle,
  cart,
  dispatch,
  themeColor,
}) {
  const colorScheme = themeColor || 'blue';
  const cartItems = cart?.items || [];

  return (
    <VStack spacing={3} align="stretch" w="100%">
      {groups.map((group) => {
        const isExpanded = expandedCategoryId === group.categoryId;
        const badgeCount = getCategoryBadgeCount(cartItems, group.categoryId);

        return (
          <Box
            key={group.categoryId}
            borderRadius="xl"
            border="1px solid"
            borderColor={isExpanded ? `${colorScheme}.200` : 'gray.200'}
            overflow="hidden"
            bg="white"
          >
            {/* Accordion Header */}
            <Flex
              as="button"
              w="100%"
              p={4}
              align="center"
              justify="space-between"
              onClick={() => onToggle(group.categoryId)}
              bg={isExpanded ? `${colorScheme}.50` : 'white'}
              _hover={{ bg: isExpanded ? `${colorScheme}.50` : 'gray.50' }}
              transition="background 0.2s"
              cursor="pointer"
              border="none"
              textAlign="left"
            >
              <Flex align="center" gap={3}>
                <Text fontWeight="700" fontSize="md" color="gray.800">
                  {group.categoryName}
                </Text>
                {!isExpanded && badgeCount > 0 && (
                  <Badge
                    colorScheme={colorScheme}
                    borderRadius="full"
                    px={2}
                    py={0.5}
                    fontSize="xs"
                  >
                    {badgeCount} item{badgeCount !== 1 ? 's' : ''} added
                  </Badge>
                )}
              </Flex>
              {isExpanded ? (
                <ChevronUpIcon boxSize={5} color="gray.500" />
              ) : (
                <ChevronDownIcon boxSize={5} color="gray.500" />
              )}
            </Flex>

            {/* Accordion Content */}
            <Collapse in={isExpanded} animateOpacity>
              <VStack spacing={2} p={3} align="stretch">
                {group.services.map((service) => {
                  const svcId = service.serviceId || service.serviceName;
                  const cartItem = cartItems.find(
                    (item) => item.serviceId === svcId
                  );
                  const isWeight =
                    service.inputWeight === true ||
                    service.inputWeight === 'true';
                  const serviceWithId = { ...service, serviceId: svcId };

                  if (isWeight) {
                    return (
                      <WeightServiceRow
                        key={svcId}
                        service={serviceWithId}
                        cartItem={cartItem}
                        dispatch={dispatch}
                      />
                    );
                  }
                  return (
                    <PieceServiceRow
                      key={svcId}
                      service={serviceWithId}
                      cartItem={cartItem}
                      dispatch={dispatch}
                    />
                  );
                })}
              </VStack>
            </Collapse>
          </Box>
        );
      })}
    </VStack>
  );
}
