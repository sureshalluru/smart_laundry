import React, {useEffect, useState, lazy, Suspense, createContext, useContext} from 'react';
import {useAuth} from './Context/AuthContext';
import {ChakraProvider, Box, Spinner, Alert, AlertIcon} from '@chakra-ui/react';
import {Routes, Route, useNavigate, useParams, Navigate} from 'react-router-dom';
import NoPage from "./Pages/NoPage";
import axios from 'axios';
import {validateEmpCredentials, fetchPrefix} from "./Pages/ValidateEmployeeDetails";
import {fetchLaundryServices} from './Pages/LaundryInfoManagement';
import {LoadScript} from '@react-google-maps/api';
import ProtectedRoute from './utils/ProtectedRoute';
import { FEATURES } from './utils/permissions';
import { EmployeeAuthProvider } from './Context/EmployeeAuthContext';
import EmployeeAuthGuard from './Context/EmployeeAuthGuard';
import { CompanyAuthProvider, useCompanyAuth } from './Context/CompanyAuthContext';

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
const DashboardPage = lazy(() => import('./Pages/DashboardPage'));
const FAQPage = lazy(() => import('./Pages/FAQPage'));
const EngagementPage = lazy(() => import('./Pages/EngagementPage'));
const QuickPOSPage = lazy(() => import('./Pages/QuickPOSPage'));
const SupportChatPage = lazy(() => import('./Pages/SupportChatPage'));
const RoutePlannerPage = lazy(() => import('./Pages/RoutePlannerPage'));
const ReportsPage = lazy(() => import('./Pages/ReportsPage'));
const MobileOrderPage = lazy(() => import('./Pages/MobileOrderPage'));
const EmployeeLoginPage = lazy(() => import('./Pages/EmployeeLoginPage'));
const PinEntryPage = lazy(() => import('./Pages/PinEntryPage'));

// Company pages (multi-location management)
const CompanyLoginPage = lazy(() => import('./Pages/CompanyLoginPage'));
const CompanyLayout = lazy(() => import('./Components/Company/CompanyLayout'));
const CompanyDashboardPage = lazy(() => import('./Pages/CompanyDashboardPage'));
const CompanyReportsPage = lazy(() => import('./Pages/CompanyReportsPage'));
const CompanyPerformancePage = lazy(() => import('./Pages/CompanyPerformancePage'));

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

// Redirect bare /admin (no laundryId) to SLB product page
// Admin requires /:laundryId/admin format — each laundry has isolated credentials
function AdminRedirect() {
    // Clear any stale session since there's no laundry context
    localStorage.removeItem('auth');
    localStorage.removeItem('idToken');
    localStorage.removeItem('empRole');
    window.location.href = '/slb';
    return null;
}

// Responsive default route: desktop → Quick POS, mobile → Active Orders
function ResponsiveDefaultRedirect() {
    const isMobile = window.innerWidth < 768;
    return <Navigate to={isMobile ? "active-orders" : "pos"} replace/>;
}

