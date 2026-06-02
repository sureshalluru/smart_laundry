import {
  Box,
  Heading,
  VStack,
  Input,
  Button,
  Select,
  Flex,
  Image,
} from "@chakra-ui/react";

const BookDemo = () => {
  return (
    <Box
      bgGradient="linear(to-b, #144A99, #217BFF)"
      py={20}
      px={{ base: 6, md: 20 }}
      color="white"
    >
      <Heading fontSize="2xl" textAlign="center" mb={12}>
        BOOK A DEMO
      </Heading>

      <Flex
        direction={{ base: "column", md: "row" }}
        align="center"
        justify="center"
        gap={12}
        maxW="7xl"
        mx="auto"
      >
        {/* Left - Image */}
        <Box flex="1" textAlign="center">
          <Image
            src="/LandingPage/book.svg"
            alt="Book a Demo Illustration"
            maxW="100%"
            height={{ base: "250px", md: "400px" }}
            mx="auto"
          />
        </Box>

        {/* Right - Form */}
        <Box flex="1" w="100%">
          <VStack spacing={4} align="stretch">
            <Input placeholder="Full name" bg="white" color="black" />
            <Input placeholder="Email address" bg="white" color="black" />

            <Flex gap={2} flexDirection={{ base: "column", sm: "row" }}>
              <Select
                bg="white"
                color="black"
                maxW={{ base: "100%", sm: "120px" }}
              >
                <option value="+1">🇺🇸 +1</option>
                <option value="+91">🇮🇳 +91</option>
              </Select>
              <Input
                placeholder="Phone number"
                bg="white"
                color="black"
                flex="1"
              />
            </Flex>

            <Select bg="white" color="black" placeholder="No of Stores">
              <option>1</option>
              <option>2–5</option>
              <option>5+</option>
            </Select>

            <Select
              bg="white"
              color="black"
              placeholder="I'm Interested in"
            >
              <option>Tracking</option>
              <option>Delivery</option>
              <option>All features</option>
            </Select>

            <Button
              bg="black"
              color="white"
              w="100%"
              h="50px"
              borderRadius="md"
              _hover={{ bg: "#222" }}
            >
              Schedule Demo
            </Button>
          </VStack>
        </Box>
      </Flex>
    </Box>
  );
};

export default BookDemo;
