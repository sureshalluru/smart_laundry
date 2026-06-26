import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Flex, Grid, GridItem, Button, Text, Input, VStack, HStack, Badge,
  Icon, IconButton, InputGroup, InputLeftAddon, useToast, InputLeftElement, Divider
} from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaArrowLeft, FaCheck, FaTimes, FaMinus, FaPlus, FaPrint, FaSearch } from 'react-icons/fa';
import { QuickPOSPaymentModalWrapper } from '../Components/QuickPOS/QuickPOSPaymentModal';
import RegisterCustomer from '../hooks/RegisterCustomer';

const popIn = keyframes`
  0% { transform: scale(0.95); opacity: 0.7; }
  50% { transform: scale(1.03); }
  100% { transform: scale(1); opacity: 1; }
`;

const SERVICE_COLORS = ['blue.50','green.50','purple.50','orange.50','pink.50','teal.50','cyan.50','yellow.50','red.50'];
const SERVICE_BORDERS = ['blue.300','green.300','purple.300','orange.300','pink.300','teal.300','cyan.300','yellow.300','red.300'];

export default function QuickPOSPage({ laundryId, stripePublicKey, stripeTerminalExists }) {
  const navigate = useNavigate();
  const authToken = localStorage.getItem('idToken');

  const [services, setServices] = useState([]);
  const [cart, setCart] = useState([]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [phoneSuggestions, setPhoneSuggestions] = useState([]);
  const [bags, setBags] = useState(1);
  const [tip, setTip] = useState({ tipOption: 'noTip', tipType: 'noTip', tipPercentage: 0, tipAmount: '0.00', customTip: '' });
  const [needBy, setNeedBy] = useState('asap'); // 'asap' or date string
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [animatingItem, setAnimatingItem] = useState(null);

  // New customer registration state
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const toast = useToast();

  // Service search/filter
  const [serviceSearch, setServiceSearch] = useState('');

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
    setIsNewCustomer(false);
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
      if (exact) { setCustomerName(`${exact.firstName||''} ${exact.lastName||''}`.trim()); setCustomerId(exact.customerId); setPhoneSuggestions([]); setIsNewCustomer(false); }
      else {
        setCustomerName(''); setCustomerId('');
        if (phone.length === 10) setIsNewCustomer(true);
      }
    } catch (err) { /* ok */ }
  };

  const selectCustomer = (s) => {
    setCustomerPhone(s.phoneNumber?.replace('+1','') || '');
    setCustomerName(`${s.firstName||''} ${s.lastName||''}`.trim());
    setCustomerId(s.customerId); setPhoneSuggestions([]); setIsNewCustomer(false);
  };

  // Register new customer inline
  const handleRegisterCustomer = async () => {
    if (!newFirstName.trim() || !newLastName.trim()) {
      toast({ title: 'Name required', description: 'Please enter first and last name.', status: 'warning', duration: 3000, isClosable: true });
      return;
    }
    setIsRegistering(true);
    try {
      const result = await RegisterCustomer({
        laundryId,
        phoneNumber: customerPhone,
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        email: newEmail.trim(),
        receivePhoneNotification: true,
      });
      setCustomerId(result.customerId);
      setCustomerName(`${newFirstName.trim()} ${newLastName.trim()}`);
      setIsNewCustomer(false);
      setNewFirstName(''); setNewLastName(''); setNewEmail('');
      toast({ title: result.isNew ? 'Customer registered' : 'Customer found', status: 'success', duration: 2000, isClosable: true });
    } catch (err) {
      toast({ title: 'Registration failed', description: err.message, status: 'error', duration: 4000, isClosable: true });
    } finally {
      setIsRegistering(false);
    }
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
  const tipAmount = parseFloat(tip.tipAmount) || 0;
  const total = subtotal + tipAmount;

  // Print — matches the regular order ticket format from OrdersInfoManagement
  const printTicket = (printOrderId) => {
    const orderSummary = cart.map(i => {
      const qty = i.isWeight ? 1 : i.quantity;
      const unit = i.isWeight ? `${parseFloat(i.inputWeight) || 0} lbs` : '';
      return `<tr><td>${qty}</td><td>${i.serviceName}${unit ? ` (${unit})` : ''}</td></tr>`;
    }).join('');

    const htmlContent = `
      <html>
        <head>
          <style>
            @page { size: auto; margin: 0; }
            body {
              font-family: Arial, sans-serif;
              font-size: 14px;
              font-weight: bold;
              margin: 0;
              padding: 0;
              width: 80mm;
            }
            .ticket { padding: 10px; box-sizing: border-box; width: 80mm; }
            .ticket-header { text-align: center; font-size: 16px; margin-bottom: 10px; }
            .ticket-section { font-size: 14px; margin-bottom: 5px; }
            .summary { font-size: 14px; margin-top: 10px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 5px 0; }
            .qr-code { text-align: center; margin-top: 10px; }
            hr { border: none; border-top: 1px dashed #000; margin: 10px 0; }
            .totals { margin-top: 10px; text-align: right; }
          </style>
        </head>
        <body>
          ${Array.from({length: bags}, (_, i) => `
            <div class="ticket">
              <div class="ticket-header">Ticket ${i + 1}/${bags} (Bag)</div>
              <div class="ticket-section"><span>Order ID:</span> ${printOrderId}</div>
              <div class="ticket-section"><span>Due:</span> ${needBy === 'asap' ? 'ASAP' : needBy}</div>
              <div class="ticket-section"><span>Customer:</span> ${customerName || customerPhone}</div>
              <div class="summary">
                <span>Order Summary:</span>
                <table>
                  <thead><tr><th>Qty</th><th>Item Name</th></tr></thead>
                  <tbody>${orderSummary}</tbody>
                </table>
              </div>
              <hr/>
              <div class="totals">
                <div>Subtotal: $${subtotal.toFixed(2)}</div>
                ${tipAmount > 0 ? `<div>Tip: $${tipAmount.toFixed(2)}</div>` : ''}
                <div style="font-size:16px;">TOTAL: $${total.toFixed(2)}</div>
              </div>
              <div class="qr-code" id="qrcode-${i + 1}"></div>
            </div>
            ${i < bags - 1 ? '<hr>' : ''}
          `).join('')}
          <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
          <script>
            ${Array.from({length: bags}, (_, i) => `
              QRCode.toDataURL('${printOrderId}', { width: 100, height: 100 }, (err, url) => {
                const qr = document.getElementById('qrcode-${i + 1}');
                if (!err && qr) { const img = document.createElement('img'); img.src = url; qr.appendChild(img); }
              });
            `).join('\n')}
            setTimeout(() => { }, 800);
          </script>
        </body>
      </html>
    `;

    // Print via hidden iframe — avoids popup window, cleaner UX
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();
    // Wait for QR codes to load, then print
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      // Clean up iframe after print dialog closes
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 800);
  };

  const resetPOS = () => {
    setCart([]); setCustomerPhone(''); setCustomerName(''); setCustomerId('');
    setBags(1); setTip({ tipOption: 'noTip', tipType: 'noTip', tipPercentage: 0, tipAmount: '0.00', customTip: '' }); setNeedBy('asap'); setOrderSuccess(null); setOrderId(null); setPhoneSuggestions([]);
    setIsNewCustomer(false); setNewFirstName(''); setNewLastName(''); setNewEmail('');
  };

  if (orderSuccess) {
    return (
      <Flex h="100vh" align="center" justify="center" bg="green.50" direction="column">
        <Icon as={FaCheck} boxSize={20} color="green.400" mb={4} />
        <Text fontSize="4xl" fontWeight="bold" color="green.600">Order Created!</Text>
        <Text fontSize="2xl" color="gray.600" mt={2}>{orderId}</Text>
        <HStack mt={6} spacing={4}>
          <Button leftIcon={<FaPrint />} colorScheme="blue" size="lg" onClick={() => printTicket(orderId)}>Print Again</Button>
          <Button colorScheme="green" size="lg" onClick={resetPOS}>New Order</Button>
        </HStack>
      </Flex>
    );
  }

  return (
    <Flex h="100vh" w="100vw" position="fixed" top={0} left={0} bg="gray.50" zIndex={1300} direction={{ base: 'column', md: 'row' }}>
      {/* LEFT: Phone + Services Grid (clean, just tap targets) */}
      <Box w={{ base: '100%', md: 'auto' }} flex={{ md: 1 }} h="100%" overflowY="auto" p={3} bg="white">
        <HStack mb={2} justify="space-between">
          <HStack>
            <Button variant="ghost" size="xs" leftIcon={<FaArrowLeft />} onClick={() => navigate(`/${laundryId}/admin/active-orders`)}>Active Orders</Button>
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
            {!customerName && customerPhone.length === 10 && <Badge colorScheme="orange" fontSize="xs" px={2} py={1}>New Customer</Badge>}
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

        {/* New Customer Registration — inline compact form */}
        {isNewCustomer && !customerId && (
          <Box mb={3} p={2} bg="orange.50" borderRadius="md" border="1px solid" borderColor="orange.200">
            <Text fontSize="xs" fontWeight="semibold" mb={1} color="orange.700">Register New Customer</Text>
            <HStack spacing={2} mb={1}>
              <Input placeholder="First name *" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)}
                size="sm" bg="white" />
              <Input placeholder="Last name *" value={newLastName} onChange={(e) => setNewLastName(e.target.value)}
                size="sm" bg="white" />
            </HStack>
            <HStack spacing={2}>
              <Input placeholder="Email (optional)" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                size="sm" bg="white" type="email" />
              <Button size="sm" colorScheme="orange" onClick={handleRegisterCustomer} isLoading={isRegistering}
                isDisabled={!newFirstName.trim() || !newLastName.trim()} minW="80px">
                Register
              </Button>
            </HStack>
          </Box>
        )}

        {/* Search services */}
        <InputGroup size="sm" mb={3}>
          <InputLeftElement pointerEvents="none">
            <Icon as={FaSearch} color="gray.400" boxSize={3} />
          </InputLeftElement>
          <Input placeholder="Search services..." value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
            bg="gray.50" borderRadius="lg" border="1px solid" borderColor="gray.200"
            _focus={{ borderColor: 'blue.300', bg: 'white' }} />
        </InputGroup>

        {/* Services Grid — clean uniform cards */}
        <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }} gap={2}>
          {services
            .filter(svc => !serviceSearch || svc.serviceName?.toLowerCase().includes(serviceSearch.toLowerCase()))
            .map((svc, idx) => {
              const inCart = cart.find(i => i.serviceName === svc.serviceName);
              return (
            <GridItem key={svc.serviceName || idx}>
              <Button w="100%" h={{ base: '68px', md: '76px' }} bg={inCart ? 'blue.50' : 'white'}
                border="1px solid" borderColor={inCart ? 'blue.400' : 'gray.200'}
                borderRadius="xl" flexDirection="column" position="relative"
                onClick={() => addToCart(svc)} _hover={{ bg: 'gray.50', shadow: 'sm', borderColor: 'blue.300' }}
                _active={{ transform: 'scale(0.97)' }} transition="all 0.12s"
                animation={animatingItem === svc.serviceName ? `${popIn} 0.25s ease` : undefined}>
                {inCart && (
                  <Badge position="absolute" top={1} right={1} colorScheme="blue" borderRadius="full" fontSize="9px" px={1.5}>
                    {inCart.quantity}{inCart.isWeight ? 'lb' : ''}
                  </Badge>
                )}
                <Text fontWeight="600" fontSize="xs" textAlign="center" noOfLines={2} color="gray.800">{svc.serviceName}</Text>
                <Text fontSize="sm" fontWeight="700" color="blue.600" mt={0.5}>
                  ${parseFloat(svc.price || 0).toFixed(2)}{svc.inputWeight ? '/lb' : ''}
                </Text>
              </Button>
            </GridItem>
              );
          })}
        </Grid>
      </Box>

      {/* RIGHT: Cart + Summary — light clean panel */}
      <Box w={{ base: '100%', md: '320px' }} minW="320px" h="100%" bg="white" borderLeft="1px solid" borderColor="gray.200" display="flex" flexDirection="column">
        {/* Cart items with inline controls */}
        <Box flex={1} overflowY="auto" p={3}>
          <HStack justify="space-between" mb={2}>
            <Text fontSize="md" fontWeight="bold" color="gray.800">Cart ({cart.length})</Text>
            <HStack>
              <Text fontSize="xs" color="gray.600">Bags:</Text>
              <IconButton icon={<FaMinus />} size="xs" variant="outline" colorScheme="gray" onClick={() => setBags(Math.max(1, bags-1))} aria-label="-" />
              <Text fontWeight="bold" fontSize="sm" color="gray.800">{bags}</Text>
              <IconButton icon={<FaPlus />} size="xs" variant="outline" colorScheme="gray" onClick={() => setBags(bags+1)} aria-label="+" />
            </HStack>
          </HStack>

          {cart.length === 0 ? (
            <Text color="gray.400" textAlign="center" py={8} fontSize="sm">Tap services on the left to add items</Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {cart.map(item => {
                const qty = item.isWeight ? (parseFloat(item.inputWeight) || 0) : item.quantity;
                const lineTotal = item.price * qty;
                return (
                  <Box key={item.serviceName} bg="gray.50" borderRadius="lg" p={2} border="1px solid" borderColor="gray.100">
                    <HStack justify="space-between" mb={1}>
                      <Text fontSize="sm" fontWeight="semibold" noOfLines={1} flex={1} color="gray.800">{item.serviceName}</Text>
                      <Text fontSize="sm" fontWeight="bold" color="blue.600">${lineTotal.toFixed(2)}</Text>
                      <IconButton icon={<FaTimes />} size="xs" variant="ghost" colorScheme="red" onClick={() => removeFromCart(item.serviceName)} aria-label="x" />
                    </HStack>
                    <HStack>
                      <Text fontSize="xs" color="gray.500" minW="50px">${item.price.toFixed(2)}{item.isWeight ? '/lb' : ' ea'}</Text>
                      {item.isWeight ? (
                        <InputGroup size="sm" maxW="120px">
                          <Input placeholder="0" value={item.inputWeight} onChange={(e) => updateWeight(item.serviceName, e.target.value)}
                            type="number" textAlign="center" bg="white" borderColor="orange.300" _focus={{ borderColor: 'orange.400' }} />
                          <InputLeftAddon bg="orange.100" color="orange.700" fontSize="xs">lbs</InputLeftAddon>
                        </InputGroup>
                      ) : (
                        <HStack spacing={1}>
                          <IconButton icon={<FaMinus />} size="xs" variant="outline" colorScheme="gray" onClick={() => updateQuantity(item.serviceName, -1)} aria-label="-" />
                          <Text fontWeight="bold" fontSize="md" minW="25px" textAlign="center" color="gray.800">{item.quantity}</Text>
                          <IconButton icon={<FaPlus />} size="xs" variant="outline" colorScheme="gray" onClick={() => updateQuantity(item.serviceName, 1)} aria-label="+" />
                        </HStack>
                      )}
                    </HStack>
                  </Box>
                );
              })}
            </VStack>
          )}
        </Box>

        {/* Bottom: Summary + Complete (sticky) */}
        <Box p={3} bg="gray.50" borderTop="1px solid" borderColor="gray.200">
          <HStack justify="space-between" mb={1}>
            <Text fontSize="sm" color="gray.600">Subtotal</Text><Text fontSize="sm" fontWeight="bold" color="gray.800">${subtotal.toFixed(2)}</Text>
          </HStack>

          {/* Need By */}
          <HStack spacing={1} mb={2}>
            <Text fontSize="xs" color="gray.600">Need by:</Text>
            <Button size="xs" h="26px" variant={needBy === 'asap' ? 'solid' : 'outline'}
              colorScheme={needBy === 'asap' ? 'green' : 'gray'} onClick={() => setNeedBy('asap')}>ASAP</Button>
            <Button size="xs" h="26px" variant={needBy === 'tomorrow' ? 'solid' : 'outline'}
              colorScheme={needBy === 'tomorrow' ? 'blue' : 'gray'}
              onClick={() => { const d = new Date(); d.setDate(d.getDate()+1); setNeedBy(d.toISOString().split('T')[0]); }}>Tomorrow</Button>
            <Input type="date" size="xs" h="26px" w="110px" bg="white" borderColor={needBy !== 'asap' && needBy !== 'tomorrow' ? 'blue.300' : 'gray.300'}
              value={needBy !== 'asap' && needBy !== 'tomorrow' ? needBy : ''}
              onChange={(e) => setNeedBy(e.target.value || 'asap')} />
          </HStack>

          {/* Tip */}
          <HStack spacing={1} mb={2} flexWrap="wrap">
            <Text fontSize="xs" mr={1} color="gray.600">Tip:</Text>
            {['5', '10', '15'].map(pct => (
              <Button key={pct} size="xs" h="26px" minW="35px"
                variant={tip.tipOption === pct ? 'solid' : 'outline'}
                colorScheme={tip.tipOption === pct ? 'blue' : 'gray'}
                onClick={() => {
                  const amt = ((subtotal * parseInt(pct)) / 100).toFixed(2);
                  setTip({ tipOption: pct, tipType: 'percentage', tipPercentage: parseInt(pct), tipAmount: amt, customTip: '' });
                }}>
                {pct}%
              </Button>
            ))}
            <Button size="xs" h="26px" minW="45px"
              variant={tip.tipOption === 'custom' ? 'solid' : 'outline'}
              colorScheme={tip.tipOption === 'custom' ? 'orange' : 'gray'}
              onClick={() => setTip(prev => ({ ...prev, tipOption: 'custom', tipType: 'custom' }))}>
              Custom
            </Button>
            <Button size="xs" h="26px" minW="40px"
              variant={tip.tipOption === 'noTip' ? 'solid' : 'outline'}
              colorScheme={tip.tipOption === 'noTip' ? 'gray' : 'gray'}
              onClick={() => setTip({ tipOption: 'noTip', tipType: 'noTip', tipPercentage: 0, tipAmount: '0.00', customTip: '' })}>
              None
            </Button>
            {tip.tipOption === 'custom' && (
              <Input placeholder="$" w="55px" size="xs" h="26px" bg="white" value={tip.customTip} textAlign="center"
                onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setTip(prev => ({ ...prev, customTip: v, tipAmount: v || '0.00' })); }}
                type="text" />
            )}
            {tipAmount > 0 && <Text fontSize="xs" color="blue.600" ml={1} fontWeight="600">${tipAmount.toFixed(2)}</Text>}
          </HStack>

          <Divider mb={2} />

          {/* Total */}
          <HStack justify="space-between" mb={2}>
            <Text fontSize="lg" fontWeight="bold" color="gray.800">Total</Text>
            <Text fontSize="2xl" fontWeight="bold" color="blue.600">${total.toFixed(2)}</Text>
          </HStack>

          {/* Complete — opens payment modal */}
          <Button w="100%" h="50px" colorScheme="green" fontSize="md" fontWeight="bold" borderRadius="lg"
            onClick={() => setIsPaymentModalOpen(true)}
            isDisabled={!cart.length || customerPhone.length < 10 || (isNewCustomer && !customerId)}
            opacity={(!cart.length || customerPhone.length < 10 || (isNewCustomer && !customerId)) ? 0.5 : 1}>
            {!cart.length ? '⬅️ Add items' : customerPhone.length < 10 ? '📱 Enter phone' : (isNewCustomer && !customerId) ? '👤 Register customer' : `✅ Complete — $${total.toFixed(2)}`}
          </Button>
        </Box>
      </Box>

      {/* Payment Modal */}
      <QuickPOSPaymentModalWrapper
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onPaymentSuccess={(successOrderId) => {
          setIsPaymentModalOpen(false);
          setOrderSuccess(true);
          setOrderId(successOrderId);
          printTicket(successOrderId);
        }}
        cart={cart}
        subtotal={subtotal}
        bags={bags}
        customerPhone={customerPhone}
        customerName={customerName}
        customerId={customerId}
        initialTip={tip}
        needBy={needBy}
        laundryId={laundryId}
        stripeTerminalExists={!!stripeTerminalExists}
        stripePublicKey={stripePublicKey || ''}
      />
    </Flex>
  );
}