function App() {
    const auth = useAuth();

    if (auth.isLoading) return <LoadingSpinner/>;

    return (
        <ChakraProvider>
            <Routes>
                {/* ── Employee/Mobile routes (no admin auth required) ───────── */}
                <Route path="/:laundryId/admin/employee-login" element={
                    <EmployeeAuthProvider>
                        <Suspense fallback={<LoadingSpinner/>}>
                            <EmployeeLoginPage/>
                        </Suspense>
                    </EmployeeAuthProvider>
                }/>
                <Route path="/:laundryId/admin/pin" element={
                    <EmployeeAuthProvider>
                        <Suspense fallback={<LoadingSpinner/>}>
                            <PinEntryPage/>
                        </Suspense>
                    </EmployeeAuthProvider>
                }/>
                <Route path="/:laundryId/admin/order/:orderId" element={
                    <EmployeeAuthProvider>
                        <EmployeeAuthGuard>
                            <Suspense fallback={<LoadingSpinner/>}>
                                <MobileOrderPage/>
                            </Suspense>
                        </EmployeeAuthGuard>
                    </EmployeeAuthProvider>
                }/>
                {/* Employee mobile active-orders — PIN-only access */}
                <Route path="/:laundryId/admin/mobile-active-orders" element={
                    <EmployeeAuthProvider>
                        <EmployeeAuthGuard>
                            <Suspense fallback={<LoadingSpinner/>}>
                                <WrappedOrderInfoManagement orderOperation="active"/>
                            </Suspense>
                        </EmployeeAuthGuard>
                    </EmployeeAuthProvider>
                }/>

                {/* ── Admin routes (require admin store-level auth) ─────────── */}
                <Route path="/:laundryId/admin" element={
                    <AdminAuthGate>
                        <LoadScript
                            googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
                            libraries={['places']}
                        >
                            <LaundryValidationProvider>
                                <Suspense fallback={<LoadingSpinner/>}>
                                    <WrappedAdminHomeLayout validateEmpCredentials={validateEmpCredentials}/>
                                </Suspense>
                            </LaundryValidationProvider>
                        </LoadScript>
                    </AdminAuthGate>
                }>
                    <Route index element={
                        <ProtectedRoute feature={FEATURES.ORDERS}>
                            <ResponsiveDefaultRedirect/>
                        </ProtectedRoute>
                    }/>
                    <Route path="home" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedAdminHomePage/>
                        </Suspense>
                    }/>
                    <Route path="active-orders" element={
                        <ProtectedRoute feature={FEATURES.ORDERS}>
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedOrderInfoManagement orderOperation="active"
                                                        validateEmpCredentials={validateEmpCredentials}/>
                        </Suspense>
                        </ProtectedRoute>
                    }/>
                    <Route path="completed-orders" element={
                        <ProtectedRoute feature={FEATURES.ORDERS}>
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedOrderInfoManagement orderOperation="completed"/>
                        </Suspense>
                        </ProtectedRoute>
                    }/>
                    <Route path="canceled-orders" element={
                        <ProtectedRoute feature={FEATURES.ORDERS}>
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedOrderInfoManagement orderOperation="canceled"/>
                        </Suspense>
                        </ProtectedRoute>
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
                        <ProtectedRoute feature={FEATURES.PRICING}>
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedLaundryInfoManagement validateEmpCredentials={validateEmpCredentials} type="services"/>
                        </Suspense>
                        </ProtectedRoute>
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
                    <Route path="deliverySchedule" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedLaundryInfoManagement validateEmpCredentials={validateEmpCredentials} type="deliverySchedule"/>
                        </Suspense>
                    }/>
                    <Route path="settings" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedLaundryInfoManagement validateEmpCredentials={validateEmpCredentials} type="systemSettings"/>
                        </Suspense>
                    }/>
                    <Route path="payment-settings" element={
                        <ProtectedRoute feature={FEATURES.PRICING}>
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedLaundryInfoManagement validateEmpCredentials={validateEmpCredentials} type="paymentSettings"/>
                        </Suspense>
                        </ProtectedRoute>
                    }/>
                    <Route path="websiteServices" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedLaundryInfoManagement validateEmpCredentials={validateEmpCredentials} type="websiteServices"/>
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
                    <Route path="dashboard" element={
                        <ProtectedRoute feature={FEATURES.DASHBOARD}>
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedDashboardPage/>
                        </Suspense>
                        </ProtectedRoute>
                    }/>
                    <Route path="faq" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedFAQPage/>
                        </Suspense>
                    }/>
                    <Route path="engagement" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedEngagementPage/>
                        </Suspense>
                    }/>
                    <Route path="pos" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedQuickPOSPage/>
                        </Suspense>
                    }/>
                    <Route path="support-chat" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedSupportChatPage/>
                        </Suspense>
                    }/>
                    <Route path="route-planner" element={
                        <ProtectedRoute feature={FEATURES.ROUTE_PLANNING}>
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedRoutePlannerPage/>
                        </Suspense>
                        </ProtectedRoute>
                    }/>
                    <Route path="reports" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <WrappedReportsPage/>
                        </Suspense>
                    }/>
                </Route>

                {/* Driver Route */}
                <Route path="/:laundryId/driver/home" element={
                    <AdminAuthGate>
                        <LoadScript
                            googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
                            libraries={['places']}
                        >
                            <LaundryValidationProvider>
                                <Suspense fallback={<LoadingSpinner/>}>
                                    <WrappedDriverHome validateEmpCredentials={validateEmpCredentials}/>
                                </Suspense>
                            </LaundryValidationProvider>
                        </LoadScript>
                    </AdminAuthGate>
                }/>

                {/* ── Company admin routes ───────────────────────────────── */}
                <Route path="/company/login" element={
                    <CompanyAuthProvider>
                        <Suspense fallback={<LoadingSpinner/>}>
                            <CompanyLoginPage/>
                        </Suspense>
                    </CompanyAuthProvider>
                }/>
                <Route path="/company/:companyId" element={
                    <CompanyAuthProvider>
                        <CompanyAuthGate>
                            <Suspense fallback={<LoadingSpinner/>}>
                                <CompanyLayout/>
                            </Suspense>
                        </CompanyAuthGate>
                    </CompanyAuthProvider>
                }>
                    <Route path="dashboard" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <CompanyDashboardPage/>
                        </Suspense>
                    }/>
                    <Route path="reports" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <CompanyReportsPage/>
                        </Suspense>
                    }/>
                    <Route path="performance" element={
                        <Suspense fallback={<LoadingSpinner/>}>
                            <CompanyPerformancePage/>
                        </Suspense>
                    }/>
                </Route>

                {/* Bare /admin redirect — find user's laundry and redirect */}
                <Route path="/admin" element={<AdminRedirect />} />
                <Route path="/admin/*" element={<AdminRedirect />} />

                <Route path="/invalid" element={<NoPage/>}/>
                <Route path="*" element={<NoPage/>}/>
            </Routes>
        </ChakraProvider>
    );
}

