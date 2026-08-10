import React, { useEffect, useState, useContext } from "react";
import {
    Box, VStack, HStack, Text, Badge, Heading, Spinner, Flex,
    List, ListItem, ListIcon, Divider, Avatar
} from "@chakra-ui/react";
import { FiStar, FiAward, FiTrendingUp } from "react-icons/fi";
import { LaundryContext } from "../Contexts/LaundryContext";

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export default function CommunityBoard() {
    const { laundryId } = useContext(LaundryContext);
    const [communityData, setCommunityData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCommunityData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [laundryId]);

    const fetchCommunityData = async () => {
        setLoading(true);
        try {
            const headers = {
                Authorization: `Bearer ${localStorage.getItem("idToken")}`,
            };
            const res = await fetch(
                `${API_URL}/api/referrals/community?laundryId=${laundryId}`,
                { headers }
            );
            if (res.ok) {
                setCommunityData(await res.json());
            }
        } catch (err) {
            console.error("Error fetching community data:", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Flex justify="center" align="center" py={6}>
                <Spinner size="md" />
            </Flex>
        );
    }

    if (!communityData) {
        return null;
    }

    const { recent_activity = [], leaderboard = [], milestones = [], total_referrals = 0 } = communityData;

    return (
        <Box bg="white" p={5} borderRadius="lg" boxShadow="sm" border="1px" borderColor="gray.100">
            <Heading size="md" mb={4} display="flex" alignItems="center" gap={2}>
                <FiTrendingUp /> Community Board
            </Heading>

            {/* Milestone Banners */}
            {milestones.length > 0 && (
                <VStack spacing={2} mb={4} align="stretch">
                    {milestones.map((milestone, idx) => (
                        <Box
                            key={idx}
                            p={3}
                            bg="purple.50"
                            borderRadius="md"
                            border="1px"
                            borderColor="purple.200"
                            textAlign="center"
                        >
                            <HStack justify="center" spacing={2}>
                                <FiAward color="purple" />
                                <Text fontWeight="bold" color="purple.700" fontSize="sm">
                                    🎉 {milestone.message || `Community milestone: ${milestone.threshold} referrals reached!`}
                                </Text>
                            </HStack>
                        </Box>
                    ))}
                </VStack>
            )}

            {/* Recent Activity Feed */}
            {recent_activity.length > 0 && (
                <Box mb={4}>
                    <Text fontWeight="semibold" fontSize="sm" color="gray.600" mb={2}>
                        Recent Activity
                    </Text>
                    <List spacing={2}>
                        {recent_activity.slice(0, 10).map((activity, idx) => (
                            <ListItem key={idx} fontSize="sm" color="gray.700">
                                <HStack>
                                    <ListIcon as={FiStar} color="yellow.500" />
                                    <Text>{activity.message}</Text>
                                </HStack>
                            </ListItem>
                        ))}
                    </List>
                </Box>
            )}

            {recent_activity.length === 0 && milestones.length === 0 && leaderboard.length === 0 && (
                <Text fontSize="sm" color="gray.500" textAlign="center" py={4}>
                    No community activity yet. Be the first to refer a friend!
                </Text>
            )}

            {/* Monthly Leaderboard */}
            {leaderboard.length > 0 && (
                <Box>
                    <Divider mb={3} />
                    <Text fontWeight="semibold" fontSize="sm" color="gray.600" mb={2}>
                        Monthly Leaderboard
                    </Text>
                    <VStack align="stretch" spacing={2}>
                        {leaderboard.slice(0, 10).map((entry, idx) => (
                            <HStack key={idx} justify="space-between" px={2} py={1}
                                bg={idx < 3 ? "yellow.50" : "transparent"}
                                borderRadius="md"
                            >
                                <HStack spacing={3}>
                                    <Avatar size="xs" name={entry.name} />
                                    <Text fontSize="sm" fontWeight={idx < 3 ? "bold" : "normal"}>
                                        {idx + 1}. {entry.name}
                                    </Text>
                                </HStack>
                                <Badge colorScheme={idx === 0 ? "yellow" : idx === 1 ? "gray" : idx === 2 ? "orange" : "blue"}>
                                    {entry.count} referral{entry.count !== 1 ? "s" : ""}
                                </Badge>
                            </HStack>
                        ))}
                    </VStack>
                </Box>
            )}

            {/* Total Referrals */}
            {total_referrals > 0 && (
                <Box mt={3} pt={3} borderTop="1px" borderColor="gray.100">
                    <Text fontSize="xs" color="gray.500" textAlign="center">
                        {total_referrals} total referrals in our community
                    </Text>
                </Box>
            )}
        </Box>
    );
}
