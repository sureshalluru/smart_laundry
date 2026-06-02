import { Box, Heading, Text, Image, SimpleGrid, VStack } from "@chakra-ui/react";

const features = [
  {
    title: "How It Works",
    description:
      "Smart Laundry Basket (SLB) is an AI-powered garment tracking system designed to make laundry simple, smart, and secure — for both laundromat operators and their customers.\n\nCustomers can place Wash & Fold orders online in just a few taps. Customers can place Wash & Fold orders online in just a few taps. Whether laundry is picked up from home or dropped off at the laundromat, SLB takes over  — tracking every garment at every step of the wash-and-fold process. The system automatically alerts the operator if anything goes missing or gets mixed up, so nothing slips through the cracks.\n\nSLB isn't just powerful — it's plug-and-play. Laundromat owners can add SLB to their own website or even their Google Business Page in under 5 minutes. Just enter your business name, logo, and merchant info, and you're live.\n\nNo tech skills needed. No complicated setup. Just a smarter way to run your laundry business.",
    image: "https://via.placeholder.com/600x300?text=How+It+Works",
  },
  {
    title: "Track Every Garment",
    description:
      "Whether you drop off your laundry at the laundromat or have it picked up from your home, Smart Laundry Basket (SLB) makes sure every item is accounted for — from start to finish.\n\nOur AI-powered cameras track your clothes from the moment they’re unpacked by a Laundry Care Expert (LCE), all the way through the wash, dry, and fold process. You'll receive updates at each step — complete with images of your actual laundry — so you know exactly what was received and what’s going into the bag at the end.\n\nIf something doesn’t match up, SLB alerts the LCE immediately before anything moves forward. That means no mix-ups, no missing garments, and full transparency for every order.\n\nWith SLB, you get more than clean clothes — you get confidence and trust that nothing gets lost in the wash.",
    image: "https://via.placeholder.com/600x300?text=Garment+Tracking",
  },
  {
    title: "Integrated Ordering Experience",
    description:
      "Once a laundromat signs up with Smart Laundry Basket (SLB), we provide two simple, custom URLs — one for customers to place orders, and another for the laundromat to manage them.\n\nOperators can embed the customer-facing link anywhere: on their website, Google Business Page, social media, or even in text messages. Wherever your customers find you, they can start placing Wash & Fold orders instantly — no extra development or setup required.\n\nOn the backend, laundromat staff get a clean, easy-to-use dashboard to view and manage all incoming orders. It’s everything you need to accept, process, and stay on top of laundry orders — in one place.\n\nNo apps to install. No tech hurdles. Just a seamless, modern way to serve your customers.",
    image: "https://via.placeholder.com/600x300?text=Ordering+Experience",
  },
  {
    title: "Grow Your Business",
    description:
      "When customers trust your service, your business grows — and that’s exactly what Smart Laundry Basket (SLB) helps you build.\n\nBy giving your customers full visibility into their orders — including photos of what they sent in and what they’re getting back — SLB creates a new level of confidence. They know every garment is accounted for, handled with care, and returned just as expected. That kind of trust leads to loyal customers, glowing reviews, and more repeat orders.\n\nBehind the scenes, SLB gives laundromat operators the tools to grow smarter. Our built-in dashboard shows you exactly what customers are ordering, who’s coming back, and who’s gone quiet. You can spot trends, identify gaps, and even re-engage inactive customers.\n\nForget to wash your comforter for a few months? SLB can send a friendly reminder. Haven’t heard from a regular lately? SLB makes it easy to reach out and bring them back.\n\nWith trust, insights, and automation — SLB doesn’t just help you run your business. It helps you grow it.",
    image: "https://via.placeholder.com/600x300?text=Grow+Your+Business",
  },
];


const LearnMore = () => (
  <Box maxW="6xl" mx="auto" p={6}>
    <Heading as="h1" size="2xl" textAlign="center" mb={8}>
      Learn More About Smart Laundry Basket
    </Heading>
    <SimpleGrid columns={{ base: 1 }} spacing={12}>
      {features.map((feature, index) => (
        <VStack
          key={index}
          spacing={4}
          align="start"
          bg="gray.50"
          p={6}
          borderRadius="lg"
          boxShadow="md"
        >
          <Image src={feature.image} alt={feature.title} borderRadius="md" />
          <Heading as="h2" size="lg">{feature.title}</Heading>
          <Text fontSize="md" color="gray.700" whiteSpace="pre-line">
            {feature.description}
          </Text>
        </VStack>
      ))}
    </SimpleGrid>
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
    <a href="/get-started">
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

export default LearnMore;
