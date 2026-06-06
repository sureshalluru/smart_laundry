import React, {useEffect, useState, lazy, Suspense, createContext, useContext} from 'react';
import {useAuth} from './Context/AuthContext';
import {ChakraProvider, Box, Spinner, Alert, AlertIcon} from '@chakra-ui/react';
import {Routes, Route, useNavigate, useParams, Navigate} from 'react-router-dom';
import NoPage from "./Pages/NoPage";
import axios from 'axios';
import {validateEmpCredentials, fetchPrefix} from "./Pages/ValidateEmployeeDetails";
import {fetchLaundryServices} from './Pages/LaundryInfoManagement';
import {LoadScript} from '@react-google-maps/api';

// Lazy-load pages
const AdminHomeLayout = lazy(() => import('./Components/AdminHome/AdminHomeLayout'));
const AdminHomePage = lazy(() => import('./Pages/AdminHomePage'));
const OrderInfoManagement = lazy(() => import('./Pages/OrdersInfoManagement'));
const AdminCreateOrder = lazy(() => import('./Pages/AdminCreateOrder'));
const OrderProducts = lazy(() => import('./Pages/OrderProducts'));
const LaundryInfoManagement = lazy(() => import('./Pages/LaundryInfoManagement'));
const PromotionsPage = lazy(() => import('./Pages/PromotionsPage'));
const AddEmployeePage = lazy(() => import('./Pages/AddEmployeePage'));
const ManagerDashboardPage = lazy(() => import('./Pages/ManagerDashboardPage'));
const DriverHome = lazy(() => import('./Pages/DriverHome'));
const StoreAdminLogin = lazy(() => import('./Pages/StoreAdminLoginPage'));
const EmployeeReviews = lazy(() => import('./Pages/EmployeeReviews'));
const ChatPage = lazy(() => import('./Pages/ChatPage'));
const ZipInterestPage = lazy(() => import('./Pages/ZipInterestPage'));

// ── Shared Components ────────────────────────────────────────────────────────

function LoadingSpinner() {
    return (
        <Box display="flex" justifyContent="center" alignItems="center" minH="100vh">
            <Spinner size="xl" thickness="4px" speed="0.65s"/>
        </Box>
    );
}

function ErrorDisplay({error}) {
    return (
        <Box p={4}>
            <Alert status="error">
                <AlertIcon/>
                {error?.message || 'An unknown error occurred'}
            </Alert>
        </Box>
    );
}

// ── Laundry Validation Context ───────────────────────────────────────────────

const LaundryValidationContext = createContext();

