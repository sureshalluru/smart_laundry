import React, { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  VStack,
  HStack,
  SimpleGrid,
  Badge,
  Switch,
  Collapse,
  useColorModeValue,
} from '@chakra-ui/react';
import { getDemoData } from '../demoMockData';

/**
 * EngagementView
 *
 * Displays the automated customer engagement system including engagement stats,
 * campaign types with enable/disable toggles, message templates with personalization
 * tokens, clickable campaign buckets showing customer segment lists, and campaign
 * performance metrics.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
const EngagementView = () => {
  const { stats, campaigns, templates } = getDemoData('engagement');

  // Track enabled state per campaign type
  const [enabledState, setEnabledState] = useState(() => {
    const initial = {};
    campaigns.forEach((c) => {
      initial[c.type] = c.enabled;
    });
    return initial;
  });

  // Track which campaign bucket is expanded
  const [expandedCampaign, setExpandedCampaign] = useState(null);

  const cardBg = useColorModeValue('white', 'gray.700');
  const tokenBg = useColorModeValue('blue.50', 'blue.900');
  const tokenColor = useColorModeValue('blue.600', 'blue.200');
  const templateBg = useColorModeValue('gray.50', 'gray.600');
  const hoverBg = useColorModeValue('gray.50', 'gray.600');

  const handleToggle = (campaignType) => {
    setEnabledState((prev) => ({
      ...prev,
      [campaignType]: !prev[campaignType],
    }));
  };

  const handleCampaignClick = (campaignType) => {
    setExpandedCampaign((prev) => (prev === campaignType ? null : campaignType));
  };

  /**
   * Renders a message template body with highlighted personalization tokens.
   */
  const renderTemplateBody = (body) => {
    const parts = body.split(/({{[^}]+}})/g);
    return parts.map((part, idx) => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        return (
          <Text
            as="span"
            key={idx}
            bg={tokenBg}
            color={tokenColor}
            px={1}
            borderRadius="sm"
            fontWeight="medium"
            fontSize="xs"
          >
            {part}
          </Text>
        );
      }
      return <Text as="span" key={idx} fontSize="sm">{part}</Text>;
    });
  };

  const getTemplate = (campaignType) => {
    return templates.find((t) => t.campaignType === campaignType);
  };

  return (
    <Box>
      <Heading size="md" mb={4}>
        Customer Engagement
      </Heading>

      {/* Engagement Stats Cards */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <Box p={4} borderWidth="1px" borderRadius="md" bg={cardBg} textAlign="center">
          <Text fontSize="2xl" fontWeight="bold" color="green.500">
            {stats.activeCustomers}
          </Text>
          <Text fontSize="xs" color="gray.500">
            Active Customers
          </Text>
        </Box>
        <Box p={4} borderWidth="1px" borderRadius="md" bg={cardBg} textAlign="center">
          <Text fontSize="2xl" fontWeight="bold" color="orange.500">
            {stats.abandonedCarts}
          </Text>
          <Text fontSize="xs" color="gray.500">
            Abandoned Carts
          </Text>
        </Box>
        <Box p={4} borderWidth="1px" borderRadius="md" bg={cardBg} textAlign="center">
          <Text fontSize="2xl" fontWeight="bold" color="red.400">
            {stats.dormantCustomers}
          </Text>
          <Text fontSize="xs" color="gray.500">
            Dormant Customers
          </Text>
        </Box>
        <Box p={4} borderWidth="1px" borderRadius="md" bg={cardBg} textAlign="center">
          <Text fontSize="2xl" fontWeight="bold" color="purple.500">
            {stats.winBackCandidates}
          </Text>
          <Text fontSize="xs" color="gray.500">
            Win-Back Candidates
          </Text>
        </Box>
      </SimpleGrid>

      {/* Campaign Sections */}
      <VStack spacing={4} align="stretch">
        {campaigns.map((campaign) => {
          const template = getTemplate(campaign.type);
          const isExpanded = expandedCampaign === campaign.type;
          const isEnabled = enabledState[campaign.type];

          return (
            <Box
              key={campaign.type}
              p={4}
              borderWidth="1px"
              borderRadius="md"
              bg={cardBg}
              opacity={isEnabled ? 1 : 0.6}
              transition="opacity 0.2s"
            >
              {/* Campaign Header */}
              <HStack justify="space-between" mb={3}>
                <HStack spacing={3}>
                  <Heading size="sm">{campaign.label}</Heading>
                  <Badge colorScheme={isEnabled ? 'green' : 'gray'} fontSize="xs">
                    {isEnabled ? 'Active' : 'Disabled'}
                  </Badge>
                </HStack>
                <HStack spacing={2}>
                  <Text fontSize="xs" color="gray.500">
                    {isEnabled ? 'On' : 'Off'}
                  </Text>
                  <Switch
                    size="sm"
                    isChecked={isEnabled}
                    onChange={() => handleToggle(campaign.type)}
                    aria-label={`Toggle ${campaign.label}`}
                  />
                </HStack>
              </HStack>

              {/* Performance Metrics */}
              <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3} mb={3}>
                <Box>
                  <Text fontSize="xs" color="gray.500">
                    Customers
                  </Text>
                  <Text fontWeight="bold" fontSize="sm">
                    {campaign.customerCount}
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="xs" color="gray.500">
                    Open Rate
                  </Text>
                  <Text fontWeight="bold" fontSize="sm" color="blue.500">
                    {Math.round(campaign.openRate * 100)}%
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="xs" color="gray.500">
                    Conversion Rate
                  </Text>
                  <Text fontWeight="bold" fontSize="sm" color="green.500">
                    {Math.round(campaign.conversionRate * 100)}%
                  </Text>
                </Box>
              </SimpleGrid>

              {/* Message Template */}
              {template && (
                <Box
                  p={3}
                  borderWidth="1px"
                  borderRadius="md"
                  bg={templateBg}
                  mb={3}
                >
                  <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={1}>
                    Message Template
                  </Text>
                  <Text fontSize="sm" lineHeight="tall">
                    {renderTemplateBody(template.body)}
                  </Text>
                  <HStack mt={2} spacing={1} flexWrap="wrap">
                    {template.tokens.map((token) => (
                      <Badge
                        key={token}
                        size="sm"
                        variant="outline"
                        colorScheme="blue"
                        fontSize="10px"
                      >
                        {token}
                      </Badge>
                    ))}
                  </HStack>
                </Box>
              )}

              {/* Clickable Campaign Bucket */}
              <Box
                as="button"
                w="100%"
                textAlign="left"
                p={2}
                borderWidth="1px"
                borderRadius="md"
                cursor="pointer"
                _hover={{ bg: hoverBg }}
                onClick={() => handleCampaignClick(campaign.type)}
                aria-expanded={isExpanded}
                aria-label={`View ${campaign.label} customer segment`}
              >
                <HStack justify="space-between">
                  <Text fontSize="sm" fontWeight="medium">
                    View Customer Segment ({campaign.customerCount})
                  </Text>
                  <Text fontSize="sm" color="gray.400">
                    {isExpanded ? '▲' : '▼'}
                  </Text>
                </HStack>
              </Box>

              {/* Customer Segment List */}
              <Collapse in={isExpanded} animateOpacity>
                <Box mt={2} p={3} borderWidth="1px" borderRadius="md">
                  <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={2}>
                    Customers in Segment
                  </Text>
                  <VStack align="stretch" spacing={2}>
                    {campaign.customers.map((customer) => (
                      <HStack
                        key={customer.id}
                        justify="space-between"
                        p={2}
                        borderWidth="1px"
                        borderRadius="sm"
                        fontSize="sm"
                      >
                        <Text fontWeight="medium">{customer.name}</Text>
                        <Text color="gray.500" fontSize="xs">
                          {customer.phone}
                        </Text>
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </VStack>

      {/* Noscript block for SEO/crawlers */}
      <noscript>
        <section>
          <h2>Automated Customer Engagement</h2>
          <p>
            Smart Laundry Basket's engagement system automatically identifies and
            re-engages customers through targeted campaigns. The platform tracks active
            customers, abandoned carts, dormant customers, and win-back candidates to
            maximize retention and revenue.
          </p>
          <ul>
            <li>Engagement statistics: active customers, abandoned carts, dormant customers, win-back candidates</li>
            <li>Abandoned cart recovery campaigns with personalized messages</li>
            <li>Dormant customer outreach with promotional incentives</li>
            <li>Win-back campaigns for churned customers</li>
            <li>Message templates with personalization tokens (customer name, promo code, business name)</li>
            <li>Campaign performance tracking: open rates and conversion metrics</li>
            <li>Enable/disable toggles for individual campaign types</li>
            <li>Customer segment lists for each campaign bucket</li>
          </ul>
        </section>
      </noscript>
    </Box>
  );
};

export default EngagementView;
