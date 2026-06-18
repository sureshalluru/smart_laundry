import React from 'react';
import {
  Box, Container, Heading, Text, Button, VStack, HStack, SimpleGrid, Icon,
  Flex, Badge, Image, Divider, List, ListItem, ListIcon
} from '@chakra-ui/react';
import { FiCheck, FiTruck, FiSmartphone, FiClock, FiDollarSign, FiShield,
  FiUsers, FiBarChart2, FiMail, FiZap, FiPackage, FiCamera } from 'react-icons/fi';

const ProductWebsite = () => {
  return (
    <Box bg="white" minH="100vh">
      {/* Navbar */}
      <Box as="nav" position="sticky" top={0} zIndex={100} bg="white" borderBottom="1px solid" borderColor="gray.100" boxShadow="sm">
        <Container maxW="1200px">
          <Flex py={3} align="center" justify="space-between">
            <HStack spacing={2}>
              <Box bg="blue.600" color="white" px={2} py={1} borderRadius="md" fontWeight="800" fontSize="sm">SLB</Box>
              <Text fontWeight="700" fontSize="lg" color="gray.800">Smart Laundry Basket</Text>
            </HStack>
            <HStack spacing={6} display={{ base: 'none', md: 'flex' }}>
              <Text as="a" href="#features" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>Features</Text>
              <Text as="a" href="#ai" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>AI Tracking</Text>
              <Text as="a" href="#pricing" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>Pricing</Text>
              <Text as="a" href="#how-it-works" fontSize="sm" color="gray.600" _hover={{ color: 'blue.500' }}>How It Works</Text>
            </HStack>
            <HStack spacing={3}>
              <Button as="a" href="/onboard" size="sm" colorScheme="blue" borderRadius="full" px={6}>Get Started Free</Button>
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/* Hero */}
      <Box py={{ base: 16, md: 24 }} bg="linear-gradient(135deg, #EBF8FF 0%, #F0FFF4 100%)">
        <Container maxW="1200px">
          <Flex direction={{ base: 'column', lg: 'row' }} align="center" gap={10}>
            <VStack align={{ base: 'center', lg: 'flex-start' }} spacing={6} flex={1} textAlign={{ base: 'center', lg: 'left' }}>
              <Badge colorScheme="blue" px={3} py={1} borderRadius="full" fontSize="xs">Built by laundromat owners, for laundromat owners</Badge>
              <Heading fontSize={{ base: '3xl', md: '5xl' }} color="gray.800" lineHeight="shorter">
                The All-in-One Platform That <Text as="span" color="blue.500">Works as Hard</Text> as You Do
              </Heading>
              <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.600" maxW="550px">
                POS, pickup & delivery, AI garment tracking, customer portal, automated marketing — everything you need to run a modern laundromat. Free to start.
              </Text>
              <HStack spacing={4} pt={2} flexWrap="wrap" justify={{ base: 'center', lg: 'flex-start' }}>
                <Button as="a" href="/onboard" size="lg" colorScheme="blue" borderRadius="full" px={8} boxShadow="lg">
                  Start Free — 2 Min Setup
                </Button>
                <Button as="a" href="#features" size="lg" variant="outline" borderRadius="full" px={8}>
                  See Features
                </Button>
              </HStack>
              <HStack spacing={6} pt={4} color="gray.500" fontSize="sm" flexWrap="wrap" justify={{ base: 'center', lg: 'flex-start' }}>
                <HStack><Icon as={FiCheck} color="green.500" /><Text>No setup fees</Text></HStack>
                <HStack><Icon as={FiCheck} color="green.500" /><Text>No contracts</Text></HStack>
                <HStack><Icon as={FiCheck} color="green.500" /><Text>Free until $3K/mo</Text></HStack>
              </HStack>
            </VStack>
            <Box flex={1} maxW="550px">
              <Image
                src="https://laundry-images-store-prod.s3.us-east-1.amazonaws.com/onboard-hero.png"
                alt="Smart Laundry Basket Platform"
                borderRadius="2xl" boxShadow="2xl"
              />
            </Box>
          </Flex>
        </Container>
      </Box>

      {/* Trusted By */}
      <Box py={8} bg="gray.50" borderY="1px solid" borderColor="gray.100">
        <Container maxW="800px" textAlign="center">
          <Text fontSize="sm" color="gray.500" mb={3}>TRUSTED BY LAUNDROMATS IN</Text>
          <HStack spacing={8} justify="center" flexWrap="wrap" color="gray.400" fontSize="md" fontWeight="600">
            <Text>Round Rock, TX</Text><Text>•</Text><Text>Austin, TX</Text><Text>•</Text><Text>Hutto, TX</Text><Text>•</Text><Text>Cedar Park, TX</Text>
          </HStack>
        </Container>
      </Box>

      {/* Features */}
      <Box id="features" py={{ base: 16, md: 20 }}>
        <Container maxW="1200px">
          <VStack spacing={4} textAlign="center" mb={12}>
            <Badge colorScheme="blue" px={3} py={1} borderRadius="full">Features</Badge>
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Everything You Need to Run Your Laundromat</Heading>
            <Text color="gray.600" maxW="600px" fontSize="lg">One platform. Every tool. No more juggling multiple systems.</Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={8}>
            {[
              { icon: FiDollarSign, title: 'Quick POS', desc: 'Tap-to-order checkout for walk-in customers. Card, cash, or terminal. Print tickets instantly.', color: 'green' },
              { icon: FiTruck, title: 'Pickup & Delivery', desc: 'Scheduled or instant Uber pickups. Route optimization for drivers. Real-time tracking.', color: 'blue' },
              { icon: FiCamera, title: 'AI Garment Tracking', desc: 'Photo-based item recognition. Fewer disputes. Complete transparency for every garment.', color: 'purple' },
              { icon: FiSmartphone, title: 'Customer Portal', desc: 'Branded website for each shop. Online ordering, payments, order tracking, reviews.', color: 'orange' },
              { icon: FiBarChart2, title: 'Dashboard & Analytics', desc: 'Revenue trends, customer insights, employee performance. Know your numbers.', color: 'teal' },
              { icon: FiMail, title: 'Automated Marketing', desc: 'Smart reminders for dormant customers. Holiday promos. Win-back campaigns. Auto-pilot growth.', color: 'pink' },
              { icon: FiUsers, title: 'Customer Management', desc: 'Full CRM. Order history, preferences, recurring schedules, loyalty tracking.', color: 'cyan' },
              { icon: FiClock, title: 'Recurring Orders', desc: 'Weekly/bi-weekly auto-scheduling. Customers set it and forget it. You get steady revenue.', color: 'yellow' },
              { icon: FiShield, title: 'Secure Payments', desc: 'Stripe-powered. Card on file, terminal, invoicing for commercial accounts. PCI compliant.', color: 'red' },
            ].map((feature) => (
              <Box key={feature.title} p={6} borderRadius="xl" border="1px solid" borderColor="gray.100" _hover={{ boxShadow: 'lg', transform: 'translateY(-4px)' }} transition="all 0.3s">
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

      {/* AI Garment Tracking Section */}
      <Box id="ai" py={{ base: 16, md: 20 }} bg="gray.900" color="white">
        <Container maxW="1200px">
          <Flex direction={{ base: 'column', lg: 'row' }} align="center" gap={10}>
            <VStack align={{ base: 'center', lg: 'flex-start' }} spacing={6} flex={1} textAlign={{ base: 'center', lg: 'left' }}>
              <Badge colorScheme="purple" px={3} py={1} borderRadius="full">Coming Soon</Badge>
              <Heading fontSize={{ base: '2xl', md: '4xl' }}>AI-Powered Garment Tracking</Heading>
              <Text fontSize="lg" color="gray.300">
                Every item photographed, identified, and tracked from intake to delivery. No more "where's my blue shirt?" disputes.
              </Text>
              <List spacing={3} color="gray.300">
                <ListItem><ListIcon as={FiCheck} color="purple.300" />Automatic item detection from photos</ListItem>
                <ListItem><ListIcon as={FiCheck} color="purple.300" />Color, type, and brand recognition</ListItem>
                <ListItem><ListIcon as={FiCheck} color="purple.300" />Full chain-of-custody tracking per garment</ListItem>
                <ListItem><ListIcon as={FiCheck} color="purple.300" />Customer can view their items in real-time</ListItem>
                <ListItem><ListIcon as={FiCheck} color="purple.300" />Reduces missing item claims by 90%+</ListItem>
              </List>
              <Button as="a" href="/onboard" colorScheme="purple" size="lg" borderRadius="full" px={8}>
                Get Early Access
              </Button>
            </VStack>
            <Box flex={1} maxW="450px" bg="gray.800" borderRadius="2xl" p={6} border="1px solid" borderColor="gray.700">
              <VStack spacing={4} align="stretch">
                <HStack bg="gray.700" p={4} borderRadius="lg">
                  <Icon as={FiCamera} boxSize={8} color="purple.300" />
                  <Box>
                    <Text fontWeight="bold">Photo Intake</Text>
                    <Text fontSize="sm" color="gray.400">Driver snaps photo → AI identifies items</Text>
                  </Box>
                </HStack>
                <HStack bg="gray.700" p={4} borderRadius="lg">
                  <Icon as={FiPackage} boxSize={8} color="blue.300" />
                  <Box>
                    <Text fontWeight="bold">Item Catalog</Text>
                    <Text fontSize="sm" color="gray.400">Blue Shirt, Black Pants, Red Dress → tagged</Text>
                  </Box>
                </HStack>
                <HStack bg="gray.700" p={4} borderRadius="lg">
                  <Icon as={FiShield} boxSize={8} color="green.300" />
                  <Box>
                    <Text fontWeight="bold">Proof of Delivery</Text>
                    <Text fontSize="sm" color="gray.400">Every item accounted for. Zero disputes.</Text>
                  </Box>
                </HStack>
              </VStack>
            </Box>
          </Flex>
        </Container>
      </Box>

      {/* Customization Section */}
      <Box py={{ base: 16, md: 20 }} bg="white">
        <Container maxW="1200px">
          <Flex direction={{ base: 'column', lg: 'row' }} align="center" gap={10}>
            <Box flex={1}>
              <Badge colorScheme="orange" px={3} py={1} borderRadius="full" mb={4}>Fully Customizable</Badge>
              <Heading fontSize={{ base: '2xl', md: '3xl' }} mb={4}>Your Brand. Your Rules. Your Way.</Heading>
              <Text color="gray.600" fontSize="lg" mb={6}>
                Every laundromat is different. That's why Smart Laundry Basket is built to adapt to YOUR business — not the other way around.
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                {[
                  { title: 'Custom Branding', desc: 'Your logo, colors, and domain. Customers see YOUR brand, not ours.' },
                  { title: 'Flexible Services', desc: 'Per-pound, per-bag, per-piece — set your own services and pricing.' },
                  { title: 'Your Schedule', desc: 'Configure pickup/delivery days, hours, and time slots your way.' },
                  { title: 'Payment Options', desc: 'Cash, card, terminal, invoicing, pay-later — enable what works for you.' },
                  { title: 'Custom Promotions', desc: 'Create your own promo codes, frequency discounts, and holiday deals.' },
                  { title: 'Multi-Location', desc: 'Run multiple shops from one account with separate branding for each.' },
                ].map((item) => (
                  <HStack key={item.title} align="flex-start" spacing={3}>
                    <Icon as={FiCheck} color="green.500" mt={1} flexShrink={0} />
                    <Box>
                      <Text fontWeight="700" fontSize="sm">{item.title}</Text>
                      <Text color="gray.500" fontSize="xs">{item.desc}</Text>
                    </Box>
                  </HStack>
                ))}
              </SimpleGrid>
              <Text mt={6} fontSize="sm" color="gray.500" fontStyle="italic">
                Need something specific? We build custom features for our partners. Book a demo to discuss.
              </Text>
            </Box>
            <Box flex={1} maxW="450px" bg="gray.50" borderRadius="2xl" p={8} border="1px solid" borderColor="gray.200">
              <VStack spacing={5} align="stretch">
                <Box bg="white" p={4} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor="orange.100">
                  <HStack spacing={3}>
                    <Box w="40px" h="40px" bg="orange.100" borderRadius="full" display="flex" alignItems="center" justifyContent="center">🎨</Box>
                    <Box><Text fontWeight="bold" fontSize="sm">Theme & Colors</Text><Text fontSize="xs" color="gray.500">Choose from 8 brand colors or request custom</Text></Box>
                  </HStack>
                </Box>
                <Box bg="white" p={4} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor="blue.100">
                  <HStack spacing={3}>
                    <Box w="40px" h="40px" bg="blue.100" borderRadius="full" display="flex" alignItems="center" justifyContent="center">🌐</Box>
                    <Box><Text fontWeight="bold" fontSize="sm">Custom Domain</Text><Text fontSize="xs" color="gray.500">www.yourlaundry.com → your branded portal</Text></Box>
                  </HStack>
                </Box>
                <Box bg="white" p={4} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor="green.100">
                  <HStack spacing={3}>
                    <Box w="40px" h="40px" bg="green.100" borderRadius="full" display="flex" alignItems="center" justifyContent="center">⚙️</Box>
                    <Box><Text fontWeight="bold" fontSize="sm">Business Logic</Text><Text fontSize="xs" color="gray.500">Custom workflows, notifications, and integrations</Text></Box>
                  </HStack>
                </Box>
                <Box bg="white" p={4} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor="purple.100">
                  <HStack spacing={3}>
                    <Box w="40px" h="40px" bg="purple.100" borderRadius="full" display="flex" alignItems="center" justifyContent="center">🛠️</Box>
                    <Box><Text fontWeight="bold" fontSize="sm">Custom Features</Text><Text fontSize="xs" color="gray.500">Need something unique? We'll build it for you.</Text></Box>
                  </HStack>
                </Box>
              </VStack>
            </Box>
          </Flex>
        </Container>
      </Box>

      {/* How It Works */}
      <Box id="how-it-works" py={{ base: 16, md: 20 }}>
        <Container maxW="1000px">
          <VStack spacing={4} textAlign="center" mb={12}>
            <Badge colorScheme="green" px={3} py={1} borderRadius="full">Simple Onboarding</Badge>
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Live in 2 Minutes. Seriously.</Heading>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 4 }} spacing={8}>
            {[
              { step: '1', title: 'Sign Up', desc: 'Enter your laundry name, address, and services. 60 seconds.' },
              { step: '2', title: 'Go Live', desc: 'Your branded website, customer portal, and POS are instantly ready.' },
              { step: '3', title: 'Take Orders', desc: 'Walk-ins, online orders, recurring customers. All managed in one place.' },
              { step: '4', title: 'Grow', desc: 'Automated marketing brings customers back. You focus on laundry.' },
            ].map((s) => (
              <VStack key={s.step} spacing={3} textAlign="center">
                <Box bg="blue.500" color="white" w="50px" h="50px" borderRadius="full" display="flex" alignItems="center" justifyContent="center" fontSize="xl" fontWeight="800">
                  {s.step}
                </Box>
                <Text fontWeight="700" fontSize="lg">{s.title}</Text>
                <Text color="gray.600" fontSize="sm">{s.desc}</Text>
              </VStack>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      {/* Pricing */}
      <Box id="pricing" py={{ base: 16, md: 20 }} bg="blue.50">
        <Container maxW="800px" textAlign="center">
          <VStack spacing={6}>
            <Badge colorScheme="blue" px={3} py={1} borderRadius="full">Pricing</Badge>
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Free Until You Grow</Heading>
            <Text color="gray.600" fontSize="lg" maxW="500px">
              No tricks. Use the full platform for free. Only pay when your monthly revenue exceeds $3,000.
            </Text>

            <Flex direction={{ base: 'column', md: 'row' }} gap={6} w="100%" justify="center" pt={4}>
              <Box bg="white" borderRadius="2xl" p={8} boxShadow="md" flex={1} maxW="350px" border="2px solid" borderColor="green.200">
                <Badge colorScheme="green" mb={4}>FREE TIER</Badge>
                <Heading fontSize="4xl" mb={2}>$0</Heading>
                <Text color="gray.500" mb={4}>Up to $3,000/month revenue</Text>
                <List spacing={2} textAlign="left" mb={6}>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Full POS system</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Customer portal & website</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Pickup & delivery management</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Recurring orders</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Stripe payments</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="green.500" />Dashboard & analytics</ListItem>
                </List>
                <Button as="a" href="/onboard" colorScheme="green" w="100%" borderRadius="full" size="lg">Start Free</Button>
              </Box>

              <Box bg="white" borderRadius="2xl" p={8} boxShadow="md" flex={1} maxW="350px" border="2px solid" borderColor="blue.200">
                <Badge colorScheme="blue" mb={4}>GROWTH</Badge>
                <Heading fontSize="4xl" mb={2}>$149<Text as="span" fontSize="lg" color="gray.400">/mo</Text></Heading>
                <Text color="gray.500" mb={4}>When revenue exceeds $3,000/mo</Text>
                <List spacing={2} textAlign="left" mb={6}>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Everything in Free</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />AI Garment Tracking</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Automated customer engagement</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Uber delivery integration</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Priority support</ListItem>
                  <ListItem fontSize="sm"><ListIcon as={FiCheck} color="blue.500" />Multi-location support</ListItem>
                </List>
                <Button as="a" href="/onboard" colorScheme="blue" w="100%" borderRadius="full" size="lg">Get Started</Button>
              </Box>
            </Flex>
          </VStack>
        </Container>
      </Box>

      {/* CTA */}
      <Box py={{ base: 16, md: 20 }} bg="blue.600" color="white" textAlign="center">
        <Container maxW="700px">
          <VStack spacing={6}>
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>Ready to Modernize Your Laundromat?</Heading>
            <Text fontSize="lg" opacity={0.9}>Join laundromat owners who are growing their business with Smart Laundry Basket. Setup takes 2 minutes.</Text>
            <HStack spacing={4}>
              <Button as="a" href="/onboard" size="lg" colorScheme="white" color="blue.600" bg="white" borderRadius="full" px={8} _hover={{ bg: 'gray.100' }}>
                Start Free Now
              </Button>
              <Button as="a" href="https://calendar.app.google/Gu7fDZWRHYtrZK5H8" target="_blank" rel="noopener noreferrer" size="lg" variant="outline" borderColor="whiteAlpha.600" color="white" borderRadius="full" px={8} _hover={{ bg: 'whiteAlpha.200' }}>
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
                <Text as="a" href="#ai" _hover={{ color: 'white' }}>AI Tracking</Text>
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
