import React from 'react';
import './App.css';
import { ChakraProvider } from '@chakra-ui/react';
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
import SareeRollingPage from './Pages/SareeRollingPage';
import ItemTrackingUpload from './Pages/ItemTrackingUpload';
import OrderTrackingPhotos from './Pages/OrderTrackingPhotos';
import TrackingPage from './Pages/TrackingPage';
import { Navigate } from 'react-router-dom';
import theme from './theme';

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
            <GoogleMapsProvider>
            <CustomerAuthProvider>
                <BrowserRouter>
                    <Routes>
                        {/* Public site landing page — domain-aware redirect */}
                        <Route path="/" element={<DomainRedirect />} />

                        <Route path="/invalid" element={<Navigate to="/" replace />} />
                        <Route path="/platform-admin" element={<PlatformAdminPage />} />
                        <Route path="/onboard" element={<OnboardingPage />} />
                        <Route path="/saree-rolling" element={<SareeRollingPage />} />
                        <Route path="/:laundryId/saree-rolling" element={<SareeRollingPage />} />
                        <Route path="/track/:token" element={<ItemTrackingUpload />} />
                        <Route path="/order-tracking/:orderId" element={<OrderTrackingPhotos />} />

                        <Route path="/:laundryId/*" element={
                            <LaundryProvider>
                                <Routes>
                                    <Route index element={<Address />} />
                                    <Route path="site" element={<LaundryLandingWrapper />} />
                                    <Route path="login" element={<AuthenticationPage />} />
                                    <Route path="user/track/:orderId" element={
                                        <TrackingPage />
                                    } />
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
        </ChakraProvider>
    );
}

export default App;
