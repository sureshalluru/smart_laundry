import {
  Box,
  Heading,
  Text,
  VStack,
  Image,
  Button,
  Flex,
} from "@chakra-ui/react";

const BoostBusiness = () => {
  return (
    <Box px={{ base: 4, md: 10 }} py={20} maxW="7xl" mx="auto">
      <Flex
        direction={{ base: "column", md: "row" }}
        align="center"
        justify="space-between"
        gap={12}
      >
        {/* Left - Image */}
        <Box flex="1">
          <Image
            src="/LandingPage/business-impact.svg"
            alt="Business impact background"
            borderRadius="20px"
            width="100%"
            objectFit="cover"
          />
        </Box>

        {/* Right - Content */}
        <Box flex="1">
          {/* Heading */}
          <Heading fontSize={{ base: "2xl", md: "3xl" }} mb={6}>
            Business Impact
          </Heading>

          {/* Card box with shirt detection */}
          <Box
            border="1px solid #ccc"
            borderRadius="20px"
            p={6}
            mb={6}
            boxShadow="sm"
          >
            <Flex
              direction={{ base: "column", md: "row" }}
              align="center"
              justify="space-between"
              gap={4}
            >
              <Text fontWeight="bold" fontSize="lg">
                Your shirt has been identified 📸🧺
              </Text>
              <VStack spacing={1}>
                <Image
                  src="/LandingPage/Father-Cloth.svg"
                  alt="Shirt icon"
                  boxSize="70px"
                  border="2px solid green"
                  borderRadius="md"
                />
                <Text fontSize="sm" color="green.600">
                  Shirt
                </Text>
              </VStack>
            </Flex>
          </Box>

          {/* Bullet Points */}
          <VStack align="start" spacing={3} fontSize="sm" color="gray.700">
            <Text>
              1. <b>Order in Seconds</b> – Customers place orders online or in-store with ease.
            </Text>
            <Text>
              2. <b>Full Transparency</b> – They see exactly what was sent and where it is.
            </Text>
            <Text>
              3. <b>Timely Delivery</b> – Reliable drop-offs, real-time notifications.
            </Text>
            <Text>
              4. <b>Clean Results, Happy Clients</b> – Consistency keeps them coming back.
            </Text>
          </VStack>

          {/* Call to Action */}
          <Button
            mt={8}
            colorScheme="blue"
            px={8}
            borderRadius="12px"
            fontWeight="semibold"
          >
            Get Started
          </Button>
        </Box>
      </Flex>
    </Box>
  );
};

export default BoostBusiness;
