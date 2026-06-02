import React, {useContext, useState} from "react";
import {
    Stack,
    FormControl,
    FormLabel,
    Input,
    Button,
    InputLeftAddon,
    InputGroup,
    useToast,
    Heading
} from "@chakra-ui/react";
import {LaundryContext} from "../Contexts/LaundryContext";

export default function LoginPage({onLoginSubmit,isLoginLoading,initialPhoneNumber=""}) {
    const strippedPhoneNumber = initialPhoneNumber.slice(-10);
    const [phoneNumber, setPhoneNumber] = useState(strippedPhoneNumber);
    const { laundryData } = useContext(LaundryContext);
    const toast = useToast(); // Use Chakra toast for error notifications
    const handleLoginSubmit = () => {
        const digitsOnly = phoneNumber.replace(/\D/g, '');
        if (digitsOnly.length !== 10) {
            toast({
                title: "Invalid phone number",
                description: "Please enter a 10-digit US phone number (area code + number).",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            return;
        }
        onLoginSubmit(`+1${digitsOnly}`); // TODO: Change this logic

    };

    return (
        <Stack pl={7} pr={7} spacing={3} alignItems={["center","start"]}>
            <Heading  size={['md','lg']} color="blue.600" mb={4}>
                {laundryData?.laundryName}
            </Heading>
            <FormControl id="phone">
                <FormLabel fontSize={['md','xl']}>Phone Number</FormLabel>
                <InputGroup>
                    <InputLeftAddon>+1</InputLeftAddon>
                    <Input type='tel'
                           placeholder="Enter your 10-digit phone number"
                           value={phoneNumber}
                           onChange={(e) => setPhoneNumber(e.target.value)}/>
                </InputGroup>
            </FormControl>
            <Button
                isLoading={isLoginLoading}
                loadingText='Verifying'
                colorScheme='teal'
                w="full"
                fontSize={['md','lg']}
                onClick={handleLoginSubmit}>
                Submit
            </Button>
        </Stack>
    );
}

