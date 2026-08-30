import React, { Suspense, useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { ChakraProvider } from '@chakra-ui/react';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Address from "./Pages/Address";
import NoPage from "./Pages/NoPage";
import AuthenticationPage from "./Pages/AuthenticationPage";
import LaundryHomePage from "./Pages/LaundryHomePage";
import CustomerAuthCheck from "./Components/LaundryHome/CustomerAuthCheck";
import { CustomerAuthProvider } from "./Context/AuthContext";
import { LaundryProvider } from "./Components/Contexts/LaundryContext";
import { GoogleMapsProvider } from "./Components/Contexts/GoogleMapsProvider";
import SLBLanding from "./Components/Landing/SLBLanding";
import LearnMore from "./Components/Landing/LearnMore";
import BookDemo from "./Components/Landing/BookDemo";
import GetStarted from "./Components/Landing/GetStarted";
import LandingPage from './Pages/LandingPage';
import ProductWebsite from './Pages/ProductWebsite';
import LaundryLandingWrapper from './Pages/LaundryLandingWrapper';
import PlatformAdminPage from './Pages/PlatformAdminPage';
import OnboardingPage from './Pages/OnboardingPage';
import ShowLandingPage from './Pages/ShowLandingPage';
import SareeRollingPage from './Pages/SareeRollingPage';
import ItemTrackingUpload from './Pages/ItemTrackingUpload';
import OrderTrackingPhotos from './Pages/OrderTrackingPhotos';
import TrackingPage from './Pages/TrackingPage';
import DemoCustomerLogin from './Pages/DemoCustomerLogin';
import FAQIndexPage from './Pages/FAQIndexPage';
import FAQDetailPage from './Pages/FAQDetailPage';
import CityPickupDeliveryPage from './Pages/CityPickupDeliveryPage';
import { Navigate, useParams } from 'react-router-dom';
import theme from './theme';

// Lazy-loaded Demo Shell for code splitting (Requirement 15.4)
const DemoShell = React.lazy(() => import('./Components/Demo/DemoShell'));

// Payment link redirect — converts /user/pay/:orderId to /user/my-orders/?order_id=X&is_open=true
function PayRedirect() {
    const { laundryId, orderId } = useParams();
    return <Navigate to={`/${laundryId}/user/my-orders/?order_id=${orderId}&is_open=true`} replace />;
}

// Known custom-domain → laundry_id mapping.
//
// This is an INSTANT fallback for the tenants we know at build time, so their
// sites resolve with zero network latency and zero risk. Any domain NOT listed
// here is resolved at runtime from the database (each tenant's user_domain) via
// the public /api/customer/resolve-domain endpoint — so onboarding a new tenant
// domain no longer requires a code change here.
function knownHostLaundryId(host) {
    const h = (host || '').toLowerCase();
    if (h.includes('spinandshine')) return '2';
    if (h.includes('roundrock')) return '1';
    if (h.includes('clean-rite') || h.includes('cleanrite') || h.includes('clean-ritehays')) return '11';
    if (h.includes('fetchandfold')) return '1003';
    return null; // unknown → resolve from DB
}

// Resolve an unknown host to a laundry_id from the database. Returns the id
// string on a match, or null on no-match / error (caller decides the fallback).
async function resolveHostFromApi(host) {
    try {
        const base = process.env.REACT_APP_AWS_API_URL || '';
        const { data } = await axios.get(`${base}/api/customer/resolve-domain`, {
            params: { host },
        });
        if (data && data.status === 'success' && data.laundryId) {
            return String(data.laundryId);
        }
    } catch (e) {
        // Network/lookup failure — fall back to default silently.
    }
    return null;
}

// Domain-to-laundry mapping for multi-tenant root redirect.
// Known hosts redirect instantly; unknown hosts are resolved from the DB.
function DomainRedirect() {
    const host = window.location.hostname.toLowerCase();
    // SLB product website domain — handled after hooks (hooks must run
    // unconditionally, before any early return, per rules-of-hooks).
    const isSlb = host.includes('smartlaundrybasket');
    const known = knownHostLaundryId(host);
    const [laundryId, setLaundryId] = useState(known);

    useEffect(() => {
        if (isSlb || known) return; // SLB routes elsewhere; known resolves instantly
        let active = true;
        resolveHostFromApi(host).then((id) => {
            if (active) setLaundryId(id || '1'); // default to 1 if unresolved
        });
        return () => { active = false; };
    }, [host, known, isSlb]);

    if (isSlb) return <Navigate to="/slb" replace />;
    if (!laundryId) return null; // brief wait while the DB lookup resolves
    return <Navigate to={`/${laundryId}/site`} replace />;
}

// SEO page redirect — for custom domains accessing /pickup-delivery/city or /faq without laundryId
function DomainSEORedirect({ page }) {
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname;

    const known = knownHostLaundryId(host);
    const [laundryId, setLaundryId] = useState(known);

    useEffect(() => {
        if (known) return;
        let active = true;
        resolveHostFromApi(host).then((id) => {
            if (active) setLaundryId(id || '1');
        });
        return () => { active = false; };
    }, [host, known]);

    if (!laundryId) return null;
    return <Navigate to={`/${laundryId}${path}`} replace />;
}

// Set page title immediately based on domain (before API loads).
// This only covers the build-time-known hosts so the title is correct instantly.
// For every other tenant (resolved from the DB), the LaundryContext sets the
// correct title once its data loads — so unknown domains just show the default
// briefly rather than a wrong name.
(function setDomainTitle() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('spinandshine')) {
        document.title = 'Spin and Shine Laundromat - Free Pickup & Delivery';
    } else if (host.includes('roundrock')) {
        document.title = 'EcoSpin Round Rock Laundry - Free Pickup & Delivery';
    } else if (host.includes('clean-rite') || host.includes('cleanrite')) {
        document.title = 'Clean-Rite Hays - Free Pickup & Delivery';
    } else if (host.includes('fetchandfold')) {
        document.title = 'Fetch & Fold - Pickup & Delivery';
    } else if (host.includes('smartlaundrybasket')) {
        document.title = 'Smart Laundry Basket';
    }
    // For custom domains not listed here, title stays as default
    // until LaundryContext sets it from the database
})();

