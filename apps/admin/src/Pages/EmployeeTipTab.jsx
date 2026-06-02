import React, { useEffect, useState, useMemo } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Box,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Spinner,
  useToast,
  ButtonGroup,
  Button,
  Input,
  HStack,
  Flex,
  useColorModeValue,
} from "@chakra-ui/react";
import { format, parseISO, isAfter } from "date-fns";
import { fetchEmployeeTips } from "./LaundryInfoManagement";

/* ---------- helpers ---------- */
const today       = new Date();
const MAX_DATE    = format(today, "yyyy-MM-dd");
const MONTH_START = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
const money = (n = 0) => `$${n.toFixed(2)}`;

export default function EmployeeTipTab({ laundryId }) {
  const toast      = useToast();
  const cardBg     = useColorModeValue("white", "gray.800");
  const monthTint  = useColorModeValue("teal.50", "teal.900");
  const empTint    = useColorModeValue("blue.50", "blue.900");

  /* ───── date pickers (UI) ───── */
  const [startPick, setStartPick] = useState(MONTH_START);
  const [endPick,   setEndPick]   = useState(MAX_DATE);

  /* ───── applied range ───── */
  const [start, setStart] = useState(MONTH_START);
  const [end,   setEnd]   = useState(MAX_DATE);

  /* ───── data & filters ───── */
  const [tips,    setTips]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [method,  setMethod]  = useState("All");

  /* ───── fetch tips ───── */
  const load = async (s, e) => {
    setLoading(true);
    try {
      const data = await fetchEmployeeTips(laundryId, s, e);
      setTips(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Failed to load", status: "error", duration: 3000, isClosable: true });
      setTips([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(start, end); }, [laundryId]); // eslint-disable-line

  /* ───── date-picker handlers ───── */
  const handleStartInput = (v) => {
    const next = v || MONTH_START;
    if (isAfter(new Date(next), new Date(endPick))) setEndPick(next);
    setStartPick(next);
  };
  const handleEndInput = (v) => {
    const next = v || MAX_DATE;
    if (isAfter(new Date(startPick), new Date(next))) setStartPick(MONTH_START);
    setEndPick(next);
  };
  const apply = () => {
    if (isAfter(new Date(startPick), new Date(endPick))) {
      toast({ title: "Invalid range", description: "End date cannot be before start date.", status: "warning" });
      return;
    }
    setStart(startPick);
    setEnd(endPick);
    load(startPick, endPick);
  };

  /* ───── runtime filters ───── */
  const visible = useMemo(() => {
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end}T23:59:59`);
    return tips.filter(t => {
      const okMethod = method === "All" || t.tipMethod?.toLowerCase() === method.toLowerCase();
      const d = t.createdAt ? new Date(t.createdAt) : null;
      return okMethod && d && d >= s && d <= e;
    });
  }, [tips, method, start, end]);

  /* ───── group: month ➜ emp ➜ rows ───── */
  const grouped = useMemo(() => {
    return visible.reduce((acc, t) => {
      const month = format(parseISO(t.createdAt), "yyyy-MM");
      const empId = t.tipReceiverId || "Unassigned";
      acc[month] ??= {};
      acc[month][empId] ??= [];
      acc[month][empId].push(t);
      return acc;
    }, {});
  }, [visible]);

  /* ---------- UI ---------- */
  return (
    <Box p={{ base: 2, md: 3 }}>
      {/* ───── filter bar ───── */}
      <Box
        bg={useColorModeValue("whiteAlpha.700", "whiteAlpha.100")}
        border="1px solid"
        borderColor={useColorModeValue("blackAlpha.100", "whiteAlpha.200")}
        backdropFilter="blur(6px)"
        p={4}
        borderRadius="xl"
        boxShadow="sm"
        mb={6}
      >
        <Flex wrap="wrap" gap={4} justify={{ base: "center", md: "space-between" }}>
          {/* Date range */}
          <HStack spacing={3}>
            <Input
              type="date"
              value={startPick}
              max={MAX_DATE}
              onChange={(e) => handleStartInput(e.target.value)}
              size="sm"
              borderRadius="full"
              variant="outline"
              border="1px solid"
              borderColor="gray.400"
              bg="white"
              _hover={{ borderColor: "teal.400" }}
              _focus={{ ring: 1, ringColor: "teal.500", borderColor: "teal.500" }}
            />
            <Input
              type="date"
              value={endPick}
              max={MAX_DATE}
              onChange={(e) => handleEndInput(e.target.value)}
              size="sm"
              borderRadius="full"
              variant="outline"
              border="1px solid"
              borderColor="gray.400"
              bg="white"
              _hover={{ borderColor: "teal.400" }}
              _focus={{ ring: 1, ringColor: "teal.500", borderColor: "teal.500" }}
            />
            <Button colorScheme="teal" size="sm" borderRadius="full" px={6} onClick={apply}>
              Apply
            </Button>
          </HStack>

          {/* Card / Cash toggle */}
          <ButtonGroup size="sm" isAttached variant="outline">
            {["All", "Card", "Cash"].map((t) => (
              <Button
                key={t}
                onClick={() => setMethod(t)}
                borderRadius="full"
                variant={method === t ? "solid" : "outline"}
                colorScheme="teal"
              >
                {t}
              </Button>
            ))}
          </ButtonGroup>
        </Flex>
      </Box>

      {/* ───── main content ───── */}
      {loading ? (
        <Box textAlign="center" mt={12}>
          <Spinner size="xl" />
          <Text mt={4}>Loading…</Text>
        </Box>
      ) : Object.keys(grouped).length === 0 ? (
        <Text>No tips yet for {format(new Date(start), "MMMM yyyy")}.</Text>
      ) : (
        <Accordion allowMultiple>
          {Object.entries(grouped).map(([month, empMap]) => {
            /* month totals */
            const monthCash = Object.values(empMap).flat()
              .filter((t) => t.tipMethod?.toLowerCase() === "cash")
              .reduce((s, t) => s + (t.tipAmount || 0), 0);
            const monthCard = Object.values(empMap).flat()
              .filter((t) => t.tipMethod?.toLowerCase() === "card")
              .reduce((s, t) => s + (t.tipAmount || 0), 0);
            const monthTotal = monthCash + monthCard;

            return (
              <AccordionItem key={month} bg={monthTint} borderRadius="lg" mb={4} boxShadow="xs">
                {/* Month header */}
                <h2>
                  <AccordionButton _expanded={{ bg: "teal.100" }} px={6} py={3}>
                    <Flex flex="1" justify="space-between" align="center" flexWrap="wrap" gap={2}>
                      <Text fontWeight="bold">
                        {format(parseISO(`${month}-01`), "MMMM yyyy")}
                      </Text>
                      <Text fontSize="sm" color="gray.700" whiteSpace="nowrap">
                        {money(monthTotal)}{" "}
                        <Text as="span" fontSize="xs" color="gray.500">
                          (card {money(monthCard)}, cash {money(monthCash)})
                        </Text>
                      </Text>
                    </Flex>
                    <AccordionIcon />
                  </AccordionButton>
                </h2>

                {/* Month body */}
                <AccordionPanel pb={4} bg={cardBg} borderRadius="0 0 lg lg">
                 <Box maxW={{ base: "100%", md: "850px" }} mx="auto" w="full">
                    <Accordion allowMultiple>
                    {Object.entries(empMap).map(([empId, list]) => {
                      const tot  = list.reduce((s, t) => s + (t.tipAmount || 0), 0);
                      const cash = list.filter((t) => t.tipMethod?.toLowerCase() === "cash")
                        .reduce((s, t) => s + (t.tipAmount || 0), 0);
                      const card = list.filter((t) => t.tipMethod?.toLowerCase() === "card")
                        .reduce((s, t) => s + (t.tipAmount || 0), 0);

                      return (
                        <AccordionItem key={empId} bg={empTint} borderRadius="md" mb={3} boxShadow="xs">
                          <h3>
                            <AccordionButton
                              _expanded={{ bg: "blue.100" }}
                              borderRadius="md"
                              px={4}
                              py={1}            /* tighter vertical padding */
                            >
                              {/* ── employee label + totals ── */}
                              <Flex
                                w="full"
                                align="center"
                                justify="space-between"
                                columnGap={4}
                                rowGap={1}
                                flexWrap="wrap"  /* lets them wrap on xs screens */
                              >
                                <Text
                                  fontWeight="semibold"
                                  whiteSpace="nowrap"
                                >
                                  Employee:&nbsp;{empId}
                                </Text>

                                <Text
                                  fontSize="sm"
                                  color="gray.600"
                                  whiteSpace="nowrap"
                                >
                                  {money(tot)}{" "}
                                  <Text as="span" fontSize="xs" color="gray.500">
                                    (card&nbsp;{money(card)}, cash&nbsp;{money(cash)})
                                  </Text>
                                </Text>
                              </Flex>

                              <AccordionIcon />
                            </AccordionButton>


                          </h3>

                          {/* Employee detail table */}
                          <AccordionPanel bg={cardBg} px={0}>
                            <Box maxH="320px" overflow="auto">
                              <Table size="sm" variant="striped">
                                <Thead position="sticky" top={0} bg={empTint} zIndex={1}>
                                  <Tr>
                                    <Th>Order ID</Th>
                                    <Th>Date</Th>
                                    <Th isNumeric>Total</Th>
                                    <Th isNumeric>Grand</Th>
                                    <Th isNumeric>Tip</Th>
                                    <Th>Tip&nbsp;%</Th>
                                    <Th>Type</Th>
                                    <Th>Method</Th>
                                  </Tr>
                                </Thead>
                                <Tbody>
                                  {list.map((t, i) => (
                                    <Tr key={i}>
                                      <Td>{t.orderId || "-"}</Td>
                                      <Td>{format(parseISO(t.createdAt), "yyyy-MM-dd hh:mm a")}</Td>
                                      <Td isNumeric>{money(t.totalCost || 0)}</Td>
                                      <Td isNumeric>{money(t.grandTotal || 0)}</Td>
                                      <Td isNumeric>{money(t.tipAmount || 0)}</Td>
                                      <Td>{t.tipPercentage != null ? `${t.tipPercentage}%` : "-"}</Td>
                                      <Td>{t.tipType || "-"}</Td>
                                      <Td>{t.tipMethod || "-"}</Td>
                                    </Tr>
                                  ))}
                                </Tbody>
                              </Table>
                            </Box>
                          </AccordionPanel>
                        </AccordionItem>
                      );
                    })}
                    </Accordion>
                  </Box>
                </AccordionPanel>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </Box>
  );
}