function LaundryValidationProvider({children}) {
    const [validatedLaundry, setValidatedLaundry] = useState(null);
    const [loading, setLoading] = useState(true);
    const auth = useAuth();
    const navigate = useNavigate();
    const [empPrefix, setEmpPrefix] = useState('');
    const {laundryId} = useParams();

    useEffect(() => {
        let isMounted = true;

        if (validatedLaundry?.id === laundryId) {
            setLoading(false);
            return;
        }

        async function validateCurrentLaundry() {
            if (!laundryId) {
                navigate('/invalid');
                return;
            }

            const token = localStorage.getItem('idToken');
            if (!token) return;
            setLoading(true);

            try {
                const response = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/laundry/validate-test-laundry`,
                    {
                        params: {operation: 'checkLaundryId', laundryId},
                        headers: {'Authorization': `Bearer ${token}`}
                    }
                );

                if (!isMounted) return;

                const laundryData = response.data;
                if (laundryData.status === 'success' && laundryData.exists) {
                    setValidatedLaundry({
                        id: laundryId,
                        name: laundryData.laundryName,
                        stripePublicKey: laundryData.stripePublicKey,
                        stripeTerminalExists: laundryData.stripeTerminalExists,
                        laundryTimeZone: laundryData.laundryTimeZone
                    });
                    document.title = laundryData.laundryName;
                    const prefix = await fetchPrefix(laundryId);
                    setEmpPrefix(prefix);
                } else {
                    navigate('/invalid');
                }
            } catch (error) {
                console.error('Error validating laundry:', error);
                if (error.response?.status === 401) {
                    auth.logout();
                    navigate('/');
                } else {
                    navigate('/invalid');
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        validateCurrentLaundry();
        return () => { isMounted = false; };
    }, [laundryId, auth, navigate]);

    return (
        <LaundryValidationContext.Provider value={{laundry: validatedLaundry, loading, empPrefix}}>
            {children}
        </LaundryValidationContext.Provider>
    );
}

function useLaundry() {
    const context = useContext(LaundryValidationContext);
    if (!context) throw new Error('useLaundry must be used within LaundryValidationProvider');
    return context;
}

function withLaundryValidation(Component) {
    return function WrappedComponent(props) {
        const {laundry, loading, empPrefix} = useLaundry();
        if (loading) return <LoadingSpinner/>;
        if (!laundry) return null;
        return <Component {...props}
                          laundryId={laundry.id}
                          laundryName={laundry.name}
                          stripePublicKey={laundry.stripePublicKey}
                          stripeTerminalExists={laundry.stripeTerminalExists}
                          laundryTimeZone={laundry.laundryTimeZone}
                          empPrefix={empPrefix}/>;
    };
}

// ── Main App Component ───────────────────────────────────────────────────────

function App() {
    const auth = useAuth();

    if (auth.isLoading) return <LoadingSpinner/>;
    if (auth.error) return <ErrorDisplay error={auth.error}/>;

    if (!auth.isAuthenticated) {
        return (
            <ChakraProvider>
                <Suspense fallback={<LoadingSpinner/>}>
                    <StoreAdminLogin/>
                </Suspense>
            </ChakraProvider>
        );
    }

    // Create wrapped components
    const WrappedAdminHomeLayout = withLaundryValidation(AdminHomeLayout);
    const WrappedAdminHomePage = withLaundryValidation(AdminHomePage);
    const WrappedOrderInfoManagement = withLaundryValidation(OrderInfoManagement);
    const WrappedAdminCreateOrder = withLaundryValidation(AdminCreateOrder);
    const WrappedOrderProducts = withLaundryValidation(OrderProducts);
    const WrappedLaundryInfoManagement = withLaundryValidation(LaundryInfoManagement);
    const WrappedPromotionsPage = withLaundryValidation(PromotionsPage);
    const WrappedManagerDashboardPage = withLaundryValidation(ManagerDashboardPage);
    const WrappedDriverHome = withLaundryValidation(DriverHome);
    const WrappedEmployeeReviews = withLaundryValidation(EmployeeReviews);
    const WrappedChatPage = withLaundryValidation(ChatPage);
    const WrappedZipInterestPage = withLaundryValidation(ZipInterestPage);

    return (
        <ChakraProvider>
            <LoadScript
                googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
                libraries={['places']}
            >
                <Routes>
                    {/* Admin Routes */}
                    <Route path="/:laundryId/admin" element={
                        <LaundryValidationProvider>
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedAdminHomeLayout validateEmpCredentials={validateEmpCredentials}/>
                            </Suspense>
                        </LaundryValidationProvider>
                    }>
                        <Route index element={<Navigate to="active-orders" replace/>}/>
                        <Route path="home" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedAdminHomePage/>
                            </Suspense>
                        }/>
                        <Route path="active-orders" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedOrderInfoManagement orderOperation="active"
                                                            validateEmpCredentials={validateEmpCredentials}/>
                            </Suspense>
                        }/>
                        <Route path="completed-orders" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedOrderInfoManagement orderOperation="completed"/>
                            </Suspense>
                        }/>
                        <Route path="canceled-orders" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedOrderInfoManagement orderOperation="canceled"/>
                            </Suspense>
                        }/>
                        <Route path="create-order" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedAdminCreateOrder/>
                            </Suspense>
                        }/>
                        <Route path="order-products" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedOrderProducts/>
                            </Suspense>
                        }/>
                        <Route path="services" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedLaundryInfoManagement validateEmpCredentials={validateEmpCredentials} type="services"/>
                            </Suspense>
                        }/>
                        <Route path="products" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedLaundryInfoManagement validateEmpCredentials={validateEmpCredentials} type="products"/>
                            </Suspense>
                        }/>
                        <Route path="zipCodes" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedLaundryInfoManagement validateEmpCredentials={validateEmpCredentials} type="zipCodes"/>
                            </Suspense>
                        }/>
                        <Route path="logoAndDomain" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedLaundryInfoManagement validateEmpCredentials={validateEmpCredentials} type="logoAndDomain"/>
                            </Suspense>
                        }/>
                        <Route path="promotions" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedPromotionsPage
                                    validateEmpCredentials={validateEmpCredentials}
                                    fetchLaundryServices={fetchLaundryServices}/>
                            </Suspense>
                        }/>
                        <Route path="manager-page" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedManagerDashboardPage/>
                            </Suspense>
                        }/>
                        <Route path="employee-reviews" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedEmployeeReviews/>
                            </Suspense>
                        }/>
                        <Route path="chat" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedChatPage/>
                            </Suspense>
                        }/>
                        <Route path="zip-interest" element={
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedZipInterestPage/>
                            </Suspense>
                        }/>
                    </Route>

                    {/* Driver Route */}
                    <Route path="/:laundryId/driver/home" element={
                        <LaundryValidationProvider>
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedDriverHome validateEmpCredentials={validateEmpCredentials}/>
                            </Suspense>
                        </LaundryValidationProvider>
                    }/>

                    <Route path="/invalid" element={<NoPage/>}/>
                    <Route path="*" element={<NoPage/>}/>
                </Routes>
            </LoadScript>
        </ChakraProvider>
    );
}

export default App;
