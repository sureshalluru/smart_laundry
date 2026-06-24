import React, { useState, useEffect } from 'react';
import {
    Box,
    Button,
    VStack,
    Divider,
    Flex,
    useDisclosure,
    Drawer,
    DrawerOverlay,
    DrawerContent,
    DrawerHeader,
    DrawerBody,
    IconButton,
    Collapse,
    useToast,
    Icon,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    Input,
    Image,
    InputGroup,
    InputLeftAddon
} from '@chakra-ui/react';
import {
    FaBars,
    FaHome,
    FaClipboardList,
    FaPlus,
    FaShoppingCart,
    FaUsers,
    FaCogs,
    FaBox,
    FaSignOutAlt,
    FaComments,
    FaCashRegister,
} from 'react-icons/fa';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { fetchLaundryInfo } from '../../Pages/LaundryInfoManagement';
import { useAuth } from '../../Context/AuthContext';
import { getUserRole, hasPermission, FEATURES } from '../../utils/permissions';
import axios from 'axios';

// Unread badge for support chat
const SupportUnreadBadge = ({ laundryId }) => {
    const [unread, setUnread] = useState(0);
    useEffect(() => {
        const check = async () => {
            try {
                const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/chat/messages`, {
                    params: { customerId: `laundry-${laundryId}`, laundryId: 'platform' }
                });
                // Count messages from admin that haven't been "seen"
                const msgs = res.data?.messages || [];
                const adminMsgs = msgs.filter(m => m.senderType === 'admin');
                // Simple heuristic: if there are admin messages and conversation has unread
                if (adminMsgs.length > 0) {
                    // Check unread_customer from conversation
                    // For simplicity, we just show badge if last message is from admin
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg?.senderType === 'admin') setUnread(1);
                    else setUnread(0);
                }
            } catch (e) { /* ok */ }
        };
        check();
        const interval = setInterval(check, 30000);
        return () => clearInterval(interval);
    }, [laundryId]);
    if (unread === 0) return null;
    return (
        <Box position="absolute" top="2px" right="8px" bg="red.500" color="white" borderRadius="full"
            w="16px" h="16px" fontSize="xs" display="flex" alignItems="center" justifyContent="center">
            {unread}
        </Box>
    );
};

const AdminLayout = ({ validateEmpCredentials, empPrefix }) => {
    const { laundryId } = useParams();
    const navigate = useNavigate();
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isDrawerOpen, onOpen: onDrawerOpen, onClose: onDrawerClose } = useDisclosure();
    const [isExpanded, setIsExpanded] = useState(false);
    const [empId, setEmpId] = useState('');
    const [passcode, setPasscode] = useState('');
    const [error, setError] = useState('');
    const toast = useToast();
    const [credentialsValidating, setCredentialsValidating] = useState(false); // State to store the credentials validation
    const {
        isOpen: isDriverModalOpen,
        onOpen: onDriverModalOpen,
        onClose: onDriverModalClose,
    } = useDisclosure();
    const [isDriverAccess, setIsDriverAccess] = useState(false);
    const [isOrdersExpanded, setIsOrdersExpanded] = useState(false);
    const [isPlaceOrderExpanded, setIsPlaceOrderExpanded] = useState(false);
    const [isProductsExpanded, setIsProductsExpanded] = useState(false);
     const [laundryName, setLaundryName] = useState('');
      const [laundryLogo, setLaundryLogo] = useState('');

      useEffect(() => {
        const getLaundryInfo = async () => {
          try {
            const response = await fetchLaundryInfo(laundryId);
            // console.log("Laundry Info Response:", response);
      
            if (response) {
              setLaundryName(response.name);  
              setLaundryLogo(response.logo);  
            }
          } catch (error) {
            console.error("Error while getting laundry info in AdminHomeLayout:", error);
          }
        };
      
        if (laundryId) {
          getLaundryInfo();
        }
      }, [laundryId]);
    const handleValidate = async () => {
        try {
            setCredentialsValidating(true);
            // Validate employee credentials and get role
            const fullEmpId = empPrefix + empId;
            const { isValidated, role } = await validateEmpCredentials(laundryId, fullEmpId, passcode);
    
            if (isValidated) {
                if ((isDriverAccess && role === "Delivery Driver") || (!isDriverAccess && (role === "Manager" || role === "Admin"))) {
                    toast({
                        title: "Validation Success",
                        description: `Access granted. Role: ${role}`,
                        status: "success",
                        duration: 3000,
                        isClosable: true,
                    });
                    setError('');
                    onClose();
    
                    // Navigate based on role
                    if (isDriverAccess) {
                        navigate(`/${laundryId}/driver/home`); // Redirect to Driver Home
                    } else {
                        // Redirect to Manager view
                        navigate(`/${laundryId}/admin/manager-page`);
                    }
    
                    setEmpId('');
                    setPasscode('');
                } else {
                    setError(`Unauthorized access. Your role is: ${role}`);
                    toast({
                        title: "Access Denied",
                        description: `You do not have permission to access this page.`,
                        status: "error",
                        duration: 3000,
                        isClosable: true,
                    });
                }
            } else {
                setError('Invalid credentials. Please try again.');
                toast({
                    title: "Validation Failed",
                    description: "Invalid credentials. Please check your Employee ID and Passcode.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
            }
        } catch (error) {
            console.error('Validation failed:', error);
            setError('An error occurred while validating credentials. Please try again.');
            toast({
                title: "Validation Error",
                description: "An error occurred during validation.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
        }
        finally {
            setCredentialsValidating(false);
        }
    };

    
    // Use this function to handle the Driver Access modal opening
const handleDriverAccessOpen = () => {
    setIsDriverAccess(true);
    onOpen(); // Open the modal
};

// Reset access type when modal is closed
const handleModalClose = () => {
    setIsDriverAccess(false);
    onClose();
};
    
    return (
        <Flex minH="100vh" flexDirection="column">
            {/* Top Bar with Hamburger Menu */}
            <Flex
                as="header"
                w="100%"
                position="fixed"
                bg="teal.500"
                color="white"
                alignItems="center"
                justifyContent="space-between"
                p={4}
                borderBottom="1px solid"
                borderColor="gray.300"
                zIndex="1100"
                h="50px"
            >
                <IconButton
                    aria-label="Open menu"
                    icon={<FaBars />}
                    variant="ghost"
                    color="white"
                    _hover={{ bg: "teal.600" }}
                    onClick={onDrawerOpen}
                    display={{ base: "block", md: "none" }} // Show only on mobile
                />
                <Image
                    src={laundryLogo} // REPLACE WITH YOUR ACTUAL S3 URL
                    alt={`${laundryName}`}
                    height="40px"
                    maxW="120px"
                    objectFit="contain"
                    ml="left" // Push to the right
                />

<Box fontSize="xl" fontWeight="bold" align="center">
                    {laundryName} Admin
                </Box>

                {/* <Box fontSize="xl" fontWeight="bold">
                    {laundryName}
                </Box> */}
                
            </Flex>

            {/* Sidebar for Desktop */}
            <Flex flexDirection="row" flex="1">
                <Box
                    as="aside"
                    w={{ base: "0", md: "250px" }}
                    bg="#F7FAFC"
                    display={{ base: "none", md: "flex" }}
                    flexDirection="column"
                    borderRight="1px solid"
                    borderColor="gray.300"
                >
                    <SidebarContent
                        laundryId={laundryId}
                        navigate={navigate}
                        isExpanded={isExpanded}
                        setIsExpanded={setIsExpanded}
                        onOpen={onOpen}
                        handleDriverAccessOpen={handleDriverAccessOpen}
                        isOrdersExpanded={isOrdersExpanded}
                        setIsOrdersExpanded={setIsOrdersExpanded}
                        isPlaceOrderExpanded={isPlaceOrderExpanded}
                        setIsPlaceOrderExpanded={setIsPlaceOrderExpanded}
                        isProductsExpanded={isProductsExpanded}
                        setIsProductsExpanded={setIsProductsExpanded}
                    />
                </Box>

                {/* Main Content */}
                <Box flex="1" bg="white" p={6} pt={{ base: "70px", md: "70px", lg: "70px" }}>
                    <Outlet />
                </Box>

            </Flex>

            {/* Drawer for Mobile */}
            <Drawer isOpen={isDrawerOpen} placement="left" onClose={onDrawerClose} >
                <DrawerOverlay />
                <DrawerContent bg="#F7FAFC" sx={{
                    width: ['70%', '300px'], 
                    maxWidth: ['70%', '300px'],
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    mt:"50px",
                    maxHeight: '70vh'
                 }}>
                <DrawerHeader borderBottomWidth="1px">Admin Panel</DrawerHeader>
                <DrawerBody p={4}>
                    <SidebarContent
                        laundryId={laundryId}
                        navigate={navigate}
                        isExpanded={isExpanded}
                        setIsExpanded={setIsExpanded}
                        onOpen={onOpen}
                        handleDriverAccessOpen={handleDriverAccessOpen}
                        isOrdersExpanded={isOrdersExpanded}
                        setIsOrdersExpanded={setIsOrdersExpanded}
                        isPlaceOrderExpanded={isPlaceOrderExpanded}
                        setIsPlaceOrderExpanded={setIsPlaceOrderExpanded}
                        isProductsExpanded={isProductsExpanded}
                        setIsProductsExpanded={setIsProductsExpanded}
                    />
                </DrawerBody>
                </DrawerContent>
            </Drawer>
            

            {/* Modal updates */}
            <Modal isOpen={isOpen} onClose={handleModalClose}>
                <ModalOverlay />
                <ModalContent
                maxW={{ base: "80vw", md: "400px" }}  // Responsive width
                mx={4}       // Horizontal margin to prevent edge cutoff
                borderRadius="md"
                >
                    <ModalHeader>{isDriverAccess ? 'Driver Access' : 'Manager Access'}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <InputGroup mb={4}>
                            <InputLeftAddon>{empPrefix}</InputLeftAddon>
                            <Input
                                placeholder="EmpId"
                                value={empId}
                                onChange={(e) => setEmpId(e.target.value)}
                            />
                        </InputGroup>
                        <Input
                            type="password"
                            placeholder="Enter Passcode"
                            value={passcode}
                            onChange={(e) => setPasscode(e.target.value)}
                            mb={4}
                        />
                        {error && <Box color="red.500">{error}</Box>}
                    </ModalBody>
                    <ModalFooter>
                        <Button colorScheme="blue" onClick={handleValidate} isLoading={credentialsValidating}>
                            Validate
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Flex>
    );
};

// Sidebar Content Component
const SidebarContent = ({ 
    laundryId, navigate, 
    isExpanded, setIsExpanded, 
    onOpen, handleDriverAccessOpen, 
    isOrdersExpanded, setIsOrdersExpanded, 
    isPlaceOrderExpanded, setIsPlaceOrderExpanded, 
    isProductsExpanded, setIsProductsExpanded,}) => {
    const toast = useToast();
    const auth = useAuth();
    // Get user role for permission checks
    const role = localStorage.getItem('empRole') || getUserRole();
    // Function to handle right-click and open link in a new tab
    const handleRightClick = (event, path) => {
        event.preventDefault(); // Prevent default context menu
        window.open(`/${laundryId}${path}`, '_blank'); // Open link in new tab
    };
    const handleSignOut = () => {
        auth.logout();
        localStorage.removeItem('idToken');
        localStorage.removeItem('empRole');
        window.location.href = `/${laundryId}/admin`;
    };

    return (
    
    <VStack spacing={4} align="stretch" mt={["0px", "0px", "40px", "50px"]} >
        {/* Home - visible to Employee, Manager, Admin */}
        {hasPermission(role, FEATURES.ORDERS) && (
        <Button as="a" href={`/${laundryId}/admin/active-orders`}
            leftIcon={<FaHome />}
            variant="ghost"
            colorScheme="blue"
            justifyContent="flex-start"
            onClick={() => navigate(`/${laundryId}/admin/active-orders`)}
        >
            Home
        </Button>
        )}

        {/* Orders - visible to Employee, Manager, Admin */}
        {hasPermission(role, FEATURES.ORDERS) && (
        <>
        <Button
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="purple"
                justifyContent="flex-start"
                onClick={() => setIsOrdersExpanded(!isOrdersExpanded)}
            >
                Orders
        </Button>

        <Collapse in={isOrdersExpanded} animateOpacity>
            <VStack spacing={2} align="stretch" pl={6} maxWidth="100%">
            <Button as="a" href={`/${laundryId}/admin/active-orders`}
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="blue"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/active-orders`)}
            >
                Active Orders
            </Button>

            <Button as="a" href={`/${laundryId}/admin/completed-orders`}
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="green"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/completed-orders`)}
            >
                Completed Orders
            </Button>

            <Button as="a" href={`/${laundryId}/admin/canceled-orders`}
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="blue"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/canceled-orders`)}
            >
                Canceled Orders
            </Button>
                    </VStack>
        </Collapse>
        </>
        )}

        {/* Place Order - visible to Employee, Manager, Admin */}
        {hasPermission(role, FEATURES.ORDERS) && (
        <>
        <Button
                leftIcon={<FaPlus />}
                variant="ghost"
                colorScheme="purple"
                justifyContent="flex-start"
                onClick={() => setIsPlaceOrderExpanded(!isPlaceOrderExpanded)}
            >
                Place Order
            </Button>

            <Collapse in={isPlaceOrderExpanded} animateOpacity>
                <VStack spacing={2} align="stretch" pl={6} maxWidth="100%">
                    <Button as="a" href={`/${laundryId}/admin/create-order`}
                        leftIcon={<FaPlus />}
                        variant="ghost"
                        colorScheme="blue"
                        justifyContent="flex-start"
                        size="sm"
                        maxWidth="100%"
                        onClick={() => navigate(`/${laundryId}/admin/create-order`)} 
                    >
                        Laundry Orders
                    </Button>

                    <Button as="a" href={`/${laundryId}/admin/order-products`}
                        leftIcon={<FaShoppingCart />}
                        variant="ghost"
                        colorScheme="purple"
                        justifyContent="flex-start"
                        size="sm"
                        maxWidth="100%"
                        onClick={() => navigate(`/${laundryId}/admin/order-products`)} 
                    >
                        Instant Orders
                    </Button>

                    <Button as="a" href={`/${laundryId}/admin/pos`}
                        leftIcon={<FaCashRegister />}
                        variant="ghost"
                        colorScheme="teal"
                        justifyContent="flex-start"
                        size="sm"
                        maxWidth="100%"
                        onClick={() => navigate(`/${laundryId}/admin/pos`)} 
                    >
                        Quick POS
                    </Button>
                </VStack>
            </Collapse>
        </>
        )}

        {/* Products & Services - visible to Admin only (PRICING) */}
        {hasPermission(role, FEATURES.PRICING) && (
        <>
        <Button
            leftIcon={<FaShoppingCart />}
            variant="ghost"
            colorScheme="purple"
            justifyContent="flex-start"
            onClick={() => setIsProductsExpanded(!isProductsExpanded)}
        >
            Products & Services ...
        </Button>
        <Collapse in={isProductsExpanded} animateOpacity>
            <VStack spacing={2} align="stretch" pl={6} maxWidth="100%">
                <Button as="a" href={`/${laundryId}/admin/services`}
                    leftIcon={<Icon as={FaCogs} />}
                    variant="ghost"
                    colorScheme="blue"
                    justifyContent="start"
                    size="sm"
                    maxWidth="100%"
                    onClick={() => navigate(`/${laundryId}/admin/services`)}
                >
                    Services
                </Button>
                <Button as="a" href={`/${laundryId}/admin/products`}
                    leftIcon={<Icon as={FaBox} />}
                    variant="ghost"
                    colorScheme="green"
                    justifyContent="start"
                    size="sm"
                    maxWidth="100%"
                    onClick={() => navigate(`/${laundryId}/admin/products`)}
                >
                    Products
                </Button>
                <Button as="a" href={`/${laundryId}/admin/logoAndDomain`}
                    leftIcon={<Icon as={FaBox} />}
                    variant="ghost"
                    colorScheme="blue"
                    justifyContent="start"
                    size="sm"
                    maxWidth="100%"
                    onClick={() => navigate(`/${laundryId}/admin/logoAndDomain`)}
                >
                    logoAndDomain
                </Button>
                <Button as="a" href={`/${laundryId}/admin/zipCodes`}
                    leftIcon={<Icon as={FaBox} />}
                    variant="ghost"
                    colorScheme="green"
                    justifyContent="start"
                    size="sm"
                    maxWidth="100%"
                    onClick={() => navigate(`/${laundryId}/admin/zipCodes`)}
                >
                    Servicable ZipCodes
                </Button>
                <Button as="a" href={`/${laundryId}/admin/deliverySchedule`}
                    leftIcon={<Icon as={FaCogs} />}
                    variant="ghost"
                    colorScheme="green"
                    justifyContent="start"
                    size="sm"
                    maxWidth="100%"
                    onClick={() => navigate(`/${laundryId}/admin/deliverySchedule`)}
                >
                    Delivery Schedule
                </Button>
                <Button as="a" href={`/${laundryId}/admin/websiteServices`}
                    leftIcon={<Icon as={FaCogs} />}
                    variant="ghost"
                    colorScheme="green"
                    justifyContent="start"
                    size="sm"
                    maxWidth="100%"
                    onClick={() => navigate(`/${laundryId}/admin/websiteServices`)}
                >
                    Website Services
                </Button>
                <Button as="a" href={`/${laundryId}/admin/settings`}
                    leftIcon={<Icon as={FaCogs} />}
                    variant="ghost"
                    colorScheme="green"
                    justifyContent="start"
                    size="sm"
                    maxWidth="100%"
                    onClick={() => navigate(`/${laundryId}/admin/settings`)}
                >
                    System Settings
                </Button>
            </VStack>
        </Collapse>
        </>
        )}

        {/* Promotions - visible to Manager, Admin */}
        {hasPermission(role, FEATURES.PROMOTIONS) && (
        <Button as="a" href={`/${laundryId}/admin/promotions`}
            leftIcon={<FaClipboardList />}
            variant="ghost"
            colorScheme="pink"
            justifyContent="flex-start"
            maxWidth="100%"
            onClick={() => navigate(`/${laundryId}/admin/promotions`)}
        >
            Promotions
        </Button>
        )}

        {/* Route Planner - visible to Manager, Admin */}
        {hasPermission(role, FEATURES.ROUTE_PLANNING) && (
        <Button as="a" href={`/${laundryId}/admin/route-planner`}
            leftIcon={<FaClipboardList />}
            variant="ghost"
            colorScheme="teal"
            justifyContent="flex-start"
            onClick={() => navigate(`/${laundryId}/admin/route-planner`)}
        >
            Route Planner
        </Button>
        )}

        {/* Employees / Manager Access - visible to Manager, Admin */}
        {hasPermission(role, FEATURES.ADD_EMPLOYEES) && (
        <Button
            leftIcon={<FaUsers />}
            variant="ghost"
            colorScheme="teal"
            justifyContent="flex-start"
            onClick={onOpen}
        >
            Manager Access Only
        </Button>
        )}

        {/* Driver Access - visible to Driver, Manager, Admin */}
        {hasPermission(role, FEATURES.DRIVER_ROUTE) && (
        <Button
            leftIcon={<FaUsers />}
            variant="ghost"
            colorScheme="teal"
            justifyContent="flex-start"
            onClick={handleDriverAccessOpen}
        >
            Driver Access Only
        </Button>
        )}

        {/* Employee Reviews - visible to Manager, Admin */}
        {hasPermission(role, FEATURES.ADD_EMPLOYEES) && (
        <Button as="a" href={`/${laundryId}/admin/employee-reviews`}
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="orange"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/employee-reviews`)}
        >
            Employee Reviews
        </Button>
        )}

        {/* Chat - visible to Employee, Manager, Admin */}
        {hasPermission(role, FEATURES.CHAT) && (
        <Button as="a" href={`/${laundryId}/admin/chat`}
                leftIcon={<FaComments />}
                variant="ghost"
                colorScheme="blue"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/chat`)}
        >
            Chat
        </Button>
        )}

        {/* Dashboard - visible to Admin only */}
        {hasPermission(role, FEATURES.DASHBOARD) && (
        <>
        <Button as="a" href={`/${laundryId}/admin/zip-interest`}
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="teal"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/zip-interest`)}
        >
            Zip Demand
        </Button>
        <Button as="a" href={`/${laundryId}/admin/dashboard`}
                leftIcon={<FaHome />}
                variant="ghost"
                colorScheme="green"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/dashboard`)}
        >
            Dashboard
        </Button>
        <Button as="a" href={`/${laundryId}/admin/faq`}
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="blue"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/faq`)}
        >
            FAQ
        </Button>
        </>
        )}

        {/* Engagement - visible to Admin only */}
        {hasPermission(role, FEATURES.ENGAGEMENT) && (
        <Button as="a" href={`/${laundryId}/admin/engagement`}
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="orange"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/engagement`)}
        >
            Engagement
        </Button>
        )}

        {/* Support Chat - visible to Admin only (LAUNDRY_SETTINGS) */}
        {hasPermission(role, FEATURES.LAUNDRY_SETTINGS) && (
        <Button as="a" href={`/${laundryId}/admin/support-chat`}
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="cyan"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/support-chat`)}
                position="relative"
        >
            💬 Support
            <SupportUnreadBadge laundryId={laundryId} />
        </Button>
        )}

        {/* My Route - for Driver role specifically */}
        {role === 'Driver' && (
        <Button as="a" href={`/${laundryId}/driver/home`}
            leftIcon={<FaHome />}
            variant="ghost"
            colorScheme="blue"
            justifyContent="flex-start"
            onClick={() => navigate(`/${laundryId}/driver/home`)}
        >
            My Route
        </Button>
        )}

        <Button
            leftIcon={<FaSignOutAlt />}
            variant="ghost"
            colorScheme="red"
            justifyContent="flex-start"
            mt="auto"
            onClick={handleSignOut}
        >
            Sign Out
        </Button>
        <Divider />
    </VStack>


    );
    };

export default AdminLayout;
