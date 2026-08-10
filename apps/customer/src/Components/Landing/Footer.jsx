import { Box, Text, HStack, Link, Icon } from "@chakra-ui/react";
import { FaFacebook, FaTwitter, FaInstagram } from "react-icons/fa";

const Footer = () => (
  <Box bg="gray.900" color="Blue" p={6} textAlign="center" mt={10}>
    <Text mb={3}>&copy; {new Date().getFullYear()} Smart Laundry Basket. All rights reserved.</Text>
    <HStack spacing={4} justify="center">
      <Link href="#" isExternal><Icon as={FaFacebook} boxSize={6} /></Link>
      <Link href="#" isExternal><Icon as={FaTwitter} boxSize={6} /></Link>
      <Link href="#" isExternal><Icon as={FaInstagram} boxSize={6} /></Link>
    </HStack>
    <Text mt={3}>Contact us: <Link href="mailto:info@smartlaundrybasket.ai" color="blue.300">info@smartlaundrybasket.ai</Link></Text>
  </Box>
);

export default Footer;
