import React, { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  VStack,
  HStack,
  SimpleGrid,
  Badge,
  Collapse,
  Table,
  Tbody,
  Tr,
  Td,
  useColorModeValue,
} from '@chakra-ui/react';
import { format } from 'date-fns';
import { getDemoData, getCustomerById } from '../demoMockData';

/**
 * ReferralReviewView
 *
 * Displays the referral program and review collection system including:
 * - Simulated SMS referral invitation with personalized link
 * - Reward structure display ("$X for you, $X for your friend")
 * - Referral tracking dashboard (total sent, conversions, rewards earned)
 * - Post-service review request notification
 * - Sample reviews with star ratings, text, and employee attribution
 * - Expandable notification details on click
 * - Configurable reward settings display
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
const ReferralReviewView = () => {
  const { referrals, reviews, config } = getDemoData('referralReview');

  // Track expanded notification states
  const [expandedNotification, setExpandedNotification] = useState(null);

  const cardBg = useColorModeValue('white', 'gray.700');
  const smsBg = useColorModeValue('green.50', 'green.900');
  const smsBubbleBg = useColorModeValue('green.100', 'green.800');
  const reviewRequestBg = useColorModeValue('blue.50', 'blue.900');
  const reviewRequestBubbleBg = useColorModeValue('blue.100', 'blue.800');
  const configBg = useColorModeValue('gray.50', 'gray.600');
  const starFilledColor = useColorModeValue('yellow.400', 'yellow.300');
  const starEmptyColor = useColorModeValue('gray.300', 'gray.500');

  const toggleNotification = (id) => {
    setExpandedNotification((prev) => (prev === id ? null : id));
  };

  /**
   * Renders star rating as filled/empty stars
   */
  const renderStars = (rating) => {
    return (
      <HStack spacing={0.5}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Text
            key={star}
            color={star <= rating ? starFilledColor : starEmptyColor}
            fontSize="md"
          >
            ★
          </Text>
        ))}
      </HStack>
    );
  };

  const referrerCustomer = getCustomerById('C001');
  const referredFriendName = 'Alex Martinez';

  return (
    <Box>
      <Heading size="md" mb={4}>
        Referral &amp; Review System
      </Heading>

      {/* Reward Structure Display */}
      <Box
        p={5}
        mb={6}
        borderWidth="2px"
        borderColor="green.300"
        borderRadius="lg"
        bg={cardBg}
        textAlign="center"
      >
        <Text fontSize="sm" color="gray.500" mb={1}>
          Referral Reward Program
        </Text>
        <Heading size="lg" color="green.500">
          ${referrals.rewardPerReferrer} for you, ${referrals.rewardPerReferred} for your friend
        </Heading>
        <Text fontSize="sm" color="gray.500" mt={2}>
          Earn credits every time a friend signs up. Up to {referrals.maxMonthly} referrals per month.
        </Text>
      </Box>

      {/* Referral Tracking Dashboard */}
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
        <Box p={4} borderWidth="1px" borderRadius="md" bg={cardBg} textAlign="center">
          <Text fontSize="2xl" fontWeight="bold" color="blue.500">
            {referrals.totalSent}
          </Text>
          <Text fontSize="xs" color="gray.500">
            Total Referrals Sent
          </Text>
        </Box>
        <Box p={4} borderWidth="1px" borderRadius="md" bg={cardBg} textAlign="center">
          <Text fontSize="2xl" fontWeight="bold" color="green.500">
            {referrals.conversions}
          </Text>
          <Text fontSize="xs" color="gray.500">
            Successful Conversions
          </Text>
        </Box>
        <Box p={4} borderWidth="1px" borderRadius="md" bg={cardBg} textAlign="center">
          <Text fontSize="2xl" fontWeight="bold" color="purple.500">
            ${referrals.totalRewards}
          </Text>
          <Text fontSize="xs" color="gray.500">
            Total Rewards Earned
          </Text>
        </Box>
      </SimpleGrid>

      {/* Simulated SMS Referral Invitation */}
      <Box mb={6}>
        <Heading size="sm" mb={3}>
          SMS Referral Invitation
        </Heading>
        <Box
          p={4}
          borderRadius="lg"
          bg={smsBg}
          borderWidth="1px"
          borderColor="green.200"
          cursor="pointer"
          onClick={() => toggleNotification('sms-referral')}
          aria-expanded={expandedNotification === 'sms-referral'}
          aria-label="Expand referral SMS details"
          role="button"
        >
          <HStack justify="space-between" mb={2}>
            <HStack spacing={2}>
              <Text fontSize="lg">💬</Text>
              <Text fontSize="sm" fontWeight="bold">
                Text Message
              </Text>
            </HStack>
            <Badge colorScheme="green" fontSize="10px">
              Sent
            </Badge>
          </HStack>
          <Box
            p={3}
            borderRadius="md"
            bg={smsBubbleBg}
            maxW="85%"
          >
            <Text fontSize="sm">
              Hey {referredFriendName}! {referrerCustomer?.name} thinks you&apos;d love Smart Laundry Basket.
              Sign up with their link and you both get ${referrals.rewardPerReferred} off your first order!
            </Text>
            <Text fontSize="xs" color="blue.600" mt={1} fontWeight="medium">
              https://slb.link/ref/{referrerCustomer?.name?.split(' ')[0]?.toLowerCase()}2024
            </Text>
          </Box>

          <Collapse in={expandedNotification === 'sms-referral'} animateOpacity>
            <Box mt={3} p={3} borderTopWidth="1px" borderColor="green.200">
              <Text fontSize="xs" color="gray.500" mb={1}>
                Full Message Details
              </Text>
              <VStack align="stretch" spacing={1} fontSize="sm">
                <HStack>
                  <Text fontWeight="medium">From:</Text>
                  <Text>Smart Laundry Basket</Text>
                </HStack>
                <HStack>
                  <Text fontWeight="medium">To:</Text>
                  <Text>{referredFriendName} (555-0199)</Text>
                </HStack>
                <HStack>
                  <Text fontWeight="medium">Referred by:</Text>
                  <Text>{referrerCustomer?.name}</Text>
                </HStack>
                <HStack>
                  <Text fontWeight="medium">Reward:</Text>
                  <Text>${referrals.rewardPerReferred} credit on sign-up</Text>
                </HStack>
                <HStack>
                  <Text fontWeight="medium">Status:</Text>
                  <Badge colorScheme="green" fontSize="10px">Delivered</Badge>
                </HStack>
              </VStack>
            </Box>
          </Collapse>
        </Box>
      </Box>

      {/* Post-Service Review Request Notification */}
      <Box mb={6}>
        <Heading size="sm" mb={3}>
          Post-Service Review Request
        </Heading>
        <Box
          p={4}
          borderRadius="lg"
          bg={reviewRequestBg}
          borderWidth="1px"
          borderColor="blue.200"
          cursor="pointer"
          onClick={() => toggleNotification('review-request')}
          aria-expanded={expandedNotification === 'review-request'}
          aria-label="Expand review request details"
          role="button"
        >
          <HStack justify="space-between" mb={2}>
            <HStack spacing={2}>
              <Text fontSize="lg">📱</Text>
              <Text fontSize="sm" fontWeight="bold">
                Review Request Notification
              </Text>
            </HStack>
            <Badge colorScheme="blue" fontSize="10px">
              {config.reviewRequestDelay}
            </Badge>
          </HStack>
          <Box
            p={3}
            borderRadius="md"
            bg={reviewRequestBubbleBg}
            maxW="85%"
          >
            <Text fontSize="sm">
              Hi {referrerCustomer?.name}! Your laundry order has been delivered. 🎉
              How was your experience? Tap to leave a quick review for your service
              provider.
            </Text>
            <Text fontSize="xs" color="blue.600" mt={1} fontWeight="medium">
              ⭐ Rate your experience →
            </Text>
          </Box>

          <Collapse in={expandedNotification === 'review-request'} animateOpacity>
            <Box mt={3} p={3} borderTopWidth="1px" borderColor="blue.200">
              <Text fontSize="xs" color="gray.500" mb={1}>
                Full Notification Details
              </Text>
              <VStack align="stretch" spacing={1} fontSize="sm">
                <HStack>
                  <Text fontWeight="medium">Trigger:</Text>
                  <Text>{config.reviewRequestDelay}</Text>
                </HStack>
                <HStack>
                  <Text fontWeight="medium">Customer:</Text>
                  <Text>{referrerCustomer?.name}</Text>
                </HStack>
                <HStack>
                  <Text fontWeight="medium">Order:</Text>
                  <Text>ORD-2847 — Wash & Fold</Text>
                </HStack>
                <HStack>
                  <Text fontWeight="medium">Min Rating for Display:</Text>
                  <Text>{config.minimumRatingForDisplay} stars</Text>
                </HStack>
                <HStack>
                  <Text fontWeight="medium">Response:</Text>
                  <Badge colorScheme="green" fontSize="10px">5-star review submitted</Badge>
                </HStack>
              </VStack>
            </Box>
          </Collapse>
        </Box>
      </Box>

      {/* Customer Reviews */}
      <Box mb={6}>
        <Heading size="sm" mb={3}>
          Customer Reviews
        </Heading>
        <VStack spacing={3} align="stretch">
          {reviews.map((review) => {
            const customer = getCustomerById(review.customerId);
            return (
              <Box
                key={review.id}
                p={4}
                borderWidth="1px"
                borderRadius="md"
                bg={cardBg}
              >
                <HStack justify="space-between" mb={2}>
                  <HStack spacing={2}>
                    <Text fontWeight="bold" fontSize="sm">
                      {customer?.name || 'Customer'}
                    </Text>
                    {renderStars(review.rating)}
                  </HStack>
                  <Text fontSize="xs" color="gray.500">
                    {format(review.date, 'MMM d, yyyy')}
                  </Text>
                </HStack>
                <Text fontSize="sm" mb={2}>
                  {review.text}
                </Text>
                <HStack spacing={1}>
                  <Text fontSize="xs" color="gray.500">
                    Service by:
                  </Text>
                  <Badge variant="subtle" colorScheme="blue" fontSize="10px">
                    {review.employeeName}
                  </Badge>
                </HStack>
              </Box>
            );
          })}
        </VStack>
      </Box>

      {/* Configurable Reward Settings */}
      <Box mb={4}>
        <Heading size="sm" mb={3}>
          Reward Configuration Settings
        </Heading>
        <Box p={4} borderWidth="1px" borderRadius="md" bg={configBg}>
          <Table variant="simple" size="sm">
            <Tbody>
              <Tr>
                <Td fontWeight="medium" pl={0}>Reward Amount</Td>
                <Td isNumeric pr={0}>${config.rewardAmount} per referral</Td>
              </Tr>
              <Tr>
                <Td fontWeight="medium" pl={0}>Max Monthly Referrals</Td>
                <Td isNumeric pr={0}>{config.maxMonthlyReferrals}</Td>
              </Tr>
              <Tr>
                <Td fontWeight="medium" pl={0}>Credit Expiration</Td>
                <Td isNumeric pr={0}>{config.creditExpirationDays} days</Td>
              </Tr>
              <Tr>
                <Td fontWeight="medium" pl={0}>Review Request Delay</Td>
                <Td isNumeric pr={0}>{config.reviewRequestDelay}</Td>
              </Tr>
              <Tr>
                <Td fontWeight="medium" pl={0} borderBottom="none">Min Rating for Display</Td>
                <Td isNumeric pr={0} borderBottom="none">{config.minimumRatingForDisplay} stars</Td>
              </Tr>
            </Tbody>
          </Table>
        </Box>
      </Box>

      {/* Noscript block for SEO/crawlers */}
      <noscript>
        <section>
          <h2>Referral &amp; Review System</h2>
          <p>
            Smart Laundry Basket's referral and review system helps businesses grow
            through word-of-mouth and social proof. Customers receive personalized SMS
            invitations to refer friends and are prompted to leave reviews after service
            completion.
          </p>
          <ul>
            <li>SMS referral invitations with personalized links and reward incentives</li>
            <li>Dual reward structure: both referrer and referred friend earn credits</li>
            <li>Referral tracking dashboard: total sent, conversions, rewards earned</li>
            <li>Post-service review request notifications sent automatically after delivery</li>
            <li>Customer reviews with star ratings, text feedback, and employee attribution</li>
            <li>Expandable notification details showing full message content</li>
            <li>Configurable reward settings: amount, monthly limits, credit expiration</li>
          </ul>
        </section>
      </noscript>
    </Box>
  );
};

export default ReferralReviewView;
