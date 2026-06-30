import React from 'react';
import {
    Box, Flex, VStack, Button, Divider, Heading, IconButton,
    useDisclosure, Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody,
} from '@chakra-ui/react';
import { FiHome, FiBarChart2, FiTrendingUp, FiLogOut, FiBriefcase, FiMenu } from 'react-icons/fi';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useCompanyAuth } from '../../Context/CompanyAuthContext';
import LocationSwitcher from './LocationSwitcher';

export default function CompanyLayout() {
    const navigate = useNavigate();
    const { companyId } = useParams();
    const { companyUser, companyLogout } = useCompanyAuth();
    const { isOpen, onOpen, onClose } = useDisclosure();

    const handleLogout = () => {
        companyLogout();
        navigate('/company/login');
    };

    const SidebarContent = () => (
        <VStack spacing={2} align="stretch" h="full">
            <Box px={4} py={3}>
                <Heading size="sm" color="purple.600">
                    <Box as="span" mr={2}><FiBriefcase style={{ display: 'inline' }} /></Box>
                    {companyUser?.name || 'Company Admin'}
                </Heading>
            </Box>
            <Divider />

            <VStack spacing={1} align="stretch" px={2} mt={2}>
                <Button
                    variant="ghost"
                    justifyContent="flex-start"
                    leftIcon={<FiHome />}
                    colorScheme="purple"
                    onClick={() => navigate(`/company/${companyId}/dashboard`)}
                >
                    Dashboard
                </Button>
                <Button
                    variant="ghost"
                    justifyContent="flex-start"
                    leftIcon={<FiBarChart2 />}
                    colorScheme="purple"
                    onClick={() => navigate(`/company/${companyId}/reports`)}
                >
                    Reports
                </Button>
                <Button
                    variant="ghost"
                    justifyContent="flex-start"
                    leftIcon={<FiTrendingUp />}
                    colorScheme="purple"
                    onClick={() => navigate(`/company/${companyId}/performance`)}
                >
                    Performance
                </Button>
            </VStack>

            <Divider my={3} />

            <LocationSwitcher />

            <Box mt="auto" px={2} pb={4}>
                <Divider mb={3} />
                <Button
                    variant="ghost"
                    justifyContent="flex-start"
                    leftIcon={<FiLogOut />}
                    colorScheme="red"
                    size="sm"
                    w="full"
                    onClick={handleLogout}
                >
                    Sign Out
                </Button>
            </Box>
        </VStack>
    );

    return (
        <Flex minH="100vh">
            {/* Desktop Sidebar */}
            <Box
                as="aside"
                w="260px"
                bg="gray.50"
                borderRight="1px solid"
                borderColor="gray.200"
                display={{ base: 'none', md: 'flex' }}
                flexDirection="column"
            >
                <SidebarContent />
            </Box>

            {/* Mobile header + drawer */}
            <Box display={{ base: 'block', md: 'none' }} position="fixed" top={0} left={0} right={0} zIndex={1100}>
                <Flex bg="purple.500" color="white" p={3} alignItems="center">
                    <IconButton
                        icon={<FiMenu />}
                        variant="ghost"
                        color="white"
                        onClick={onOpen}
                        aria-label="Open menu"
                    />
                    <Heading size="sm" ml={3}>Company Admin</Heading>
                </Flex>
            </Box>

            <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
                <DrawerOverlay />
                <DrawerContent bg="gray.50">
                    <DrawerHeader borderBottomWidth="1px">Company Admin</DrawerHeader>
                    <DrawerBody p={0}>
                        <SidebarContent />
                    </DrawerBody>
                </DrawerContent>
            </Drawer>

            {/* Main Content */}
            <Box flex={1} bg="white" p={6} pt={{ base: '70px', md: 6 }}>
                <Outlet />
            </Box>
        </Flex>
    );
}
