import React, { useEffect, useState, useContext } from "react";
import {
    Box, VStack, HStack, Text, Button, Badge, Heading, Divider,
    Spinner, useToast, IconButton, Flex, Table, Thead, Tbody,
    Tr, Th, Td, Stat, StatLabel, StatNumber,
    SimpleGrid
} from "@chakra-ui/react";
import { FiShare2, FiCopy, FiGift } from "react-icons/fi";
import { LaundryContext } from "../Components/Contexts/LaundryContext";
import CommunityBoard from "../Components/Community/CommunityBoard";

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export default function ReferralDashboardPage() {
    const { laundryId, laundryData } = useContext(LaundryContext);
    const toast = useToast();

    const [codeData, setCodeData] = useState(null);
    const [stats, setStats] = useState(null);
    const [credits, setCredits] = useState(null);
    const [referrals, setReferrals] = useState([]);
    const [loading, setLoading] = useState(true);

    const referralLink = codeData?.code
        ? `https://${window.location.host}/${laundryId}/site?ref=${codeData.code}`
        : "";

    // Clipboard fallback for when useClipboard doesn't pick up updated value
    const copyToClipboard = async () => {
        const textToCopy = codeData?.code
            ? `https://${window.location.host}/${laundryId}/site?ref=${codeData.code}`
            : "";
        if (!textToCopy) {
            toast({ title: "No referral code yet", status: "warning", duration: 2000 });
            return;
        }
        try {
            await navigator.clipboard.writeText(textToCopy);
            toast({ title: "Link copied!", status: "success", duration: 2000 });
        } catch (err) {
            // Fallback for non-HTTPS / older browsers
            const textarea = document.createElement("textarea");
            textarea.value = textToCopy;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            toast({ title: "Link copied!", status: "success", duration: 2000 });
        }
    };

    const getAuthHeaders = () => ({
        Authorization: `Bearer ${localStorage.getItem("idToken")}`,
    });

    useEffect(() => {
        fetchAllData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [laundryId]);

    const fetchAllData = async () => {
        setLoading(true);
        const headers = getAuthHeaders();
        try {
            const [codeRes, statsRes, creditsRes, referralsRes] = await Promise.allSettled([
                fetch(`${API_URL}/api/referrals/my-code?laundryId=${laundryId}`, { headers }),
                fetch(`${API_URL}/api/referrals/my-stats?laundryId=${laundryId}`, { headers }),
                fetch(`${API_URL}/api/referrals/my-credits?laundryId=${laundryId}`, { headers }),
                fetch(`${API_URL}/api/referrals/my-referrals?laundryId=${laundryId}`, { headers }),
            ]);

            if (codeRes.status === "fulfilled" && codeRes.value.ok) {
                setCodeData(await codeRes.value.json());
            }
            if (statsRes.status === "fulfilled" && statsRes.value.ok) {
                setStats(await statsRes.value.json());
            }
            if (creditsRes.status === "fulfilled" && creditsRes.value.ok) {
                setCredits(await creditsRes.value.json());
            }
            if (referralsRes.status === "fulfilled" && referralsRes.value.ok) {
                setReferrals(await referralsRes.value.json());
            }
        } catch (err) {
            console.error("Error fetching referral data:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Join ${laundryData?.laundryName || "us"} with my referral!`,
                    text: `Use my referral code ${codeData?.code} to get a reward on your first order!`,
                    url: referralLink,
                });
            } catch (err) {
                // User cancelled or share failed — fall back to copy
                if (err.name !== "AbortError") {
                    copyToClipboard();
                }
            }
        } else {
            copyToClipboard();
        }
    };

    if (loading) {
        return (
            <Flex justify="center" align="center" minH="300px">
                <Spinner size="lg" />
            </Flex>
        );
    }

    return (
        <Box p={[4, 6]} maxW="800px" mx="auto">
            <VStack spacing={6} align="stretch">
                <Heading size="lg" display="flex" alignItems="center" gap={2}>
                    <FiGift /> My Referrals
                </Heading>

                {/* My Code Section */}
                <Box bg="white" p={5} borderRadius="lg" boxShadow="sm" border="1px" borderColor="gray.100">
                    <Text fontWeight="bold" fontSize="md" mb={3}>My Referral Code</Text>
                    <HStack spacing={4} align="center" wrap="wrap">
                        <Box
                            px={4} py={2} bg="blue.50" borderRadius="md"
                            border="2px dashed" borderColor="blue.300"
                            fontWeight="bold" fontSize="xl" letterSpacing="widest"
                        >
                            {codeData?.code || "—"}
                        </Box>
                        <Button
                            leftIcon={<FiShare2 />}
                            colorScheme="blue"
                            size="sm"
                            onClick={handleShare}
                        >
                            Share
                        </Button>
                        <IconButton
                            icon={<FiCopy />}
                            aria-label="Copy referral link"
                            size="sm"
                            variant="outline"
                            onClick={copyToClipboard}
                        />
                    </HStack>
                    {referralLink && (
                        <Text fontSize="xs" color="gray.500" mt={2} noOfLines={1}>
                            {referralLink}
                        </Text>
                    )}
                </Box>

                {/* My Stats Section */}
                <Box bg="white" p={5} borderRadius="lg" boxShadow="sm" border="1px" borderColor="gray.100">
                    <Text fontWeight="bold" fontSize="md" mb={3}>My Stats</Text>
                    <SimpleGrid columns={[2, 4]} spacing={4}>
                        <Stat>
                            <StatLabel>Total Referrals</StatLabel>
                            <StatNumber>{stats?.totalReferrals ?? 0}</StatNumber>
                        </Stat>
                        <Stat>
                            <StatLabel>Conversions</StatLabel>
                            <StatNumber>{stats?.conversions ?? 0}</StatNumber>
                        </Stat>
                        <Stat>
                            <StatLabel>Pending</StatLabel>
                            <StatNumber>{stats?.pending ?? 0}</StatNumber>
                        </Stat>
                        <Stat>
                            <StatLabel>Total Earned</StatLabel>
                            <StatNumber>{stats?.totalEarned ?? "$0.00"}</StatNumber>
                        </Stat>
                    </SimpleGrid>
                </Box>

                {/* Credit Balance Section */}
                <Box bg="white" p={5} borderRadius="lg" boxShadow="sm" border="1px" borderColor="gray.100">
                    <Text fontWeight="bold" fontSize="md" mb={3}>Credit Balance</Text>
                    <Text fontSize="2xl" fontWeight="bold" color="green.600">
                        {credits?.balance ?? "$0.00"}
                    </Text>
                    {credits?.credits?.length > 0 && (
                        <Box mt={3}>
                            <Text fontSize="sm" color="gray.600" mb={2}>Expiration Breakdown:</Text>
                            <VStack align="stretch" spacing={1}>
                                {credits.credits.map((credit, idx) => (
                                    <HStack key={idx} justify="space-between" fontSize="sm">
                                        <Text>{credit.amount}</Text>
                                        <Badge colorScheme={
                                            new Date(credit.expiresAt) < new Date(Date.now() + 7 * 86400000)
                                                ? "red" : "green"
                                        }>
                                            Expires {new Date(credit.expiresAt).toLocaleDateString()}
                                        </Badge>
                                    </HStack>
                                ))}
                            </VStack>
                        </Box>
                    )}
                </Box>

                {/* My Referrals List */}
                <Box bg="white" p={5} borderRadius="lg" boxShadow="sm" border="1px" borderColor="gray.100">
                    <Text fontWeight="bold" fontSize="md" mb={3}>My Referrals</Text>
                    {referrals?.referrals?.length > 0 ? (
                        <Table size="sm" variant="simple">
                            <Thead>
                                <Tr>
                                    <Th>Name</Th>
                                    <Th>Status</Th>
                                </Tr>
                            </Thead>
                            <Tbody>
                                {referrals.referrals.map((ref, idx) => (
                                    <Tr key={idx}>
                                        <Td>{ref.firstName}</Td>
                                        <Td>
                                            <Badge colorScheme={
                                                ref.status === "rewarded" ? "green" :
                                                ref.status === "first_order_completed" ? "blue" : "yellow"
                                            }>
                                                {ref.status === "signed_up" ? "Signed Up" :
                                                 ref.status === "first_order_completed" ? "First Order" :
                                                 ref.status === "rewarded" ? "Rewarded" : ref.status}
                                            </Badge>
                                        </Td>
                                    </Tr>
                                ))}
                            </Tbody>
                        </Table>
                    ) : (
                        <Text fontSize="sm" color="gray.500">
                            No referrals yet. Share your code to get started!
                        </Text>
                    )}
                </Box>

                <Divider />

                {/* Community Board */}
                <CommunityBoard />
            </VStack>
        </Box>
    );
}
