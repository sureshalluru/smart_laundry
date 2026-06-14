import React from 'react';
import {
    Box,
    Container,
    Heading,
    Text,
    Accordion,
    AccordionItem,
    AccordionButton,
    AccordionPanel,
    AccordionIcon,
    VStack,
    Badge,
    Divider,
    UnorderedList,
    ListItem,
    OrderedList,
} from '@chakra-ui/react';

const FAQSection = ({ title, color, items }) => (
    <Box w="100%" bg="white" borderRadius="lg" p={6} boxShadow="sm">
        <Heading size="md" mb={4} color={`${color}.600`}>
            {title}
        </Heading>
        <Accordion allowMultiple>
            {items.map((item, idx) => (
                <AccordionItem key={idx} border="none" mb={2}>
                    <AccordionButton
                        bg="gray.50"
                        borderRadius="md"
                        _hover={{ bg: 'gray.100' }}
                        _expanded={{ bg: `${color}.50`, color: `${color}.700` }}
                    >
                        <Box flex="1" textAlign="left" fontWeight="medium">
                            {item.question}
                        </Box>
                        <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel pb={4} pt={3} px={4} fontSize="sm" color="gray.700">
                        {item.answer}
                    </AccordionPanel>
                </AccordionItem>
            ))}
        </Accordion>
    </Box>
);

