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
    document.title = 'Smart Laundry Basket — Open Source Platform for Service Businesses';
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
            <Button as="a" href="/onboard" size="sm" colorScheme="blue" borderRadius="full" px={6}>Get Started</Button>
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
              Open Source • Self-Host Free • Managed $49/mo
            </Badge>
            <Heading fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }} color="white" lineHeight="shorter" fontWeight="800"
              textShadow="0 2px 30px rgba(0,0,0,0.5)">
              The Open Source Platform for Service Businesses.
            </Heading>
            <Text fontSize={{ base: 'md', md: 'lg' }} color="white" maxW="650px" lineHeight="tall" fontWeight="500"
              textShadow="0 1px 10px rgba(0,0,0,0.4)">
              Customer booking, POS, scheduling, delivery management, AI tracking — all in one. Free to use forever. $49/month if you want us to host and maintain it for you.
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
              <Heading fontSize={{ base: '2xl', md: '4xl' }}>Your Business. Your Software. Your Choice.</Heading>
            </VStack>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} w="100%">
              {/* Other Platforms */}
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

              {/* Smart Laundry Basket */}
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

            <Box bg="whiteAlpha.100" borderRadius="2xl" px={8} py={6} border="1px solid" borderColor="whiteAlpha.200">
              <Text fontSize="sm" color="gray.400" mb={1}>It's your software — run it yourself or let us handle it</Text>
              <Heading fontSize={{ base: '3xl', md: '5xl' }} color="green.300">Open Source. $49 Managed.</Heading>
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
                "Anyone Can Build It With AI"
              </Heading>
              <Text color="gray.600" fontSize="md" lineHeight="tall">
                Sure, you can build your own booking system. You can set up a website, wire payments, 
                build a customer portal. But who maintains it? Who updates it? Who fixes it at 2am?
              </Text>
              <Text color="gray.600" fontSize="md" lineHeight="tall">
                Building is 10% of the work. Hosting, security patches, database backups, uptime monitoring, 
                payment integration updates — that's the other 90%. That's what we handle for $49/mo.
              </Text>
              <Text color="gray.700" fontSize="md" fontWeight="600">
                Or self-host it yourself. It's open source. Your choice, always.
              </Text>
            </VStack>
            <VStack align="flex-start" spacing={6}>
              <Badge colorScheme="orange" px={3} py={1} borderRadius="full">Works For Any Service</Badge>
              <Heading fontSize={{ base: 'xl', md: '3xl' }} color="gray.800">
                One Platform, Any Service Business
              </Heading>
              <Text color="gray.600" fontSize="md" lineHeight="tall">
                Laundry, cleaning, detailing, pet grooming, lawn care, tutoring — if you provide a service 
                and customers book it, this platform handles the entire workflow.
              </Text>
              <Text color="gray.600" fontSize="md" lineHeight="tall">
                Customers book online. You see orders in your admin panel. Process the service, charge, deliver. 
                All from one platform that you own and control.
              </Text>
              <Text color="gray.700" fontSize="md" fontWeight="600">
                No platform fees. No revenue cuts. Everything goes directly to your bank account.
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
            <Badge colorScheme="blue" px={3} py={1} borderRadius="full">Why Us</Badge>
            <Heading fontSize={{ base: '2xl', md: '3xl' }}>How We Compare</Heading>
            <Text color="gray.600" maxW="600px">Open source with managed hosting vs. locked-in SaaS.</Text>
          </VStack>

          <Box overflowX="auto" borderRadius="xl" border="1px solid" borderColor="gray.200" bg="white">
            <Box as="table" w="100%" fontSize="sm">
              <Box as="thead" bg="gray.800" color="white">
                <Box as="tr">
                  <Box as="th" p={4} textAlign="left">Feature</Box>
                  <Box as="th" p={4} textAlign="center" bg="blue.600">Smart Laundry Basket</Box>
                  <Box as="th" p={4} textAlign="center">Typical SaaS Platforms</Box>
                  <Box as="th" p={4} textAlign="center">Build It Yourself</Box>
                </Box>
              </Box>
              <Box as="tbody">
                {[
                  ['Monthly Cost', 'Free (self-host) or $49/mo', '$200-500/mo', '$0 + your time'],
                  ['Source Code Access', '✓ Full access', '✗ Closed source', '✓ You built it'],
                  ['Vendor Lock-in', 'None — it\'s yours', 'High — data trapped', 'None'],
                  ['Hosting & Maintenance', 'Included in $49/mo', 'Included', 'You handle it'],
                  ['Updates & Security Patches', 'Included', 'Included', 'You handle it'],
                  ['Customer Booking Portal', '✓', '✓', 'Build it yourself'],
                  ['POS System', '✓ (any device)', '✓ (some)', 'Build it yourself'],
                  ['Pickup & Delivery Management', '✓', '✗ or extra $$', 'Build it yourself'],
                  ['AI Tracking', '✓', '✗', 'Build it yourself'],
                  ['Direct Payments (no cuts)', '✓ Your Stripe', 'Sometimes 2-5% fees', '✓'],
                  ['Custom Domain', '✓', 'Extra $$', '✓'],
                  ['Support', 'Included', 'Included', 'Stack Overflow'],
                ].map(([feature, us, saas, diy], i) => (
                  <Box as="tr" key={i} borderTop="1px solid" borderColor="gray.100" _hover={{ bg: 'blue.50' }}>
                    <Box as="td" p={3} fontWeight="600" color="gray.700">{feature}</Box>
                    <Box as="td" p={3} textAlign="center" bg="blue.50" fontWeight="600" color="blue.700">{us}</Box>
                    <Box as="td" p={3} textAlign="center" color="gray.600">{saas}</Box>
                    <Box as="td" p={3} textAlign="center" color="gray.600">{diy}</Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          <Text textAlign="center" fontSize="xs" color="gray.500" mt={4}>
            You own the software. We just make it easy to run.
          </Text>
        </Container>
      </Box>

      {/* Features Grid */}
      <Box id="features" py={{ base: 16, md: 20 }}>
        <Container maxW="1200px">
          <VStack spacing={4} textAlign="center" mb={12}>
            <Badge colorScheme="blue" px={3} py={1} borderRadius="full">Features</Badge>
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Everything a Service Business Needs.</Heading>
            <Text color="gray.600" maxW="600px" fontSize="lg">One platform for bookings, operations, payments, and customer management.</Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={8}>
            {[
              { icon: FiDollarSign, title: 'Quick POS', desc: 'Tap-to-order checkout for walk-ins. Card, cash, or terminal. Works on any device.', color: 'green' },
              { icon: FiTruck, title: 'Pickup & Delivery', desc: 'Scheduled routes, driver tracking, or Uber integration. Real-time updates for customers.', color: 'blue' },
              { icon: FiCamera, title: 'AI Tracking', desc: 'Photo-based verification and item recognition. Complete transparency. Fewer disputes.', color: 'purple' },
              { icon: FiSmartphone, title: 'Customer Booking Portal', desc: 'Branded website where customers book services, pay, and track orders.', color: 'orange' },
              { icon: FiBarChart2, title: 'Dashboard & Analytics', desc: 'Revenue trends, customer insights, employee performance at a glance.', color: 'teal' },
              { icon: FiMail, title: 'Automated Notifications', desc: 'Order updates, reminders, and marketing on autopilot via SMS and email.', color: 'pink' },
              { icon: FiUsers, title: 'Customer CRM', desc: 'Full history, preferences, recurring schedules, and loyalty tracking.', color: 'cyan' },
              { icon: FiClock, title: 'Recurring Orders', desc: 'Customers subscribe to regular service. You get predictable, steady revenue.', color: 'yellow' },
              { icon: FiShield, title: 'Direct Payments', desc: 'Your Stripe, your bank account. We never touch your money — zero platform fees.', color: 'red' },
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
            <Badge colorScheme="green" px={3} py={1} borderRadius="full">Two Options</Badge>
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Self-Host or Let Us Run It.</Heading>
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

      {/* Testimonials */}
      <Box py={{ base: 16, md: 20 }}>
        <Container maxW="1000px">
          <VStack spacing={4} textAlign="center" mb={12}>
            <Badge colorScheme="purple" px={3} py={1} borderRadius="full">Use Cases</Badge>
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Built for Service Providers</Heading>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8}>
            {[
              { name: 'Wash & Fold', location: 'Laundry Services', quote: 'Customers schedule pickups online, we process orders, track garments with AI photos, and deliver — all managed from one dashboard.' },
              { name: 'Home Cleaning', location: 'Cleaning Services', quote: 'Clients book recurring cleanings, we assign crews, track completion, and auto-charge. No phone tag, no spreadsheets.' },
              { name: 'Mobile Detailing', location: 'Auto Services', quote: 'Customers pick a package, schedule a slot, we route our detailers and send real-time ETAs. Payment on completion.' },
            ].map((t) => (
              <Box key={t.name} p={6} borderRadius="xl" bg="gray.50" border="1px solid" borderColor="gray.100">
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
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Free to Use. $49/mo to Not Worry About It.</Heading>
            <Text color="gray.600" fontSize="lg" maxW="550px">
              The software is yours. Self-host it free forever. Or pay $49/month and we handle everything.
            </Text>

            <Flex direction={{ base: 'column', md: 'row' }} gap={6} w="100%" justify="center" pt={4}>
              {/* Self-Hosted */}
              <Box bg="white" borderRadius="2xl" p={8} boxShadow="md" flex={1} maxW="350px" border="2px solid" borderColor="green.200">
                <Badge colorScheme="green" mb={4}>SELF-HOSTED</Badge>
                <Heading fontSize="4xl" mb={2}>$0</Heading>
                <Text color="gray.500" mb={6}>Free forever. You run it.</Text>
                <List spacing={2} textAlign="left" mb={6}>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Full source code access</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />All features included</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Deploy anywhere you want</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Customize to your needs</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Community support</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />No usage limits</ListItem>
                </List>
                <Button as="a" href="https://github.com/sureshalluru/smart_laundry" target="_blank" colorScheme="green" w="100%" borderRadius="full" size="lg" variant="outline">View on GitHub</Button>
              </Box>

              {/* Managed */}
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

      {/* FAQ */}
      <Box id="faq" py={{ base: 16, md: 20 }}>
        <Container maxW="700px">
          <VStack spacing={4} textAlign="center" mb={10}>
            <Badge colorScheme="gray" px={3} py={1} borderRadius="full">FAQ</Badge>
            <Heading fontSize={{ base: '2xl', md: '3xl' }}>Common Questions</Heading>
          </VStack>

          <Accordion allowMultiple>
            {[
              { q: 'Is it really free?', a: 'Yes. The source code is open source — you can clone it, deploy it on your own server, and use it forever at no cost. The $49/mo managed plan is for people who don\'t want to deal with servers, updates, and backups.' },
              { q: 'What do I get for $49/month?', a: 'We host the entire platform for you — your customer portal, admin dashboard, API, database. We handle updates, security patches, daily backups, SSL, custom domain setup, and priority support. You just focus on your business.' },
              { q: 'Do you take a cut of my transactions?', a: 'Never. You connect your own Stripe account and customer payments go directly to YOUR bank. We charge $49/mo flat (or $0 if you self-host) and never touch your revenue.' },
              { q: 'What kind of businesses can use this?', a: 'Any service business — laundry, cleaning, detailing, pet grooming, lawn care, tutoring, and more. If customers book a service and you fulfill it, this platform handles the workflow.' },
              { q: 'Can I customize the code?', a: 'Absolutely. It\'s open source. Fork the repo, modify anything, add features specific to your business. If you\'re on the managed plan, we can discuss custom modifications too.' },
              { q: 'What if I start self-hosted and want to switch to managed?', a: 'Easy. Sign up for the managed plan and we\'ll help migrate your data. Works the other way too — you can always export and self-host.' },
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
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Ready to Own Your Platform?</Heading>
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
