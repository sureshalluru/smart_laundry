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
import SLBLanding from "./Components/Landing/SLBLanding";
import LearnMore from "./Components/Landing/LearnMore";
import BookDemo from "./Components/Landing/BookDemo";
import GetStarted from "./Components/Landing/GetStarted";
import LandingPage from './Pages/LandingPage';
import LaundryLandingWrapper from './Pages/LaundryLandingWrapper';
import { Navigate } from 'react-router-dom';
import theme from './theme';

function App() {
    return (
        <ChakraProvider theme={theme}>
            <CustomerAuthProvider>
                <BrowserRouter>
                    <Routes>
                        {/* Public site landing page — default laundry (for roundrocklaundry.com) */}
                        <Route path="/" element={<Navigate to="/1/site" replace />} />

                        <Route path="/invalid" element={<NoPage />} />

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
        </ChakraProvider>
    );
}

export default App;
