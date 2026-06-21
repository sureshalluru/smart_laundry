import React, { useState, useMemo } from 'react';
import { Box, VStack, Text } from '@chakra-ui/react';
import { groupServicesByCategory } from './cartUtils';
import CategoryAccordion from './CategoryAccordion';
import StickyCartBar from './StickyCartBar';
import WeightServiceRow from './WeightServiceRow';
import PieceServiceRow from './PieceServiceRow';

/**
 * UnifiedServicePage — Main page component for service selection.
 *
 * Displays all services grouped by category in an accordion layout.
 * If serviceCategories is null/empty/undefined, renders a flat list
 * without the accordion (backward compatibility).
 */
export default function UnifiedServicePage({
  laundryServices,
  serviceCategories,
  cart,
  dispatch,
  onContinue,
  themeColor,
}) {
  const colorScheme = themeColor || 'blue';
  const cartItems = cart?.items || [];

  // Group services by category
  const groups = useMemo(
    () => groupServicesByCategory(laundryServices, serviceCategories),
    [laundryServices, serviceCategories]
  );

  // Determine if we have real categories or should show a flat list
  const hasCategories =
    serviceCategories && Array.isArray(serviceCategories) && serviceCategories.length > 0;

  // Manage which accordion section is expanded (default to first category)
  const [expandedCategoryId, setExpandedCategoryId] = useState(() => {
    if (hasCategories && groups.length > 0) {
      return groups[0].categoryId;
    }
    return null;
  });

  const handleToggle = (categoryId) => {
    setExpandedCategoryId((prev) =>
      prev === categoryId ? null : categoryId
    );
  };

  return (
    <Box w="100%" maxW="500px" mx="auto" pb="100px">
      <VStack spacing={4} align="stretch" py={2}>
        <Text fontSize="md" fontWeight="bold" color="gray.800">
          Select Services
        </Text>

        {hasCategories ? (
          /* Accordion-based layout with categories */
          <CategoryAccordion
            groups={groups}
            expandedCategoryId={expandedCategoryId}
            onToggle={handleToggle}
            cart={cart}
            dispatch={dispatch}
            themeColor={colorScheme}
          />
        ) : (
          /* Flat list fallback — no categories configured */
          <VStack spacing={2} align="stretch">
            {(laundryServices || []).map((service) => {
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
        )}
      </VStack>

      {/* Sticky cart bar at the bottom */}
      <StickyCartBar
        items={cartItems}
        onContinue={onContinue}
        themeColor={colorScheme}
      />
    </Box>
  );
}
