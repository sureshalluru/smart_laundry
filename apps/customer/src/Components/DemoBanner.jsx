import React from 'react';
import { Box, Text, HStack, Link } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';

/**
 * DemoBanner — shows a sticky banner at the top when in demo mode (laundry 999).
 * Provides guidance and links to switch between customer/admin views.
 * Only renders when laundryId is "999".
 */
const DemoBanner = ({ laundryId }) => {
  if (String(laundryId) !== '999') return null;

  return (
    <Box
      bg="blue.600"
      color="white"
      py={2}
      px={4}
      textAlign="center"
      fontSize="sm"
      position="sticky"
      top={0}
      zIndex={1000}
    >
      <HStack justify="center" spacing={2} flexWrap="wrap">
        <Text fontWeight="bold">🎯 Demo Mode</Text>
        <Text>— Try placing an order! Select "Invoice" at checkout.</Text>
        <Text mx={2}>|</Text>
        <Link
          as={RouterLink}
          to="/demo-admin"
          color="yellow.200"
          fontWeight="bold"
          textDecoration="underline"
          target="_blank"
        >
          Try Admin View →
        </Link>
      </HStack>
    </Box>
  );
};

export default DemoBanner;
