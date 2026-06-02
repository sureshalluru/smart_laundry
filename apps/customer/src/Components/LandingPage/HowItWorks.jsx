import {
  Box,
  Heading,
  Text,
  VStack,
  Image,
  IconButton,
  Flex,
} from "@chakra-ui/react";
import { ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { useRef } from "react";

const steps = [
  {
    title: "Place Orders",
    img: "/LandingPage/place-orders.svg",
    desc: "Customers place orders in a few clicks or in-store. Whether online or walk-in, every item is logged instantly and accurately.",
  },
  {
    title: "AI Technology Logs Every Garment",
    // img: "/LandingPage/ai-logs.svg",
    img: "/LandingPage/manage-flow.svg",
    desc: "As laundry is received, AI-powered cameras scan and catalog each garment, creating a digital log for full accountability. Both employees and customers know exactly what was received and what was delivered back.",
  },
  {
    title: "Employees Manage the Full Order Flow",
    img: "/LandingPage/manage-flow.svg",
    desc: "Staff get an intuitive dashboard to manage every step, washing, folding, and status updates. Orders are organized and easy to track, whether they came from online or in-store.",
  },
  {
    title: "Drivers Deliver with Real-time Updates",
    img: "/LandingPage/deliver-updates.svg",
    desc: "Drivers receive optimized pickup/delivery routes and customers get real-time updates on order progress — from pickup to doorstep delivery.",
  },
];

const HowItWorks = () => {
  const scrollRef = useRef();

  const scroll = (direction) => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const scrollAmount = container.offsetWidth * 0.7;
      container.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <Box px={{ base: 4, md: 10 }} py={{ base: 10, md: 20 }} bg="white">
      <Heading
        textAlign="center"
        fontSize={{ base: "2xl", md: "3xl" }}
        mb={4}
        color="gray.800"
      >
        How It Works?
      </Heading>
      <Text
        textAlign="center"
        maxW="800px"
        mx="auto"
        mb={10}
        fontSize={{ base: "sm", md: "md" }}
        color="gray.600"
      >
        From everyday laundry care to specialized garment treatments, we deliver
        excellence with every service. Explore our offerings and discover how we
        can make your life easier with reliable, high-quality solutions.
      </Text>

      <Flex justify="center" align="center" position="relative">
        <IconButton
          aria-label="Scroll left"
          icon={<ChevronLeftIcon />}
          onClick={() => scroll("left")}
          position="absolute"
          left="-10px"
          top="50%"
          transform="translateY(-50%)"
          zIndex="1"
          display={{ base: "none", md: "flex" }}
          borderRadius="full"
          bg="white"
          boxShadow="md"
        />

        <Box
          overflowX="auto"
          ref={scrollRef}
          scrollBehavior="smooth"
          css={{
            "&::-webkit-scrollbar": {
              display: "none",
            },
          }}
        >
          <Flex gap={6} minW="max-content" px={2}>
            {steps.map((step, i) => (
              <VStack
                key={i}
                spacing={4}
                minW={{ base: "280px", md: "340px", lg: "400px" }}
                maxW={{ base: "280px", md: "340px", lg: "400px" }}
                flexShrink={0}
                p={5}
                borderRadius="lg"
                boxShadow="sm"
                bg="gray.50"
                align="start"
              >
                <Box
                  w="100%"
                  h="200px"
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                >
                  <Image
                    src={step.img}
                    alt={step.title}
                    maxH="180px"
                    objectFit="contain"
                  />
                </Box>
                <Text fontWeight="bold" fontSize="lg" color="gray.800">
                  {step.title}
                </Text>
                <Text fontSize="sm" color="gray.600">
                  {step.desc}
                </Text>
              </VStack>
            ))}
          </Flex>
        </Box>

        <IconButton
          aria-label="Scroll right"
          icon={<ChevronRightIcon />}
          onClick={() => scroll("right")}
          position="absolute"
          right="-10px"
          top="50%"
          transform="translateY(-50%)"
          zIndex="1"
          display={{ base: "none", md: "flex" }}
          borderRadius="full"
          bg="white"
          boxShadow="md"
        />
      </Flex>
    </Box>
  );
};

export default HowItWorks;

