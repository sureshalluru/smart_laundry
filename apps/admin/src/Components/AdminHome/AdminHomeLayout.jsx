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
} from 'react-icons/fa';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { fetchLaundryInfo } from '../../Pages/LaundryInfoManagement';
import { useAuth } from '../../Context/AuthContext';

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
                    bg="#ccf0ed"
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
                <Box flex="1" bg="#AADDD9" p={6} pt={{ base: "70px", md: "70px", lg: "70px" }}>
                    <Outlet />
                </Box>

            </Flex>

            {/* Drawer for Mobile */}
            <Drawer isOpen={isDrawerOpen} placement="left" onClose={onDrawerClose} >
                <DrawerOverlay />
                <DrawerContent bg="#ccf0ed" sx={{
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
    // Function to handle right-click and open link in a new tab
    const handleRightClick = (event, path) => {
        event.preventDefault(); // Prevent default context menu
        window.open(`/${laundryId}${path}`, '_blank'); // Open link in new tab
    };
    const handleSignOut = () => {
        auth.logout();
        localStorage.removeItem('idToken');
        window.location.href = '/admin';
    };

    return (
    
    <VStack spacing={4} align="stretch" mt={["0px", "0px", "40px", "50px"]} >
        <Button as="a" href={`/${laundryId}/admin/home`}
            leftIcon={<FaHome />}
            variant="ghost"
            colorScheme="blue"
            justifyContent="flex-start"
            onClick={() => navigate(`/${laundryId}/admin/home`)}
        >
            Home
        </Button>
        {/* Place Order Button */}
        <Button
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="purple"
                justifyContent="flex-start"
                onClick={() => setIsOrdersExpanded(!isOrdersExpanded)}
            >
                Orders
        </Button>

        {/* Collapsible Section for Create Order and Other */}
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

            {/* {/* <Button as="a" href={`/${laundryId}/admin/view-commercial-orders`}
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="blue"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/view-commercial-orders`)}
            >
                Commercial Orders
            </Button> */}

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

        {/* Place Order Button */}
        <Button
                leftIcon={<FaPlus />}
                variant="ghost"
                colorScheme="purple"
                justifyContent="flex-start"
                onClick={() => setIsPlaceOrderExpanded(!isPlaceOrderExpanded)} // Toggle collapse
            >
                Place Order
            </Button>

            {/* Collapsible Section for Create Order and Other */}
            <Collapse in={isPlaceOrderExpanded} animateOpacity>
                <VStack spacing={2} align="stretch" pl={6} maxWidth="100%">
                    {/* Create Order Option */}
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

                    {/* Other Option */}
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
                    {/* Other Option */}
                    {/* <Button as="a" href={`/${laundryId}/admin/commercial-order-invoice`}
                        leftIcon={<FaShoppingCart />}
                        variant="ghost"
                        colorScheme="blue"
                        justifyContent="flex-start"
                        size="sm"
                        maxWidth="100%"
                        onClick={() => navigate(`/${laundryId}/admin/commercial-order-invoice`)} 
                    >
                        Commercial Orders
                    </Button> */}
                </VStack>
            </Collapse>


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
            </VStack>
        </Collapse>
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
        <Button
            leftIcon={<FaUsers />}
            variant="ghost"
            colorScheme="teal"
            justifyContent="flex-start"
            onClick={onOpen}
        >
            Manager Access Only
        </Button>
        <Button
            leftIcon={<FaUsers />}
            variant="ghost"
            colorScheme="teal"
            justifyContent="flex-start"
            onClick={handleDriverAccessOpen} // Open modal for Driver Access
        >
            Driver Access Only
        </Button>
        <Button as="a" href={`/${laundryId}/admin/employee-reviews`}
                leftIcon={<FaClipboardList />}
                variant="ghost"
                colorScheme="orange"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/employee-reviews`)}
        >
            Employee Reviews
        </Button>
        <Button as="a" href={`/${laundryId}/admin/chat`}
                leftIcon={<FaComments />}
                variant="ghost"
                colorScheme="blue"
                justifyContent="flex-start"
                onClick={() => navigate(`/${laundryId}/admin/chat`)}
        >
            Chat
        </Button>
        <Button
            leftIcon={<FaSignOutAlt />}
            variant="ghost"
            colorScheme="red"
            justifyContent="flex-start"
            mt="auto" // Pushes to bottom if flex layout
            onClick={handleSignOut}
        >
            Sign Out
        </Button>
        <Divider />
    </VStack>


    );
    };

export default AdminLayout;
