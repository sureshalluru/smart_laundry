import { Box } from "@chakra-ui/react";
import Hero from "./Hero";
import MainContent from "./MainContent";
import Footer from "./Footer";

export default function SmartLaundryLanding() {
  return (
    <Box display="flex" flexDir="column" alignItems="center" p={6}>
      <Hero />
      <MainContent />
      <Footer />
    </Box>
  );
}
