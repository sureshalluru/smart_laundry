import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Flex, Grid, GridItem, Button, Text, Input, VStack, HStack, Badge,
  Icon, useToast, IconButton, InputGroup, InputLeftAddon, Divider
} from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaArrowLeft, FaCheck, FaTimes, FaMinus, FaPlus, FaPrint } from 'react-icons/fa';
import { useAdminSession } from '../hooks/useAdminSession';

const popIn = keyframes`
  0% { transform: scale(0.95); opacity: 0.7; }
  50% { transform: scale(1.03); }
  100% { transform: scale(1); opacity: 1; }
`;

const SERVICE_COLORS = ['blue.50','green.50','purple.50','orange.50','pink.50','teal.50','cyan.50','yellow.50','red.50'];
const SERVICE_BORDERS = ['blue.300','green.300','purple.300','orange.300','pink.300','teal.300','cyan.300','yellow.300','red.300'];

export default function QuickPOSPage({ laundryId }) {
  const navigate = useNavigate();
  const toast = useToast();
  const authToken = localStorage.getItem('idToken');
  const { getEmpId } = useAdminSession();

  const [services, setServices] = useState([]);
  const [cart, setCart] = useState([]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [phoneSuggestions, setPhoneSuggestions] = useState([]);
  const [bags, setBags] = useState(1);
  const [tip, setTip] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [animatingItem, setAnimatingItem] = useState(null);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/get-info-api`,
          { params: { operation: 'getLaundryInfo', laundryId }, headers: { Authorization: `Bearer ${authToken}` } });
        if (res.data.status === 'success') setServices(res.data.laundryServices || []);
      } catch (err) { console.error(err); }
    };
    fetchServices();
  }, [laundryId, authToken]);

  // Phone lookup
  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, '');
    setCustomerPhone(value);
    if (value.length < 3) { setPhoneSuggestions([]); setCustomerName(''); setCustomerId(''); return; }
    if (searchTimeout) clearTimeout(searchTimeout);
    const t = setTimeout(() => lookupCustomer(value), 300);
    setSearchTimeout(t);
  };

  const lookupCustomer = async (phone) => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/customer/check-partial-phonenumbers`,
        { params: { operation: 'searchPhone', phoneQuery: phone, laundryId }, headers: { Authorization: `Bearer ${authToken}` } });
      const suggestions = res.data?.body?.suggestions || [];
      setPhoneSuggestions(suggestions);
      const exact = suggestions.find(s => s.phoneNumber?.replace('+1','') === phone);
      if (exact) { setCustomerName(`${exact.firstName||''} ${exact.lastName||''}`.trim()); setCustomerId(exact.customerId); setPhoneSuggestions([]); }
      else { setCustomerName(''); setCustomerId(''); }
    } catch (err) { /* ok */ }
  };

  const selectCustomer = (s) => {
    setCustomerPhone(s.phoneNumber?.replace('+1','') || '');
    setCustomerName(`${s.firstName||''} ${s.lastName||''}`.trim());
    setCustomerId(s.customerId); setPhoneSuggestions([]);
  };

  // Cart
  const addToCart = useCallback((service) => {
    setAnimatingItem(service.serviceName);
    setTimeout(() => setAnimatingItem(null), 300);
    const price = parseFloat(service.price || service.servicePrice || 0);
    setCart(prev => {
      const existing = prev.find(i => i.serviceName === service.serviceName);
      if (existing) return prev.map(i => i.serviceName === service.serviceName ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { serviceName: service.serviceName, price, quantity: 1, inputWeight: '', isWeight: !!service.inputWeight }];
    });
  }, []);

  const updateQuantity = (name, delta) => setCart(prev => prev.map(i => i.serviceName === name ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  const updateWeight = (name, w) => setCart(prev => prev.map(i => i.serviceName === name ? { ...i, inputWeight: w } : i));
  const removeFromCart = (name) => setCart(prev => prev.filter(i => i.serviceName !== name));

  const subtotal = cart.reduce((s, i) => s + (i.price * (i.isWeight ? (parseFloat(i.inputWeight) || 0) : i.quantity)), 0);
  const total = subtotal + tip;

  // Print
  const printTicket = (orderId) => {
    const w = window.open('', 'PRINT', 'height=600,width=350');
    if (!w) return;
    const now = new Date().toLocaleString();
    const items = cart.map(i => {
      const qty = i.isWeight ? (parseFloat(i.inputWeight)||0) : i.quantity;
      return `<tr><td>${i.serviceName}</td><td>${qty}${i.isWeight?'lb':''}</td><td>$${(i.price*qty).toFixed(2)}</td></tr>`;
    }).join('');
    w.document.write(`<html><head><title>Ticket</title><style>
      body{font-family:monospace;font-size:12px;width:280px;margin:0 auto;padding:10px}
      h2{text-align:center;margin:5px 0}.line{border-top:1px dashed #000;margin:8px 0}
      table{width:100%}td{padding:2px 0}.total{font-size:14px;font-weight:bold;text-align:right}.center{text-align:center}
    </style></head><body>
      <h2>Order Ticket</h2><p class="center">${now}</p><div class="line"></div>
      <p><strong>Order:</strong> ${orderId}</p>
      <p><strong>Customer:</strong> ${customerName||customerPhone}</p>
      <p><strong>Bags:</strong> ${bags}</p><div class="line"></div>
      <table>${items}</table><div class="line"></div>
      <p class="total">Subtotal: $${subtotal.toFixed(2)}</p>
      ${tip>0?`<p class="total">Tip: $${tip.toFixed(2)}</p>`:''}
      <p class="total">TOTAL: $${total.toFixed(2)}</p><div class="line"></div>
      <p class="center">Payment: ${paymentMethod}</p><p class="center">Thank you!</p>
    </body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  // Submit — uses same API as AdminCreateOrder (instore-place-order)
  const handleSubmitOrder = async () => {
    if (!cart.length) { toast({ title: 'Cart empty', status: 'warning', duration: 2000 }); return; }
    if (customerPhone.length < 10) { toast({ title: 'Enter phone', status: 'warning', duration: 2000 }); return; }
    if (!paymentMethod) { toast({ title: 'Select payment', status: 'warning', duration: 2000 }); return; }
    setIsSubmitting(true);
    try {
      const empId = getEmpId() || localStorage.getItem('empId') || '';
      const isPayNow = paymentMethod === 'cash' || paymentMethod === 'terminal' || paymentMethod === 'card';
      const tipMethod = paymentMethod === 'cash' ? 'Cash' : 'Card';

      const inStoreOrderPayload = {
        operation: 'inStorePlaceOrder',
        customerId: customerId || '',
        laundryId: laundryId,
        address: '',
        doorNumber: '',
        addressInstructions: '',
        specialInstructions: '',
        saveSpecialInstructions: false,
        services: cart.map(i => ({
          service: i.serviceName,
          weightOrCount: i.isWeight ? (parseFloat(i.inputWeight) || 0) : i.quantity,
          servicePrice: i.price,
        })),
        pickupDate: new Date().toISOString().split('T')[0],
        pickupTimeInterval: '',
        dropoffDate: '',
        dropoffTimeInterval: '',
        coupon: '',
        subTotal: parseFloat(subtotal.toFixed(2)),
        totalCost: parseFloat(subtotal.toFixed(2)),
        grandTotal: parseFloat(total.toFixed(2)),
        tip: {
          tipType: tip > 0 ? 'amount' : 'noTip',
          tipPercentage: 0,
          tipAmount: parseFloat(tip.toFixed(2)),
          tipMethod: tipMethod,
          tipReceiverId: empId || '',
        },
        discountedPrice: 0,
        isPayNow: isPayNow,
        laundryBags: bags,
        cardPaymentMethodId: '',
        isTerminalPayment: paymentMethod === 'terminal',
        customerPhone: `+1${customerPhone}`,
      };

      const res = await axios.post(
        `${process.env.REACT_APP_AWS_API_URL}/api/admin/instore-place-order`,
        inStoreOrderPayload,
        { headers: { Authorization: `Bearer ${authToken}`, 'X-Amz-Date': laundryId } }
      );
      const orderId = res.data?.orderId || res.data?.body?.orderId || 'Created';
      setOrderSuccess(orderId);
      printTicket(orderId);
      setTimeout(() => resetPOS(), 4000);
    } catch (err) {
      toast({ title: 'Order failed', description: err.response?.data?.message || err.response?.data?.body?.message || err.message, status: 'error', duration: 4000 });
    } finally { setIsSubmitting(false); }
  };

  const resetPOS = () => {
    setCart([]); setCustomerPhone(''); setCustomerName(''); setCustomerId('');
    setBags(1); setTip(0); setCustomTip(''); setPaymentMethod(''); setOrderSuccess(null); setPhoneSuggestions([]);
  };

  if (orderSuccess) {
    return (
      <Flex h="100vh" align="center" justify="center" bg="green.50" direction="column">
        <Icon as={FaCheck} boxSize={20} color="green.400" mb={4} />
        <Text fontSize="4xl" fontWeight="bold" color="green.600">Order Created!</Text>
        <Text fontSize="2xl" color="gray.600" mt={2}>{orderSuccess}</Text>
        <HStack mt={6} spacing={4}>
          <Button leftIcon={<FaPrint />} colorScheme="blue" size="lg" onClick={() => printTicket(orderSuccess)}>Print Again</Button>
          <Button colorScheme="green" size="lg" onClick={resetPOS}>New Order</Button>
        </HStack>
      </Flex>
    );
  }

  return (
    <Flex h="100vh" w="100vw" position="fixed" top={0} left={0} bg="gray.50" zIndex={1500} direction={{ base: 'column', md: 'row' }}>
      {/* LEFT: Phone + Services Grid (clean, just tap targets) */}
      <Box w={{ base: '100%', md: '55%' }} h="100%" overflowY="auto" p={3} bg="white">
        <HStack mb={2} justify="space-between">
          <HStack>
            <Button variant="ghost" size="xs" leftIcon={<FaArrowLeft />} onClick={() => navigate(`/${laundryId}/admin/active-orders`)}>Back</Button>
            <Badge colorScheme="blue" fontSize="xs">QUICK POS</Badge>
          </HStack>
          <Button size="xs" colorScheme="red" variant="ghost" onClick={resetPOS}>Clear</Button>
        </HStack>

        {/* Phone */}
        <Box mb={3} position="relative">
          <HStack>
            <InputGroup size="md" flex={1}>
              <InputLeftAddon fontSize="sm">+1</InputLeftAddon>
              <Input placeholder="Customer phone" value={customerPhone} onChange={handlePhoneChange} maxLength={10} bg="blue.50" />
            </InputGroup>
            {customerName && <Badge colorScheme="green" fontSize="xs" px={2} py={1}>✓ {customerName}</Badge>}
          </HStack>
          {phoneSuggestions.length > 0 && (
            <Box position="absolute" top="42px" left={0} right={0} bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" boxShadow="lg" zIndex={10} maxH="120px" overflowY="auto">
              {phoneSuggestions.map(s => (
                <Box key={s.customerId} px={3} py={2} cursor="pointer" _hover={{ bg: 'blue.50' }} onClick={() => selectCustomer(s)}>
                  <Text fontSize="sm" fontWeight="semibold">{s.firstName} {s.lastName} <Text as="span" color="gray.400" fontSize="xs">{s.phoneNumber}</Text></Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Services Grid — large tap targets, nothing else */}
        <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }} gap={2}>
          {services.map((svc, idx) => (
            <GridItem key={svc.serviceName || idx}>
              <Button w="100%" h={{ base: '60px', md: '70px' }} bg={SERVICE_COLORS[idx % 9]} border="2px solid"
                borderColor={SERVICE_BORDERS[idx % 9]} borderRadius="lg" flexDirection="column"
                onClick={() => addToCart(svc)} _hover={{ transform: 'scale(1.02)', shadow: 'md' }}
                _active={{ transform: 'scale(0.97)' }} transition="all 0.12s"
                animation={animatingItem === svc.serviceName ? `${popIn} 0.25s ease` : undefined}>
                <Text fontWeight="bold" fontSize="xs" textAlign="center" noOfLines={1}>{svc.serviceName}</Text>
                <Text fontSize="sm" fontWeight="bold" color="gray.700">
                  ${parseFloat(svc.price || 0).toFixed(2)}{svc.inputWeight ? '/lb' : ''}
                </Text>
              </Button>
            </GridItem>
          ))}
        </Grid>
      </Box>

      {/* RIGHT: Cart (with weight/qty) + Summary + Payment */}
      <Box w={{ base: '100%', md: '45%' }} h="100%" bg="gray.800" color="white" display="flex" flexDirection="column">
        {/* Cart items with inline controls */}
        <Box flex={1} overflowY="auto" p={3}>
          <HStack justify="space-between" mb={2}>
            <Text fontSize="md" fontWeight="bold">Cart ({cart.length})</Text>
            <HStack>
              <Text fontSize="xs">Bags:</Text>
              <IconButton icon={<FaMinus />} size="xs" variant="outline" colorScheme="whiteAlpha" onClick={() => setBags(Math.max(1, bags-1))} aria-label="-" />
              <Text fontWeight="bold" fontSize="sm">{bags}</Text>
              <IconButton icon={<FaPlus />} size="xs" variant="outline" colorScheme="whiteAlpha" onClick={() => setBags(bags+1)} aria-label="+" />
            </HStack>
          </HStack>

          {cart.length === 0 ? (
            <Text color="gray.500" textAlign="center" py={8} fontSize="sm">Tap services on the left to add items</Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {cart.map(item => {
                const qty = item.isWeight ? (parseFloat(item.inputWeight) || 0) : item.quantity;
                const lineTotal = item.price * qty;
                return (
                  <Box key={item.serviceName} bg="gray.700" borderRadius="md" p={2}>
                    <HStack justify="space-between" mb={1}>
                      <Text fontSize="sm" fontWeight="semibold" noOfLines={1} flex={1}>{item.serviceName}</Text>
                      <Text fontSize="sm" fontWeight="bold" color="green.300">${lineTotal.toFixed(2)}</Text>
                      <IconButton icon={<FaTimes />} size="xs" variant="ghost" colorScheme="red" onClick={() => removeFromCart(item.serviceName)} aria-label="x" />
                    </HStack>
                    <HStack>
                      <Text fontSize="xs" color="gray.400" minW="50px">${item.price.toFixed(2)}{item.isWeight ? '/lb' : ' ea'}</Text>
                      {item.isWeight ? (
                        <InputGroup size="sm" maxW="120px">
                          <Input placeholder="0" value={item.inputWeight} onChange={(e) => updateWeight(item.serviceName, e.target.value)}
                            type="number" textAlign="center" bg="gray.600" borderColor="orange.400" _focus={{ borderColor: 'orange.300' }} />
                          <InputLeftAddon bg="orange.600" color="white" fontSize="xs">lbs</InputLeftAddon>
                        </InputGroup>
                      ) : (
                        <HStack spacing={1}>
                          <IconButton icon={<FaMinus />} size="xs" variant="solid" colorScheme="gray" onClick={() => updateQuantity(item.serviceName, -1)} aria-label="-" />
                          <Text fontWeight="bold" fontSize="md" minW="25px" textAlign="center">{item.quantity}</Text>
                          <IconButton icon={<FaPlus />} size="xs" variant="solid" colorScheme="gray" onClick={() => updateQuantity(item.serviceName, 1)} aria-label="+" />
                        </HStack>
                      )}
                    </HStack>
                  </Box>
                );
              })}
            </VStack>
          )}
        </Box>

        {/* Bottom: Summary + Payment (sticky) */}
        <Box p={3} bg="gray.900" borderTop="1px solid" borderColor="gray.700">
          <HStack justify="space-between" mb={1}>
            <Text fontSize="sm">Subtotal</Text><Text fontSize="sm" fontWeight="bold">${subtotal.toFixed(2)}</Text>
          </HStack>

          {/* Tip */}
          <HStack spacing={1} mb={2}>
            <Text fontSize="xs">Tip:</Text>
            {[0, 2, 5, 10].map(amt => (
              <Button key={amt} size="xs" h="26px" minW="35px"
                variant={tip === amt && !customTip ? 'solid' : 'outline'}
                colorScheme={tip === amt && !customTip ? 'blue' : 'whiteAlpha'}
                onClick={() => { setTip(amt); setCustomTip(''); }}>
                {amt === 0 ? '—' : `$${amt}`}
              </Button>
            ))}
            <Input placeholder="$" w="45px" size="xs" h="26px" bg="gray.700" value={customTip} textAlign="center"
              onChange={(e) => { setCustomTip(e.target.value); setTip(parseFloat(e.target.value) || 0); }} type="number" />
          </HStack>

          {/* Total */}
          <HStack justify="space-between" mb={2}>
            <Text fontSize="lg" fontWeight="bold">TOTAL</Text>
            <Text fontSize="2xl" fontWeight="bold" color="green.300">${total.toFixed(2)}</Text>
          </HStack>

          {/* Payment */}
          <Grid templateColumns="repeat(5, 1fr)" gap={1} mb={2}>
            {[
              { key: 'cash', label: '💵 Cash', color: 'green' },
              { key: 'card', label: '💳 Card', color: 'blue' },
              { key: 'terminal', label: '📱 Tap', color: 'teal' },
              { key: 'payLater', label: '🕐 Later', color: 'orange' },
              { key: 'invoice', label: '📄 Invoice', color: 'purple' },
            ].map(pm => (
              <Button key={pm.key} h="40px" fontSize="xs" fontWeight="bold"
                colorScheme={pm.color}
                variant={paymentMethod === pm.key ? 'solid' : 'outline'}
                opacity={paymentMethod === pm.key ? 1 : 0.7}
                border={paymentMethod === pm.key ? '2px solid white' : '1px solid'}
                borderColor={paymentMethod === pm.key ? 'white' : `${pm.color}.400`}
                onClick={() => setPaymentMethod(pm.key)}>
                {pm.label}
              </Button>
            ))}
          </Grid>

          {/* Complete */}
          <Button w="100%" h="50px" colorScheme="green" fontSize="md" fontWeight="bold" borderRadius="lg"
            onClick={handleSubmitOrder} isLoading={isSubmitting}
            isDisabled={!cart.length || !paymentMethod || customerPhone.length < 10}
            opacity={(!cart.length || !paymentMethod || customerPhone.length < 10) ? 0.5 : 1}>
            {!cart.length ? '⬅️ Add items' : !paymentMethod ? '⬆️ Select payment' : customerPhone.length < 10 ? '📱 Enter phone' : `✅ Complete — $${total.toFixed(2)}`}
          </Button>
        </Box>
      </Box>
    </Flex>
  );
}
