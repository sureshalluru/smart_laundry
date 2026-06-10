import React, { useState, useEffect } from "react";
import {
    IconButton,
    Spinner,
    Tooltip,
    useToast,
    Menu,
    MenuButton,
    MenuList,
    MenuItem,
    useBreakpointValue,
} from "@chakra-ui/react";
import axios from "axios";
import { useParams } from "react-router-dom";
import { BellIcon } from "@chakra-ui/icons";
import {fetchLaundryInfo} from './LaundryInfoManagement'; 

export const NotificationButton = ({ order }) => {
    
    const apiUrl = `${process.env.REACT_APP_AWS_API_URL}/api/admin/send-notifications`;

    const [loading, setLoading] = useState(false);
    const toast = useToast();
    const apiKey = process.env.REACT_APP_AWS_API_KEY;
    const { laundryId } = useParams();
    // 🔥 State to store fetched Laundry Info
    const [laundryEmail, setLaundryEmail] = useState("");
    const [laundryPhone, setLaundryPhone] = useState("");
    const [adminDomain, setAdminDomain] = useState("");
    const [userDomain, setUserDomain] = useState("");
    const authToken = localStorage.getItem('idToken');
    // 🔥 Responsive settings using Chakra UI's breakpoints
    const buttonSize = useBreakpointValue({ base: "sm", md: "md", lg: "lg", xl: "lg" }); 
    const tooltipPlacement = useBreakpointValue({ base: "bottom", md: "top" });
    const menuPlacement = useBreakpointValue({ base: "bottom-end", md: "bottom-start" });

    const [shortUrl, setShortUrl] = useState("");

    
    // Fetch Laundry Info on component mount
    useEffect(() => {
        const getLaundryInfo = async () => {
            if (!laundryId) return; // Avoid running with undefined laundryId
    
            console.log("Fetching laundry info...");
            const laundryData = await fetchLaundryInfo(laundryId);
            if (laundryData) {
                setLaundryEmail(laundryData.email || "");
                setLaundryPhone(laundryData.phone || "");
                setAdminDomain(laundryData.domain?.adminDomain || "");
                setUserDomain(laundryData.domain?.userDomain || "https://main.d2th8pw9g4ufxz.amplifyapp.com");
                console.log("user domain:", laundryData.domain?.userDomain); // Log once
            }
        };
    
        getLaundryInfo();
    }, [laundryId]);
    const baseUrl = window.location.origin;
    const orderDetailsUrl = `${baseUrl}/${laundryId}/user/my-orders/?order_id=${order?.orderId}&is_open=true`;

    useEffect(() => {
        const shortenUrl = async () => {
            if (!orderDetailsUrl) return;

            try {
                const response = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(orderDetailsUrl)}`);
                setShortUrl(response.data); // Set the shortened URL
            } catch (error) {
                console.error("Error shortening URL:", error.response?.data || error.message || error);
                setShortUrl(orderDetailsUrl); // Fallback to original if API fails
            }
        };

        shortenUrl();
    }, [orderDetailsUrl]);

    const sendNotification = async (type) => {
        if (!order || !order.orderId) {
            toast({
                title: "Error",
                description: "Order details are missing.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            return;
        }

        const { customerEmail, customerPhone, orderStatus, orderType, paymentStatus, laundryName } = order;
        const customerNotification = order["customer Notification"];
        console.log("order status:",orderStatus);
        console.log("order:", order);

        if (!customerNotification) {
            toast({
                title: "No Notification Preference",
                description: "Customer has not set a preference for notifications.",
                status: "info",
                duration: 3000,
                isClosable: true,
            });
            return;
        }

        setLoading(true);

        let message = "";
        let subject = "";
        let description = "";
        let emailMessage = "";
        
        if (type === "payment") {
            if (paymentStatus !== "Unpaid") {
                toast({
                    title: "Payment Already Completed",
                    description: "This order does not require a payment reminder.",
                    status: "info",
                    duration: 3000,
                    isClosable: true,
                });
                setLoading(false);
                return;
            }
            message = "Dear " + order.customerName + 
            ", this is a reminder that payment for your laundry order " + order.orderId + 
            " at " + laundryName + " is still pending. Please complete the payment at your earliest convenience." + 
            
            " Pay Now: " + shortUrl + 
            
            " Thank you, " + laundryName + 
            " Team. Contact: " + laundryPhone;
            
            emailMessage = `<!DOCTYPE html>\\n\
                <html>\\n\
                <head>\\n\
                    <style>\\n\
                        body { font-family: Arial, sans-serif; line-height: 1.6; text-align: center; color: #333; font-size: 17px;}\\n\
                        .container { padding: 20px; text-align: center; background-color: #f9f9f9; font-size: 17px;}\\n\
                        .button { background-color: #28a745; color: white !important; padding: 10px 20px; text-decoration: none; font-size: 20px;}\\n\
                        .left-align { text-align: left; margin-left: 20px; }\\n\
                        .footer { margin-top: 20px; font-size: 14px; text-align: center; color: #777; }\\n\
                    </style>\\n\
                </head>\\n\
                <body>\\n\
                    <div class='container'>\\n\
                        <p class='left-align'>Dear <strong>${order.customerName}</strong>,</p>\\n\
                        <p class='left-align'>This is a friendly reminder regarding the outstanding payment for your laundry order <strong>${order.orderId}</strong>. Please complete the payment at your earliest convenience to facilitate a smooth transaction.</p>\\n\
                        <a href='${shortUrl}' class='button'>Pay Now</a>\\n\
                    </div>\\n\
                    <div class='footer'>\\n\
                        <p>Thank you,</p>\\n\
                        <p><strong>${laundryName} Team</strong></p>\\n\
                        <p><strong>${laundryPhone}</strong></p>\\n\
                        <p><strong>${laundryEmail}</strong></p>\\n\
                        <p><strong>${userDomain}</strong></p>\\n\
                    </div>\\n\
                </body>\\n\
                </html>`;
        
        
            subject = `Payment Reminder for Order Id ${order.orderId} at ${laundryName}`;
            description = `Payment reminder sent to ${customerEmail}`;
            
            } else if (type === "pickup") {
            if (!order.orderId.startsWith("IS") || orderStatus === "OrderPickedUp") {
                toast({
                    title: "Pickup Reminder Not Applicable",
                    description: "Pickup reminders are only for InStore orders that are not yet picked up.",
                    status: "info",
                    duration: 3000,
                    isClosable: true,
                });
                setLoading(false);
                return;
            }
            message = "Dear " + order.customerName + 
            ", your laundry order " + order.orderId + 
            " is ready for pickup at " + laundryName + 
            ". Please visit us at your convenience to collect your order." + 

            " View Order: " + shortUrl + 

            " Thank you, " + laundryName + 
            " Team. Contact: " + laundryPhone;
            emailMessage = `<!DOCTYPE html>\\n\
            <html>\\n\
            <head>\\n\
            <style>\\n\
                body { font-family: Arial, sans-serif; line-height: 1.6; text-align: center; color: #333; font-size: 17px; }\\n\
                .container { padding: 20px; text-align: center; background-color: #f9f9f9; font-size: 17px; }\\n\
                .left-align { text-align: left; margin-left: 20px; }\\n\
                .button { background-color:rgb(49, 26, 179); color: white !important; padding: 10px 20px; text-decoration: none; font-size: 20px; }\\n\
                .footer { margin-top: 20px; font-size: 14px; text-align: center; color: #777; font-size: 17px; }\\n\
            </style>\\n\
        </head>\\n\
        <body>\\n\
            <div class='container'>\\n\
                <p class='left-align'>Dear <strong>${order.customerName}</strong>,</p>\\n\
                <p>This is a friendly reminder that your laundry order <strong>${order.orderId}</strong> is ready for pickup at <strong>${laundryName}</strong>.</p>\\n\
                <a href='${shortUrl}' class='button'>View Order Details</a>\\n\
                <p>Please visit our store at your convenience to collect your order.</p>\\n\
            </div>\\n\
            <div class='footer'>\\n\
                <p>Thank you,</p>\\n\
                <p><strong>${laundryName} Team</strong></p>\\n\
                <p><strong>${laundryPhone}</strong></p>\\n\
                <p><strong>${laundryEmail}</strong></p>\\n\
                <p><strong>${userDomain}</strong></p>\\n\
            </div>\\n\
        </body>\\n\
            </html>`;
            subject = `Pickup Reminder for Order ${order.orderId} at ${laundryName}`;
            description = `Pickup reminder sent to ${customerEmail}`;
        }

        const headers = { "Content-Type": "application/json", 'Authorization': `Bearer ${authToken}`, 'X-Amz-Date': laundryId};

        try {
            if (customerNotification.email && customerEmail) {
                const emailPayload = {
                    type: "email",
                    recipient: customerEmail,
                    sender: laundryEmail,
                    subject: subject,
                    message: emailMessage,
                };

                await axios.post(apiUrl, emailPayload, { headers });

                toast({
                    title: "Email Sent",
                    description: description,
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                });
            }

            if (customerNotification.phone && customerPhone) {
                const smsPayload = {
                    type: "sms",
                    recipient: customerPhone,
                    sender: `${laundryName}`,
                    message: message,
                };

                await axios.post(apiUrl, smsPayload, { headers });

                toast({
                    title: "SMS Sent",
                    description: `Reminder sent to ${customerPhone}`,
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                });
            }
        } catch (error) {
            console.error("API Error:", error.response?.data);
            toast({
                title: "Error",
                description: "Failed to send notification.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Menu portalProps={{ appendToBody: true }}>
            {/* <Tooltip label="Send Reminder" fontSize="sm" placement={tooltipPlacement}>
                <MenuButton
                    as={IconButton}
                    icon={loading ? <Spinner size="sm" /> : <BellIcon />}
                    colorScheme="red"
                    variant="ghost"
                    minW="auto" 
                    p={0} 
                    aria-label="Send Reminder"
                    size={buttonSize}
                />
            </Tooltip> */}

            <Tooltip label="Send Reminder" fontSize="sm" placement={tooltipPlacement}>
                <MenuButton
                    as={IconButton}
                    icon={loading ? <Spinner size="sm" /> : <BellIcon />}
                    colorScheme="red"
                    size="lg" 
                    aria-label="Send Reminder"
                />
            </Tooltip>




            <MenuList placement={menuPlacement}>
                <MenuItem
                    onClick={() => sendNotification("payment")}
                    isDisabled={order.paymentStatus !== "Unpaid"}
                >
                    💳 Send Payment Reminder
                </MenuItem>
                <MenuItem
                    onClick={() => sendNotification("pickup")}
                    isDisabled={!order.orderId.startsWith("IS") || order.orderStatus === "OrderPickedUp"}
                >
                    📦 Send Pickup Reminder for Instore Order
                </MenuItem>
            </MenuList>
        </Menu>
    );
};
