import React, { useEffect, useState } from 'react';
import {
  Box, Container, Heading, Text, Button, VStack, HStack, SimpleGrid, Icon,
  Flex, Badge, List, ListItem, ListIcon, Accordion, AccordionItem,
  AccordionButton, AccordionPanel, AccordionIcon
} from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import { FiCheck, FiTruck, FiSmartphone, FiClock, FiDollarSign, FiShield,
  FiUsers, FiBarChart2, FiMail, FiCamera, FiArrowRight, FiMessageCircle,
  FiRepeat, FiGift, FiTarget, FiZap, FiMapPin, FiStar } from 'react-icons/fi';
import ChatWidget from '../Components/Chat/ChatWidget';

// ── FAQ Data (used for rendering AND for JSON-LD structured data) ──────────
const FAQ_DATA = [
  { q: 'Is it really free?', a: 'Yes. The source code is open source — you can clone it, deploy it on your own server, and use it forever at no cost. The $49/mo managed plan is for people who don\'t want to deal with servers, updates, and backups.' },
  { q: 'What do I get for $49/month?', a: 'We host the entire platform for you — your customer portal, admin dashboard, API, database. We handle updates, security patches, daily backups, SSL, custom domain setup, and priority support. You just focus on your business.' },
  { q: 'Do you take a cut of my transactions?', a: 'Never. You connect your own Stripe account and customer payments go directly to YOUR bank. We charge $49/mo flat (or $0 if you self-host) and never touch your revenue.' },
  { q: 'What kind of businesses can use this?', a: 'Any service business — laundry, cleaning, detailing, pet grooming, lawn care, tutoring, and more. If customers book a service and you fulfill it, this platform handles the workflow.' },
  { q: 'How does SMS marketing work?', a: 'The platform includes built-in SMS marketing campaigns. Send targeted messages to customers based on their engagement stage — new signups, dormant customers, or loyal regulars. Campaigns are configurable per location with custom promo codes and message templates.' },
  { q: 'What is abandoned cart recovery?', a: 'When a customer starts scheduling a pickup but doesn\'t complete the order, the system automatically sends a follow-up SMS with a promo code to bring them back. You configure the timing, message, and discount — the platform handles the rest.' },
  { q: 'How does the referral program work?', a: 'Each customer gets a unique referral code. When they share it and a friend signs up and places an order, both the referrer and referee earn credit toward future orders. You configure reward amounts, expiration, and monthly caps from the admin dashboard.' },
  { q: 'Can I customize the code?', a: 'Absolutely. It\'s open source. Fork the repo, modify anything, add features specific to your business. If you\'re on the managed plan, we can discuss custom modifications too.' },
  { q: 'What if I start self-hosted and want to switch to managed?', a: 'Easy. Sign up for the managed plan and we\'ll help migrate your data. Works the other way too — you can always export and self-host.' },
  { q: 'Do I need special hardware?', a: 'No. Use any device with a browser — phone, tablet, or computer. For card-present payments, we support standard Stripe terminals.' },
  { q: 'We have several locations — do we set up each one individually?', a: 'Yes, each location is set up on its own, and you can group them under one company for a combined view. When you set up your first location, choose "Create a company" and you\'ll get a join code. For each additional location, onboard it and choose "Join a company" with that code. A company admin login then gives you a consolidated dashboard across all locations.' },
  { q: 'How are orders separated by location?', a: 'Automatically. Every order is tied to a specific location, and each store\'s admin/POS sees only its own orders, customers, employees, and reports — locations never mix. At the company level, those roll up into a consolidated view with per-location breakdowns alongside company-wide totals.' },
  { q: 'Do we have to offer pickup & delivery, or can we run standard in-store drop-off?', a: 'Pickup & delivery is optional. You can run entirely on walk-in / in-store drop-off using the Quick POS — an in-store order needs only the items, no address or scheduling. Delivery is opt-in per order and defaults to your own driver. Third-party delivery (Uber) is an optional add-on.' },
  { q: 'Do we have to link a website to take payments?', a: 'No. In-store payments are handled at the POS independently — Cash, Card, Terminal, and Pay Later. Cash and Pay Later work with zero payment setup; Card and Terminal just need you to connect your own Stripe account (per location). The customer website is simply an optional online-ordering channel.' },
  { q: 'Is there an AI chat for my customers?', a: 'Yes. Every tenant site includes an AI-powered chat widget that answers customer questions about your services, pricing, hours, and delivery areas using your actual business data. If the customer needs a human, it escalates to your admin chat inbox.' },
  { q: 'How do automated customer reminders work?', a: 'The engagement engine automatically segments customers into stages — new, active, dormant, and at-risk. It sends personalized SMS reminders with configurable promo codes at the right time to re-engage lapsed customers and retain active ones. You set the rules, it runs on autopilot.' },
];

