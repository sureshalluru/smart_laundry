import React, { useMemo } from 'react';
import { useLocation, Link as RouterLink } from 'react-router-dom';
import { Box, Text, HStack, Link, Wrap, WrapItem, Breadcrumb, BreadcrumbItem, BreadcrumbLink } from '@chakra-ui/react';
import { ChevronRightIcon } from '@chakra-ui/icons';

/**
 * SEO-rich feature descriptions per view with keyword-dense content
 * that is visible to both users and crawlers.
 */
const VIEW_SEO_CONTENT = {
  dashboard: {
    heading: 'Laundry Business Order Management',
    body: 'The order management dashboard gives laundry business owners complete visibility into daily operations. Track pending pickups, monitor in-progress orders, and confirm deliveries — all from one screen. Built for laundromats, dry cleaners, and pickup-delivery laundry services.',
    relatedViews: ['driver', 'tracking', 'pos'],
  },
  driver: {
    heading: 'Pickup & Delivery Driver Management',
    body: 'Assign drivers to pickup and delivery routes with real-time status tracking. See which drivers are active, en route, or available. Each assignment includes customer details, time windows, and order contents for efficient dispatch.',
    relatedViews: ['routes', 'tracking', 'dashboard'],
  },
  tracking: {
    heading: 'Real-Time Laundry Order Tracking',
    body: 'Give your customers transparency with a 6-stage order tracking workflow. From order placement through pickup, processing, and final delivery — customers see exactly where their laundry is at every step.',
    relatedViews: ['driver', 'subscriptions', 'ordering'],
  },
  subscriptions: {
    heading: 'Recurring Laundry Pickup Scheduling',
    body: 'Offer your customers weekly, bi-weekly, or monthly recurring pickup schedules. Subscription management automates scheduling so customers never have to re-order, increasing retention and lifetime value.',
    relatedViews: ['ordering', 'engagement', 'tracking'],
  },
  'ai-tracking': {
    heading: 'AI-Powered Garment Counting & Verification',
    body: 'Protect your business from lost-item disputes with AI garment tracking. The system photographs intake bags, counts items using computer vision, and reconciles against fold counts — flagging discrepancies automatically.',
    relatedViews: ['dashboard', 'tracking', 'driver'],
  },
  engagement: {
    heading: 'Automated Customer Retention Campaigns',
    body: 'Win back dormant customers and recover abandoned carts with automated engagement campaigns. Personalized text messages with promo codes drive repeat business without manual effort.',
    relatedViews: ['referrals', 'subscriptions', 'ordering'],
  },
  ordering: {
    heading: 'Online Laundry Ordering System',
    body: 'Let customers order laundry services online with flexible pricing — per-pound for wash & fold or per-piece for dry cleaning. Includes time slot scheduling, delivery estimates, and recurring order options.',
    relatedViews: ['pos', 'subscriptions', 'tracking'],
  },
  referrals: {
    heading: 'Customer Referral & Review Program',
    body: 'Grow your laundry business through word-of-mouth. Automated referral invitations reward both the referrer and their friend. Post-service review requests build social proof with star ratings and employee attribution.',
    relatedViews: ['engagement', 'ordering', 'dashboard'],
  },
  pos: {
    heading: 'Walk-In Point-of-Sale Checkout',
    body: 'Process walk-in customers fast with a tap-to-add POS interface. Counter staff can build orders from a service grid, manage cart quantities, and accept card, cash, or terminal payments in seconds.',
    relatedViews: ['ordering', 'dashboard', 'driver'],
  },
  routes: {
    heading: 'Multi-Driver Route Optimization',
    body: 'Optimize delivery routes across multiple drivers with color-coded map visualization. See total stops, estimated drive time, and distances for each driver. Reduce fuel costs and delivery times with intelligent stop ordering.',
    relatedViews: ['driver', 'tracking', 'dashboard'],
  },
};

/**
 * DemoFeatureFooter
 *
 * Renders SEO-rich content below each demo view:
 * 1. Breadcrumbs (Home > Demo > Current View)
 * 2. Keyword-rich feature description paragraph (visible to users and crawlers)
 * 3. "See Also" internal links to related demo views
 */
const DemoFeatureFooter = ({ views }) => {
  const location = useLocation();

  const { currentPath, currentView, seoContent } = useMemo(() => {
    const pathSegment = location.pathname.split('/').pop();
    const view = views.find((v) => v.path === pathSegment) || views[0];
    const content = VIEW_SEO_CONTENT[view.path] || VIEW_SEO_CONTENT.dashboard;
    return { currentPath: view.path, currentView: view, seoContent: content };
  }, [location.pathname, views]);

  const relatedViews = useMemo(() => {
    return seoContent.relatedViews
      .map((path) => views.find((v) => v.path === path))
      .filter(Boolean);
  }, [seoContent.relatedViews, views]);

  return (
    <Box px={4} py={4} mt={4} borderTopWidth="1px" borderColor="gray.100">
      {/* Breadcrumbs */}
      <Breadcrumb
        separator={<ChevronRightIcon color="gray.400" />}
        fontSize="xs"
        color="gray.500"
        mb={3}
      >
        <BreadcrumbItem>
          <BreadcrumbLink as={RouterLink} to="/slb">
            Home
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbLink as={RouterLink} to="/slb/demo/dashboard">
            Demo
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>
          <BreadcrumbLink>{currentView.label}</BreadcrumbLink>
        </BreadcrumbItem>
      </Breadcrumb>

      {/* Feature Description — visible, keyword-rich content for SEO */}
      <Box mb={4}>
        <Text as="h3" fontSize="sm" fontWeight="bold" color="gray.700" mb={1}>
          {seoContent.heading}
        </Text>
        <Text fontSize="sm" color="gray.600" lineHeight="tall">
          {seoContent.body}
        </Text>
      </Box>

      {/* Internal Links — "See Also" section */}
      <Box>
        <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={2}>
          Explore related features:
        </Text>
        <Wrap spacing={2}>
          {relatedViews.map((view) => (
            <WrapItem key={view.path}>
              <Link
                as={RouterLink}
                to={`/slb/demo/${view.path}`}
                fontSize="xs"
                color="blue.500"
                px={2}
                py={1}
                borderRadius="md"
                bg="blue.50"
                _hover={{ bg: 'blue.100', textDecoration: 'none' }}
              >
                {view.label}
              </Link>
            </WrapItem>
          ))}
        </Wrap>
      </Box>
    </Box>
  );
};

export default DemoFeatureFooter;