function App() {
    return (
        <ChakraProvider theme={theme}>
            <HelmetProvider>
            <GoogleMapsProvider>
            <CustomerAuthProvider>
                <BrowserRouter>
                    <Routes>
                        {/* Public site landing page — domain-aware redirect */}
                        <Route path="/" element={<DomainRedirect />} />

                        <Route path="/invalid" element={<Navigate to="/" replace />} />
                        <Route path="/platform-admin" element={<PlatformAdminPage />} />
                        <Route path="/onboard" element={<OnboardingPage />} />
                        <Route path="/demo-customer" element={<DemoCustomerLogin />} />
                        <Route path="/show" element={<ShowLandingPage />} />
                        <Route path="/cla" element={<ShowLandingPage />} />
                        <Route path="/saree-rolling" element={<SareeRollingPage />} />
                        <Route path="/:laundryId/saree-rolling" element={<SareeRollingPage />} />
                        <Route path="/track/:token" element={<ItemTrackingUpload />} />
                        <Route path="/order-tracking/:orderId" element={<OrderTrackingPhotos />} />

                        {/* SEO pages without laundryId prefix — for custom domains */}
                        <Route path="/pickup-delivery/:citySlug" element={<DomainSEORedirect page="pickup-delivery" />} />
                        <Route path="/faq" element={<DomainSEORedirect page="faq" />} />
                        <Route path="/faq/:slug" element={<DomainSEORedirect page="faq" />} />

                        <Route path="/:laundryId/*" element={
                            <LaundryProvider>
                                <Routes>
                                    <Route index element={<Address />} />
                                    <Route path="site" element={<LaundryLandingWrapper />} />
                                    <Route path="login" element={<AuthenticationPage />} />
                                    <Route path="faq" element={<FAQIndexPage />} />
                                    <Route path="faq/:slug" element={<FAQDetailPage />} />
                                    <Route path="pickup-delivery/:citySlug" element={<CityPickupDeliveryPage />} />
                                    <Route path="user/track/:orderId" element={
                                        <TrackingPage />
                                    } />
                                    <Route path="user/pay/:orderId" element={<PayRedirect />} />
                                    <Route path="user/*" element={
                                        <CustomerAuthCheck>
                                            <LaundryHomePage />
                                        </CustomerAuthCheck>
                                    } />
                                    <Route path="*" element={<Navigate to={`/${window.location.pathname.split('/')[1]}/site`} replace />} />
                                </Routes>
                            </LaundryProvider>
                        } />

                        <Route path="/Welcome" element={<SLBLanding />} />
                        <Route path="/LearnMore" element={<LearnMore />} />
                        <Route path="/BookDemo" element={<BookDemo />} />
                        <Route path="/GetStarted" element={<GetStarted />} />
                        <Route path="/slb/demo/*" element={
                            <Suspense fallback={<div>Loading demo...</div>}>
                                <DemoShell />
                            </Suspense>
                        } />
                        <Route path="/slb" element={<ProductWebsite />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </CustomerAuthProvider>
            </GoogleMapsProvider>
            </HelmetProvider>
        </ChakraProvider>
    );
}

export default App;
