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
import LaundryLandingWrapper from './Pages/LaundryLandingWrapper';
import PlatformAdminPage from './Pages/PlatformAdminPage';
import { Navigate } from 'react-router-dom';
import theme from './theme';

// Domain-to-laundry mapping for multi-tenant root redirect
function DomainRedirect() {
    const host = window.location.hostname.toLowerCase();
    let laundryId = '1'; // default
    if (host.includes('spinandshine')) laundryId = '2';
    else if (host.includes('roundrock')) laundryId = '1';
    // Add more domains here as you onboard laundries
    return <Navigate to={`/${laundryId}/site`} replace />;
}

function App() {
    return (
        <ChakraProvider theme={theme}>
            <GoogleMapsProvider>
            <CustomerAuthProvider>
                <BrowserRouter>
                    <Routes>
                        {/* Public site landing page — domain-aware redirect */}
                        <Route path="/" element={<DomainRedirect />} />

                        <Route path="/invalid" element={<NoPage />} />
                        <Route path="/platform-admin" element={<PlatformAdminPage />} />

                        <Route path="/:laundryId/*" element={
                            <LaundryProvider>
                                <Routes>
                                    <Route index element={<Address />} />
                                    <Route path="site" element={<LaundryLandingWrapper />} />
                                    <Route path="login" element={<AuthenticationPage />} />
                                    <Route path="user/*" element={
                                        <CustomerAuthCheck>
                                            <LaundryHomePage />
                                        </CustomerAuthCheck>
                                    } />
                                    <Route path="*" element={<NoPage />} />
                                </Routes>
                            </LaundryProvider>
                        } />

                        <Route path="/Welcome" element={<SLBLanding />} />
                        <Route path="/LearnMore" element={<LearnMore />} />
                        <Route path="/BookDemo" element={<BookDemo />} />
                        <Route path="/GetStarted" element={<GetStarted />} />
                        <Route path="/slb" element={<LandingPage />} />
                        <Route path="*" element={<NoPage />} />
                    </Routes>
                </BrowserRouter>
            </CustomerAuthProvider>
            </GoogleMapsProvider>
        </ChakraProvider>
    );
}

export default App;
