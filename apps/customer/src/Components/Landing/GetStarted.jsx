import {
    Box,
    Heading,
    VStack,
    Input,
    Textarea,
    FormControl,
    FormLabel,
    Checkbox,
    Button,
  } from "@chakra-ui/react";
  import { useState } from "react";
  
  const GetStarted = () => {
    const [formData, setFormData] = useState({
      businessName: "",
      businessAddress: "",
      dba: "",
      logo: null,
      einDoc: null,
      stripePublicKey: "",
      stripePrivateKey: "",
      ownerName: "",
      ownerAddress: "",
      agreeToPolicy: false,
    });
  
    const handleChange = (e) => {
      const { name, value, type, checked, files } = e.target;
      if (type === "file") {
        setFormData({ ...formData, [name]: files[0] });
      } else if (type === "checkbox") {
        setFormData({ ...formData, [name]: checked });
      } else {
        setFormData({ ...formData, [name]: value });
      }
    };
  
    const handleSubmit = (e) => {
      e.preventDefault();
      if (!formData.agreeToPolicy) {
        alert("Please agree to the policy before submitting.");
        return;
      }
      // Send formData to backend here (e.g., via fetch or Axios)
      console.log("Form submitted:", formData);
      alert("Thank you! We'll review your information and get back to you shortly.");
    };
  
    return (
      <Box maxW="4xl" mx="auto" p={6}>
        <Heading as="h1" size="xl" mb={6} textAlign="center">
          Get Started with Smart Laundry Basket
        </Heading>
        <form onSubmit={handleSubmit}>
          <VStack spacing={6} align="stretch">
            <FormControl isRequired>
              <FormLabel>Business Name</FormLabel>
              <Input name="businessName" value={formData.businessName} onChange={handleChange} />
            </FormControl>
  
            <FormControl isRequired>
              <FormLabel>Business Address</FormLabel>
              <Textarea name="businessAddress" value={formData.businessAddress} onChange={handleChange} />
            </FormControl>
  
            <FormControl>
              <FormLabel>DBA (Doing Business As)</FormLabel>
              <Input name="dba" value={formData.dba} onChange={handleChange} />
            </FormControl>
  
            <FormControl isRequired>
              <FormLabel>Upload Logo</FormLabel>
              <Input name="logo" type="file" accept="image/*" onChange={handleChange} />
            </FormControl>
  
            <FormControl isRequired>
              <FormLabel>Upload EIN Document</FormLabel>
              <Input name="einDoc" type="file" accept=".pdf,.jpg,.png" onChange={handleChange} />
            </FormControl>
  
            <FormControl isRequired>
              <FormLabel>Stripe Terminal Public Key</FormLabel>
              <Input name="stripePublicKey" value={formData.stripePublicKey} onChange={handleChange} />
            </FormControl>
  
            <FormControl isRequired>
              <FormLabel>Stripe Terminal Private Key</FormLabel>
              <Input name="stripePrivateKey" value={formData.stripePrivateKey} onChange={handleChange} />
            </FormControl>
  
            <FormControl isRequired>
              <FormLabel>Owner / Representative Name</FormLabel>
              <Input name="ownerName" value={formData.ownerName} onChange={handleChange} />
            </FormControl>
  
            <FormControl isRequired>
              <FormLabel>Owner / Representative Address</FormLabel>
              <Textarea name="ownerAddress" value={formData.ownerAddress} onChange={handleChange} />
            </FormControl>
  
            <FormControl isRequired>
              <Checkbox name="agreeToPolicy" isChecked={formData.agreeToPolicy} onChange={handleChange}>
                I agree to the terms and onboarding policy
              </Checkbox>
            </FormControl>
  
            <Button type="submit" colorScheme="blue" size="lg">
              Submit Application
            </Button>
          </VStack>
        </form>
      </Box>
    );
  };
  
  export default GetStarted;
  