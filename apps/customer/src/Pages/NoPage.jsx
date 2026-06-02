import React from 'react';
import { Box, Heading, Text } from '@chakra-ui/react';

const NoPage = () => {
    return (       
    <Box bg="#AADDD9" minHeight="100vh" display="flex" justifyContent="center" alignItems="center">
        <Box textAlign="center" p={10}>
            <Heading as="h1" size="2xl" mb={4}>
            Invalid Request
            </Heading>
            <Text fontSize="lg">
            The request URL is invalid. Please check the URL and try again.
            </Text>
        </Box>
    </Box>
    );
};

export default NoPage;
