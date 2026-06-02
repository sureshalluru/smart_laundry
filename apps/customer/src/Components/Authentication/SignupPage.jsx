// SignupPage.js
import React, { useState } from "react";
import {Stack, FormControl, FormLabel, Input, Button, Checkbox, useToast} from "@chakra-ui/react";

export default function SignupPage({ onSubmit, phoneNumber,isSignUpLoading }) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [receivePhoneNotification, setReceivePhoneNotification] = useState(false);
    const toast = useToast(); // Use Chakra UI toast for error notifications

    const handleSubmit = () => {
        if (firstName && lastName && email) {
            onSubmit(phoneNumber, firstName, lastName, email, receivePhoneNotification);
        } else {
            toast({
                title: "Missing Information",
                description: "Please Fill All Details",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        }
    };

    return (
        <Stack pl={16} pr={16} spacing={6}>
            <FormControl id="firstName">
                <FormLabel fontSize={['sm','lg']}>First Name</FormLabel>
                <Input
                    type="text"
                    placeholder="Enter your first name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                />
            </FormControl>
            <FormControl id="lastName">
                <FormLabel fontSize={['sm','lg']}>Last Name</FormLabel>
                <Input
                    type="text"
                    placeholder="Enter your last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                />
            </FormControl>
            <FormControl id="email">
                <FormLabel fontSize={['sm','lg']}>Email</FormLabel>
                <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </FormControl>
            <FormControl id="phone">
                <FormLabel fontSize={['sm','lg']}>Phone Number</FormLabel>
                <Input type="text" value={phoneNumber} isReadOnly />
            </FormControl>
            <Checkbox
                mt={4}
                isChecked={receivePhoneNotification}
                onChange={(e) => setReceivePhoneNotification(e.target.checked)}
                size={['md','lg']}
            >
                Receive order notifications via phone
            </Checkbox>
            <Button onClick={handleSubmit} isLoading={isSignUpLoading} fontSize={['md','lg']} loadingText='Registering User' colorScheme="blue">
                Register
            </Button>
        </Stack>
    );
}
