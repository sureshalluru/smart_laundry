import React, { Suspense, useState, useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box, Skeleton, VStack } from '@chakra-ui/react';
import {
  MdDashboard,
  MdLocalShipping,
  MdTimeline,
  MdEventRepeat,
  MdCameraAlt,
  MdCampaign,
  MdShoppingCart,
  MdStar,
  MdPointOfSale,
  MdRoute,
} from 'react-icons/md';

import DemoErrorBoundary from './DemoErrorBoundary';
import ViewSwitcher from './ViewSwitcher';
import CTAOverlay from './CTAOverlay';
import DemoSEOHead from './DemoSEOHead';
import DemoGuidedNav from './DemoGuidedNav';
import DemoFeatureFooter from './DemoFeatureFooter';

// Lazy-loaded view imports
const AdminDashboardView = React.lazy(() => import('./views/AdminDashboardView'));
const DriverDispatchView = React.lazy(() => import('./views/DriverDispatchView'));
const CustomerTrackingView = React.lazy(() => import('./views/CustomerTrackingView'));
const SubscriptionManagementView = React.lazy(() => import('./views/SubscriptionManagementView'));
const AITrackingView = React.lazy(() => import('./views/AITrackingView'));
const EngagementView = React.lazy(() => import('./views/EngagementView'));
const CustomerOrderingView = React.lazy(() => import('./views/CustomerOrderingView'));
const ReferralReviewView = React.lazy(() => import('./views/ReferralReviewView'));
const QuickPOSView = React.lazy(() => import('./views/QuickPOSView'));
const RouteOptimizationView = React.lazy(() => import('./views/RouteOptimizationView'));

/**
 * Route-to-view mapping array defining all 10 demo views.
 * Each entry includes key, label, icon component, path (relative), and SEO metadata.
 */
const DEMO_VIEWS = [
  {
    key: 'adminDashboard',
    label: 'Dashboard',
    icon: MdDashboard,
    path: 'dashboard',
    title: 'Smart Laundry Basket Demo — Order Management Dashboard',
    description: 'Explore the order management dashboard with real-time status tracking, revenue summaries, and filterable order lists.',
  },
  {
    key: 'driverDispatch',
    label: 'Driver Dispatch',
    icon: MdLocalShipping,
    path: 'driver',
    title: 'Smart Laundry Basket Demo — Driver Dispatch & Logistics',
    description: 'See how drivers are assigned pickups and deliveries with status indicators and route visualization.',
  },
  {
    key: 'customerTracking',
    label: 'Order Tracking',
    icon: MdTimeline,
    path: 'tracking',
    title: 'Smart Laundry Basket Demo — Real-Time Order Tracking',
    description: 'Track orders through a 6-stage workflow with live timeline updates and estimated delivery times.',
  },
  {
    key: 'subscriptions',
    label: 'Subscriptions',
    icon: MdEventRepeat,
    path: 'subscriptions',
    title: 'Smart Laundry Basket Demo — Recurring Order Scheduling',
    description: 'Manage recurring laundry schedules with weekly, bi-weekly, and monthly frequency options.',
  },
  {
    key: 'aiTracking',
    label: 'AI Tracking',
    icon: MdCameraAlt,
    path: 'ai-tracking',
    title: 'Smart Laundry Basket Demo — AI Garment Tracking',
    description: 'Experience AI-powered garment recognition with intake photo scanning and fold reconciliation.',
  },
  {
    key: 'engagement',
    label: 'Engagement',
    icon: MdCampaign,
    path: 'engagement',
    title: 'Smart Laundry Basket Demo — Automated Customer Engagement',
    description: 'Automate customer win-back campaigns, abandoned cart recovery, and dormant customer re-engagement.',
  },
  {
    key: 'customerOrdering',
    label: 'Ordering',
    icon: MdShoppingCart,
    path: 'ordering',
    title: 'Smart Laundry Basket Demo — Customer Ordering Experience',
    description: 'Browse service options with per-pound and per-bag pricing, schedule pickups, and review order summaries.',
  },
  {
    key: 'referralReview',
    label: 'Referrals',
    icon: MdStar,
    path: 'referrals',
    title: 'Smart Laundry Basket Demo — Referral & Review System',
    description: 'Manage referral rewards, track conversions, and collect post-service reviews with star ratings.',
  },
  {
    key: 'quickPOS',
    label: 'Quick POS',
    icon: MdPointOfSale,
    path: 'pos',
    title: 'Smart Laundry Basket Demo — Point-of-Sale Checkout',
    description: 'Fast point-of-sale checkout with tap-to-add service tiles, cart management, and multiple payment methods.',
  },
  {
    key: 'routeOptimization',
    label: 'Routes',
    icon: MdRoute,
    path: 'routes',
    title: 'Smart Laundry Basket Demo — Multi-Driver Route Optimization',
    description: 'Optimize multi-driver delivery routes with color-coded stops, distance calculations, and time estimates.',
  },
];

