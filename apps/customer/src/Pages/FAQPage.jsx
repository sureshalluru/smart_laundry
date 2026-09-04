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
    const placingOrdersItems = [
        {
            question: 'How do I place an online laundry order?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Placing an order is easy:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem>Log in to your account and go to "Schedule Order".</ListItem>
                        <ListItem>Select the services you need (Wash & Fold, Dry Cleaning, etc.).</ListItem>
                        <ListItem>Choose your pricing preference (per-bag or per-pound if available).</ListItem>
                        <ListItem>Select your pickup and delivery time slots.</ListItem>
                        <ListItem>Confirm your address and payment method.</ListItem>
                        <ListItem>Review your order and submit!</ListItem>
                    </OrderedList>
                    <Text>You'll receive a confirmation notification once your order is placed.</Text>
                </VStack>
            ),
        },
        {
            question: 'What is the difference between per-bag and per-pound pricing?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Your laundry service may offer two pricing options:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem><strong>Per-Bag:</strong> You pay a flat rate for each bag of laundry. The price is fixed and known upfront when you place your order.</ListItem>
                        <ListItem><strong>Per-Pound:</strong> You're charged based on the actual weight of your laundry. The final price is determined after your laundry is weighed at the facility.</ListItem>
                    </UnorderedList>
                    <Text>Per-bag pricing gives you cost certainty, while per-pound may be more economical for lighter loads.</Text>
                </VStack>
            ),
        },
        {
            question: 'What is instant pickup (Uber) vs scheduled pickup?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>There are two pickup options available:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem><strong>Instant Pickup (Uber):</strong> An Uber driver is dispatched immediately to pick up your laundry. Best for when you need same-day service and want your laundry picked up ASAP.</ListItem>
                        <ListItem><strong>Scheduled Pickup:</strong> Choose a specific date and time window for pickup. A driver (either the laundry's own driver or Uber) will arrive during your selected time slot.</ListItem>
                    </UnorderedList>
                    <Text>Both options provide tracking so you can see when your driver is on the way.</Text>
                </VStack>
            ),
        },
        {
            question: 'How do I select delivery preferences?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>During checkout, you can set your delivery preferences:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>Choose your delivery address (or update it in your Account settings).</ListItem>
                        <ListItem>Select a delivery time slot that works for you.</ListItem>
                        <ListItem>Add any special instructions (e.g., "Leave at the front door").</ListItem>
                        <ListItem>Choose between standard scheduled delivery or instant Uber delivery.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
    ];

    const paymentItems = [
        {
            question: 'How do payments work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Here's how the payment process works:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem>When you place an order, your card is saved securely via Stripe.</ListItem>
                        <ListItem>A temporary $1 hold is placed to verify your card is valid (this is NOT a charge).</ListItem>
                        <ListItem>Your laundry is picked up, washed, and processed.</ListItem>
                        <ListItem>Once processing is complete, your card is charged the actual amount based on your order (weight, services, delivery fee, and tip).</ListItem>
                    </OrderedList>
                    <Text>The $1 hold is released automatically — you're only ever charged for the actual service.</Text>
                </VStack>
            ),
        },
        {
            question: 'How do I pay for in-store orders online?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>If you dropped off your laundry in-store:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>The shop may send you a payment link via SMS or email.</ListItem>
                        <ListItem>Click the link to view your order total and pay securely online.</ListItem>
                        <ListItem>Alternatively, if you have a card saved in your account, the shop can charge it directly (with your permission).</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'What is "Pay by Invoice" for commercial customers?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Pay by Invoice is designed for businesses and commercial accounts:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>Instead of paying per-order, charges are accumulated over a billing period.</ListItem>
                        <ListItem>You'll receive an invoice (via email) with all orders from that period.</ListItem>
                        <ListItem>Payment is due according to the agreed terms (e.g., Net 30).</ListItem>
                        <ListItem>Contact your laundry service to set up a commercial account.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
    ];

    const orderTrackingItems = [
        {
            question: 'How do I track my order status?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>To track your order:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem>Go to "My Orders" from the sidebar menu.</ListItem>
                        <ListItem>You'll see all your active and past orders.</ListItem>
                        <ListItem>Each order shows its current status with a colored badge.</ListItem>
                        <ListItem>You'll also receive SMS/email notifications as your order progresses.</ListItem>
                    </OrderedList>
                </VStack>
            ),
        },
        {
            question: 'What does each order status mean?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Here's what each status means for your order:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem><Badge colorScheme="gray">Order Submitted</Badge> — Your order has been placed and confirmed.</ListItem>
                        <ListItem><Badge colorScheme="blue">Ready for Pickup</Badge> — A driver is being assigned to pick up your laundry.</ListItem>
                        <ListItem><Badge colorScheme="cyan">Received at Facility</Badge> — Your laundry has arrived at the shop.</ListItem>
                        <ListItem><Badge colorScheme="yellow">Processing</Badge> — Your laundry is being washed and prepared.</ListItem>
                        <ListItem><Badge colorScheme="orange">Processing Complete</Badge> — Your laundry is clean and ready for delivery.</ListItem>
                        <ListItem><Badge colorScheme="purple">Out for Delivery</Badge> — A driver is on the way to deliver your laundry.</ListItem>
                        <ListItem><Badge colorScheme="green">Delivered</Badge> — Your laundry has been delivered!</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'How do I view order details and photos?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>From "My Orders," tap on any order to see its details:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>View the services included and pricing breakdown.</ListItem>
                        <ListItem>See pickup and delivery times.</ListItem>
                        <ListItem>View proof-of-delivery photos uploaded by the driver.</ListItem>
                        <ListItem>Check payment status and receipt information.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
    ];

    const recurringItems = [
        {
            question: 'How do I set up weekly or bi-weekly laundry service?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>To set up recurring service:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem>When placing an order, look for the "Recurring" or "Frequency" option.</ListItem>
                        <ListItem>Choose your preferred frequency: weekly, bi-weekly, or monthly.</ListItem>
                        <ListItem>Select your regular pickup and delivery time slots.</ListItem>
                        <ListItem>Confirm your order — future orders will be created automatically on your schedule.</ListItem>
                    </OrderedList>
                    <Text>Each recurring order uses the same services and preferences. You'll be notified before each pickup.</Text>
                </VStack>
            ),
        },
        {
            question: 'How do I cancel recurring orders?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>To cancel your recurring laundry service:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>Go to "My Orders" and find your recurring order (it will have a recurring indicator).</ListItem>
                        <ListItem>Open the order details and look for the option to cancel the recurring schedule.</ListItem>
                        <ListItem>Confirm the cancellation — no future orders will be created.</ListItem>
                        <ListItem>Any already-scheduled order that hasn't been picked up yet can be individually canceled.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
    ];

    const accountItems = [
        {
            question: 'How do I update my address?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>To update your delivery address:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem>Go to "Account" from the sidebar menu.</ListItem>
                        <ListItem>Find the address section and click to edit.</ListItem>
                        <ListItem>Enter your new address — it will autocomplete as you type.</ListItem>
                        <ListItem>Save your changes. Future orders will use the updated address.</ListItem>
                    </OrderedList>
                    <Text>You can also update your address during checkout for a specific order.</Text>
                </VStack>
            ),
        },
        {
            question: 'How do I leave a review?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>After your order is delivered, you can leave a review:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>Go to "My Orders" and find a completed order.</ListItem>
                        <ListItem>Look for the "Leave a Review" option.</ListItem>
                        <ListItem>Rate your experience and leave a comment.</ListItem>
                        <ListItem>Your feedback helps the laundry service improve!</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
    ];

    const cancellationItems = [
        {
            question: 'How do I cancel an order?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>To cancel an order:</Text>
                    <OrderedList spacing={1} pl={4}>
                        <ListItem>Go to "My Orders" and find the order you want to cancel.</ListItem>
                        <ListItem>Open the order details.</ListItem>
                        <ListItem>Tap the "Cancel Order" button.</ListItem>
                        <ListItem>Confirm the cancellation.</ListItem>
                    </OrderedList>
                </VStack>
            ),
        },
        {
            question: 'When can I cancel an order?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Cancellation is available under the following conditions:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>You can cancel up to <strong>6 hours before your scheduled pickup time</strong>.</ListItem>
                        <ListItem>Once a driver has been dispatched or your laundry has been picked up, cancellation is no longer available.</ListItem>
                        <ListItem>If you need to cancel after the cutoff, please contact the laundry directly via chat.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'What happens to my payment hold on cancellation?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>When you cancel an order:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>The $1 authorization hold on your card is released immediately.</ListItem>
                        <ListItem>No charges are made to your card.</ListItem>
                        <ListItem>Depending on your bank, the hold may take 1–3 business days to disappear from your statement.</ListItem>
                        <ListItem>You will receive a confirmation notification that your order has been canceled.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
    ];

    const pricingExtrasItems = [
        {
            question: 'What are add-ons / processing extras?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Add-ons are optional extras your laundry may offer on top of the base wash — for example hang-dry, extra rinse, hypoallergenic detergent, or fabric softener.</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>You can select any available add-ons while building your order.</ListItem>
                        <ListItem>Some add-ons are priced per item and some per pound, so the exact amount for weight-based add-ons is finalized after your laundry is weighed.</ListItem>
                        <ListItem>Your order review shows an estimate; the final total reflects the actual weight.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'How is the delivery fee calculated?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Whether there's a delivery fee depends on how your laundry has set it up. Common options are:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem><strong>No fee:</strong> delivery is included.</ListItem>
                        <ListItem><strong>Flat fee:</strong> a single fixed amount per delivery.</ListItem>
                        <ListItem><strong>Distance-based:</strong> based on how far your address is from the shop, often with a free radius.</ListItem>
                        <ListItem><strong>Tiered by distance:</strong> different rates for different distance bands (e.g. free nearby, then a flat rate, then a per-mile rate farther out).</ListItem>
                    </UnorderedList>
                    <Text>Any applicable fee is shown on your order review before you confirm, so you always see it upfront.</Text>
                </VStack>
            ),
        },
        {
            question: 'How do tips work?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Tipping is optional and always up to you:</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>You can add a tip as a percentage or a fixed dollar amount, or choose no tip.</ListItem>
                        <ListItem>Tips can be added when you place an order, and on recurring orders your tip preference carries forward.</ListItem>
                        <ListItem>A tip can also be added or adjusted on an existing order before it's finalized.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
    ];

    const trackingTechItems = [
        {
            question: 'What is AI item tracking?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>Some laundries use AI-assisted item counting to help verify the garments in your order before and after washing.</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>It helps reduce lost or mismatched items by recording an itemized count.</ListItem>
                        <ListItem>Not every laundry uses this — many run a simple weight-and-tag process instead, and both are reliable.</ListItem>
                        <ListItem>If your laundry uses it, it works behind the scenes; there's nothing extra you need to do.</ListItem>
                    </UnorderedList>
                </VStack>
            ),
        },
        {
            question: 'What if my address is outside the delivery area?',
            answer: (
                <VStack align="start" spacing={2}>
                    <Text>If you try to schedule from an address the laundry doesn't currently serve, you'll be let know it's out of range and given a way to reach them.</Text>
                    <UnorderedList spacing={1} pl={4}>
                        <ListItem>Your area is recorded as demand, so the laundry can see where customers are asking for service.</ListItem>
                        <ListItem>Some laundries also offer a "bring service to my area" form on their website you can submit.</ListItem>
                        <ListItem>As service areas expand, previously out-of-range addresses may become available.</ListItem>
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
                        Frequently Asked Questions
                    </Heading>
                    <Text color="gray.600">
                        Find answers to common questions about our laundry service
                    </Text>
                </Box>

                <Divider />

                <FAQSection title="👕 Placing Orders" color="blue" items={placingOrdersItems} />
                <FAQSection title="💳 Payments" color="green" items={paymentItems} />
                <FAQSection title="🧺 Pricing, Add-ons & Tips" color="orange" items={pricingExtrasItems} />
                <FAQSection title="📍 Order Tracking" color="purple" items={orderTrackingItems} />
                <FAQSection title="🤖 Item Tracking & Service Area" color="pink" items={trackingTechItems} />
                <FAQSection title="🔄 Recurring Orders" color="cyan" items={recurringItems} />
                <FAQSection title="👤 Account" color="teal" items={accountItems} />
                <FAQSection title="❌ Cancellation" color="red" items={cancellationItems} />
            </VStack>
        </Container>
    );
};

export default FAQPage;
