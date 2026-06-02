import React, { useEffect, useState, useCallback } from 'react';
import {
    Box,
    Text,
    VStack,
    Heading,
    Flex,
    Spinner,
    useToast,
    Accordion,
    AccordionItem,
    AccordionButton,
    AccordionPanel,
    AccordionIcon,
    HStack,
    Badge
} from '@chakra-ui/react';
import { FaStar } from 'react-icons/fa';
import axios from 'axios';
import { useAuth } from '../Context/AuthContext';
import { useParams } from 'react-router-dom';

const EmployeeReviews = ({laundryTimeZone}) => {
    const { laundryId } = useParams();
    const [employees, setEmployees] = useState([]);
    const [reviews, setReviews] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadingReviews, setLoadingReviews] = useState({});
    const toast = useToast();
    const auth = useAuth();
    const authToken = auth.user?.id_token;
    const [expandedIndex, setExpandedIndex] = useState(null);

    const formatReviewDate = (dateString) => {
        if (!dateString) return 'N/A';

        const date = new Date(dateString);

        if (laundryTimeZone) {
            try {
                return date.toLocaleString('en-US', {
                    timeZone: laundryTimeZone,
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                console.error("Error formatting date with timezone:", e);
            }
        }
        // Default formatting when no timezone or error occurs
        return date.toLocaleString();
    };

    useEffect(() => {
        const fetchEmployees = async () => {
            setLoading(true);
            try {
                if (!authToken) {
                    throw new Error('Authentication token not available');
                }

                const response = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/admin/show-all-employees`,
                    {
                        params: {
                            operation: "showAllEmployees",
                            laundryId,
                        },
                        headers: {
                            'Authorization': `Bearer ${authToken}`
                        },
                    }
                );
                console.log("laundryTimeZone", laundryTimeZone);

                const reviewedEmployees = response.data.body.employees
                    .map(emp => ({
                        fullName: emp.fullName,
                        avgRating: emp.avgRating || 0,
                        employeeId: emp.employeeId,
                        role: emp.role
                    }));
                setEmployees(reviewedEmployees);
            } catch (error) {
                console.error("Error fetching employees:", error);
                toast({
                    title: "Error loading reviews",
                    description: error.message || "Could not retrieve employee reviews",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
            } finally {
                setLoading(false);
            }
        };

        if (laundryId && authToken) {
            fetchEmployees();
        }
    }, [laundryId, authToken, toast]);

    const fetchEmployeeReviews = useCallback(async (employeeId) => {
        if (reviews[employeeId]) return;

        setLoadingReviews(prev => ({ ...prev, [employeeId]: true }));
        try {
            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/get-employee-reviews`,
                {
                    params: {
                        operation: "getEmployeeReviews",
                        laundryId,
                        employeeId,
                        limit: 5
                    },
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    },
                }
            );

            // Handle both possible response formats
            const responseData = typeof response.data.body === 'string'
                ? JSON.parse(response.data.body)
                : response.data.body;

            setReviews(prev => ({
                ...prev,
                [employeeId]: responseData.reviews || []
            }));
        } catch (error) {
            console.error(`Error fetching reviews for employee ${employeeId}:`, error);
            toast({
                title: "Error loading reviews",
                description: `Could not retrieve reviews for employee ${employeeId}`,
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoadingReviews(prev => ({ ...prev, [employeeId]: false }));
        }
    }, [laundryId, authToken, toast, reviews]);
    // const renderStars = (rating) => {
    //     const stars = [];
    //     const fullStars = Math.floor(rating);
    //
    //     for (let i = 0; i < fullStars; i++) {
    //         stars.push(<FaStar key={`full-${i}`} color="gold" />);
    //     }
    //
    //     const remainingStars = 5 - stars.length;
    //     for (let i = 0; i < remainingStars; i++) {
    //         stars.push(<FaStar key={`empty-${i}`} color="gray" />);
    //     }
    //     return (
    //         <Flex align="center">
    //             {stars}
    //             <Text ml={2} fontSize="sm">{rating.toFixed(1)}</Text>
    //         </Flex>
    //     );
    // };
    const renderStars = (rating) => {
        return (
            <Flex align="center">
                {Array.from({ length: 5 }, (_, i) => (
                    <FaStar
                        key={i}
                        color={i < Math.floor(rating) ? "gold" : "gray"}
                    />
                ))}
                <Text ml={2} fontSize="sm">
                    {rating.toFixed(1)}
                </Text>
            </Flex>
        );
    };

    if (loading) {
        return (
            <Flex justify="center" align="center" minH="200px">
                <Spinner size="xl" />
            </Flex>
        );
    }

    return (
        <Box p={4}>
            <VStack spacing={4} align="stretch">
                <Heading as="h1" size="xl" mb={6}>Employee Reviews</Heading>

                <Box bg="white" borderRadius="md" boxShadow="md" p={4}>
                    <Box display="grid" gridTemplateColumns="1fr 1fr 1fr 1fr" fontWeight="semibold" pb={2} borderBottom="1px solid #e2e8f0">
                        <Text>EMPLOYEE ID</Text>
                        <Text>EMPLOYEE NAME</Text>
                        <Text>ROLE</Text>
                        <Text>AVERAGE RATING</Text>
                    </Box>

                    {employees.length > 0 ? (
                        <Accordion
                            allowToggle
                            width="100%"
                            index={expandedIndex}
                            onChange={(index) => {
                                setExpandedIndex(index);
                                if (index !== null && employees[index]) {
                                    const employeeId = employees[index].employeeId;
                                    fetchEmployeeReviews(employeeId);
                                }
                            }}
                        >
                            {employees.map((employee, index) => (
                                <AccordionItem key={`${employee.employeeId}-${index}`} border="none">
                                    <>
                                        <AccordionButton
                                            as={Box}
                                            p={0}
                                            _hover={{ bg: 'gray.50' }}
                                            width="100%"
                                        >
                                            <Box display="grid" gridTemplateColumns="1fr 1fr 1fr 1fr" alignItems="center" p={3} w="100%">
                                                <Text fontWeight="medium">{employee.employeeId}</Text>
                                                <Text fontWeight="medium">{employee.fullName}</Text>
                                                <Text fontWeight="medium">{employee.role}</Text>
                                                <Flex justify="space-between" align="center">
                                                    {renderStars(employee.avgRating)}
                                                    <AccordionIcon />
                                                </Flex>
                                            </Box>
                                        </AccordionButton>
                                        <AccordionPanel pb={4}>
                                            {loadingReviews[employee.employeeId] ? (
                                                <Flex justify="center" p={4}>
                                                    <Spinner />
                                                </Flex>
                                            ) : reviews[employee.employeeId]?.length > 0 ? (
                                                    <VStack align="stretch" spacing={4}>
                                                        <Text fontWeight="bold" fontSize="lg">Recent Reviews</Text>
                                                        {reviews[employee.employeeId].map((review, i) => (
                                                            <Box key={i} p={3} borderWidth="1px" borderRadius="md">
                                                                <HStack justify="space-between">
                                                                    <Badge colorScheme="blue">Order: {review.orderId}</Badge>
                                                                    <Text fontSize="sm" color="gray.500">
                                                                        {formatReviewDate(review.reviewDate)}
                                                                    </Text>
                                                                </HStack>
                                                                <Box mt={2}>
                                                                    {renderStars(review.employeeRating)}
                                                                </Box>
                                                                {review.reviewComment && (
                                                                    <Text mt={2}>{review.reviewComment}</Text>
                                                                )}
                                                            </Box>
                                                        ))}
                                                    </VStack>
                                                ) : (
                                                    <Text textAlign="center" py={4}>No recent reviews found</Text>
                                                )}

                                                </AccordionPanel>
                                    </>
                                </AccordionItem>
                            ))}
                        </Accordion>

                    ) : (
                        <Text textAlign="center" py={4}>No employee reviews available</Text>
                    )}
                </Box>
            </VStack>
        </Box>
    );
};

export default EmployeeReviews;