/**
 * AdminAuthGate — Wrapper that checks admin (store-level) auth.
 * If not authenticated, shows the StoreAdminLogin page.
 * If authenticated, renders children.
 * Also accepts company tokens — if a company JWT is stored, treat as authenticated.
 */
function AdminAuthGate({ children }) {
    const auth = useAuth();

    // Check if a valid company token exists (company admin navigating into a laundry)
    const companyStored = localStorage.getItem('companyToken');
    let hasValidCompanyToken = false;
    if (companyStored) {
        try {
            const parsed = JSON.parse(companyStored);
            const payload = JSON.parse(atob(parsed.accessToken.split('.')[1]));
            if (payload.exp * 1000 > Date.now() && payload.role === 'company_admin') {
                hasValidCompanyToken = true;
            }
        } catch (e) { /* invalid token, ignore */ }
    }

    if (!auth.isAuthenticated && !hasValidCompanyToken) {
        return (
            <Suspense fallback={<LoadingSpinner/>}>
                <StoreAdminLogin/>
            </Suspense>
        );
    }

    return children;
}

/**
 * CompanyAuthGate — Wrapper that checks company-level auth.
 * If not authenticated as company admin, redirects to company login.
 * If authenticated, renders children.
 */
function CompanyAuthGate({ children }) {
    const { isCompanyAuthenticated, isLoading } = useCompanyAuth();

    if (isLoading) return <LoadingSpinner />;

    if (!isCompanyAuthenticated) {
        return <Navigate to="/company/login" replace />;
    }

    return children;
}

// Create wrapped components (hoisted outside render for stable references)
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
const WrappedDashboardPage = withLaundryValidation(DashboardPage);
const WrappedFAQPage = withLaundryValidation(FAQPage);
const WrappedEngagementPage = withLaundryValidation(EngagementPage);
const WrappedQuickPOSPage = withLaundryValidation(QuickPOSPage);
const WrappedSupportChatPage = withLaundryValidation(SupportChatPage);
const WrappedRoutePlannerPage = withLaundryValidation(RoutePlannerPage);
const WrappedReportsPage = withLaundryValidation(ReportsPage);

export default App;
