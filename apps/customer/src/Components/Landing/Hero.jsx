import { Box, Heading, Text, Image } from "@chakra-ui/react";

const Hero = () => (
  <Box minH="60vh" bgGradient="linear(to-r, blue.700, indigo.500)" display="flex" flexDir="column" alignItems="center" justifyContent="center" p={6} color="Blue" textAlign="center">
    <Heading as="h1" size="2xl" fontWeight="extrabold" mb={4} color="red.700">
  Smart Laundry Basket
</Heading>

    <Text fontSize="xl" maxW="3xl" mb={6}>
    AI-powered laundry tech for garment tracking and Wash and Fold ordering — built to grow your business and earn your customers’ trust.
    </Text>
    <a href="/GetStarted">
      <Box
        as="button"
        px={6}
        py={3}
        fontSize="md"
        fontWeight="bold"
        color="white"
        bg="yellow.500"
        _hover={{ bg: "yellow.600" }}
        borderRadius="md"
      >
       No risk for 3 months. Then just $150/month to grow your laundry business.
      </Box>
    </a>
    
    <Image src="https://via.placeholder.com/500x300" alt="Smart Laundry Basket" borderRadius="lg" />
  </Box>
);

export default Hero;
