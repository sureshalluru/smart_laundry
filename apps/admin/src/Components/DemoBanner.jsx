import React from 'react';
import { Box, Text, HStack, Link } from '@chakra-ui/react';

/**
 * DemoBanner — shows a sticky banner at the top when in demo mode (laundry 999).
 * Provides guidance for the admin demo experience.
 * Only renders when laundryId is "999".
 */
const DemoBanner = ({ laundryId }) => {
  if (String(laundryId) !== '999') return null;

  const customerDemoUrl = window.location.origin.replace(':3001', ':3000') + '/demo-customer';

  return (
    <Box
      bg="purple.600"
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
        <Text fontWeight="bold">🎯 Admin Demo</Text>
        <Text>— Manage orders, create new ones, track deliveries. This is your business dashboard.</Text>
        <Text mx={2}>|</Text>
        <Link
          href={customerDemoUrl}
          color="yellow.200"
          fontWeight="bold"
          textDecoration="underline"
          target="_blank"
        >
          Try Customer View →
        </Link>
      </HStack>
    </Box>
  );
};

export default DemoBanner;
