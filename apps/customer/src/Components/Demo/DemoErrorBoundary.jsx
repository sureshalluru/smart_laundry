import React from 'react';
import { Box, Heading, Text, UnorderedList, ListItem } from '@chakra-ui/react';

/**
 * DemoErrorBoundary
 *
 * Catches errors from lazy-loaded demo views and renders a static fallback
 * listing platform features. Prevents errors from crashing the parent
 * ProductWebsite page.
 *
 * Requirements: 1.5
 */
class DemoErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging; no network calls
    console.error('[DemoErrorBoundary] caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box p={6} bg="gray.50" borderRadius="md" textAlign="left">
          <Heading as="h3" size="md" mb={3}>
            Unable to load demo
          </Heading>
          <Text mb={3}>
            Explore what Smart Laundry Basket offers:
          </Text>
          <UnorderedList spacing={2} pl={4}>
            <ListItem>Order management dashboard with real-time status tracking</ListItem>
            <ListItem>Driver dispatch and route optimization</ListItem>
            <ListItem>Customer-facing order tracking with live updates</ListItem>
            <ListItem>Recurring subscription and schedule management</ListItem>
            <ListItem>AI-powered garment recognition and fold reconciliation</ListItem>
            <ListItem>Automated customer engagement and win-back campaigns</ListItem>
            <ListItem>Flexible ordering with per-pound and per-bag pricing</ListItem>
            <ListItem>Referral program and post-service review collection</ListItem>
            <ListItem>Quick point-of-sale checkout for walk-in customers</ListItem>
            <ListItem>Multi-driver route optimization with map visualization</ListItem>
          </UnorderedList>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default DemoErrorBoundary;
