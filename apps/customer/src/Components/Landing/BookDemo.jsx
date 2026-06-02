import { Box, Heading, Text } from "@chakra-ui/react";

const BookDemo = () => {
  return (
    <Box maxW="6xl" mx="auto" p={6} textAlign="center">
      <Heading as="h1" size="2xl" mb={4}>
        Book a Free Demo
      </Heading>
      <Text fontSize="lg" color="gray.600" mb={8}>
        See how Smart Laundry Basket works, ask questions, and discover how it can help your laundromat grow.
        Schedule your personalized demo at a time that works for you.
      </Text>
      <Box as="section" w="100%" h="700px">
        <iframe
          src="https://calendly.com/smartlaundrybasket/"  // <-- Replace with your actual Calendly link
          width="100%"
          height="100%"
          frameBorder="0"
          title="Book a Demo"
        ></iframe>
      </Box>
    </Box>
  );
};

export default BookDemo;
