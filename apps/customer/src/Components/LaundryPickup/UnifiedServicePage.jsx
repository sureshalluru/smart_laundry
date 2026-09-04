import React, { useState, useMemo } from 'react';
import {
  Box, VStack, Text, Accordion, AccordionItem, AccordionButton,
  AccordionPanel, AccordionIcon, OrderedList, ListItem, Link, HStack, Icon,
} from '@chakra-ui/react';
import { FiPhone, FiMapPin } from 'react-icons/fi';
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
  footerSlot,
  addonsTotal = 0,
  contactPhone = '',
  laundryAddress = '',
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

      {/* Optional footer content (e.g. add-on picker) below the service list */}
      {footerSlot}

      {/* How To Order + Contact — mirrors the info rows under the service menu
          on comparable booking screens. Collapsible so they stay out of the way. */}
      <Box mt={4}>
        <Accordion allowToggle>
          <AccordionItem border="1px solid" borderColor="gray.100" borderRadius="lg" mb={2} bg="white">
            <AccordionButton _expanded={{ bg: `${colorScheme}.50` }} borderRadius="lg">
              <Box flex="1" textAlign="left" fontWeight="600" fontSize="sm" color="gray.700">
                How To Order
              </Box>
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pb={4} fontSize="sm" color="gray.600">
              <OrderedList spacing={1} pl={2}>
                <ListItem>Pick your services and set the weight or quantity.</ListItem>
                <ListItem>Enter your pickup address so we can confirm we serve your area.</ListItem>
                <ListItem>Choose one-time or recurring, then pick your pickup and delivery times.</ListItem>
                <ListItem>Add payment (or pay at pickup) and review your order.</ListItem>
              </OrderedList>
            </AccordionPanel>
          </AccordionItem>

          {(contactPhone || laundryAddress) && (
            <AccordionItem border="1px solid" borderColor="gray.100" borderRadius="lg" bg="white">
              <AccordionButton _expanded={{ bg: `${colorScheme}.50` }} borderRadius="lg">
                <Box flex="1" textAlign="left" fontWeight="600" fontSize="sm" color="gray.700">
                  Contact Us
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4} fontSize="sm" color="gray.600">
                <VStack align="stretch" spacing={2}>
                  {contactPhone && (
                    <HStack spacing={2}>
                      <Icon as={FiPhone} color={`${colorScheme}.500`} />
                      <Link href={`tel:${contactPhone}`} color={`${colorScheme}.600`} fontWeight="500">
                        {contactPhone}
                      </Link>
                    </HStack>
                  )}
                  {laundryAddress && (
                    <HStack spacing={2} align="flex-start">
                      <Icon as={FiMapPin} color={`${colorScheme}.500`} mt={1} />
                      <Text>{laundryAddress}</Text>
                    </HStack>
                  )}
                </VStack>
              </AccordionPanel>
            </AccordionItem>
          )}
        </Accordion>
      </Box>

      {/* Sticky cart bar at the bottom */}
      <StickyCartBar
        items={cartItems}
        onContinue={onContinue}
        themeColor={colorScheme}
        addonsTotal={addonsTotal}
      />
    </Box>
  );
}
