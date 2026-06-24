import React from 'react';
import {
  Box, Container, Heading, Text, Button, VStack, HStack, SimpleGrid, Icon,
  Flex, Badge, List, ListItem, ListIcon, Accordion, AccordionItem,
  AccordionButton, AccordionPanel, AccordionIcon
} from '@chakra-ui/react';
import { FiCheck, FiTruck, FiSmartphone, FiClock, FiDollarSign, FiShield,
  FiUsers, FiBarChart2, FiMail, FiCamera, FiArrowRight } from 'react-icons/fi';

const ProductWebsite = () => {
  return (
    <Box bg="white" minH="100vh">
      {/* Sticky Navbar */}
      <Box as="nav" position="sticky" top={0} zIndex={100} bg="white" borderBottom="1px solid" borderColor="gray.100" boxShadow="sm">
        <Container maxW="1200px">
          <Flex py={3} align="center" justify="space-between">
            <HStack spacing={2}>
              <Box bg="blue.600" color="white" px={2} py={1} borderRadius="md" fontWeight="800" fontSize="sm">SLB</Box>
              <Text fontWeight="700" fontSize="lg" color="gray.800">Smart Laundry Basket</Text>
            </HStack>
            <HStack spacing={6} display={{ base: 'none', md: 'flex' }}>
              <Text as="a" href="#how-it-works" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>How It Works</Text>
              <Text as="a" href="#features" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>Features</Text>
              <Text as="a" href="#pricing" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>Pricing</Text>
              <Text as="a" href="#faq" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>FAQ</Text>
            </HStack>
            <Button as="a" href="/onboard" size="sm" colorScheme="blue" borderRadius="full" px={6}>Get Started Free</Button>
          </Flex>
        </Container>
      </Box>

      {/* Hero Section */}
      <Box position="relative" overflow="hidden" py={{ base: 20, md: 28 }}>
        {/* Video Background */}
        <Box as="video" autoPlay muted loop playsInline
          position="absolute" top="0" left="0" w="100%" h="100%"
          objectFit="cover" zIndex="0">
          <source src="https://laundry-images-store-prod.s3.us-east-1.amazonaws.com/15380072_3840_2160_30fps.mp4" type="video/mp4" />
        </Box>
        {/* Dark overlay for readability */}
        <Box position="absolute" top="0" left="0" w="100%" h="100%"
          bg="linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.7) 100%)" zIndex="1" />

        <Container maxW="800px" textAlign="center" position="relative" zIndex="2">
          <VStack spacing={6}>
            <Badge bg="whiteAlpha.200" color="white" px={4} py={1} borderRadius="full" fontSize="xs" fontWeight="600">
              The platform that puts money back in your pocket
            </Badge>
            <Heading fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }} color="white" lineHeight="shorter" fontWeight="800"
              textShadow="0 2px 30px rgba(0,0,0,0.5)">
              Stop Giving Away 25% of Every Load
            </Heading>
            <Text fontSize={{ base: 'md', md: 'lg' }} color="white" maxW="650px" lineHeight="tall" fontWeight="500"
              textShadow="0 1px 10px rgba(0,0,0,0.4)">
              Other laundry platforms take a cut of every transaction. Smart Laundry Basket charges a flat $149/mo — and we never touch your payments. Customers pay directly to YOUR Stripe account, money goes straight to YOUR bank. Free until you hit $3K/month.
            </Text>
            <HStack spacing={4} pt={2} flexWrap="wrap" justify="center">
              <Button as="a" href="/onboard" size="lg" colorScheme="blue" borderRadius="full" px={8} boxShadow="lg"
                _hover={{ transform: 'translateY(-2px)', boxShadow: 'xl' }} rightIcon={<FiArrowRight />}>
                Start Free — 2 Min Setup
              </Button>
              <Button as="a" href="#how-it-works" size="lg" variant="outline" borderColor="whiteAlpha.600" color="white" borderRadius="full" px={8}
                _hover={{ bg: 'whiteAlpha.200' }}>
                See How It Works
              </Button>
            </HStack>
            <HStack spacing={6} pt={4} color="whiteAlpha.800" fontSize="sm" flexWrap="wrap" justify="center">
              <HStack><Icon as={FiCheck} color="green.300" /><Text>No setup fees</Text></HStack>
              <HStack><Icon as={FiCheck} color="green.300" /><Text>No contracts</Text></HStack>
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
              <Badge colorScheme="yellow" px={3} py={1} borderRadius="full">The Math Is Simple</Badge>
              <Heading fontSize={{ base: '2xl', md: '4xl' }}>Keep 100% of Your Transaction Revenue</Heading>
            </VStack>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} w="100%">
              {/* Other Platforms */}
              <Box bg="red.900" borderRadius="2xl" p={8} border="1px solid" borderColor="red.700" opacity={0.9}>
                <VStack spacing={4} align="stretch">
                  <Text fontWeight="700" fontSize="lg" color="red.200">With Other Platforms</Text>
                  <Box bg="red.800" borderRadius="lg" p={4}>
                    <Text fontSize="sm" color="red.200">If you process <strong>$8,000/mo</strong></Text>
                    <Text fontSize="sm" color="red.200">and they take <strong>25%</strong>...</Text>
                    <Text fontSize="2xl" fontWeight="800" color="red.300" mt={2}>-$2,000/mo</Text>
                    <Text fontSize="sm" color="red.300">That's $24,000/year gone.</Text>
                  </Box>
                </VStack>
              </Box>

              {/* Smart Laundry Basket */}
              <Box bg="green.900" borderRadius="2xl" p={8} border="1px solid" borderColor="green.700">
                <VStack spacing={4} align="stretch">
                  <Text fontWeight="700" fontSize="lg" color="green.200">With Smart Laundry Basket</Text>
                  <Box bg="green.800" borderRadius="lg" p={4}>
                    <Text fontSize="sm" color="green.200">You pay a flat</Text>
                    <Text fontSize="2xl" fontWeight="800" color="green.300">$149/mo</Text>
                    <Text fontSize="sm" color="green.200" mt={2}>You save <strong>$1,851/mo</strong> ($22,212/year)</Text>
                  </Box>
                </VStack>
              </Box>
            </SimpleGrid>

            <Box bg="whiteAlpha.100" borderRadius="2xl" px={8} py={6} border="1px solid" borderColor="whiteAlpha.200">
              <Text fontSize="sm" color="gray.400" mb={1}>Average annual savings</Text>
              <Heading fontSize={{ base: '3xl', md: '5xl' }} color="green.300">Save $22,000+ per year</Heading>
            </Box>
          </VStack>
        </Container>
      </Box>

      {/* Features Grid */}
      <Box id="features" py={{ base: 16, md: 20 }}>
        <Container maxW="1200px">
          <VStack spacing={4} textAlign="center" mb={12}>
            <Badge colorScheme="blue" px={3} py={1} borderRadius="full">Features</Badge>
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Everything You Need. Nothing You Don't.</Heading>
            <Text color="gray.600" maxW="600px" fontSize="lg">One platform replaces your POS, website, CRM, and marketing tools.</Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={8}>
            {[
              { icon: FiDollarSign, title: 'Quick POS', desc: 'Tap-to-order checkout for walk-ins. Card, cash, or terminal. Print tickets instantly.', color: 'green' },
              { icon: FiTruck, title: 'Pickup & Delivery', desc: 'Scheduled routes or instant Uber pickups. Real-time tracking for customers.', color: 'blue' },
              { icon: FiCamera, title: 'AI Garment Tracking', desc: 'Photo-based item recognition. Complete transparency. Fewer disputes.', color: 'purple' },
              { icon: FiSmartphone, title: 'Customer Portal', desc: 'Branded website with online ordering, payments, and order tracking.', color: 'orange' },
              { icon: FiBarChart2, title: 'Dashboard & Analytics', desc: 'Revenue trends, customer insights, employee performance at a glance.', color: 'teal' },
              { icon: FiMail, title: 'Automated Marketing', desc: 'Win-back campaigns, smart reminders, holiday promos on autopilot.', color: 'pink' },
              { icon: FiUsers, title: 'Customer CRM', desc: 'Full history, preferences, recurring schedules, and loyalty tracking.', color: 'cyan' },
              { icon: FiClock, title: 'Recurring Orders', desc: 'Customers set it and forget it. You get predictable, steady revenue.', color: 'yellow' },
              { icon: FiShield, title: 'Direct Payments', desc: 'Your Stripe, your bank account. We never touch your money — payments go straight from customer to you.', color: 'red' },
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

      {/* How It Works */}
      <Box id="how-it-works" py={{ base: 16, md: 20 }} bg="gray.50">
        <Container maxW="900px">
          <VStack spacing={4} textAlign="center" mb={12}>
            <Badge colorScheme="green" px={3} py={1} borderRadius="full">Simple Onboarding</Badge>
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Live in 2 Minutes. Seriously.</Heading>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={10}>
            {[
              { step: '1', title: 'Sign Up', desc: '2 minutes. Just your business info — name, address, services. That\'s it.' },
              { step: '2', title: 'Go Live', desc: 'Your branded website, customer portal, and POS are ready instantly.' },
              { step: '3', title: 'Grow', desc: 'Take orders from day one. We handle the tech so you can focus on laundry.' },
            ].map((s) => (
              <VStack key={s.step} spacing={4} textAlign="center">
                <Box bg="blue.500" color="white" w="56px" h="56px" borderRadius="full" display="flex" alignItems="center" justifyContent="center" fontSize="xl" fontWeight="800">
                  {s.step}
                </Box>
                <Text fontWeight="700" fontSize="lg">{s.title}</Text>
                <Text color="gray.600" fontSize="sm">{s.desc}</Text>
              </VStack>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      {/* Testimonials */}
      {/* TODO: Replace these placeholder testimonials with real customer testimonials */}
      <Box py={{ base: 16, md: 20 }}>
        <Container maxW="1000px">
          <VStack spacing={4} textAlign="center" mb={12}>
            <Badge colorScheme="purple" px={3} py={1} borderRadius="full">What Owners Say</Badge>
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Laundromat Owners Love It</Heading>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8}>
            {[
              { name: 'Marcus Johnson', location: 'Austin, TX', quote: 'We were paying $700/mo in platform fees. Switched to SLB and now we keep all of it. The setup took less time than my morning coffee.' },
              { name: 'Patricia Reeves', location: 'Round Rock, TX', quote: 'I\'m not tech-savvy at all, but I had my website and POS running in under 5 minutes. My customers love the pickup scheduling.' },
              { name: 'David Chen', location: 'Cedar Park, TX', quote: 'The flat fee is a game-changer. As our volume grew, we were losing more and more to percentage cuts. Now $149 is $149 whether we do $5K or $15K.' },
            ].map((t) => (
              <Box key={t.name} p={6} borderRadius="xl" bg="gray.50" border="1px solid" borderColor="gray.100">
                <Text color="gray.700" fontSize="sm" mb={4} fontStyle="italic">"{t.quote}"</Text>
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
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>No Percentage Cuts. Ever.</Heading>
            <Text color="gray.600" fontSize="lg" maxW="550px">
              Use the full platform free. Only pay $149/mo once your revenue exceeds $3,000/month.
            </Text>

            <Flex direction={{ base: 'column', md: 'row' }} gap={6} w="100%" justify="center" pt={4}>
              {/* Free Tier */}
              <Box bg="white" borderRadius="2xl" p={8} boxShadow="md" flex={1} maxW="350px" border="2px solid" borderColor="green.200">
                <Badge colorScheme="green" mb={4}>FREE</Badge>
                <Heading fontSize="4xl" mb={2}>$0</Heading>
                <Text color="gray.500" mb={6}>Up to $3,000/mo in revenue</Text>
                <List spacing={2} textAlign="left" mb={6}>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Full POS system</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Branded customer website</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Pickup & delivery management</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Recurring orders</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Stripe payments</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Dashboard & analytics</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Email support</ListItem>
                </List>
                <Button as="a" href="/onboard" colorScheme="green" w="100%" borderRadius="full" size="lg">Start Free</Button>
              </Box>

              {/* Growth Tier */}
              <Box bg="white" borderRadius="2xl" p={8} boxShadow="md" flex={1} maxW="350px" border="2px solid" borderColor="blue.300" position="relative">
                <Badge colorScheme="blue" mb={4}>GROWTH</Badge>
                <Heading fontSize="4xl" mb={2}>$149<Text as="span" fontSize="lg" color="gray.400">/mo</Text></Heading>
                <Text color="gray.500" mb={6}>When revenue exceeds $3K/mo</Text>
                <List spacing={2} textAlign="left" mb={6}>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Everything in Free</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />AI Garment Tracking</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Automated marketing campaigns</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Uber delivery integration</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Multi-location support</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Priority support</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Custom domain</ListItem>
                </List>
                <Button as="a" href="/onboard" colorScheme="blue" w="100%" borderRadius="full" size="lg">Get Started</Button>
              </Box>
            </Flex>

            <Text fontSize="sm" color="gray.500" pt={4}>No contracts. Cancel anytime. Your data is always yours.</Text>
          </VStack>
        </Container>
      </Box>

      {/* FAQ */}
      <Box id="faq" py={{ base: 16, md: 20 }}>
        <Container maxW="700px">
          <VStack spacing={4} textAlign="center" mb={10}>
            <Badge colorScheme="gray" px={3} py={1} borderRadius="full">FAQ</Badge>
            <Heading fontSize={{ base: '2xl', md: '3xl' }}>Common Questions</Heading>
          </VStack>

          <Accordion allowMultiple>
            {[
              { q: 'What happens if I cancel?', a: 'You can cancel anytime — no penalties, no contracts. Your data stays yours and we\'ll help you export everything.' },
              { q: 'Do you take a cut of my transactions?', a: 'Never. We don\'t even process your payments. You connect your own Stripe account and customer payments go directly to YOUR bank. We charge a flat $149/mo (free under $3K/mo) and never touch your revenue.' },
              { q: 'What\'s included in the $149/mo?', a: 'Everything — POS, customer portal, website, pickup & delivery management, AI tracking, automated marketing, CRM, analytics, and priority support. No add-ons or hidden fees.' },
              { q: 'How long does setup take?', a: 'About 2 minutes. Enter your business info, set your services and pricing, and you\'re live. Your website and POS are ready immediately.' },
              { q: 'Can I use my own domain?', a: 'Yes. Growth plan customers can connect their own custom domain (e.g., www.yourlaundry.com) to their customer portal.' },
              { q: 'Do I need special hardware?', a: 'No. Use any device with a browser — phone, tablet, or computer. For card-present payments, we support standard Stripe terminals.' },
            ].map((item, i) => (
              <AccordionItem key={i} border="none" mb={3}>
                <AccordionButton bg="gray.50" borderRadius="xl" py={4} px={6} _hover={{ bg: 'gray.100' }} _expanded={{ bg: 'blue.50' }}>
                  <Text flex="1" textAlign="left" fontWeight="600" fontSize="md">{item.q}</Text>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel py={4} px={6} color="gray.600" fontSize="sm" lineHeight="tall">
                  {item.a}
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
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Ready to Keep More of What You Earn?</Heading>
            <Text fontSize="lg" opacity={0.9}>
              Join laundromat owners saving thousands per year. Setup takes 2 minutes. No credit card required.
            </Text>
            <HStack spacing={4} flexWrap="wrap" justify="center">
              <Button as="a" href="/onboard" size="lg" bg="white" color="blue.600" borderRadius="full" px={8}
                _hover={{ bg: 'gray.100', transform: 'translateY(-2px)' }} boxShadow="lg">
                Start Free Now
              </Button>
              <Button as="a" href="https://calendar.app.google/Gu7fDZWRHYtrZK5H8" target="_blank" rel="noopener noreferrer"
                size="lg" variant="outline" borderColor="whiteAlpha.600" color="white" borderRadius="full" px={8}
                _hover={{ bg: 'whiteAlpha.200' }}>
                Book a Demo
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
              <Text fontSize="sm">Built by laundromat owners, for laundromat owners.</Text>
              <Text fontSize="xs">© 2024 Smart Laundry Basket. All rights reserved.</Text>
            </VStack>
            <HStack spacing={8} fontSize="sm">
              <VStack align="flex-start" spacing={2}>
                <Text fontWeight="bold" color="white">Product</Text>
                <Text as="a" href="#features" _hover={{ color: 'white' }}>Features</Text>
                <Text as="a" href="#pricing" _hover={{ color: 'white' }}>Pricing</Text>
                <Text as="a" href="#how-it-works" _hover={{ color: 'white' }}>How It Works</Text>
              </VStack>
              <VStack align="flex-start" spacing={2}>
                <Text fontWeight="bold" color="white">Company</Text>
                <Text as="a" href="/onboard" _hover={{ color: 'white' }}>Get Started</Text>
                <Text as="a" href="https://calendar.app.google/Gu7fDZWRHYtrZK5H8" target="_blank" _hover={{ color: 'white' }}>Book Demo</Text>
                <Text as="a" href="mailto:roundrocklaundry@gmail.com" _hover={{ color: 'white' }}>Contact</Text>
              </VStack>
            </HStack>
          </Flex>
        </Container>
      </Box>
    </Box>
  );
};

export default ProductWebsite;