const FAQPage = () => {
    const gettingStartedItems = [
        {
            question: 'How do I set up my laundry shop?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>To set up your laundry shop, navigate through the following sections in the sidebar:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem><strong>Services:</strong> Add your laundry services (Wash & Fold, Dry Cleaning, etc.) and set pricing per pound or per bag.</ListItem>
                        <ListItem><strong>Products:</strong> Add any additional products you sell (detergent, fabric softener, etc.).</ListItem>
                        <ListItem><strong>Zip Codes:</strong> Define which zip codes your shop services for delivery.</ListItem>
                        <ListItem><strong>Delivery Schedule:</strong> Set your pickup and delivery time slots for each day of the week.</ListItem>
                        <ListItem><strong>Logo & Domain:</strong> Upload your shop logo and configure your custom domain.</ListItem>
                    </OrderedList>
                    <Text>Each section is accessible from the Settings area in the sidebar.</Text>
                </VStack>
            ),
        },
        {
            question: 'How does device registration work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Device registration adds a layer of security to your admin panel. Here's how it works:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>When an employee logs in from a new device for the first time, the device is registered with a unique identifier.</ListItem>
                        <ListItem>The manager/owner must approve the device before the employee can access the admin panel from it.</ListItem>
                        <ListItem>This prevents unauthorized access even if login credentials are compromised.</ListItem>
                        <ListItem>You can manage registered devices from the Manager Access section.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'How do I add employees and assign roles?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>To add employees:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem>Go to the "Manager Access Only" section in the sidebar.</ListItem>
                        <ListItem>Add a new employee with their name, phone number, and email.</ListItem>
                        <ListItem>Assign them a role: <Badge colorScheme="blue">Employee</Badge>, <Badge colorScheme="purple">Manager</Badge>, or <Badge colorScheme="green">Driver</Badge>.</ListItem>
                        <ListItem>Set a 4-digit PIN for employee credential validation on sensitive actions.</ListItem>
                    </OrderedList>
                    <Text>Employees can access the admin panel based on their assigned role permissions. Drivers use the separate Driver Access section.</Text>
                </VStack>
            ),
        },
    ];

    const orderManagementItems = [
        {
            question: 'What is the order lifecycle?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Every order follows this lifecycle:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem><Badge colorScheme="gray">OrderSubmitted</Badge> — Customer places the order online or in-store.</ListItem>
                        <ListItem><Badge colorScheme="blue">ReadyForIntake</Badge> — Order is confirmed and ready for pickup/intake.</ListItem>
                        <ListItem><Badge colorScheme="cyan">ReceivedAtFacility</Badge> — Laundry has been physically received at your facility.</ListItem>
                        <ListItem><Badge colorScheme="yellow">ProcessingStarted</Badge> — Washing/cleaning has begun.</ListItem>
                        <ListItem><Badge colorScheme="orange">ProcessingCompleted</Badge> — Laundry is clean, folded, and ready. Payment is captured at this stage.</ListItem>
                        <ListItem><Badge colorScheme="purple">EnRouteToDelivery</Badge> — Driver is on the way to deliver.</ListItem>
                        <ListItem><Badge colorScheme="green">Delivered</Badge> — Order has been delivered to the customer.</ListItem>
                    </OrderedList>
                    <Text>You can advance orders through each status from the Active Orders page.</Text>
                </VStack>
            ),
        },
        {
            question: 'How do I edit an order?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>To edit an order, click on it from the Active Orders page to open the Order Actions drawer. You can:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem><strong>Add/remove services:</strong> Modify which services are included in the order.</ListItem>
                        <ListItem><strong>Update weight:</strong> Enter the actual weight after receiving the laundry at your facility.</ListItem>
                        <ListItem><strong>Add products:</strong> Include any additional products the customer requests.</ListItem>
                        <ListItem><strong>Update pricing:</strong> Adjust line items if needed before payment capture.</ListItem>
                    </UnorderedList>
                    <Text>Note: Edits should be made before the ProcessingCompleted stage, as payment is captured at that point.</Text>
                </VStack>
            ),
        },
        {
            question: 'How do I cancel an order?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>To cancel an order:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem>Open the order from Active Orders.</ListItem>
                        <ListItem>Click the "Cancel Order" button in the order actions.</ListItem>
                        <ListItem>Select a cancellation reason.</ListItem>
                        <ListItem>Confirm the cancellation.</ListItem>
                    </OrderedList>
                    <Text>If there's an active Uber delivery, you'll be prompted to cancel that as well. The $1 payment hold will be released automatically upon cancellation.</Text>
                </VStack>
            ),
        },
        {
            question: "What's the difference between in-store and online orders?",
            answer: (
                <VStack align="start" spacing={2}>
                    <Text><strong>Online Orders:</strong></Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>Customer places order from the website.</ListItem>
                        <ListItem>Customer's card is saved and a $1 hold is placed.</ListItem>
                        <ListItem>Delivery is scheduled or uses Uber instant pickup.</ListItem>
                        <ListItem>Payment is automatically captured at ProcessingCompleted.</ListItem>
                    </UnorderedList>
                    <Text mt={2}><strong>In-Store Orders:</strong></Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>Created by admin staff using the "Create Order" page.</ListItem>
                        <ListItem>Customer may or may not have a card on file.</ListItem>
                        <ListItem>Payment can be collected in-person or via a payment link sent to the customer.</ListItem>
                        <ListItem>No delivery is required unless specifically arranged.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'How does per-bag pricing work vs per-pound?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Your shop can offer two pricing models:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem><strong>Per-Pound:</strong> Customer is charged based on the actual weight of their laundry. The weight is entered when laundry is received at the facility. Final price = weight × price per pound.</ListItem>
                        <ListItem><strong>Per-Bag:</strong> Customer selects how many bags they have at a fixed price per bag. The price is known upfront at order time.</ListItem>
                    </UnorderedList>
                    <Text>You can configure which pricing models are available for each service in the Services settings.</Text>
                </VStack>
            ),
        },
    ];

    const deliveryItems = [
        {
            question: 'How does Uber instant pickup work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Uber Direct integration provides on-demand delivery:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem>When an order reaches a delivery-ready status, you can request an Uber pickup.</ListItem>
                        <ListItem>An Uber driver is dispatched to your facility to pick up the laundry.</ListItem>
                        <ListItem>The driver delivers directly to the customer's address.</ListItem>
                        <ListItem>Real-time tracking is available for both you and the customer.</ListItem>
                    </OrderedList>
                    <Text>Uber delivery is best for same-day or urgent deliveries. You can cancel an Uber delivery if needed before pickup.</Text>
                </VStack>
            ),
        },
        {
            question: 'How does scheduled delivery work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Scheduled delivery allows customers to choose a delivery time slot:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem><strong>LaundryDriver:</strong> Your own driver delivers orders during the selected time slot. Orders appear on the Driver page grouped by delivery window.</ListItem>
                        <ListItem><strong>Uber Scheduled:</strong> An Uber driver is dispatched at the scheduled time automatically.</ListItem>
                    </UnorderedList>
                    <Text>Delivery schedules are configured in the Delivery Schedule settings, where you define available time slots for each day.</Text>
                </VStack>
            ),
        },
        {
            question: 'How does the Driver page work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>The Driver page (accessible via Driver Access) allows drivers to:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem><strong>View assigned orders:</strong> See all orders assigned for delivery, filtered by date.</ListItem>
                        <ListItem><strong>Confirm pickup:</strong> Mark that they've picked up the laundry from the facility.</ListItem>
                        <ListItem><strong>Confirm delivery:</strong> Mark the order as delivered to the customer.</ListItem>
                        <ListItem><strong>Upload photos:</strong> Take and upload proof-of-delivery photos.</ListItem>
                        <ListItem><strong>View map:</strong> See all delivery locations on a map for route planning.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
    ];

    const paymentItems = [
        {
            question: 'How does the $1 hold work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>When a customer places an online order:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem>A $1 authorization hold is placed on their saved card via Stripe.</ListItem>
                        <ListItem>This verifies the card is valid and has available funds.</ListItem>
                        <ListItem>The $1 is NOT charged — it's just a hold that automatically expires.</ListItem>
                        <ListItem>The actual charge happens later at ProcessingCompleted based on the real order total.</ListItem>
                    </OrderedList>
                    <Text>If the order is canceled, the hold is released immediately.</Text>
                </VStack>
            ),
        },
        {
            question: 'How does payment capture work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Payment capture happens automatically at the <Badge colorScheme="orange">ProcessingCompleted</Badge> stage:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem>Once processing is complete, the system calculates the final order total (based on actual weight, services, products, delivery fees, tips).</ListItem>
                        <ListItem>The customer's saved card is charged the full amount via Stripe.</ListItem>
                        <ListItem>A receipt/notification is sent to the customer.</ListItem>
                    </OrderedList>
                    <Text>This two-step process (hold then capture) ensures customers are only charged for the actual service provided.</Text>
                </VStack>
            ),
        },
        {
            question: 'How do invoice/commercial customers work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Commercial/invoice customers are businesses that pay on terms rather than per-order:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>Mark a customer as "Pay by Invoice" in their account settings.</ListItem>
                        <ListItem>Orders from invoice customers skip the card hold step.</ListItem>
                        <ListItem>Orders are tracked and accumulated over a billing period.</ListItem>
                        <ListItem>Generate invoices from the Invoice section and email them to the customer.</ListItem>
                        <ListItem>Track payment status for each invoice.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'How do I collect payment for in-store orders?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>For in-store orders, you have several payment options:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem><strong>Card on file:</strong> If the customer has a card saved, charge it directly from the order actions.</ListItem>
                        <ListItem><strong>Payment link:</strong> Send the customer a payment link via SMS/email so they can pay online.</ListItem>
                        <ListItem><strong>Cash/external:</strong> Mark the order as paid externally if they pay cash or by other means.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
    ];

    const recurringItems = [
        {
            question: 'How do recurring/frequency orders work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Recurring orders allow customers to set up automatic laundry service:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>Customers choose a frequency: weekly, bi-weekly, or monthly.</ListItem>
                        <ListItem>The system automatically creates new orders based on the schedule.</ListItem>
                        <ListItem>Each recurring order uses the same services, address, and delivery preferences.</ListItem>
                        <ListItem>Pickup and delivery times follow the customer's original selections.</ListItem>
                        <ListItem>Payment is processed per-order as each one reaches ProcessingCompleted.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'How do I manage subscriptions?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>To manage customer subscriptions:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>View all active recurring orders from the orders list (they're marked with a recurring badge).</ListItem>
                        <ListItem>You can pause or cancel a customer's recurring schedule.</ListItem>
                        <ListItem>Customers can also manage their own recurring orders from their account.</ListItem>
                        <ListItem>If a recurring order fails (e.g., card declined), you'll be notified and the subscription will be paused.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
    ];

    const otherItems = [
        {
            question: 'How do promotions and coupons work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Navigate to the Promotions page from the sidebar to manage coupons:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>Create promo codes with percentage or fixed-amount discounts.</ListItem>
                        <ListItem>Set expiration dates and usage limits for each promotion.</ListItem>
                        <ListItem>Customers enter promo codes at checkout to apply discounts.</ListItem>
                        <ListItem>Track usage and performance of each promotion.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'How does the dashboard work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>The Dashboard provides an overview of your business performance:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>View daily, weekly, and monthly revenue.</ListItem>
                        <ListItem>Track order volume and trends.</ListItem>
                        <ListItem>Monitor key metrics like average order value and customer retention.</ListItem>
                        <ListItem>See at-a-glance summaries of active orders and deliveries.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'How are notifications sent?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>The platform sends automated notifications at key points:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem><strong>Email (via Brevo):</strong> Order confirmations, receipts, invoices, and marketing communications are sent through Brevo (formerly Sendinblue).</ListItem>
                        <ListItem><strong>SMS (via Twilio):</strong> Order status updates, delivery notifications, and payment links are sent via Twilio SMS.</ListItem>
                        <ListItem>Notifications are triggered automatically as orders move through statuses.</ListItem>
                        <ListItem>You can also send custom notifications from the Send Notification section.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'How does the chat system work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>The built-in chat system allows real-time communication with customers:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>Customers can initiate chat from their order page or the chat widget.</ListItem>
                        <ListItem>Admin staff see all conversations in the Chat page.</ListItem>
                        <ListItem>Messages are delivered in real-time.</ListItem>
                        <ListItem>Use chat for order clarifications, special instructions, or customer support.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
    ];

    return (
        <Container maxW="container.lg" py={8}>
            <VStack spacing={8} align="stretch">
                <Box textAlign="center">
                    <Heading size="lg" color="blue.700" mb={2}>
                        Admin FAQ & Help Guide
                    </Heading>
                    <Text color="gray.600">
                        Everything you need to know about managing your laundry shop
                    </Text>
                </Box>

                <Divider />

                <FAQSection title="🚀 Getting Started" color="blue" items={gettingStartedItems} />
                <FAQSection title="📋 Order Management" color="purple" items={orderManagementItems} />
                <FAQSection title="🚗 Delivery" color="green" items={deliveryItems} />
                <FAQSection title="💳 Payments" color="orange" items={paymentItems} />
                <FAQSection title="🔄 Recurring Orders" color="cyan" items={recurringItems} />
                <FAQSection title="📌 Other Features" color="teal" items={otherItems} />
            </VStack>
        </Container>
    );
};

export default FAQPage;
