import { Box, Heading, Text } from "@chakra-ui/react";

const BookDemo = () => {
  // Redirect to Google Calendar booking
  window.location.href = "https://calendar.app.google/Gu7fDZWRHYtrZK5H8";
  return (
    <Box maxW="6xl" mx="auto" p={6} textAlign="center">
      <Heading as="h1" size="2xl" mb={4}>
        Redirecting to booking page...
      </Heading>
      <Text fontSize="lg" color="gray.600">
        If not redirected, <a href="https://calendar.app.google/Gu7fDZWRHYtrZK5H8" style={{color: 'blue'}}>click here</a>.
      </Text>
    </Box>
  );
};

export default BookDemo;
