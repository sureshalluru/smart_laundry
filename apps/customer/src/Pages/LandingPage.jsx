import { Box } from "@chakra-ui/react";
import HeroSection from "../Components/LandingPage/HeroSection";
import WhyChoose from "../Components/LandingPage/WhyChoose";
import HowItWorks from "../Components/LandingPage/HowItWorks";
import BoostBusiness from "../Components/LandingPage/BoostBusiness";
import BookDemo from "../Components/LandingPage/BookDemo";
import FooterSection from "../Components/LandingPage/FooterSection";

const LandingPage = () => (
  <Box>
    <HeroSection />
    <WhyChoose />
    <HowItWorks />
    <BoostBusiness />
    <BookDemo />
    <FooterSection />
  </Box>
);

export default LandingPage;
