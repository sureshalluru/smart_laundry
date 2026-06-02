import {
  Box,
  Heading,
  SimpleGrid,
  VStack,
  Text,
  Image,
  Flex,
} from "@chakra-ui/react";

const features  = [
  {
    title: "Easy Integration",
    desc:
      "Fits your business — no matter how you run it. Our smart laundry basket platform is truly plug-and-play. No need to rebuild anything—just connect and go.",
    icon: "/LandingPage/easy-integration-icon.svg",
    number: "01",
    color: "#7BCA4C",
  },
  {
    title: "Seamless Ordering",
    desc:
      "Frictionless for your customers. Powerful for your business. Your customers can place laundry orders in just a few clicks—no app download required.",
    icon: "/LandingPage/washer-icon.svg", // Make sure this file exists
    number: "02",
    color: "#F3498A",
  },
  {
    title: "AI Garment Tracking",
    desc:
      "Every item logged. Every item returned. Our AI-powered cameras automatically capture and catalog every garment entering your laundromat.",
    icon: "/LandingPage/ai-tracking.svg",
    number: "03",
    color: "#864EE1",
  },
];


const WhyChoose = () => (
  <Box bg="white" px={{ base: 6, md: 10 }} py={{ base: 16, md: 20 }} textAlign="center" position="relative">
    <Heading fontSize={{ base: "2xl", md: "4xl" }} mb={4}>
      Why Choose Smart Laundry Basket?
    </Heading>
    <Text fontSize="md" maxW="700px" mx="auto" color="gray.600" mb={16}>
      Automate your laundromat's order process, enhance customer experience with help of AI garment tracking,
      and streamline operations effortlessly.
    </Text>

    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 10, md: 4 }} alignItems="stretch">
  {features.map((f, i) => (
    <Box key={i} position="relative" px={6} pt={12} pb={10} borderRadius="xl">
      {/* Connector & Dot (not for last card) */}
      

{/* { i < features.length - 1 && (
  <Image
    src={`/LandingPage/ellipse-shape-${i + 1}.svg`}
    alt={`connector-${i + 1}`}
    position="absolute"
    zIndex="0"
    display={{ base: "none", md: "block" }}
    {...(i === 0
      ? {
          top: { base: "auto", md: "20%", lg: "10%" },
          left: { md: "60%", lg: "82%" },
          width: { base: "120px", md: "130px", lg: "160px" },
          height: "auto",
          transform: "translateY(-20%)",
        }
      : {
          top: { base: "auto", md: "40%", lg: "12%" },
          left: { md: "70%", lg: "85%" },
          width: { base: "120px", md: "140px", lg: "170px" },
          height: "auto",
          transform: "translateY(182%)",
        })}
  />
)} */}

{ i < features.length - 1 && (
  <Image
    src={`/LandingPage/ellipse-shape-${i + 1}.svg`}
    alt={`connector-${i + 1}`}
    position="absolute"
    zIndex="0"
    pointerEvents="none"
    display={{ base: "block", sm: "block", md: "block", lg: "block" }}
    {...(i === 0
      ? {
          top: { base: "100%", sm: "100%", md: "20%", lg: "12%" },
          left: { base: "35%", sm: "40%", md: "60%", lg: "82%" },
          width: { base: "140px", sm: "160px", md: "130px", lg: "160px" },
          transform: { base: "translateY(-30%)", md: "translateY(-20%)" },
        }
      : {
          top: { base: "100%", sm: "100%", md: "30%", lg: "14%" },
          left: { base: "45%", sm: "50%", md: "70%", lg: "85%" },
          width: { base: "150px", sm: "160px", md: "140px", lg: "170px" },
          transform: { base: "translateY(-10%)", md: "translateY(182%)" },
        })}
  />
)}



      {/* Card */}
      <Box
        border="1px solid"
        borderColor={f.color}
        borderRadius="20px"
        p={6}
        h="100%"
        boxShadow="md"
        bg="white"
      >
        <VStack spacing={4} textAlign="center">
          <Image src={f.icon} alt={f.title} boxSize="40px" />
          <Text fontSize="xl" fontWeight="bold" color="black">
            {f.title}
          </Text>
          <Text fontSize="sm" color="gray.600">
            {f.desc}
          </Text>
        </VStack>
      </Box>

      {/* Number Badge */}
      <Flex
        position="absolute"
        top={-3}
        left="50%"
        transform="translateX(-50%)"
        bg="white"
        border={`2px solid ${f.color}`}
        borderRadius="full"
        w="36px"
        h="36px"
        align="center"
        justify="center"
        fontSize="sm"
        fontWeight="bold"
        color={f.color}
        zIndex="1"
      >
        {f.number}
      </Flex>
    </Box>
  ))}
</SimpleGrid>


    {/* Decorative Shapes */}
    <Image
      src="/LandingPage/ellipse-shape-1.svg"
      alt="dot"
      position="absolute"
      top="100px"
      left="30px"
      boxSize="10px"
      display={{ base: "none", md: "block" }}
    />
    <Image
      src="/LandingPage/ellipse-shape-2.svg"
      alt="dot"
      position="absolute"
      top="120px"
      right="40px"
      boxSize="12px"
      display={{ base: "none", md: "block" }}
    />
  </Box>
);

export default WhyChoose;
