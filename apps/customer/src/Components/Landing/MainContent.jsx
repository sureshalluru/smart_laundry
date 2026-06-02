import { Box, Heading, Text, SimpleGrid, VStack, Icon, Button } from "@chakra-ui/react"; 
import { FaPlug, FaShoppingCart, FaChartLine, FaSearchLocation } from "react-icons/fa"; 
import { Link as RouterLink } from "react-router-dom";



const FeatureCard = ({ icon, title, description }) => (
  <VStack p={6} bg="gray.100" borderRadius="lg" boxShadow="md" align="center">
    <Icon as={icon} boxSize={10} color="blue.500" />
    <Heading as="h3" size="md" mt={3}>{title}</Heading>
    <Text color="gray.700">{description}</Text>
  </VStack>
);

const MainContent = () => (
  <Box bg="white" p={8} boxShadow="2xl" borderRadius="2xl" textAlign="center" maxW="5xl" w="full" color="gray.900" mt={-10}>
    <Heading as="h2" size="xl" fontWeight="bold" mb={4}>Why Choose Smart Laundry Basket?</Heading>
    <Text fontSize="lg" color="gray.600" mb={6}>
      Automate your laundromat's order process, enhance customer experience with help of AI garment tracking, and streamline operations effortlessly.
    </Text>
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
      <FeatureCard icon={FaPlug} title="Easy Integration" description="Plug & play system for any website or app." />
      <FeatureCard icon={FaShoppingCart} title="Seamless Ordering" description="Customers can place orders in seconds." />
      <FeatureCard icon={FaSearchLocation} title="AI Garment Tracking" description="Build trust and transparency with our AI-powered garment tracking—ensuring every item is tracked from pickup to delivery, with no mix-ups or missing pieces." />
      <FeatureCard icon={FaChartLine} title="Boost Revenue" description="Increase efficiency and grow your business with AI order management" />
    </SimpleGrid>
    <Button mt={6} colorScheme="blue" size="lg" as={RouterLink} to="/LearnMore">
        Learn More
    </Button>
    <Box
  mt={16}
  textAlign="center"
  bg="blue.50"
  p={10}
  borderRadius="2xl"
  boxShadow="xl"
>
  <Heading as="h2" size="xl" mb={4}>
    Launch or Learn — Your Choice
  </Heading>
  <Text fontSize="lg" color="gray.700" maxW="3xl" mx="auto" mb={6}>
    Already excited? You can get started in minutes.  
    Prefer a walkthrough? Book a free demo with our team and see how SLB can elevate your laundry business.
  </Text>
  <Box display="flex" flexDir={{ base: "column", md: "row" }} justifyContent="center" gap={4}>
    <a href="/GetStarted">
      <Box
        as="button"
        px={6}
        py={3}
        fontSize="md"
        fontWeight="bold"
        color="white"
        bg="blue.500"
        _hover={{ bg: "blue.600" }}
        borderRadius="md"
      >
        Get Started Now
      </Box>
    </a>
    <a href="/BookDemo">
      <Box
        as="button"
        px={6}
        py={3}
        fontSize="md"
        fontWeight="bold"
        color="blue.600"
        bg="white"
        border="2px solid"
        borderColor="blue.300"
        _hover={{ bg: "blue.100" }}
        borderRadius="md"
      >
        Book a Demo
      </Box>
    </a>
  </Box>
</Box>


  </Box>
);

export default MainContent;
