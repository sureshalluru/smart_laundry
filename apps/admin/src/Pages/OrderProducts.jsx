import React, { useState, useEffect } from 'react';
import {
    Select,
    Button,
    Input,
    Text,
    VStack,
    HStack,
    Divider,
    IconButton,
    useToast,
    Flex, RadioGroup,
    Radio, Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure,
    FormLabel,
    FormControl,
    Spinner,
    FormErrorMessage,
    Menu, MenuButton,
    MenuList, MenuItem,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    NumberIncrementStepper,
    NumberDecrementStepper
} from '@chakra-ui/react';

import { fetchLaundryProducts, fetchLaundryInfo } from './LaundryInfoManagement';
import { FaPlus, FaTrash, FaMoneyBillWave, FaCreditCard, FaPrint, FaCaretDown  } from 'react-icons/fa';
import { useParams, useNavigate  } from 'react-router-dom';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import axios from 'axios';

const OrderProductsComponent = () => {
    const navigate = useNavigate();
    const { laundryId } = useParams();
    const stripe = useStripe();
    const elements = useElements();
    const [products, setProducts] = useState([]);
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [totalPrice, setTotalPrice] = useState(0);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [isPaymentCollected, setIsPaymentCollected] = useState(false);
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [orderSuccess, setOrderSuccess] = useState(false);
    const [orderPrintDetails, setOrderPrintDetails] = useState(null);
    const [storedTerminalPaymentIntentId, setStoredTerminalPaymentIntentId] = useState(null);
    const adminAuthToken = process.env.REACT_APP_AWS_API_KEY;
    const [stripeTerminalExists, setStripeTerminalExists] = useState(false);
    const authToken = localStorage.getItem('idToken');
    const toast = useToast();
    const [shopDetails, setShopDetails] = useState({
        name: '',
        phone: '',
        email: '',
    });
    const [cardError, setCardError] = useState("");
    const [isCardComplete, setIsCardComplete] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [key, setKey] = useState(0);
    const [customProduct, setCustomProduct] = useState({ productName: "", price: "", quantity: 1 });
    const [isCustomProduct, setIsCustomProduct] = useState(false);
    const [terminalStatusMsg, setTerminalStatusMsg] = useState("");
    const [isTerminalErrorModalOpen, setIsTerminalErrorModalOpen] = useState(false);
    const [latestTerminalAmount, setLatestTerminalAmount] = useState(null);
    const [isProcessingTerminal,setIsProcessingTerminal] = useState(false);
    // Terminal Error Modal handlers
    const openTerminalErrorModal = () => setIsTerminalErrorModalOpen(true);
    const closeTerminalErrorModal = () => setIsTerminalErrorModalOpen(false);
    useEffect(() => {
        const fetchProducts = async () => {
            const productsList = await fetchLaundryProducts(laundryId);
            setProducts(productsList);
        };
        fetchProducts();
    }, [laundryId]);

    useEffect(() => {
        const fetchLaundryDetails = async () => {
            const laundryDetails = await fetchLaundryInfo(laundryId);
            console.log("laundry Details: ", laundryDetails);
            if (laundryDetails) {
                setShopDetails({
                    name: laundryDetails.name,
                    phone: laundryDetails.phone,
                    email: laundryDetails.email,
                });
                setStripeTerminalExists(laundryDetails.stripeTerminalExists);
                console.log("laundry Details: ", laundryDetails);
            } else {
                toast({
                    title: "Error",
                    description: "Could not fetch laundry products. Please try again later.",
                    status: "error",
                    duration: 5000,
                    isClosable: true
                });
            }
        };
        fetchLaundryDetails();
    }, [laundryId]);
    // Build order payload (shared logic)
    const buildOrderPayload = (extra = {}) => ({
        operation: "otherInstoreOrders",
        laundryId,
        itemsSold: selectedProducts.map(product => ({
            productName: product.productName,
            quantity: product.quantity,
            unitPrice: product.price,
        })),
        totalPrice: totalPrice.toFixed(2),
        paymentType: paymentMethod,
        ...extra,
    });

    // Centralized order placement logic
    const placeOrder = async (payload) => {
        try {
            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/instore-place-order`,
                payload,
                { headers: {
                    // 'x-api-key': adminAuthToken
                        'X-Amz-Date': laundryId,
                        'Authorization': `Bearer ${authToken}`

                    } }
            );
            if (response.data.status === "success") {
                toast({
                    title: "Order Placed",
                    description: "The order has been placed successfully!",
                    status: "success",
                    duration: 5000,
                    isClosable: true,
                });
                setOrderSuccess(true);
                setOrderPrintDetails({
                    orderId: response.data.orderId,
                    items: response.data.items,
                    totalPrice: response.data.totalPrice,
                    paymentType: response.data.paymentType,
                });
            } else {
                toast({
                    title: "Order Failed",
                    description: response.data.message,
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
            }
        } catch (error) {
            toast({
                title: "API Error",
                description: "Failed to place order. Please try again.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        }
    };

    const handleClose = () => {
        console.log("🔹 handleClose triggered!");
        console.log(`🔹 Navigating to: /${laundryId}/admin/order-products`);

        setOrderSuccess(false);

        setTimeout(() => {
            window.location.href = `/${laundryId}/admin/order-products`;
        }, 100);
    };


    const calculateTotalPrice = (updatedProducts) => {
        const newTotal = updatedProducts.reduce((acc, product) => {
            return acc + (parseFloat(product.total) || 0);
        }, 0);

        const roundedTotal = parseFloat(newTotal.toFixed(2)); // Rounding to 2 decimal places
        setTotalPrice(roundedTotal);
    };

    const handleAddProduct = () => {
        if (isCustomProduct) {
            // Validate custom input fields
            if (!customProduct.productName || !customProduct.price || customProduct.quantity <= 0) {
                toast({
                    title: "Invalid Input",
                    description: "Please enter a valid product name, price, and quantity.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
                return;
            }

            // Convert price to float for calculations
            const price = parseFloat(customProduct.price) || 0;
            const quantity = Math.max(1, customProduct.quantity);
            const total = price * quantity;

            // Add custom product to selected products list
            setSelectedProducts(prev => {
                const updatedProducts = [...prev, {
                    ...customProduct,
                    price,
                    quantity,
                    total: parseFloat(total.toFixed(2)),
                }];
                calculateTotalPrice(updatedProducts);
                return updatedProducts;
            });

            // Reset input fields after adding
            // setCustomProduct({ productName: "", price: "", quantity: 1 });
            setCustomProduct({ productName: "", price: "", quantity: 1, total: 0 });
            setIsCustomProduct(false);
        } else {
            if (!selectedProduct) return;
            setSelectedProducts(prev => {
                const existingIndex = prev.findIndex(p => p.productName === selectedProduct.productName);
                let updatedProducts;
                if (existingIndex !== -1) {
                    updatedProducts = [...prev];
                    updatedProducts[existingIndex].quantity += quantity;
                    updatedProducts[existingIndex].total = updatedProducts[existingIndex].price * updatedProducts[existingIndex].quantity;
                } else {
                    updatedProducts = [...prev, { ...selectedProduct, quantity, total: selectedProduct.price * quantity }];
                }
                calculateTotalPrice(updatedProducts);
                return updatedProducts;
            });
        }
        toast({
            title: `${isCustomProduct ? customProduct.productName : selectedProduct?.productName} Added`,
            description: `Quantity: ${isCustomProduct ? customProduct.quantity : quantity}`,
            status: 'success',
            duration: 3000,
            isClosable: true,
        });
        setSelectedProduct(null);
        setQuantity(1);

    };



    const handleCustomInputChange = (field, value) => {
        console.log(`🔹 Custom Input Change - Field: ${field}, Value: ${value}`);

        const updatedValue = field === "quantity" ? Math.max(1, Number(value)) : value;
        const price = parseFloat(field === "price" ? updatedValue : customProduct.price) || 0;
        const quantity = field === "quantity" ? updatedValue : customProduct.quantity;
        const total = price * quantity || 0; // 🔹 Ensure total is always a number

        console.log("✅ Custom Product Update:", { price, quantity, total });

        setCustomProduct(prev => ({ ...prev, [field]: updatedValue, total }));
    };


    const handleRemoveProduct = (productIndex) => {
        if (orderSuccess) return;
        setSelectedProducts(prev => {
            const updatedProducts = [...prev];
            updatedProducts.splice(productIndex, 1);
            calculateTotalPrice(updatedProducts);
            return updatedProducts;
        });
    };

    // Handle quantity changes
    const handleQuantityChange = (index, newQuantity) => {
        setSelectedProducts(prev => {
            const updatedProducts = [...prev];
            updatedProducts[index].quantity = newQuantity;
            updatedProducts[index].total = updatedProducts[index].price * newQuantity;
            calculateTotalPrice(updatedProducts); // Update total price immediately
            return updatedProducts;
        });
    };

    const handleCollectPayment = () => {
        if (paymentMethod === 'Cash') {
            onOpen();
        }
    };

    const handleCashConfirmation = (isCollected) => {
        setIsPaymentCollected(isCollected);
        onClose();
        if (!isPaymentCollected) {
            toast({
                title: "Payment Not Collected",
                description: "Please complete payment before confirming the order.",
                status: "warning",
                duration: 5000,
                isClosable: true,
                position: "top",
            });
            return;
        }

    };
    // Poll the terminal payment status repeatedly until timeout
    const pollTerminalPaymentStatus = (paymentIntentId, terminalAmount) => {
        const pollStartTime = Date.now();
        const timeoutDuration = 60000; // 60 seconds timeout
        setTerminalStatusMsg("Waiting for customer payment status...");
        const interval = setInterval(async () => {
            // Check for timeout
            if (Date.now() - pollStartTime >= timeoutDuration) {
                clearInterval(interval);
                try {
                    const finalResponse = await axios.get(
                        `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-direct-payment-status`,
                        {
                            params: {
                                operation: "checkImmediateTerminalPaymentStatus",
                                laundryId: laundryId,
                                terminalPaymentIntentId: paymentIntentId,
                                lastRun: true
                            },
                            headers: {
                                // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                                'Authorization': `Bearer ${authToken}`

                            }
                        }
                    );
                    if (finalResponse.data.status === "success") {
                        setTerminalStatusMsg("Payment Successful. Capturing payment...");
                        await placeOrder(buildOrderPayload({ terminalPaymentIntentId: finalResponse.data.paymentIntentId }));

                        setTerminalStatusMsg("");
                        setIsProcessingTerminal(false);
                    } else if (finalResponse.data.status === "cancelled") {
                        setTerminalStatusMsg("");
                        // If backend indicates reInitiation is required, clear the stored PaymentIntent ID.
                        if (finalResponse.data.reInitiate) {
                            setStoredTerminalPaymentIntentId(null);
                        }
                        openTerminalErrorModal();
                        setIsProcessingTerminal(false);

                    } else {
                        setTerminalStatusMsg("");
                        // If backend indicates reInitiation is required, clear the stored PaymentIntent ID.
                        if (finalResponse.data.reInitiate) {
                            setStoredTerminalPaymentIntentId(null);
                        }
                        openTerminalErrorModal();
                        setIsProcessingTerminal(false);

                    }
                } catch (error) {
                    setTerminalStatusMsg("");
                    // If backend indicates reInitiation is required, clear the stored PaymentIntent ID.
                    setStoredTerminalPaymentIntentId(null);
                    openTerminalErrorModal();
                    toast({
                        title: "Final Check Error",
                        description:
                            error.message || "Error during final payment status check.",
                        status: "error",
                        duration: 5000,
                        isClosable: true
                    });
                    setIsProcessingTerminal(false);

                }
                return;
            }
            try {
                const statusResponse = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-direct-payment-status`,
                    {
                        params: {
                            operation: "checkImmediateTerminalPaymentStatus",
                            laundryId: laundryId,
                            terminalPaymentIntentId: paymentIntentId,
                            lastRun: false
                        },
                        headers: {
                            // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                            'Authorization': `Bearer ${authToken}`

                        }
                    }
                );
                if (statusResponse.data.status === "success") {
                    clearInterval(interval);
                    setTerminalStatusMsg("Payment Successful. Capturing payment...");
                    await placeOrder(buildOrderPayload({ terminalPaymentIntentId: statusResponse.data.paymentIntentId }));
                    setTerminalStatusMsg("");
                    setIsProcessingTerminal(false);
                } else if (
                    statusResponse.data.status === "error" ||
                    statusResponse.data.status === "cancelled"
                ) {
                    clearInterval(interval);
                    // Optionally, if statusResponse.data.reInitiate is true, clear stored payment intent ID here.
                    setTerminalStatusMsg("");
                    // If backend indicates reInitiation is required, clear the stored PaymentIntent ID.
                    if (statusResponse.data.reInitiate) {
                        setStoredTerminalPaymentIntentId(null);
                    }
                    openTerminalErrorModal();
                    setIsProcessingTerminal(false);
                } else if (statusResponse.data.status === "pending") {
                    // Update terminal status message if available
                    setTerminalStatusMsg(
                        `Payment is pending: ${statusResponse.data.payment_status || ""}`
                    );
                }
            } catch (error) {
                clearInterval(interval);
                setTerminalStatusMsg("");
                setStoredTerminalPaymentIntentId(null);
                openTerminalErrorModal();
                toast({
                    title: "Terminal Payment Status Error",
                    description:
                        error.message || "Error checking terminal payment status.",
                    status: "error",
                    duration: 5000,
                    isClosable: true
                });
                setIsProcessingTerminal(false);
            }
        }, 4000);
    };
    // Initiate terminal payment then poll status until success before capturing payment
    const handleTerminalPayment = async (terminalAmount, existingPaymentIntentId=null) => {
        try {
            setIsProcessingTerminal(true);
            setLatestTerminalAmount(terminalAmount);
            setTerminalStatusMsg("Initiating Terminal Payment...");
            const initiateTerminalPayload = {
                orderPaymentOperation: "initiateImmediateTerminalPayment",
                amount: terminalAmount,
                laundryId: laundryId
            };
            // If re-initiating, include the existing payment intent id.
            if (existingPaymentIntentId) {
                initiateTerminalPayload.terminalPaymentIntentId = existingPaymentIntentId;
            }
            const terminalResponse = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/terminal-direct-payment`,
                initiateTerminalPayload,
                {
                    headers: {
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                        'X-Amz-Date': laundryId,
                        'Authorization': `Bearer ${authToken}`

                    }
                }
            );
            if (terminalResponse.data.status !== "success") {
                setTerminalStatusMsg("");
                openTerminalErrorModal();
                toast({
                    title: "Terminal Payment Error",
                    description:
                        terminalResponse.data.message ||
                        "Failed to initiate terminal payment.",
                    status: "error",
                    duration: 5000,
                    isClosable: true
                });
                setIsProcessingTerminal(false);
                return;
            }
            const { paymentIntentId } = terminalResponse.data;
            setStoredTerminalPaymentIntentId(paymentIntentId);
            setTerminalStatusMsg("Waiting for customer payment status...");
            pollTerminalPaymentStatus(paymentIntentId, terminalAmount);
        } catch (error) {
            setTerminalStatusMsg("");
            openTerminalErrorModal();
            console.error("Terminal Payment Error: ", error);
            toast({
                title: "Terminal Payment Error",
                description:
                    error.message || "An error occurred during terminal payment.",
                status: "error",
                duration: 5000,
                isClosable: true
            });
            setIsProcessingTerminal(false);
        }
        // Note: We do not set isProcessing(false) here since capture call and polling will handle that.
    };


    const handleConfirmOrder = async () => {
        onClose();
        const orderPayload = buildOrderPayload();
        setIsPlacingOrder(true);
        if (paymentMethod === "Card") {
            const cardElement = elements.getElement(CardElement);
            if (!cardElement) {
                toast({
                    title: "Incomplete Card Details",
                    description: "Please enter your card details to proceed.",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                    position: "top",
                });
                return;
            }
            try {
                setIsPlacingOrder(true);
                const { error, paymentMethod: cardPaymentMethod } = await stripe.createPaymentMethod({
                    type: 'card',
                    card: cardElement,
                });

                if (error) {
                    toast({
                        title: "Card Payment Failed",
                        description: error.message || "Invalid card details. Please check and try again.",
                        status: "error",
                        duration: 5000,
                        isClosable: true,
                        position: "top",
                    });
                    setIsPlacingOrder(false);
                    return;
                }

                orderPayload.cardPaymentMethodId = cardPaymentMethod.id;
            } catch (error) {
                toast({
                    title: "Payment Error",
                    description: "Failed to process payment. Try again.",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                    position: "top",
                });
                setIsPlacingOrder(false);
                return;
            }
        } else {
            setIsPlacingOrder(true);
        }
        await placeOrder(orderPayload);
        setIsPlacingOrder(false);
    };

    const handleCardChange = (event) => {
        setIsCardComplete(event.complete); // Check if card details are fully entered
        if (!event.complete) {
            setCardError("Please enter valid card details.");
        } else {
            setCardError("");
        }
    };

    const handlePrintReceipt = () => {
        const receiptWindow = window.open("", "_blank");

        if (receiptWindow) {
            // Check if the orderPrintDetails and its properties exist before proceeding
            if (!orderPrintDetails || !orderPrintDetails.items || orderPrintDetails.items.length === 0) {
                alert("No order details available for printing.");
                return;
            }

            // Start the receipt window generation
            receiptWindow.document.write(`
                <html>
                    <head>
                        <title>Order Receipt</title>
                        <style>
                            @page {
                                size: auto;
                                margin: 0;
                            }
                            @font-face {
                                font-family: 'BoldFont';
                                src: url('https://fonts.gstatic.com/s/arial/v11/Arial-Bold.woff2') format('woff2');
                                font-weight: bold;
                                font-style: normal;
                            }
                            body {
                                font-family: 'BoldFont', sans-serif;
                                font-size: 14px;
                                font-weight: bold;
                                margin: 20px;
                                padding: 0;
                                width: 80mm;
                            }
                            h3 {
                                font-size: 18px;
                                font-weight: bold;
                                text-align: center;
                                margin-bottom: 10px;
                            }
                            .center {
                                text-align: center;
                            }
                            .line {
                                border-top: 1px dashed #000;
                                margin: 10px 0;
                            }
                            table {
                                width: 100%;
                                border-collapse: collapse;
                                margin-bottom: 10px;
                            }
                            th, td {
                                text-align: left;
                                padding: 5px 0;
                                font-size: 14px;
                            }
                            .price {
                                text-align: right;
                            }
                            .total {
                                font-weight: bold;
                                font-size: 16px;
                                margin-top: 10px;
                            }
                            .payment-type {
                                font-style: italic;
                                margin-top: 10px;
                            }
                            .receipt-footer {
                                text-align: center;
                                margin-top: 20px;
                                font-size: 12px;
                            }
                        </style>
                        <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
                    </head>
                    <body>
                        <div class="center">
                            <h3>Order Receipt</h3>
                            <p>${shopDetails.name || "Laundry Name"}</p>
                            <p>${shopDetails.email || "Email not available"}</p>
                            <p>${shopDetails.phone || "Phone not available"}</p>
                        </div>
                        <div class="line"></div>
                        <p><strong>Order ID:</strong> ${orderPrintDetails.orderId}</p>
                        <p><strong>Items:</strong></p>
                        <table>
                            <thead>
                                <tr>
                                    <th>Qty</th>
                                    <th>Item</th>
                                    <th class="price">Price</th>
                                </tr>
                            </thead>           
                            <tbody>
                                ${orderPrintDetails.items.map(item => {
                // Find the product details from the products list based on product name
                // const product = products.find(p => p.productName === item.productName);

                // If the product is found, get the price, otherwise default to 0.00
                const itemPrice = item.unitPrice || 0;

                // Calculate total price by multiplying the quantity by the item price
                const totalItemPrice = (itemPrice * item.quantity).toFixed(2);

                return `
                                        <tr>
                                            <td>${item.quantity}</td>
                                            <td>${item.productName}</td>
                                            <td class="price">$${totalItemPrice}</td>
                                        </tr>
                                    `;
            }).join('')}
                            </tbody>

                        </table>
                        <div class="line"></div>
                        <p class="total">Total Price: $${orderPrintDetails.totalPrice ? orderPrintDetails.totalPrice : "0.00"}</p>
                        <p class="payment-type"><strong>Payment Method:</strong> ${orderPrintDetails.paymentType}</p>
                        <div class="line"></div>
                        <div class="receipt-footer">
                            <p>Thank you for your order!</p>
                            <p>Visit us again!</p>
                        </div>
                        <script>
                            window.onload = () => {
                                // Generate QR code after window is fully loaded
                                QRCode.toDataURL('${orderPrintDetails.orderId}', { width: 100, height: 100 }, (err, url) => {
                                    if (err) {
                                        console.error('QR Code generation failed:', err);
                                    } else {
                                        const img = document.createElement('img');
                                        img.src = url;
                                        const qrContainer = document.createElement('div');
                                        qrContainer.className = 'qr-code';
                                        qrContainer.appendChild(img);
                                        document.body.appendChild(qrContainer);
                                    }
                                });
    
                                window.print();
                                window.close(); /* Automatically close the window after printing */
                            };
                        </script>
                    </body>
                </html>
            `);

            receiptWindow.document.close();
        }
    };


    return (
        <VStack spacing={4} align="stretch" maxWidth="500px" mx="auto" bg="#BCE3E0" p={4} borderRadius="md">
            <Text fontSize="lg" fontWeight="bold">Order Products</Text>

            {/* Product Selection */}
            <HStack spacing={2} width="100%" wrap="wrap">
                {/* Menu Component for Product Selection */}
                <Menu>
                    <MenuButton
                        as={Button}
                        rightIcon={<FaCaretDown />}
                        colorScheme="teal"
                        size="sm"
                        flex={{ base: 1, md: 3 }}
                        width="100%"
                    >
                        {/* {selectedProduct ? selectedProduct.productName : 'Select a Product'} */}
                        {isCustomProduct ? "Other" : selectedProduct ? selectedProduct.productName : 'Select a Product'}

                    </MenuButton>
                    <MenuList>
                        {products.map((product) => (
                            <MenuItem
                                key={product.productName}
                                // onClick={() => setSelectedProduct(product)}
                                onClick={() => {
                                    setIsCustomProduct(false);
                                    setSelectedProduct(product);
                                }}
                                isDisabled={selectedProducts.some(p => p.productName === product.productName)}
                            >
                                {product.productName} - ${product.price}
                            </MenuItem>
                        ))}
                        <MenuItem
                            onClick={() => {
                                setIsCustomProduct(true);
                                setSelectedProduct(null);
                            }}
                        >
                            Other
                        </MenuItem>
                    </MenuList>
                </Menu>

                {isCustomProduct && (
                    <HStack spacing={2} width="100%">
                        <Input
                            placeholder="Enter Product Name"
                            value={customProduct.productName}
                            onChange={(e) => handleCustomInputChange("productName", e.target.value)}
                        />
                        <Input
                            placeholder="Enter Price"
                            type="number"
                            min="0"
                            value={customProduct.price}
                            onChange={(e) => handleCustomInputChange("price", e.target.value)}
                        />
                        <NumberInput
                            min={1}
                            value={customProduct.quantity}
                            onChange={(value) => handleCustomInputChange("quantity", value)}
                            clampValueOnBlur={false}
                        >
                            <NumberInputField placeholder="Enter Quantity" />
                            <NumberInputStepper>
                                <NumberIncrementStepper />
                                <NumberDecrementStepper />
                            </NumberInputStepper>
                        </NumberInput>
                        <Text fontWeight="bold">
                            Total: {customProduct.total !== undefined ? `$${customProduct.total.toFixed(2)}` : "$0.00"}
                        </Text>

                    </HStack>
                )}

                {/* Add Button */}
                <Button
                    leftIcon={<FaPlus />}
                    colorScheme="teal"
                    size="sm"
                    onClick={handleAddProduct}
                    isDisabled={(!selectedProduct && !isCustomProduct) || (isCustomProduct && (!customProduct.productName || !customProduct.price))}
                    flex={{ base: 1, md: 1 }}
                    width="100%"
                >
                    Add
                </Button>
            </HStack>

            {/* Selected Products List */}
            {selectedProducts.length > 0 && (
                <>
                    {selectedProducts.map((product, index) => (
                        <HStack key={index} spacing={2} align="center" width="100%" p={2} bg="white" borderRadius="md">
                            <Text flex="3">{product.productName}</Text>
                            <NumberInput
                                min={1}
                                value={product.quantity}
                                onChange={(value) => handleQuantityChange(index, Number(value))}
                                clampValueOnBlur={false}
                                width="50px"
                                size="sm"
                                flex="1"
                            >
                                <NumberInputField textAlign="center" />
                                <NumberInputStepper>
                                    <NumberIncrementStepper />
                                    <NumberDecrementStepper />
                                </NumberInputStepper>
                            </NumberInput>

                            <Text flex="1">${product.total.toFixed(2)}</Text>
                            <IconButton
                                icon={<FaTrash />}
                                aria-label="Remove Product"
                                onClick={() => handleRemoveProduct(index)}
                                colorScheme="red"
                                size="sm"
                                flex="1"
                            />
                        </HStack>
                    ))}

                    <Divider />

                    {/* Total Price */}
                    <Flex justify="space-between" align="center" fontSize="md" fontWeight="bold">
                        <Text>Total Price</Text>
                        <Text>${totalPrice.toFixed(2)}</Text>
                    </Flex>

                    {/* Payment Method Selection */}
                    <VStack align="stretch" spacing={3}>
                        <Text fontSize="md" fontWeight="bold">Payment Method</Text>
                        <RadioGroup onChange={setPaymentMethod} value={paymentMethod}>
                            <HStack spacing={4}>
                                <Radio value="Cash"><FaMoneyBillWave /> Cash</Radio>
                                <Radio value="Card"><FaCreditCard /> Card</Radio>
                                {stripeTerminalExists && (
                                    <Radio value="Terminal">
                                        <FaCreditCard/> Terminal
                                    </Radio>
                                )}
                            </HStack>
                        </RadioGroup>
                    </VStack>

                    {/* Cash Payment Confirmation Modal */}
                    <Modal isOpen={isOpen} onClose={onClose}>
                        <ModalOverlay />
                        <ModalContent>
                            <ModalHeader>Confirm Cash Collection</ModalHeader>
                            <ModalBody>
                                <Text>Did you collect the cash from the customer?</Text>
                            </ModalBody>
                            <ModalFooter>
                                <Button colorScheme="red" mr={3} onClick={() => handleCashConfirmation(false)}>
                                    No
                                </Button>
                                <Button colorScheme="green" onClick={() => handleConfirmOrder()}>
                                    Yes
                                </Button>
                            </ModalFooter>
                        </ModalContent>
                    </Modal>

                    {/* Card Payment Form */}
                    {paymentMethod === "Card" && (
                        <VStack align="stretch">
                            <FormLabel>Enter Card Details</FormLabel>
                            <FormControl isInvalid={!!cardError}>
                                <CardElement onChange={handleCardChange} />
                                <FormErrorMessage>{cardError}</FormErrorMessage>
                            </FormControl>
                        </VStack>
                    )}



                    {/* Collect Payment Button */}
                    {paymentMethod === "Cash" && (
                        <Button
                            colorScheme="blue"
                            size="md"
                            width="100%"
                            onClick={handleCollectPayment}
                            isLoading={isPlacingOrder}
                        >
                            Collect Payment
                        </Button>
                    )}
                    {paymentMethod === "Terminal" && (
                        <Button
                            colorScheme="blue"
                            size="md"
                            width="100%"
                            isLoading = {isProcessingTerminal}
                            onClick={() => handleTerminalPayment(totalPrice,storedTerminalPaymentIntentId || null)}
                        >
                            Terminal Payment (${totalPrice})
                        </Button>
                    )}

                    {/* Confirm Order Button */}
                    {paymentMethod === "Card" && isCardComplete && (
                        <Button
                            colorScheme="green"
                            size="md"
                            width="100%"
                            onClick={handleConfirmOrder}
                            isDisabled={isPlacingOrder}
                        >
                            {isPlacingOrder ? <Spinner size="sm" /> : "Confirm Order"}
                        </Button>
                    )}

                </>
            )}

            {/* Modal after order is confirmed */}
            {orderSuccess && (
                <Modal isOpen={orderSuccess} onClose={handleClose} isCentered closeOnOverlayClick={false}>
                    <ModalOverlay />
                    <ModalContent>
                        <ModalHeader>Order Confirmation</ModalHeader>
                        <ModalBody>
                            <Text>Order ID: {orderPrintDetails.orderId}</Text>
                            <Button leftIcon={<FaPrint />} colorScheme="blue" mt={4} onClick={handlePrintReceipt}>
                                Print Receipt
                            </Button>
                        </ModalBody>
                        <ModalFooter>
                            {/* <Button
                                colorScheme="green"
                                onClick={() => {
                                    setOrderSuccess(false);
                                    navigate("/", { replace: true });
                                    setTimeout(() => {
                                        navigate(`/${laundryId}/admin/order-products`, { replace: true }); // Navigate back
                                    }, 100);
                                }}
                            >
                                Close
                            </Button> */}
                            <Button
                                colorScheme="green"
                                onClick={handleClose}
                            >
                                {isFetching ? "Fetching..." : "Close"}
                            </Button>

                        </ModalFooter>
                    </ModalContent>
                </Modal>
            )}
            {/* Terminal Status Modal */}
            {terminalStatusMsg && (
                <Modal isOpen={true} onClose={() => {}} closeOnOverlayClick={false} isCentered>
                    <ModalOverlay />
                    <ModalContent>
                        <ModalHeader>Terminal Status</ModalHeader>
                        <ModalBody>
                            <HStack spacing={3}>
                                <Spinner size="sm" />
                                <Text>{terminalStatusMsg}</Text>
                            </HStack>
                        </ModalBody>
                        <ModalFooter>
                            <Button colorScheme="blue" isDisabled>
                                Processing
                            </Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>
            )}
            {/* Terminal Error Options Modal */}
            <Modal
                isOpen={isTerminalErrorModalOpen}
                onClose={closeTerminalErrorModal}
                closeOnOverlayClick={false}
            >
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Terminal Payment Error</ModalHeader>
                    <ModalBody>
                        <Text>
                            There was an error processing the terminal payment. Would you like to retry the terminal payment or choose another payment option?
                        </Text>
                    </ModalBody>
                    <ModalFooter>
                        <Button
                            colorScheme="green"
                            mr={3}
                            onClick={() => {
                                closeTerminalErrorModal();
                                // Retry using the stored payment intent and latest terminal amount
                                handleTerminalPayment(latestTerminalAmount, storedTerminalPaymentIntentId || null);
                            }}
                        >
                            Retry Terminal Payment
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                closeTerminalErrorModal();
                                setPaymentMethod("");
                                setLatestTerminalAmount(null);
                                setStoredTerminalPaymentIntentId(null);
                                setIsProcessingTerminal(false);
                            }}
                        >
                            Other Options
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </VStack>
    );
};

// Wrap in Elements Provider
const OrderProducts = ({stripePublicKey}) => (
    <Elements stripe={loadStripe(stripePublicKey)}>
        <OrderProductsComponent />
    </Elements>
);

export default OrderProducts;