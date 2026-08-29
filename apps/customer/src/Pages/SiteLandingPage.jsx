import React from 'react';
import { Box } from '@chakra-ui/react';
import SiteHero from '../Components/SiteLanding/SiteHero';
import SiteServices from '../Components/SiteLanding/SiteServices';
import SiteHowItWorks from '../Components/SiteLanding/SiteHowItWorks';
import SitePricing from '../Components/SiteLanding/SitePricing';
import SiteLocation from '../Components/SiteLanding/SiteLocation';
import SiteAbout from '../Components/SiteLanding/SiteAbout';
import SiteFooter from '../Components/SiteLanding/SiteFooter';
import SiteNavbar from '../Components/SiteLanding/SiteNavbar';
import ChatWidget from '../Components/Chat/ChatWidget';

/**
 * SiteLandingPage — Public-facing website for a laundry.
 * Multi-tenant: receives laundry config as props and renders accordingly.
 * Each laundry gets their own branded landing page at /:laundryId/site
 */
const SiteLandingPage = ({ laundryConfig }) => {
    // Generate anonymous visitor ID for chat (persists in localStorage)
    const getVisitorId = () => {
        let visitorId = localStorage.getItem('chatVisitorId');
        if (!visitorId) {
            visitorId = 'visitor-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chatVisitorId', visitorId);
        }
        return visitorId;
    };

    const laundryId = laundryConfig?.laundryId || '1';
    const visitorId = getVisitorId();

    // Optional per-tenant section hide-flags (site_content). When a flag is
    // absent the section renders exactly as before — no change for existing
    // tenants. Home-based / pickup-delivery-only operators can opt to hide
    // marketing sections that don't fit their business.
    const sc = laundryConfig?.siteContent || {};

    return (
        <Box bg="white" minH="100vh">
            <SiteNavbar config={laundryConfig} />
            <SiteHero config={laundryConfig} />
            {laundryConfig?.siteContent?.services?.length > 0 && (
                <SiteServices config={laundryConfig} />
            )}
            {!sc.hideHowItWorks && <SiteHowItWorks config={laundryConfig} />}
            {!sc.hidePricing && <SitePricing config={laundryConfig} />}
            {!sc.hideLocation && <SiteLocation config={laundryConfig} />}
            {!sc.hideAbout && <SiteAbout config={laundryConfig} />}
            <SiteFooter config={laundryConfig} />
            <ChatWidget
                customerId={visitorId}
                laundryId={laundryId}
                customerName="Website Visitor"
                customerPhone=""
            />
        </Box>
    );
};

export default SiteLandingPage;
