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

/**
 * SiteLandingPage — Public-facing website for a laundry.
 * Multi-tenant: receives laundry config as props and renders accordingly.
 * Each laundry gets their own branded landing page at /:laundryId/site
 */
const SiteLandingPage = ({ laundryConfig }) => (
    <Box bg="white" minH="100vh">
        <SiteNavbar config={laundryConfig} />
        <SiteHero config={laundryConfig} />
        <SiteServices config={laundryConfig} />
        <SiteHowItWorks />
        <SitePricing config={laundryConfig} />
        <SiteLocation config={laundryConfig} />
        <SiteAbout config={laundryConfig} />
        <SiteFooter config={laundryConfig} />
    </Box>
);

export default SiteLandingPage;
