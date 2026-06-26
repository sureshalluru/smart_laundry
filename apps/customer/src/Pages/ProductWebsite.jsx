import React, { useEffect } from 'react';
import {
  Box, Container, Heading, Text, Button, VStack, HStack, SimpleGrid, Icon,
  Flex, Badge, List, ListItem, ListIcon, Accordion, AccordionItem,
  AccordionButton, AccordionPanel, AccordionIcon
} from '@chakra-ui/react';
import { FiCheck, FiTruck, FiSmartphone, FiClock, FiDollarSign, FiShield,
  FiUsers, FiBarChart2, FiMail, FiCamera, FiArrowRight } from 'react-icons/fi';

const ProductWebsite = () => {
  // Set correct page title for the platform marketing page
  useEffect(() => {
    document.title = 'Smart Laundry Basket — The All-in-One Platform for Laundromat Owners';
  }, []);
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
              2-Minute Setup • No Hardware • No Hidden Costs
            </Badge>
            <Heading fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }} color="white" lineHeight="shorter" fontWeight="800"
              textShadow="0 2px 30px rgba(0,0,0,0.5)">
              Run Your Entire Wash & Fold Operation from One Platform.
            </Heading>
            <Text fontSize={{ base: 'md', md: 'lg' }} color="white" maxW="650px" lineHeight="tall" fontWeight="500"
              textShadow="0 1px 10px rgba(0,0,0,0.4)">
              POS, customer website, pickup & delivery, AI garment tracking, route optimization. Set up in 2 minutes. Free until your revenue hits $3K/month — then just $149/month. No contracts. No hardware.
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
                    <Text fontSize="sm" color="red.200">Over <strong>$300/mo</strong> for basic software</Text>
                    <Text fontSize="sm" color="red.200">Plus hardware costs, setup fees, onboarding calls...</Text>
                    <Text fontSize="2xl" fontWeight="800" color="red.300" mt={2}>$4,200+/year</Text>
                    <Text fontSize="sm" color="red.300">And still no AI tracking or free website.</Text>
                  </Box>
                </VStack>
              </Box>

              {/* Smart Laundry Basket */}
              <Box bg="green.900" borderRadius="2xl" p={8} border="1px solid" borderColor="green.700">
                <VStack spacing={4} align="stretch">
                  <Text fontWeight="700" fontSize="lg" color="green.200">With Smart Laundry Basket</Text>
                  <Box bg="green.800" borderRadius="lg" p={4}>
                    <Text fontSize="sm" color="green.200">Everything included at</Text>
                    <Text fontSize="2xl" fontWeight="800" color="green.300">$149/mo</Text>
                    <Text fontSize="sm" color="green.200" mt={2}>POS + AI tracking + website + routing. <strong>No hardware. No hidden fees.</strong></Text>
                  </Box>
                </VStack>
              </Box>
            </SimpleGrid>

            <Box bg="whiteAlpha.100" borderRadius="2xl" px={8} py={6} border="1px solid" borderColor="whiteAlpha.200">
              <Text fontSize="sm" color="gray.400" mb={1}>Save over $2,400/year vs other platforms</Text>
              <Heading fontSize={{ base: '3xl', md: '5xl' }} color="green.300">More Features. Half the Price.</Heading>
            </Box>
          </VStack>
        </Container>
      </Box>

      {/* The Pain — Emotional Problem Story */}
      <Box py={{ base: 16, md: 20 }} bg="white">
        <Container maxW="1000px">
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={10}>
            <VStack align="flex-start" spacing={6}>
              <Badge colorScheme="red" px={3} py={1} borderRadius="full">The Problem</Badge>
              <Heading fontSize={{ base: 'xl', md: '3xl' }} color="gray.800">
                "Where's My Blue Shirt?"
              </Heading>
              <Text color="gray.600" fontSize="md" lineHeight="tall">
                That dreaded phone call. A customer claims something is missing. Your staff checks the paper tickets, 
                the handwritten notes, the memory of last Tuesday's rush. Nothing.
              </Text>
              <Text color="gray.600" fontSize="md" lineHeight="tall">
                One lost garment costs more than money. It costs trust. It costs reviews. It costs sleep.
                Meanwhile, the platform you're paying 25% to doesn't help you prove anything.
              </Text>
              <Text color="gray.700" fontSize="md" fontWeight="600">
                You deserve a system that has your back — not one that takes your money and leaves you guessing.
              </Text>
            </VStack>
            <VStack align="flex-start" spacing={6}>
              <Badge colorScheme="orange" px={3} py={1} borderRadius="full">The Hidden Costs</Badge>
              <Heading fontSize={{ base: 'xl', md: '3xl' }} color="gray.800">
                Juggling 5 Systems That Don't Talk
              </Heading>
              <Text color="gray.600" fontSize="md" lineHeight="tall">
                One app for POS. Another for delivery scheduling. A spreadsheet for customer data. 
                A separate website builder. And somehow you're still texting customers manually.
              </Text>
              <Text color="gray.600" fontSize="md" lineHeight="tall">
                Each system costs $50-200/mo. None of them share data. Your staff wastes hours 
                copying order details between screens. And when something goes wrong? 
                Good luck finding which system dropped the ball.
              </Text>
              <Text color="gray.700" fontSize="md" fontWeight="600">
                What if one platform did everything — and cost less than any single tool you're using today?
              </Text>
            </VStack>
          </SimpleGrid>
        </Container>
      </Box>

      {/* AI Garment Tracking — Trust & Protection */}
      <Box py={{ base: 16, md: 20 }} bg="gray.900" color="white">
        <Container maxW="1100px">
          <Flex direction={{ base: 'column', lg: 'row' }} align="center" gap={10}>
            <VStack align={{ base: 'center', lg: 'flex-start' }} spacing={6} flex={1} textAlign={{ base: 'center', lg: 'left' }}>
              <Badge colorScheme="purple" px={3} py={1} borderRadius="full">AI-Powered</Badge>
              <Heading fontSize={{ base: '2xl', md: '3xl' }}>
                AI Garment Tracking That Builds Trust
              </Heading>
              <Text fontSize="lg" color="gray.300" lineHeight="tall">
                Builds customer trust, protects employees, and automatically documents every order — without changing your workflow.
              </Text>
              <List spacing={3} color="gray.300">
                <ListItem><ListIcon as={FiCheck} color="purple.300" />Snap photos at intake → AI identifies and counts every item</ListItem>
                <ListItem><ListIcon as={FiCheck} color="purple.300" />Customers see exactly what was received (transparency = trust)</ListItem>
                <ListItem><ListIcon as={FiCheck} color="purple.300" />Employees are protected — photo proof that items were received intact</ListItem>
                <ListItem><ListIcon as={FiCheck} color="purple.300" />Fold verification catches discrepancies before delivery</ListItem>
                <ListItem><ListIcon as={FiCheck} color="purple.300" />Reduces "missing item" disputes by 90%+ with zero extra effort</ListItem>
              </List>
              <Text fontSize="sm" color="gray.400" fontStyle="italic">
                No extra hardware. No training. Just take photos with any phone — AI handles the rest.
              </Text>
            </VStack>
            <Box flex={1} maxW="420px" bg="gray.800" borderRadius="2xl" p={6} border="1px solid" borderColor="gray.700">
              <VStack spacing={4} align="stretch">
                <HStack bg="gray.700" p={4} borderRadius="lg">
                  <Icon as={FiCamera} boxSize={8} color="purple.300" />
                  <Box>
                    <Text fontWeight="bold">Photo Intake</Text>
                    <Text fontSize="sm" color="gray.400">Employee snaps photos → AI counts items automatically</Text>
                  </Box>
                </HStack>
                <HStack bg="gray.700" p={4} borderRadius="lg">
                  <Icon as={FiShield} boxSize={8} color="green.300" />
                  <Box>
                    <Text fontWeight="bold">Proof of Condition</Text>
                    <Text fontSize="sm" color="gray.400">Timestamped photos prove what you received and when</Text>
                  </Box>
                </HStack>
                <HStack bg="gray.700" p={4} borderRadius="lg">
                  <Icon as={FiUsers} boxSize={8} color="blue.300" />
                  <Box>
                    <Text fontWeight="bold">Customer Transparency</Text>
                    <Text fontSize="sm" color="gray.400">Customers view their items online — builds confidence</Text>
                  </Box>
                </HStack>
                <HStack bg="gray.700" p={4} borderRadius="lg">
                  <Icon as={FiCheck} boxSize={8} color="yellow.300" />
                  <Box>
                    <Text fontWeight="bold">Fold Reconciliation</Text>
                    <Text fontSize="sm" color="gray.400">AI compares intake vs fold — flags discrepancies automatically</Text>
                  </Box>
                </HStack>
              </VStack>
            </Box>
          </Flex>
        </Container>
      </Box>

      {/* Comparison Table — Us vs Competitors */}
      <Box py={{ base: 16, md: 20 }} bg="gray.50">
        <Container maxW="900px">
          <VStack spacing={4} textAlign="center" mb={10}>
            <Badge colorScheme="blue" px={3} py={1} borderRadius="full">Why Switch</Badge>
            <Heading fontSize={{ base: '2xl', md: '3xl' }}>How We Compare</Heading>
            <Text color="gray.600" maxW="600px">The choice is clear when you see it side by side.</Text>
          </VStack>

          <Box overflowX="auto" borderRadius="xl" border="1px solid" borderColor="gray.200" bg="white">
            <Box as="table" w="100%" fontSize="sm">
              <Box as="thead" bg="gray.800" color="white">
                <Box as="tr">
                  <Box as="th" p={4} textAlign="left">Feature</Box>
                  <Box as="th" p={4} textAlign="center" bg="blue.600">Smart Laundry Basket</Box>
                  <Box as="th" p={4} textAlign="center">Revenue-Share Platforms</Box>
                  <Box as="th" p={4} textAlign="center">iOS-Only POS Apps</Box>
                </Box>
              </Box>
              <Box as="tbody">
                {[
                  ['Monthly Cost', '$149 flat', '25% of revenue', 'From $300/mo'],
                  ['Payment Processing', 'Direct to YOUR bank', 'They collect & pay you', 'Direct to you'],
                  ['Platform Fee on Transactions', 'None — 0%', '25% cut', 'None'],
                  ['Pickup & Delivery Management', '✓', '✓ (their drivers only)', '✗'],
                  ['AI Garment Tracking', '✓', '✗', '✓ (photos only)'],
                  ['Customer Website & Portal', '✓ (branded)', '✗', '✗'],
                  ['POS System', '✓ (any device)', '✗', '✓ (iOS only)'],
                  ['Automated Marketing', '✓', '✗', '✗'],
                  ['Works on Any Device', '✓ (browser-based)', '✗ (app only)', '✗ (iOS only)'],
                  ['Custom Domain', '✓', '✗', '✗'],
                  ['Free Tier', 'Yes (up to $3K/mo)', 'No', 'No'],
                  ['Unlimited Staff', '✓', 'N/A', '✓'],
                ].map(([feature, us, revShare, iosOnly], i) => (
                  <Box as="tr" key={i} borderTop="1px solid" borderColor="gray.100" _hover={{ bg: 'blue.50' }}>
                    <Box as="td" p={3} fontWeight="600" color="gray.700">{feature}</Box>
                    <Box as="td" p={3} textAlign="center" bg="blue.50" fontWeight="600" color="blue.700">{us}</Box>
                    <Box as="td" p={3} textAlign="center" color="gray.600">{revShare}</Box>
                    <Box as="td" p={3} textAlign="center" color="gray.600">{iosOnly}</Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          <Text textAlign="center" fontSize="xs" color="gray.500" mt={4}>
            Comparison based on publicly available information as of 2024. Pricing may vary.
          </Text>
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
              <VStack align="flex-start" spacing={2}>
                <Text fontWeight="bold" color="white">Contact</Text>
                <Text fontSize="xs">900 E Palm Valley Blvd</Text>
                <Text fontSize="xs">Ste 1006-1007</Text>
                <Text fontSize="xs">Round Rock, TX 78664</Text>
                <Text as="a" href="tel:5124977435" fontSize="xs" _hover={{ color: 'white' }}>(512) 497-7435</Text>
                <Text as="a" href="mailto:roundrocklaundry@gmail.com" fontSize="xs" _hover={{ color: 'white' }}>roundrocklaundry@gmail.com</Text>
              </VStack>
            </HStack>
          </Flex>
        </Container>
      </Box>
    </Box>
  );
};

export default ProductWebsite;
