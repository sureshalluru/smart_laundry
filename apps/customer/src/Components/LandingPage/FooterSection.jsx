import {
  Box,
  Image,
  Text,
  VStack,
  HStack,
  Icon,
  Heading,
  Tabs,
  TabList,
  Tab
} from "@chakra-ui/react";
import { CheckIcon } from "@chakra-ui/icons";
// import FooterImage from "../../../public/LandingPage/footer-laundry-girl.png";

const FooterSection = () => {
  return (
    <Box py={16} px={{ base: 4, md: 16 }} maxW="1200px" mx="auto">
      <Heading fontSize={{ base: "28px", md: "36px" }} mb={4}>
        We’re <b>Passionate</b> Laundry
      </Heading>

      <Tabs variant="unstyled" mb={8}>
        <TabList>
          <Tab
            _selected={{ color: "#217BFF", borderBottom: "2px solid #217BFF" }}
            mr={6}
          >
            Our Vision
          </Tab>
          <Tab mr={6}>Our Target</Tab>
          <Tab>Our Goals</Tab>
        </TabList>
      </Tabs>

      <Box
        display={{ base: "block", md: "flex" }}
        alignItems="center"
        justifyContent="space-between"
      >
        {/* Left - Text Section */}
        <Box flex="1">
          <Text fontSize="lg" mb={6}>
            By giving your customers full visibility into their orders — including photos of what they sent in and what they’re getting back — SLB creates a new level of confidence. They know every garment is accounted for, handled with care, and returned just as expected. That kind of trust leads to loyal customers, glowing reviews, and more repeat orders.
          </Text>

          <VStack align="flex-start" spacing={4}>
            {["AI Revolutionised Laundry", "Customer Support", "Best Experience"].map((item) => (
              <HStack key={item}>
                <Icon as={CheckIcon} color="blue.500" />
                <Text fontSize="md">{item}</Text>
              </HStack>
            ))}
          </VStack>
        </Box>

        {/* Right - Image Section */}
        <Box flex="1" mt={{ base: 8, md: 0 }} ml={{ md: 12 }} textAlign="center">
          <Box position="relative" display="inline-block">
            <Box
              width="12px"
              height="12px"
              bg="black"
              borderRadius="full"
              position="absolute"
              top="-8px"
              left="-8px"
            />
            <Image
  src="/LandingPage/girl-holding-washed-cloths.svg"
  alt="Girl with Laundry Basket"
              borderRadius="lg"
              maxW={{ base: "100%", md: "300px", lg: "350px" }}
              mx="auto"
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default FooterSection;
