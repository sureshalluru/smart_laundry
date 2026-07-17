import React from 'react';
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
import FAQIndexPage from './Pages/FAQIndexPage';
import FAQDetailPage from './Pages/FAQDetailPage';
import CityPickupDeliveryPage from './Pages/CityPickupDeliveryPage';
import { Navigate, useParams } from 'react-router-dom';
import theme from './theme';

// Payment link redirect — converts /user/pay/:orderId to /user/my-orders/?order_id=X&is_open=true
function PayRedirect() {
    const { laundryId, orderId } = useParams();
    return <Navigate to={`/${laundryId}/user/my-orders/?order_id=${orderId}&is_open=true`} replace />;
}

// Domain-to-laundry mapping for multi-tenant root redirect
function DomainRedirect() {
    const host = window.location.hostname.toLowerCase();
    // SLB product website domain
    if (host.includes('smartlaundrybasket')) return <Navigate to="/slb" replace />;
    let laundryId = '1'; // default
    if (host.includes('spinandshine')) laundryId = '2';
    else if (host.includes('roundrock')) laundryId = '1';
    else if (host.includes('clean-rite') || host.includes('cleanrite') || host.includes('clean-ritehays')) laundryId = '11';
    // Add more domains here as you onboard laundries
    return <Navigate to={`/${laundryId}/site`} replace />;
}

// SEO page redirect — for custom domains accessing /pickup-delivery/city or /faq without laundryId
function DomainSEORedirect({ page }) {
    const host = window.location.hostname.toLowerCase();
    let laundryId = '1'; // default
    if (host.includes('spinandshine')) laundryId = '2';
    else if (host.includes('roundrock')) laundryId = '1';
    else if (host.includes('clean-rite') || host.includes('cleanrite') || host.includes('clean-ritehays')) laundryId = '11';
    // Get the rest of the path after the page prefix
    const path = window.location.pathname;
    return <Navigate to={`/${laundryId}${path}`} replace />;
}

// Set page title immediately based on domain (before API loads)
// For tenants on smartlaundrybasket.ai/{laundryId}/site, the LaundryContext
// will set the correct title from the database once data loads.
(function setDomainTitle() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('spinandshine')) {
        document.title = 'Spin and Shine Laundromat - Free Pickup & Delivery';
    } else if (host.includes('roundrock')) {
        document.title = 'EcoSpin Round Rock Laundry - Free Pickup & Delivery';
    } else if (host.includes('clean-rite') || host.includes('cleanrite')) {
        document.title = 'Clean-Rite Hays - Free Pickup & Delivery';
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
