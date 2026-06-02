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

function App() {
    return (
        <ChakraProvider>
            <CustomerAuthProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/invalid" element={<NoPage />} />

                        <Route path="/:laundryId/*" element={
                            <LaundryProvider>
                                <Routes>
                                    <Route index element={<Address />} />
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

                        <Route path="*" element={<NoPage />} />
                        <Route path="/Welcome" element={<SLBLanding />} />
                        <Route path="/LearnMore" element={<LearnMore />} />
                        <Route path="/BookDemo" element={<BookDemo />} />
                        <Route path="/GetStarted" element={<GetStarted />} />
                        <Route path="/slb" element={<LandingPage />} />
                    </Routes>
                </BrowserRouter>
            </CustomerAuthProvider>
        </ChakraProvider>
    );
}

export default App;
