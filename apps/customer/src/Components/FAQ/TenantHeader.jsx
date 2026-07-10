import React, { useContext } from 'react';
import { Box, Flex, HStack, Image, Text, Button, VStack, Icon } from '@chakra-ui/react';
import { FiMapPin } from 'react-icons/fi';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { LaundryContext } from '../Contexts/LaundryContext';

/**
 * TenantHeader — lightweight branded header for SEO pages (FAQ, city pages).
 * Shows tenant logo, name, and a "Schedule Pickup" CTA.
 * Reads data from LaundryContext.
 */
const TenantHeader = () => {
    const { laundryId } = useParams();
    const { laundryData } = useContext(LaundryContext);

    const laundryName = laundryData?.laundryName || '';
    const laundryLogo = laundryData?.laundryLogo || '';
    const address = laundryData?.address || '';

    return (
        <Box
            as="header"
            position="sticky"
            top="0"
            zIndex="1000"
            bg="white"
            borderBottom="1px solid"
            borderColor="gray.100"
            boxShadow="sm"
        >
            <Flex
                maxW="900px"
                mx="auto"
                px={{ base: 4, md: 6 }}
                py={3}
                align="center"
                justify="space-between"
            >
                <HStack
                    as={RouterLink}
                    to={`/${laundryId}/site`}
                    spacing={3}
                    _hover={{ textDecoration: 'none' }}
                >
                    {laundryLogo && (
                        <Image
                            src={laundryLogo}
                            alt={laundryName}
                            boxSize={{ base: '32px', md: '38px' }}
                            objectFit="contain"
                            borderRadius="md"
                        />
                    )}
                    <VStack spacing={0} align="flex-start">
                        <Text
                            fontSize={{ base: 'sm', md: 'md' }}
                            fontWeight="700"
                            color="blue.700"
                        >
                            {laundryName}
                        </Text>
                        {address && (
                            <HStack spacing={1}>
                                <Icon as={FiMapPin} color="gray.400" boxSize={3} />
                                <Text fontSize="xs" color="gray.400">
                                    {address}
                                </Text>
                            </HStack>
                        )}
                    </VStack>
                </HStack>

                <Button
                    as={RouterLink}
                    to={`/${laundryId}/site`}
                    size="sm"
                    colorScheme="blue"
                    borderRadius="full"
                    display={{ base: 'none', sm: 'inline-flex' }}
                >
                    Schedule Pickup
                </Button>
            </Flex>
        </Box>
    );
};

export default TenantHeader;
