import {
  Box,
  Button,
  Heading,
  Text,
  Stack,
  Flex,
  Image,
  HStack,
} from "@chakra-ui/react";
import { PhoneIcon } from "@chakra-ui/icons";

const HeroSection = () => {
  return (
    <Box
      position="relative"
      width="100%"
      minH={{ base: "auto", md: "686px" }}
      backgroundImage="linear-gradient(0deg, rgba(0, 0, 0, 0.43), rgba(0, 0, 0, 0.43)), url('/LandingPage/smart-laundry-bg.svg')"
      backgroundSize="cover"
      backgroundPosition="center"
      color="white"
      pb={{ base: 8, md: 0 }}
    >
      {/* Top Navbar */}
      <Flex
        as="header"
        align="center"
        justify="space-between"
        px={{ base: 4, md: 12, lg: 20 }}
        py={4}
        bg="white"
      >
        {/* Left: Logo + Text */}
        <HStack spacing={3}>
          <Image
            src="/LandingPage/slb-logo.svg"
            alt="SLB Logo"
            boxSize="32px"
          />
          <Text fontSize="md" fontWeight="600" color="black">
            SMART LAUNDRY
          </Text>
        </HStack>

        {/* Right: Contact Button */}
        <Button
          bg="black"
          color="white"
          px={4}
          py={2}
          borderRadius="40px"
          _hover={{ bg: "#222" }}
          leftIcon={
            <Box
              bg="#217BFF"
              p={2}
              borderRadius="full"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <PhoneIcon fontSize="12px" color="white" />
            </Box>
          }
        >
          Contact Us
        </Button>
      </Flex>

      {/* Main Hero Content */}
      <Flex
        direction={{ base: "column", md: "row" }}
        justify="space-between"
        align="center"
        px={{ base: 4, md: 12, lg: 20 }}
        pt={{ base: 12, md: 24 }}
        pb={{ base: 16, md: 24 }}
        maxW="8xl"
        mx="auto"
      >
        {/* Left Content */}
        <Stack
          spacing={{ base: 4, md: 6 }}
          maxW={{ base: "100%", md: "50%" }}
          textAlign={{ base: "center", md: "left" }}
        >
          <Heading
            fontSize={{ base: "36px", sm: "48px", md: "60px", lg: "80px" }}
            fontWeight="400"
            lineHeight={{ base: "1.2", md: "90px", lg: "130px" }}
          >
            The{" "}
            <Box
              as="span"
              background="white"
              color="black"
              px={3}
              py={1}
              borderRadius="md"
              display="inline-block"
            >
              Smart
            </Box>
            <br />
            Laundry Basket
          </Heading>

          <Text
            fontSize={{ base: "16px", md: "17px" }}
            lineHeight={{ base: "28px", md: "35px" }}
            maxW="600px"
            mx={{ base: "auto", md: "0" }}
          >
            AI-Powered Laundry Tech to Track Every Garment, Accept Orders
            Online, and Run a Smarter Laundromat
          </Text>

          <Button
            bg="#217BFF"
            borderRadius="20px"
            w={{ base: "160px", md: "189px" }}
            h={{ base: "50px", md: "70px" }}
            fontSize={{ base: "16px", md: "18px" }}
            mx={{ base: "auto", md: "0" }}
            _hover={{ bg: "#1763cc" }}
          >
            Book A Demo
          </Button>
        </Stack>

        {/* Right Revenue Feature Bubble */}
      
      <Box
  position="relative"
  mt={{ base: 12, md: 0 }}
  w={{ base: "90%", sm: "320px", md: "300px", lg: "360px" }}
  h="auto"
  mx={{ base: "auto", md: "0" }} // center on small screens
>
  {/* Background Shape */}
  <Image
  src="/LandingPage/coin-bg.svg"
  alt="Boost Revenue background"
  width={{ base: "63%", sm: "280px", md: "300px", lg: "320px" }}
  height="auto"
  mx="auto"
/>


  {/* Overlay Content */}
  <Box
    position="absolute"
    top="0"
    left="0"
    w="100%"
    h="100%"
    px={{ base: 4, md: 5 }}
    py={{ base: 6, md: 7 }}
    display="flex"
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    textAlign="center"
    color="white"
  >
    <Image
      src="/LandingPage/coin-icon.svg"
      alt="Coin Icon"
      boxSize={{ base: "28px", md: "36px" }}
      mb={3}
    />
    <Text
      fontWeight="bold"
      fontSize={{ base: "md", md: "lg" }}
      mb={2}
    >
      Boost Revenue <span style={{ color: "#FF7A00" }}>⚡</span>
    </Text>
    <Text fontSize={{ base: "sm", md: "sm" }} maxW="220px">
      Increase efficiency and grow your business with AI order management
    </Text>
  </Box>
</Box>

      </Flex>
    </Box>
  );
};

export default HeroSection;