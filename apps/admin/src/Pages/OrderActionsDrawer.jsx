import React from "react";
import {
    Box,
    VStack,
    Text,
    Tooltip,
    IconButton,
    Drawer,
    DrawerOverlay,
    DrawerContent,
    DrawerHeader,
    DrawerBody,
    DrawerCloseButton,
    useBreakpointValue
} from "@chakra-ui/react";
import { QRCodeSVG } from "qrcode.react";
import { FaHistory, FaTicketAlt, FaReceipt, FaFileInvoice  } from "react-icons/fa";
import {NotificationButton} from "./SendNotification";
import { buildOrderUrl } from "../utils/ticketPrint";
import axios from "axios";

const OrderActionsDrawer = ({ isOpen, onClose, order, handleOrderHistory, handlePrintTicket, handlePrintReceipt, setSelectedOrder, setInvoiceModalOpen, setPaymentInstructions, setSendEmail, laundryId }) => {
    const drawerSize = useBreakpointValue({ base: "xs", sm: "xs", md: "sm", lg: "xs", xl: "xs" });
    const drawerMaxHeight = useBreakpointValue({ base: "70vh", sm: "65vh", md: "60vh" });


    if (!order) return null;

    return (
        <Drawer isOpen={isOpen} placement="right" onClose={onClose} size={drawerSize}>
            <DrawerOverlay />
            <DrawerContent
                minHeight="fit-content"
                maxHeight={drawerMaxHeight}
                minWidth="auto"
                maxWidth={{ base: "140px", md: "200px", lg: "250px" }}
                boxShadow="lg"
                borderLeftRadius="25px"
                borderRightRadius="25px"
                display="flex"
                flexDirection="column"
                bg="#F7FAFC"
                mt={{ base: "30px", md: "50px", lg: "70px" }}
                mr={{ base: "10px", md: "20px", lg: "30px"}}
                pb="15px"
            >
                {/* Close Button */}
                <DrawerCloseButton top="10px" right="10px" />

                {/* Drawer Header - Order ID & Actions */}
                <DrawerHeader
                    bg="white"
                    width="100%"
                    height="fit-content"
                    textAlign="center"
                    fontSize={{ base: "sm", md: "md", lg: "lg" }}
                    fontWeight="bold"
                    borderTopLeftRadius="25px"
                    borderTopRightRadius="25px"
                    p={3}
                >
                    {order?.orderId} <br /> Actions
                </DrawerHeader>

                {/* Drawer Body - Buttons */}
                <DrawerBody
                    overflowY="auto"
                    display="flex"
                    flexDirection="column"
                    alignItems="center"
                    justifyContent="flex-start"
                >
                    {order && (
                        <VStack align="center" >
                            {/* New Invoice Button for Commercial Orders */}
                            {order?.orderId?.startsWith("CL-") && (
                                <Tooltip label="Generate Invoice" aria-label="Generate Invoice">
                                    <IconButton
                                        icon={<FaFileInvoice />}
                                        colorScheme="purple"
                                        size="lg"
                                        onClick={() => {
                                            setSelectedOrder(order);
                                            setInvoiceModalOpen(true);
                                            setPaymentInstructions(order.paymentInstructions || "");
                                            setSendEmail(true);
                                        }}
                                        aria-label="Generate Invoice"
                                    />
                                </Tooltip>
                            )}

                            <Tooltip label="Print Ticket" aria-label="Print Ticket Tooltip">
                                <IconButton
                                    icon={<FaTicketAlt />}
                                    colorScheme="blue"
                                    size="lg"
                                    onClick={() => handlePrintTicket(order)}
                                    aria-label="Print Ticket"
                                />
                            </Tooltip>

                            <Tooltip label="Print Receipt" aria-label="Print Receipt Tooltip">
                                <IconButton
                                    icon={<FaReceipt />}
                                    colorScheme="blue"
                                    size="lg"
                                    onClick={() => handlePrintReceipt(order)}
                                    aria-label="Print Receipt"
                                />
                            </Tooltip>

                            <Tooltip label="View Order History" aria-label="View Order History Tooltip">
                                <IconButton
                                    icon={<FaHistory />}
                                    colorScheme="teal"
                                    size="lg"
                                    onClick={() => handleOrderHistory(order.orderId)}
                                    aria-label="View Order History"
                                />
                            </Tooltip>

                            {order.orderId.startsWith("IS-") && <NotificationButton order={order} />}

                            {/* Send Invoice button - only for pay-by-invoice orders */}
                            {order.payByInvoice && order.paymentStatus !== "Paid" && order.paymentStatus !== "Invoice Sent" && (
                                <Tooltip label="Send Invoice (Net 30)" placement="top">
                                    <IconButton
                                        icon={<FaFileInvoice />}
                                        colorScheme="purple"
                                        size="lg"
                                        isRound
                                        onClick={async () => {
                                            try {
                                                const res = await axios.post(
                                                    `${process.env.REACT_APP_AWS_API_URL}/api/payment/create-invoice`,
                                                    { orderId: order.orderId, laundryId: laundryId, customerEmail: order.customerEmail, customerName: order.customerName },
                                                    { headers: { Authorization: `Bearer ${localStorage.getItem('idToken')}` } }
                                                );
                                                if (res.data.status === 'success') {
                                                    alert(`Invoice sent to ${order.customerEmail}\nAmount: ${res.data.amountDue}\nPayment link: ${res.data.invoiceUrl}`);
                                                } else {
                                                    alert(`${res.data.message}`);
                                                }
                                            } catch (err) {
                                                alert(`Error: ${err.response?.data?.message || err.message}`);
                                            }
                                        }}
                                        aria-label="Send Invoice"
                                    />
                                </Tooltip>
                            )}

                            {/* QR Code - scan to open order on phone */}
                            <Tooltip label="Scan to open on phone" placement="top">
                                <Box
                                    display="flex"
                                    flexDirection="column"
                                    alignItems="center"
                                    mt={3}
                                    p={2}
                                    bg="white"
                                    borderRadius="md"
                                    boxShadow="sm"
                                >
                                    <QRCodeSVG
                                        value={buildOrderUrl(laundryId, order.orderId, null)}
                                        size={130}
                                        level="M"
                                    />
                                    <Text fontSize="xs" color="gray.600" mt={1} textAlign="center">
                                        Scan with phone
                                    </Text>
                                </Box>
                            </Tooltip>

                        </VStack>
                    )}
                </DrawerBody>
            </DrawerContent>

        </Drawer>
    );
};

export default OrderActionsDrawer;
