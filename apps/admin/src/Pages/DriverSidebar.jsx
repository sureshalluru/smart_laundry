import React, { useEffect, useState, useRef } from 'react';
import {
    Box,
    VStack,
    Text,
    Icon,
    Divider,
    Drawer,
    DrawerBody,
    DrawerOverlay,
    DrawerContent,
    useDisclosure,
    IconButton,
    Flex,
    useBreakpointValue,
    Link as ChakraLink,
    Image,
    Button
  } from "@chakra-ui/react";
  import {
    FiHome,
    FiTruck,
    FiLogOut,
    FiShoppingBag,
    FiMenu
  } from "react-icons/fi";
  import {
      FaHome
  } from 'react-icons/fa';
  import { useNavigate } from "react-router-dom";
  import { fetchLaundryInfo } from "./LaundryInfoManagement"; 

  
  const SidebarContent = ({ onSelect, onSignOut, laundryInfo, isMobile, onOpenDrawer, laundryId, navigate }) => (
    
    <VStack align="stretch" spacing={4} px={5} mt={5}>
        

        <Button as="a" href={`/${laundryId}/driver/home`}
            leftIcon={<FaHome />}
            variant="ghost"
            colorScheme="blue"
            justifyContent="flex-start"
            onClick={() => navigate(`/${laundryId}/driver/home`)}
        >
            Driver Home
        </Button>

      {/* ✅ Admin Home Button */}
    <Button as="a" href={`/${laundryId}/admin/active-orders`}
      leftIcon={<FiHome />}
      variant="ghost"
      colorScheme="blue"
      justifyContent="flex-start"
      onClick={() => navigate(`/${laundryId}/admin/active-orders`)}
    >
      Admin Home
    </Button>
              
      <ChakraLink onClick={onSignOut}>
        <Text color="red"><Icon as={FiLogOut} mr={2} /> Sign Out</Text>
      </ChakraLink>
      
    </VStack>
    
  );
  
  const SidebarLayout = ({ children, setFilter, laundryId }) => {
    const navigate = useNavigate();
    const { isOpen, onOpen, onClose } = useDisclosure();
  
    const isMobile = useBreakpointValue({ base: true, md: false });
    const [laundryInfo, setLaundryInfo] = useState(null);
    // const [laundryId, setLaundryId] = useState(null);

    useEffect(() => {
        const fetchInfo = async () => {
          const info = await fetchLaundryInfo(laundryId);
          
          if (info) {
            setLaundryInfo({
              name: info.name,
              address: info.address,
              phone: info.phone,
              logo: info.logo,
            });
          }
        };
        fetchInfo();
      }, [laundryId]);
  
    return (
      <Box minHeight="100vh" bg="#AADDD9" m="0" p="0">
        {/* Header with Hamburger */}
        <Flex
        as="header"
        position="fixed"
        top="0"
        left="0"
        right="0"
        zIndex="1000"
        height="70px"
        bg="teal.600"
        color="white"
        align="center"
        justify="space-between"
        px={4}
        boxShadow="md"
        >

{isMobile && (
  <IconButton
    icon={<FiMenu />}
    aria-label="Open sidebar"
    onClick={onOpen}
    variant="ghost"
    color="white"
    mr={2}
  />
)}

        {/* Left: Logo */}
        <Flex align="center" gap={2}>
            {laundryInfo?.logo && (
            <Image
                src={laundryInfo.logo}
                alt="Laundry Logo"
                boxSize="40px"
                objectFit="contain"
                borderRadius="md"
            />
            )}
        </Flex>

        {/* Center: Driver Panel Title */}
        <Text
            fontSize="2xl"
            fontWeight="bold"
            position="absolute"
            left="50%"
            transform="translateX(-50%)"
            whiteSpace="nowrap"
        >
            🚚 Driver Panel
        </Text>

        {/* Right: Laundry Name */}
        {!isMobile && laundryInfo?.name && (
            <Text
            fontSize="md"
            fontWeight="medium"
            textAlign="right"
            maxW="160px"
            isTruncated
            >
            {laundryInfo.name}
            </Text>
        )}
        </Flex>

  
        {/* Desktop Sidebar */}
        {!isMobile && (
          <Box
            width="240px"
            position="fixed"
            top="70px"
            left="0"
            bottom="0"
            bg="#ccf0ed"
            color="white"
          >
            <SidebarContent
  onSelect={setFilter}
  onSignOut={() => navigate("/")}
  laundryInfo={laundryInfo}
  isMobile={isMobile}
  onOpenDrawer={onOpen}
  laundryId={laundryId}
  navigate={navigate}
/>
          </Box>
        )}
  
        {/* Mobile Drawer Sidebar */}
        {isMobile && (
          <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
            <DrawerOverlay />
            <DrawerContent bg="#ccf0ed" color="black">
            <Box position="absolute" top="2" right="2">
      <IconButton
        icon={<Text fontSize="lg" fontWeight="bold">×</Text>}
        aria-label="Close sidebar"
        onClick={onClose}
        variant="ghost"
        color="black"
        _hover={{ bg: "teal.700" }}
      />
    </Box>
              <DrawerBody>
                <SidebarContent
                  onSelect={(filter) => {
                    setFilter(filter);
                    onClose();
                  }}
                  onSignOut={() => {
                    navigate("/");
                    onClose();
                  }}
                />
              </DrawerBody>
            </DrawerContent>
          </Drawer>
        )}
  
        {/* Page Content */}
        <Box
          ml={!isMobile ? "240px" : "0"}
          pt="70px"
          px={6}
          minHeight="100vh"
          transition="margin-left 0.2s ease"
        >
          {children}
        </Box>

        <Box as="footer"  bg="teal.600" textAlign="center">
            <Text fontSize={['sm', 'md']} color="white">
                📍 {laundryInfo?.laundryAddress || "123 Main Street, City, State"}
            </Text>
            <Text fontSize={['sm', 'md']} color="white">
                📞 {laundryInfo?.phoneNumber || "(123) 456-7890"}
            </Text>
        </Box>

      </Box>
    );
  };
  
  export default SidebarLayout;
  