// JSON-LD FAQPage structured data for SEO
const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_DATA.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  })),
};

const ProductWebsite = () => {
  // Generate a stable visitor ID for the chat widget
  const [visitorId] = useState(() => {
    const stored = localStorage.getItem('slb_prospect_id');
    if (stored) return stored;
    const id = `prospect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('slb_prospect_id', id);
    return id;
  });

  useEffect(() => {
    document.title = 'Smart Laundry Basket — Open Source Platform for Service Businesses';
  }, []);

  return (
    <Box bg="white" minH="100vh">
      {/* SEO Head — JSON-LD FAQPage + meta */}
      <Helmet>
        <meta name="description" content="Open source platform for laundry, cleaning, and service businesses. Customer bookings, POS, pickup & delivery, AI tracking, SMS marketing, referral programs. Self-host free or managed for $49/mo." />
        <link rel="canonical" href="https://smartlaundrybasket.ai" />
        <script type="application/ld+json">
          {JSON.stringify(FAQ_JSON_LD)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Smart Laundry Basket',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Self-hosted (free forever)' },
              { '@type': 'Offer', price: '49', priceCurrency: 'USD', description: 'Managed hosting', billingIncrement: 'P1M' },
            ],
            description: 'Open source platform for service businesses — laundry, cleaning, detailing. Handles bookings, POS, pickup & delivery, AI item tracking, SMS marketing, referral programs, and payments.',
            url: 'https://smartlaundrybasket.ai',
          })}
        </script>
      </Helmet>

      {/* Sticky Navbar */}
      <Box as="nav" position="sticky" top={0} zIndex={100} bg="white" borderBottom="1px solid" borderColor="gray.100" boxShadow="sm">
        <Container maxW="1200px">
          <Flex py={3} align="center" justify="space-between">
            <HStack spacing={2}>
              <Box bg="blue.600" color="white" px={2} py={1} borderRadius="md" fontWeight="800" fontSize="sm">SLB</Box>
              <Text fontWeight="700" fontSize="lg" color="gray.800">Smart Laundry Basket</Text>
            </HStack>
            <HStack spacing={6} display={{ base: 'none', md: 'flex' }}>
              <Text as="a" href="#features" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>Features</Text>
              <Text as="a" href="#marketing" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>Marketing</Text>
              <Text as="a" href="#how-it-works" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>How It Works</Text>
              <Text as="a" href="#pricing" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>Pricing</Text>
              <Text as="a" href="#faq" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>FAQ</Text>
            </HStack>
            <Button as="a" href="/onboard" size="sm" colorScheme="blue" borderRadius="full" px={6}>Get Started</Button>
          </Flex>
        </Container>
      </Box>

      {/* Hero Section */}
      <Box position="relative" overflow="hidden" py={{ base: 20, md: 28 }}>
        <Box as="video" autoPlay muted loop playsInline
          position="absolute" top="0" left="0" w="100%" h="100%"
          objectFit="cover" zIndex="0">
          <source src="https://laundry-images-store-prod.s3.us-east-1.amazonaws.com/15380072_3840_2160_30fps.mp4" type="video/mp4" />
        </Box>
        <Box position="absolute" top="0" left="0" w="100%" h="100%"
          bg="linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.7) 100%)" zIndex="1" />

        <Container maxW="800px" textAlign="center" position="relative" zIndex="2">
          <VStack spacing={6}>
            <Badge bg="whiteAlpha.200" color="white" px={4} py={1} borderRadius="full" fontSize="xs" fontWeight="600">
              Open Source | Self-Host Free | Managed $49/mo
            </Badge>
            <Heading as="h1" fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }} color="white" lineHeight="shorter" fontWeight="800"
              textShadow="0 2px 30px rgba(0,0,0,0.5)">
              The Open Source Platform for Service Businesses.
            </Heading>
            <Text fontSize={{ base: 'md', md: 'lg' }} color="white" maxW="650px" lineHeight="tall" fontWeight="500"
              textShadow="0 1px 10px rgba(0,0,0,0.4)">
              Customer booking, POS, scheduling, delivery, AI tracking, SMS marketing, referral programs — all in one. Free forever or $49/month managed.
            </Text>
            <HStack spacing={4} pt={2} flexWrap="wrap" justify="center">
              <Button as="a" href="/onboard" size="lg" colorScheme="blue" borderRadius="full" px={8} boxShadow="lg"
                _hover={{ transform: 'translateY(-2px)', boxShadow: 'xl' }} rightIcon={<FiArrowRight />}>
                Get Started Free
              </Button>
              <Button as="a" href="https://github.com/sureshalluru/smart_laundry" target="_blank" rel="noopener noreferrer" size="lg" variant="outline" borderColor="whiteAlpha.600" color="white" borderRadius="full" px={8}
                _hover={{ bg: 'whiteAlpha.200' }}>
                View Source on GitHub
              </Button>
            </HStack>
            <HStack spacing={6} pt={4} color="whiteAlpha.800" fontSize="sm" flexWrap="wrap" justify="center">
              <HStack><Icon as={FiCheck} color="green.300" /><Text>100% open source</Text></HStack>
              <HStack><Icon as={FiCheck} color="green.300" /><Text>Self-host free forever</Text></HStack>
              <HStack><Icon as={FiCheck} color="green.300" /><Text>Payments go direct to you</Text></HStack>
            </HStack>
          </VStack>
        </Container>
      </Box>

      {/* Problem/Solution Section */}
      <Box py={{ base: 16, md: 20 }} bg="gray.900" color="white">
        <Container maxW="1000px">
          <VStack spacing={10} textAlign="center">
            <VStack spacing={3}>
              <Badge colorScheme="yellow" px={3} py={1} borderRadius="full">Why Open Source</Badge>
              <Heading as="h2" fontSize={{ base: '2xl', md: '4xl' }}>Your Business. Your Software. Your Choice.</Heading>
            </VStack>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} w="100%">
              <Box bg="red.900" borderRadius="2xl" p={8} border="1px solid" borderColor="red.700" opacity={0.9}>
                <VStack spacing={4} align="stretch">
                  <Text fontWeight="700" fontSize="lg" color="red.200">With SaaS Platforms</Text>
                  <Box bg="red.800" borderRadius="lg" p={4}>
                    <Text fontSize="sm" color="red.200">$200-500/mo locked-in subscriptions</Text>
                    <Text fontSize="sm" color="red.200">Your data held hostage. No customization. No control.</Text>
                    <Text fontSize="2xl" fontWeight="800" color="red.300" mt={2}>$3,600+/year</Text>
                    <Text fontSize="sm" color="red.300">And they can raise prices anytime.</Text>
                  </Box>
                </VStack>
              </Box>

              <Box bg="green.900" borderRadius="2xl" p={8} border="1px solid" borderColor="green.700">
                <VStack spacing={4} align="stretch">
                  <Text fontWeight="700" fontSize="lg" color="green.200">With Smart Laundry Basket</Text>
                  <Box bg="green.800" borderRadius="lg" p={4}>
                    <Text fontSize="sm" color="green.200">Self-host free forever, or let us run it for</Text>
                    <Text fontSize="2xl" fontWeight="800" color="green.300">$49/mo</Text>
                    <Text fontSize="sm" color="green.200" mt={2}>Open source. Full control. <strong>No vendor lock-in.</strong></Text>
                  </Box>
                </VStack>
              </Box>
            </SimpleGrid>
          </VStack>
        </Container>
      </Box>

      {/* Core Features Grid */}
      <Box id="features" py={{ base: 16, md: 20 }}>
        <Container maxW="1200px">
          <VStack spacing={4} textAlign="center" mb={12}>
            <Badge colorScheme="blue" px={3} py={1} borderRadius="full">Features</Badge>
            <Heading as="h2" fontSize={{ base: '2xl', md: '4xl' }}>Everything a Service Business Needs.</Heading>
            <Text color="gray.600" maxW="600px" fontSize="lg">One platform for bookings, operations, payments, and customer management.</Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={8}>
            {[
              { icon: FiDollarSign, title: 'Quick POS', desc: 'Tap-to-order checkout for walk-ins. Card, cash, or terminal. Works on any device.', color: 'green' },
              { icon: FiTruck, title: 'Pickup & Delivery', desc: 'Scheduled routes, driver tracking, or Uber integration. Real-time updates for customers.', color: 'blue' },
              { icon: FiCamera, title: 'AI Item Tracking', desc: 'Photo-based verification and garment counting. Complete transparency. Fewer disputes.', color: 'purple' },
              { icon: FiSmartphone, title: 'Customer Booking Portal', desc: 'Branded website where customers book services, pay, and track orders in real time.', color: 'orange' },
              { icon: FiBarChart2, title: 'Dashboard & Analytics', desc: 'Revenue trends, customer insights, employee performance, and expense tracking at a glance.', color: 'teal' },
              { icon: FiRepeat, title: 'Recurring Subscriptions', desc: 'Customers subscribe to weekly or bi-weekly service. Auto-charge on schedule. Predictable revenue.', color: 'yellow' },
              { icon: FiUsers, title: 'Customer CRM', desc: 'Full history, preferences, engagement stage, pricing overrides, and commercial account support.', color: 'cyan' },
              { icon: FiShield, title: 'Direct Payments', desc: 'Your Stripe, your bank account. We never touch your money — zero platform fees on transactions.', color: 'red' },
              { icon: FiMapPin, title: 'Multi-Location Management', desc: 'Group locations under one company. Consolidated reporting with per-location drill-down.', color: 'pink' },
            ].map((feature) => (
              <Box key={feature.title} p={6} borderRadius="xl" border="1px solid" borderColor="gray.100"
                _hover={{ boxShadow: 'lg', transform: 'translateY(-4px)' }} transition="all 0.3s">
                <Box bg={`${feature.color}.50`} w="50px" h="50px" borderRadius="lg" display="flex" alignItems="center" justifyContent="center" mb={4}>
                  <Icon as={feature.icon} boxSize={6} color={`${feature.color}.500`} />
                </Box>
                <Text fontWeight="700" fontSize="lg" mb={2}>{feature.title}</Text>
                <Text color="gray.600" fontSize="sm">{feature.desc}</Text>
              </Box>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      {/* Marketing & Engagement Section — NEW */}
      <Box id="marketing" py={{ base: 16, md: 20 }} bg="gray.50">
        <Container maxW="1200px">
          <VStack spacing={4} textAlign="center" mb={12}>
            <Badge colorScheme="purple" px={3} py={1} borderRadius="full">Growth Tools</Badge>
            <Heading as="h2" fontSize={{ base: '2xl', md: '4xl' }}>Built-In Marketing That Runs on Autopilot.</Heading>
            <Text color="gray.600" maxW="650px" fontSize="lg">
              Stop losing customers to inactivity. Automated SMS campaigns, referral rewards, and abandoned cart recovery bring them back without you lifting a finger.
            </Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={8}>
            {/* SMS Marketing */}
            <Box p={8} borderRadius="2xl" bg="white" border="1px solid" borderColor="gray.200" boxShadow="sm">
              <HStack mb={4}>
                <Box bg="purple.50" p={3} borderRadius="lg">
                  <Icon as={FiMail} boxSize={6} color="purple.500" />
                </Box>
                <Heading as="h3" fontSize="xl">SMS Marketing Campaigns</Heading>
              </HStack>
              <Text color="gray.600" mb={4}>
                Send targeted SMS messages based on customer behavior. Segment by engagement stage — new signups, active customers, dormant accounts, or at-risk churners.
              </Text>
              <List spacing={2}>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Custom message templates with personalization tokens</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Attach promo codes to boost conversion</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Per-location SMS toggle and usage tracking</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Holiday and seasonal campaign templates</ListItem>
              </List>
            </Box>

            {/* Abandoned Cart Recovery */}
            <Box p={8} borderRadius="2xl" bg="white" border="1px solid" borderColor="gray.200" boxShadow="sm">
              <HStack mb={4}>
                <Box bg="orange.50" p={3} borderRadius="lg">
                  <Icon as={FiTarget} boxSize={6} color="orange.500" />
                </Box>
                <Heading as="h3" fontSize="xl">Abandoned Cart Recovery</Heading>
              </HStack>
              <Text color="gray.600" mb={4}>
                Customers who start booking but don't complete get an automatic follow-up. A well-timed SMS with a discount code recovers orders you'd otherwise lose.
              </Text>
              <List spacing={2}>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Auto-detects incomplete signup flows</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Configurable delay timing and promo codes</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Tracks open rates and conversion</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Works for both new and returning customers</ListItem>
              </List>
            </Box>

            {/* Customer Engagement Engine */}
            <Box p={8} borderRadius="2xl" bg="white" border="1px solid" borderColor="gray.200" boxShadow="sm">
              <HStack mb={4}>
                <Box bg="teal.50" p={3} borderRadius="lg">
                  <Icon as={FiZap} boxSize={6} color="teal.500" />
                </Box>
                <Heading as="h3" fontSize="xl">Automated Re-Engagement</Heading>
              </HStack>
              <Text color="gray.600" mb={4}>
                The engagement engine segments customers automatically and sends the right message at the right time — dormant win-back, weekly reminders, or loyalty nudges.
              </Text>
              <List spacing={2}>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Dormant customer win-back sequences</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Configurable reminder intervals (weekly, monthly)</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Stage-based messaging (new, active, at-risk)</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Runs fully on autopilot — set it and forget it</ListItem>
              </List>
            </Box>

            {/* Referral Program */}
            <Box p={8} borderRadius="2xl" bg="white" border="1px solid" borderColor="gray.200" boxShadow="sm">
              <HStack mb={4}>
                <Box bg="green.50" p={3} borderRadius="lg">
                  <Icon as={FiGift} boxSize={6} color="green.500" />
                </Box>
                <Heading as="h3" fontSize="xl">Referral Program</Heading>
              </HStack>
              <Text color="gray.600" mb={4}>
                Turn happy customers into your best sales channel. Each customer gets a unique code — when friends sign up and order, both earn credit.
              </Text>
              <List spacing={2}>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Unique referral codes per customer</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Configurable reward amounts for referrer and referee</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Monthly cap and credit expiration controls</ListItem>
                <ListItem fontSize="sm" color="gray.700"><ListIcon as={FiCheck} color="green.500" />Community leaderboard to drive engagement</ListItem>
              </List>
            </Box>
          </SimpleGrid>

          {/* Additional marketing features row */}
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} mt={8}>
            <Box p={6} borderRadius="xl" bg="white" border="1px solid" borderColor="gray.100" textAlign="center">
              <Icon as={FiMessageCircle} boxSize={8} color="blue.500" mb={3} />
              <Text fontWeight="700" mb={1}>AI Customer Chat</Text>
              <Text fontSize="sm" color="gray.600">AI answers questions about your services 24/7. Escalates to you when needed.</Text>
            </Box>
            <Box p={6} borderRadius="xl" bg="white" border="1px solid" borderColor="gray.100" textAlign="center">
              <Icon as={FiStar} boxSize={8} color="yellow.500" mb={3} />
              <Text fontWeight="700" mb={1}>Google Review Prompts</Text>
              <Text fontSize="sm" color="gray.600">Automatically ask happy customers for Google reviews after delivery.</Text>
            </Box>
            <Box p={6} borderRadius="xl" bg="white" border="1px solid" borderColor="gray.100" textAlign="center">
              <Icon as={FiClock} boxSize={8} color="purple.500" mb={3} />
              <Text fontWeight="700" mb={1}>Scheduled Notifications</Text>
              <Text fontSize="sm" color="gray.600">Queue emails and SMS for future delivery. Perfect for seasonal promotions.</Text>
            </Box>
          </SimpleGrid>
        </Container>
      </Box>

      {/* How It Works */}
      <Box id="how-it-works" py={{ base: 16, md: 20 }}>
        <Container maxW="900px">
          <VStack spacing={4} textAlign="center" mb={12}>
            <Badge colorScheme="green" px={3} py={1} borderRadius="full">Two Options</Badge>
            <Heading as="h2" fontSize={{ base: '2xl', md: '4xl' }}>Self-Host or Let Us Run It.</Heading>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={10}>
            <VStack spacing={4} textAlign="center" p={6} borderRadius="xl" border="1px solid" borderColor="gray.200" bg="white">
              <Box bg="green.500" color="white" w="56px" h="56px" borderRadius="full" display="flex" alignItems="center" justifyContent="center" fontSize="xl" fontWeight="800">
                A
              </Box>
              <Text fontWeight="700" fontSize="lg">Self-Host (Free)</Text>
              <Text color="gray.600" fontSize="sm">Clone the repo, deploy to your own server. Full control. Customize anything. Community support.</Text>
              <Button as="a" href="https://github.com/sureshalluru/smart_laundry" target="_blank" variant="outline" colorScheme="green" borderRadius="full" size="sm">View on GitHub</Button>
            </VStack>
            <VStack spacing={4} textAlign="center" p={6} borderRadius="xl" border="2px solid" borderColor="blue.300" bg="white" position="relative">
              <Badge position="absolute" top={-3} colorScheme="blue" px={3} py={1} borderRadius="full" fontSize="xs">Most Popular</Badge>
              <Box bg="blue.500" color="white" w="56px" h="56px" borderRadius="full" display="flex" alignItems="center" justifyContent="center" fontSize="xl" fontWeight="800">
                B
              </Box>
              <Text fontWeight="700" fontSize="lg">Managed ($49/mo)</Text>
              <Text color="gray.600" fontSize="sm">We host it, maintain it, update it, back it up. You focus on your business. 2-minute setup.</Text>
              <Button as="a" href="/onboard" colorScheme="blue" borderRadius="full" size="sm">Get Started</Button>
            </VStack>
          </SimpleGrid>
        </Container>
      </Box>

      {/* Use Cases */}
      <Box py={{ base: 16, md: 20 }} bg="gray.50">
        <Container maxW="1000px">
          <VStack spacing={4} textAlign="center" mb={12}>
            <Badge colorScheme="purple" px={3} py={1} borderRadius="full">Use Cases</Badge>
            <Heading as="h2" fontSize={{ base: '2xl', md: '4xl' }}>Built for Service Providers</Heading>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8}>
            {[
              { name: 'Wash & Fold', location: 'Laundry Services', quote: 'Customers schedule pickups online, we process orders, track garments with AI photos, and deliver — all managed from one dashboard.' },
              { name: 'Home Cleaning', location: 'Cleaning Services', quote: 'Clients book recurring cleanings, we assign crews, track completion, and auto-charge. No phone tag, no spreadsheets.' },
              { name: 'Mobile Detailing', location: 'Auto Services', quote: 'Customers pick a package, schedule a slot, we route our detailers and send real-time ETAs. Payment on completion.' },
            ].map((t) => (
              <Box key={t.name} p={6} borderRadius="xl" bg="white" border="1px solid" borderColor="gray.100">
                <Text color="gray.700" fontSize="sm" mb={4}>{t.quote}</Text>
                <Text fontWeight="700" fontSize="sm">{t.name}</Text>
                <Text color="gray.500" fontSize="xs">{t.location}</Text>
              </Box>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      {/* Pricing */}
      <Box id="pricing" py={{ base: 16, md: 20 }} bg="blue.50">
        <Container maxW="800px" textAlign="center">
          <VStack spacing={6}>
            <Badge colorScheme="blue" px={3} py={1} borderRadius="full">Pricing</Badge>
            <Heading as="h2" fontSize={{ base: '2xl', md: '4xl' }}>Free to Use. $49/mo to Not Worry About It.</Heading>
            <Text color="gray.600" fontSize="lg" maxW="550px">
              The software is yours. Self-host it free forever. Or pay $49/month and we handle everything.
            </Text>

            <Flex direction={{ base: 'column', md: 'row' }} gap={6} w="100%" justify="center" pt={4}>
              <Box bg="white" borderRadius="2xl" p={8} boxShadow="md" flex={1} maxW="350px" border="2px solid" borderColor="green.200">
                <Badge colorScheme="green" mb={4}>SELF-HOSTED</Badge>
                <Heading fontSize="4xl" mb={2}>$0</Heading>
                <Text color="gray.500" mb={6}>Free forever. You run it.</Text>
                <List spacing={2} textAlign="left" mb={6}>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Full source code access</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />All features included</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Deploy anywhere you want</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />SMS marketing & referrals included</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Community support</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />No usage limits</ListItem>
                </List>
                <Button as="a" href="https://github.com/sureshalluru/smart_laundry" target="_blank" colorScheme="green" w="100%" borderRadius="full" size="lg" variant="outline">View on GitHub</Button>
              </Box>

              <Box bg="white" borderRadius="2xl" p={8} boxShadow="md" flex={1} maxW="350px" border="2px solid" borderColor="blue.300" position="relative">
                <Badge position="absolute" top={-3} left="50%" transform="translateX(-50%)" colorScheme="blue" px={3} py={1} borderRadius="full" fontSize="xs">Recommended</Badge>
                <Badge colorScheme="blue" mb={4}>MANAGED</Badge>
                <Heading fontSize="4xl" mb={2}>$49<Text as="span" fontSize="lg" color="gray.400">/mo</Text></Heading>
                <Text color="gray.500" mb={6}>We host, maintain, and update it for you</Text>
                <List spacing={2} textAlign="left" mb={6}>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Everything in Self-Hosted</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Hosting & infrastructure</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Automatic updates & patches</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Daily backups</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />SSL & custom domain</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Priority email support</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />2-minute setup — no DevOps needed</ListItem>
                </List>
                <Button as="a" href="/onboard" colorScheme="blue" w="100%" borderRadius="full" size="lg">Get Started</Button>
              </Box>
            </Flex>

            <Text fontSize="sm" color="gray.500" pt={4}>No contracts. No revenue cuts. Cancel anytime. Your data is always yours.</Text>
          </VStack>
        </Container>
      </Box>

      {/* FAQ — SEO-friendly with semantic markup */}
      <Box as="section" id="faq" py={{ base: 16, md: 20 }} itemScope itemType="https://schema.org/FAQPage">
        <Container maxW="700px">
          <VStack spacing={4} textAlign="center" mb={10}>
            <Badge colorScheme="gray" px={3} py={1} borderRadius="full">FAQ</Badge>
            <Heading as="h2" fontSize={{ base: '2xl', md: '3xl' }}>Frequently Asked Questions</Heading>
            <Text color="gray.600" fontSize="md">Everything you need to know about Smart Laundry Basket.</Text>
          </VStack>

          <Accordion allowMultiple>
            {FAQ_DATA.map((item, i) => (
              <AccordionItem key={i} border="none" mb={3} itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                <AccordionButton bg="gray.50" borderRadius="xl" py={4} px={6} _hover={{ bg: 'gray.100' }} _expanded={{ bg: 'blue.50' }}>
                  <Text as="h3" flex="1" textAlign="left" fontWeight="600" fontSize="md" itemProp="name">{item.q}</Text>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel py={4} px={6} color="gray.600" fontSize="sm" lineHeight="tall"
                  itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <Text itemProp="text">{item.a}</Text>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </Container>
      </Box>

      {/* Final CTA */}
      <Box py={{ base: 16, md: 20 }} bg="blue.600" color="white" textAlign="center">
        <Container maxW="700px">
          <VStack spacing={6}>
            <Heading as="h2" fontSize={{ base: '2xl', md: '4xl' }}>Ready to Own Your Platform?</Heading>
            <Text fontSize="lg" opacity={0.9}>
              Open source. No vendor lock-in. Self-host free or let us manage it for $49/mo.
            </Text>
            <HStack spacing={4} flexWrap="wrap" justify="center">
              <Button as="a" href="/onboard" size="lg" bg="white" color="blue.600" borderRadius="full" px={8}
                _hover={{ bg: 'gray.100', transform: 'translateY(-2px)' }} boxShadow="lg">
                Start Managed — $49/mo
              </Button>
              <Button as="a" href="https://github.com/sureshalluru/smart_laundry" target="_blank" rel="noopener noreferrer"
                size="lg" variant="outline" borderColor="whiteAlpha.600" color="white" borderRadius="full" px={8}
                _hover={{ bg: 'whiteAlpha.200' }}>
                View Source Code
              </Button>
            </HStack>
          </VStack>
        </Container>
      </Box>

      {/* Footer */}
      <Box py={10} bg="gray.900" color="gray.400">
        <Container maxW="1200px">
          <Flex direction={{ base: 'column', md: 'row' }} justify="space-between" align={{ base: 'center', md: 'flex-start' }} gap={8}>
            <VStack align={{ base: 'center', md: 'flex-start' }} spacing={2}>
              <HStack>
                <Box bg="blue.500" color="white" px={2} py={1} borderRadius="md" fontWeight="800" fontSize="sm">SLB</Box>
                <Text fontWeight="700" color="white">Smart Laundry Basket</Text>
              </HStack>
              <Text fontSize="sm">Open source platform for service businesses.</Text>
              <Text fontSize="xs">&copy; 2024 Smart Laundry Basket. All rights reserved.</Text>
            </VStack>
            <HStack spacing={8} fontSize="sm">
              <VStack align="flex-start" spacing={2}>
                <Text fontWeight="bold" color="white">Product</Text>
                <Text as="a" href="#features" _hover={{ color: 'white' }}>Features</Text>
                <Text as="a" href="#marketing" _hover={{ color: 'white' }}>Marketing Tools</Text>
                <Text as="a" href="#pricing" _hover={{ color: 'white' }}>Pricing</Text>
                <Text as="a" href="#faq" _hover={{ color: 'white' }}>FAQ</Text>
              </VStack>
              <VStack align="flex-start" spacing={2}>
                <Text fontWeight="bold" color="white">Company</Text>
                <Text as="a" href="/onboard" _hover={{ color: 'white' }}>Get Started</Text>
                <Text as="a" href="https://calendar.app.google/Gu7fDZWRHYtrZK5H8" target="_blank" _hover={{ color: 'white' }}>Book Demo</Text>
                <Text as="a" href="mailto:roundrocklaundry@gmail.com" _hover={{ color: 'white' }}>Contact</Text>
              </VStack>
              <VStack align="flex-start" spacing={2}>
                <Text fontWeight="bold" color="white">Contact</Text>
                <Text fontSize="xs">900 E Palm Valley Blvd</Text>
                <Text fontSize="xs">Ste 1006-1007</Text>
                <Text fontSize="xs">Round Rock, TX 78664</Text>
                <Text as="a" href="tel:5125695939" fontSize="xs" _hover={{ color: 'white' }}>(512) 569-5939</Text>
                <Text as="a" href="mailto:roundrocklaundry@gmail.com" fontSize="xs" _hover={{ color: 'white' }}>roundrocklaundry@gmail.com</Text>
              </VStack>
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/* AI Chat Widget — for prospects to ask about the platform */}
      <ChatWidget
        customerId={visitorId}
        laundryId="platform"
        customerName="Website Visitor"
        customerPhone=""
      />
    </Box>
  );
};

export default ProductWebsite;
