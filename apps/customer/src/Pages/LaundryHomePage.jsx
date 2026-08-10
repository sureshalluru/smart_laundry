import React, {useContext, useState} from 'react';
import {
    Box,
    Flex,
    IconButton,
    Button,
    Stack,
    Text,
    useBreakpointValue,
    Drawer,
    DrawerOverlay,
    DrawerContent,
    DrawerHeader,
    DrawerBody,
    DrawerCloseButton,
    useDisclosure
} from '@chakra-ui/react';
import {FiMenu, FiCalendar, FiList, FiUser, FiLogOut, FiHelpCircle, FiGift} from 'react-icons/fi';
import {FaWallet} from "react-icons/fa";
import {useAuthenticator} from "../Context/AuthContext";
import {useNavigate, Routes, Route, useLocation} from "react-router-dom";
import LaundryPickupPage from "./LaundryPickupPage";
import MyOrders from "../Components/LaundryHome/MyOrders";
import Account from "../Components/LaundryHome/Account";
import OrderSuccess from "../Components/LaundryHome/OrderSuccess";
import NoPage from "./NoPage";
import FAQPage from "./FAQPage";
import {Elements} from "@stripe/react-stripe-js";
import {loadStripe} from "@stripe/stripe-js";
import {LaundryContext} from "../Components/Contexts/LaundryContext";
import PaymentMethods from "../Components/LaundryHome/PaymentMethods";
import ChatWidget from "../Components/Chat/ChatWidget";
import ReferralDashboardPage from "./ReferralDashboardPage";
const LaundryHomePage = ({laundryId, customerId, customerPaymentId: initialCustomerPaymentId = '', specialInstructions: initialSpecialInstructions=''}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [customerPaymentId, setCustomerPaymentId] = useState(initialCustomerPaymentId); // State for Customer Payment Intent Id
    const [specialInstructions, setSpecialInstructions] = useState(initialSpecialInstructions); // State for special instructions
    const [laundryTimeZone, setLaundryTimeZone] = useState(''); // State for laundryTimeZone
    const navigate = useNavigate();
    const location = useLocation();
    const {signOut, isPending} = useAuthenticator((context) => [
        context.signOut,
        context.isPending,
    ]);
    const { laundryData } = useContext(LaundryContext);
    const isSmallScreen = useBreakpointValue({base: true, md: false});
    const {isOpen, onOpen, onClose} = useDisclosure();
    // Toggle sidebar collapse (used on larger screens)
    const toggleSidebar = () => {
        setIsCollapsed(!isCollapsed);
    };

    // Sign-out logic with redirection
    const handleSignOut = () => {
        localStorage.removeItem('idToken');
        signOut();
        navigate(`/${laundryId}/login`);
    };

    // Sidebar items with routes
    const sidebarItems = [
        {label: 'Schedule Order', icon: FiCalendar, path: 'schedule-order'},
        {label: 'My Orders', icon: FiList, path: 'my-orders'},
        {label: 'Referrals', icon: FiGift, path: 'referrals'},
        {label: 'Account', icon: FiUser, path: 'account'},
        {label: 'Payment Methods', icon: FaWallet, path: 'payment'},
        {label: 'FAQ', icon: FiHelpCircle, path: 'faq'}
    ];


    const themeColor = laundryData?.themeColor || 'blue';
    const sidebarBg = `${themeColor}.700`;
    const sidebarHoverBg = `${themeColor}.600`;
    const sidebarDarkBg = `${themeColor}.800`;
    const pageBgMap = {
        blue: '#EBF8FF', green: '#F0FFF4', purple: '#FAF5FF', teal: '#E6FFFA',
        orange: '#FFFAF0', red: '#FFF5F5', pink: '#FFF5F7', cyan: '#EDFDFD',
    };
    const pageBg = pageBgMap[themeColor] || '#EBF8FF';

    return (
        <Box bg={pageBg} minHeight="100vh">
            <Flex minHeight="100vh" flexDirection={{base: "column", md: "row"}} bg={pageBg}>
                {isSmallScreen ? (
                    // On small screens, just a minimal top bar with menu icon
                    <>
                        <Flex
                            as="header"
                            w="100%"
                            bg={sidebarBg}
                            color="white"
                            p={[2,3]}
                            height={["50px", "60px"]}
                            alignItems="center"
                            position="fixed"
                            top="0"
                            left="0"
                            zIndex="999"
                        >
                            <IconButton
                                aria-label="Open Menu"
                                icon={<FiMenu/>}
                                onClick={onOpen}
                                variant="ghost"
                                color="white"
                            />
                            {laundryData?.laundryLogo && (
                                <img src={laundryData.laundryLogo} alt="" style={{height: '28px', objectFit: 'contain', marginRight: '8px'}} />
                            )}
                            <Text
                                as="a"
                                href={`/${laundryId}/site`}
                                fontSize={["sm", "md"]}
                                fontWeight="bold"
                                isTruncated
                                maxW="70%"
                                textAlign="center"
                                _hover={{ opacity: 0.8 }}
                            >
                                {laundryData?.laundryName || ""}
                            </Text>
                        </Flex>

                        {/* Drawer for the menu items on small screens */}
                        <Drawer placement="left" onClose={onClose} isOpen={isOpen}>
                            <DrawerOverlay/>
                            <DrawerContent bg={sidebarBg} color="white" maxW={["60%", "300px"]} >
                                <DrawerCloseButton/>
                                <DrawerHeader borderBottomWidth="1px">Menu</DrawerHeader>
                                <DrawerBody>
                                    <Stack spacing={4} mt={4}>
                                        {sidebarItems.map((item) => (
                                            <Button
                                                key={item.label}
                                                onClick={() => {
                                                    navigate(`/${laundryId}/user/${item.path}`);
                                                    onClose();
                                                }}
                                                leftIcon={<item.icon/>}
                                                justifyContent="flex-start"
                                                variant="ghost"
                                                colorScheme="whiteAlpha"
                                                w="full"
                                                isActive={location.pathname.includes(item.path)} // Highlight active tab
                                            >
                                                <Text>{item.label}</Text>
                                            </Button>
                                        ))}
                                        {/* Sign Out button */}
                                        <Button
                                            leftIcon={<FiLogOut/>}
                                            onClick={() => {
                                                handleSignOut();
                                                onClose();
                                            }}
                                            justifyContent="flex-start"
                                            variant="ghost"
                                            colorScheme="whiteAlpha"
                                            w="full"
                                            isLoading={isPending}
                                        >
                                            <Text>Sign Out</Text>
                                        </Button>
                                    </Stack>
                                </DrawerBody>
                            </DrawerContent>
                        </Drawer>
                    </>
                ) : (
                    // On medium and larger screens, use the collapsible sidebar on the left
                    <Flex
                        w={isCollapsed ? "80px" : "250px"}
                        bg={sidebarBg}
                        color="white"
                        direction="column"
                        p={4}
                    >
                        <IconButton
                            aria-label="Toggle Sidebar"
                            icon={<FiMenu/>}
                            onClick={toggleSidebar}
                            mb={4}
                            bg={sidebarDarkBg}
                            _hover={{bg: sidebarHoverBg}}
                        />

                        {/* Tenant Logo */}
                        {!isCollapsed && laundryData?.laundryLogo && (
                            <img src={laundryData.laundryLogo} alt="" style={{maxHeight: '50px', objectFit: 'contain', marginBottom: '16px', borderRadius: '6px'}} />
                        )}
                        {isCollapsed && laundryData?.laundryLogo && (
                            <img src={laundryData.laundryLogo} alt="" style={{maxHeight: '32px', objectFit: 'contain', marginBottom: '12px', borderRadius: '4px'}} />
                        )}
                        {!isCollapsed && !laundryData?.laundryLogo && (
                            <Text fontSize="sm" fontWeight="bold" mb={3} opacity={0.9}>{laundryData?.laundryName || ''}</Text>
                        )}

                        {/* Sidebar items */}
                        <Stack spacing={4} align="start">
                            {sidebarItems.map((item) => (
                                <Button
                                    key={item.label}
                                    onClick={() => navigate(`/${laundryId}/user/${item.path}`)}
                                    leftIcon={<item.icon/>}
                                    justifyContent={isCollapsed ? 'center' : 'flex-start'}
                                    variant="ghost"
                                    colorScheme="whiteAlpha"
                                    w="full"
                                    isActive={location.pathname.includes(item.path)} // Highlight active tab
                                >
                                    {!isCollapsed && <Text>{item.label}</Text>}
                                </Button>
                            ))}
                            {/* Sign Out button */}
                            <Button
                                leftIcon={<FiLogOut/>}
                                onClick={handleSignOut}
                                justifyContent={isCollapsed ? 'center' : 'flex-start'}
                                variant="ghost"
                                colorScheme="whiteAlpha"
                                w="full"
                                isLoading={isPending}
                            >
                                {!isCollapsed && <Text>Sign Out</Text>}
                            </Button>
                        </Stack>
                    </Flex>
                )}

                {/* Main Content */}
                <Box flex="1" bg="gray.50" overflow="auto" pt={[ "50px", "0" ]}>
                    <Routes>
                        <Route
                            index
                            element={
                                <LaundryPickupPage
                                    customerPaymentId={customerPaymentId}
                                    customerId={customerId}
                                    laundryId={laundryId}
                                    specialInstructions={specialInstructions}
                                    setSpecialInstructions = {setSpecialInstructions}
                                    setCustomerPaymentId={setCustomerPaymentId}
                                    laundryTimeZone={laundryTimeZone}
                                    setLaundryTimeZone={setLaundryTimeZone}
                                />
                            }
                        />
                        <Route
                            path="schedule-order"
                            element={
                                <LaundryPickupPage
                                    customerPaymentId={customerPaymentId}
                                    customerId={customerId}
                                    laundryId={laundryId}
                                    specialInstructions={specialInstructions}
                                    setSpecialInstructions={setSpecialInstructions}
                                    setCustomerPaymentId={setCustomerPaymentId}
                                    laundryTimeZone={laundryTimeZone}
                                    setLaundryTimeZone={setLaundryTimeZone}
                                />
                            }
                        />
                        {/* My Orders Route using query parameters */}
                        <Route
                            path="my-orders"
                            element={
                                laundryData?.stripePublicKey ? (
                                <Elements stripe={loadStripe(laundryData.stripePublicKey)}>
                                    <MyOrders customerId={customerId} laundryId={laundryId} laundryTimeZone={laundryTimeZone} />
                                </Elements>
                                ) : (
                                <Elements stripe={loadStripe('pk_test_placeholder')}>
                                    <MyOrders customerId={customerId} laundryId={laundryId} laundryTimeZone={laundryTimeZone} />
                                </Elements>
                                )
                            }
                        />
                        <Route
                            path="account"
                            element={<Account customerId={customerId} laundryTimeZone={laundryTimeZone} />}
                        />
                        {/* Payment */}
                        <Route
                            path="payment"
                            element={laundryData?.stripePublicKey ? (
                                <Elements stripe={loadStripe(laundryData.stripePublicKey)}>
                                <PaymentMethods
                                    customerId={customerId}
                                    laundryId={laundryId}
                                    customerPaymentId={customerPaymentId}
                                    setCustomerPaymentId={setCustomerPaymentId}
                                />
                            </Elements>
                            ) : (
                                <Box p={6} textAlign="center">
                                    <Text color="gray.500">Card payments are not yet configured for this location. Pay at pickup/delivery.</Text>
                                </Box>
                            )}
                        />
                        <Route path="order-success" element={<OrderSuccess laundryId={laundryId} />} />
                        <Route path="faq" element={<FAQPage />} />
                        <Route path="referrals" element={<ReferralDashboardPage />} />
                        {/* Fallback */}
                        <Route path="*" element={<NoPage />} />
                    </Routes>
                </Box>

            </Flex>

            {/* Chat Widget */}
            <ChatWidget
                customerId={customerId}
                laundryId={laundryId}
                customerName={laundryData?.customerName || ''}
                customerPhone={''}
            />
        </Box>
    );
};

export default LaundryHomePage;
