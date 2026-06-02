import React from 'react';
import {Box, Button, Center, VStack, Text, Icon, HStack} from '@chakra-ui/react';
import {CheckCircleIcon} from '@chakra-ui/icons';
import {useNavigate} from 'react-router-dom';
import {useAuthenticator} from "../../Context/AuthContext";

export default function OrderSuccess({laundryId}) {
    const navigate = useNavigate();

    // Move useAuthenticator outside handleSignOut
    const {signOut, isPending} = useAuthenticator((context) => [
        context.signOut,
        context.isPending,
    ]);

    const handleSignOut = () => {
        // Implement your sign-out logic here, e.g., clearing tokens, redirecting, etc.
        localStorage.removeItem('idToken'); // Remove token from storage (example)
        signOut(); // Call the signOut function
        navigate(`/${laundryId}/login`); // Redirect to login page after sign-out
    };

    const handleRedirectHomePage = () => {
        navigate(`/${laundryId}/user/schedule-order`); // Redirect to the Schedule Pickup Page(Home Page)
    };

    return (
        // <Box padding={6} bg = "#AADDD9" minHeight="100vh">
        //     <Center h="100vh">
        //         <VStack spacing={6} textAlign="center">
        //             {/* Tick Mark Animation */}
        //             <Box position="relative">
        //                 <Icon as={CheckCircleIcon} w={20} h={20} color="green.400"/>
        //             </Box>

        //             {/* Success Message */}
        //             <Text fontSize="2xl" fontWeight="bold">
        //                 Your order has been placed successfully!
        //             </Text>

        //             {/* Sign Out Button */}
        //             <HStack>
        //                 <Button
        //                     colorScheme="blue"
        //                     onClick={handleSignOut}
        //                     size="lg"
        //                     isLoading={isPending}
        //                 >
        //                     Sign Out
        //                 </Button>
        //                 {/* Home Page Redirect Button */}
        //                 <Button
        //                     colorScheme="blue"
        //                     onClick={handleRedirectHomePage}
        //                     size="lg"
        //                 >
        //                     Home Page
        //                 </Button>
        //             </HStack>

        //         </VStack>
        //     </Center>
        // </Box>
        <Box bg="#AADDD9" minHeight="100vh" padding={6}>
      <Center h="100%">
        <VStack spacing={6} textAlign="center">
          {/* Tick Mark Animation */}
          <Box position="relative">
            <Icon as={CheckCircleIcon} w={20} h={20} color="green.400" />
          </Box>

          {/* Success Message */}
          <Text fontSize="2xl" fontWeight="bold">
            Your order has been placed successfully!
          </Text>

          {/* Sign Out Button */}
          <HStack>
            <Button
              colorScheme="blue"
              onClick={handleSignOut}
              size="lg"
              isLoading={isPending}
            >
              Sign Out
            </Button>
            {/* Home Page Redirect Button */}
            <Button
              colorScheme="blue"
              onClick={handleRedirectHomePage}
              size="lg"
            >
              Home Page
            </Button>
          </HStack>
        </VStack>
      </Center>
    </Box>
    );
}