/**
 * Skeleton fallback shown while lazy-loaded views are loading.
 */
const DemoViewSkeleton = () => (
  <VStack spacing={4} p={4} align="stretch">
    <Skeleton height="40px" borderRadius="md" />
    <Skeleton height="120px" borderRadius="md" />
    <Skeleton height="200px" borderRadius="md" />
    <Skeleton height="80px" borderRadius="md" />
  </VStack>
);

/**
 * DemoShell
 *
 * Top-level container for the interactive product demo. Manages routing,
 * lazy-loading of view components, SEO head injection, navigation, and
 * the CTA overlay with a 30-second interaction timer.
 *
 * Requirements: 1.1, 1.3, 1.5, 2.5, 15.4, 15.5
 */
const DemoShell = () => {
  const location = useLocation();
  const [enhanced, setEnhanced] = useState(false);

  // 30-second interaction timer for CTA enhancement
  useEffect(() => {
    const timer = setTimeout(() => {
      setEnhanced(true);
    }, 30000);

    return () => clearTimeout(timer);
  }, []);

  // Determine current view from location for SEO metadata
  const currentView = useMemo(() => {
    const pathSegment = location.pathname.split('/').pop();
    return DEMO_VIEWS.find((v) => v.path === pathSegment) || DEMO_VIEWS[0];
  }, [location.pathname]);

  return (
    <Box
      maxW="1200px"
      mx="auto"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="lg"
      bg="white"
      position="relative"
      overflowX="hidden"
      overflowY="visible"
      minH="600px"
      pb="100px" /* Space for CTA overlay */
    >
      <DemoSEOHead
        title={currentView.title}
        description={currentView.description}
        path={`/slb/demo/${currentView.path}`}
        viewName={currentView.label}
      />

      <DemoErrorBoundary>
        <ViewSwitcher views={DEMO_VIEWS} />

        <Suspense fallback={<DemoViewSkeleton />}>
          <Box px={4} py={2}>
            <Routes>
              <Route path="dashboard" element={<AdminDashboardView />} />
              <Route path="driver" element={<DriverDispatchView />} />
              <Route path="tracking" element={<CustomerTrackingView />} />
              <Route path="subscriptions" element={<SubscriptionManagementView />} />
              <Route path="ai-tracking" element={<AITrackingView />} />
              <Route path="engagement" element={<EngagementView />} />
              <Route path="ordering" element={<CustomerOrderingView />} />
              <Route path="referrals" element={<ReferralReviewView />} />
              <Route path="pos" element={<QuickPOSView />} />
              <Route path="routes" element={<RouteOptimizationView />} />
              {/* Default: redirect to dashboard */}
              <Route path="" element={<Navigate to="dashboard" replace />} />
              {/* Unknown sub-routes redirect to dashboard */}
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Routes>
          </Box>

          {/* Guided Tour Navigation — Next/Previous buttons */}
          <DemoGuidedNav views={DEMO_VIEWS} />

          {/* SEO Feature Footer — breadcrumbs, description, internal links */}
          <DemoFeatureFooter views={DEMO_VIEWS} />
        </Suspense>
      </DemoErrorBoundary>

      <CTAOverlay enhanced={enhanced} />
    </Box>
  );
};

export { DEMO_VIEWS };
export default DemoShell;
