import React, { useEffect, useState, useRef } from "react";
import { useDisclosure,Tooltip } from "@chakra-ui/react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import { DeleteIcon, AddIcon } from "@chakra-ui/icons";
import ServiceCatalogManager from "../Components/ServiceCatalog/ServiceCatalogManager";
import IntegrationsTab from "../Components/Integrations/IntegrationsTab";
import {
    Box,
    Spinner,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    Text,
    Flex,
    Button,
    IconButton,
    Input,
    Switch,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    ModalCloseButton,
    useToast,
    Select,
    InputGroup,
    InputLeftAddon
} from "@chakra-ui/react";


export const fetchLaundryOrders = async (laundryId, operation) => {
    const authToken = localStorage.getItem('idToken');
    const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/orders-info`;

    try {
      const response = await axios.get(url, {
        params: {
          operation,
          laundryId,
        },
        headers: {
          // 'x-api-key': process.env.REACT_APP_AWS_API_KEY,
            'Authorization': `Bearer ${authToken}`
        },
        timeout: 15000,
      });
  
      return response.data?.body || []; // Return the orders data
    } catch (error) {
      console.error('Error fetching laundry orders:', error);
      throw error; 
    }
  };

export const fetchLaundryServices = async (laundryId) => {
    const authToken = localStorage.getItem('idToken');

    try {
      const params = {
        operation: "viewServices",
        laundryId: laundryId,
      };
      const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`;
      const response = await axios.get(url, {
        params,
        headers: {
            // "x-api-key": process.env.REACT_APP_AWS_API_KEY
            'Authorization': `Bearer ${authToken}`

        },
      });
      const services = Object.values(response.data?.body?.services || {});
      // console.log("laundry services are ", services);
      return services;
    } catch (error) {
      console.error("Error fetching laundry services:", error);
      throw error; 
    }
  };

 export const fetchLaundryProducts = async (laundryId) => {
     const authToken = localStorage.getItem('idToken');
     const params = { operation: "viewAllProducts", laundryId };
    try {
        const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`;
        const response = await axios.get(url, {
            params,
            headers: {
                // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                'Authorization': `Bearer ${authToken}`

            },
        });
        const products = Object.values(response.data?.body?.products || {});
        // console.log("products from laundry shop", products);
        return products;
    } catch (error) {
        console.error("Error fetching products:", error);
    } 
};
  
export const fetchLaundryInfo = async (laundryId) => {
    const authToken = localStorage.getItem('idToken');
    const params = { operation: "viewShopInfo", laundryId };
    try {
        const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`;
        const response = await axios.get(url, {
            params,
            headers: {
                // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                'Authorization': `Bearer ${authToken}`

            },
        });

        // Check if the response is successful
        if (response.data.statusCode === 200) {
            return response.data.body; // Return the laundry info
        } else {
            console.error("Error fetching laundry info:", response.data.message);
            return null; // Return null if there’s an error
        }
    } catch (error) {
        console.error("Error fetching laundry products:", error);
        return null; // Return null in case of any error during the API call
    }
};

export const fetchLaundryInfoById = async (laundryId) => {
    const authToken = localStorage.getItem('idToken');
    const params = { operation: "viewLaundryInfoById", laundryId };
    try {
        const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`;
        const response = await axios.get(url, {
            params,
            headers: {
                // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                'Authorization': `Bearer ${authToken}`

            },
        });

        // Check if the response is successful
        if (response.data.statusCode === 200) {
            return response.data.body; // Return the laundry info
        } else {
            console.error("Error fetching laundry info:", response.data.message);
            return null; // Return null if there’s an error
        }
    } catch (error) {
        console.error("Error fetching laundry products:", error);
        return null; // Return null in case of any error during the API call
    }
};

export const fetchEmployeeTips = async (laundryId, startDate, endDate) => {
    const authToken = localStorage.getItem('idToken');
    const apiKey = process.env.REACT_APP_TIP_API_KEY;
    const baseUrl = `${process.env.REACT_APP_AWS_API_URL}/api/admin/employee-tip-info`;

    const params = {
        operation: 'viewTipsByLaundryId',
        laundryId,
        startDate,
        endDate
    };

    try {
        const response = await axios.get(baseUrl, {
            params,
            headers: {
                'Authorization': `Bearer ${authToken}`
                // 'x-api-key': process.env.REACT_APP_TIP_API_KEY
            },
        });

        if (response.data?.statusCode === 200) {
            console.log(response);
            return response.data.body;
        } else {
            throw new Error('Failed to fetch tip data.');
        }
    } catch (error) {
        console.error('Error fetching employee tip info:', error);
        throw error;
    }
};

const ReusableModal = React.memo(({ isOpen, onClose, title, footerButtons, children }) => (
    <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
            <ModalHeader>{title}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>{children}</ModalBody>
            <ModalFooter>
                {footerButtons.map(({ label, onClick, colorScheme, variant, isLoading}, index) => (
                    <Button
                        key={index}
                        onClick={onClick}
                        colorScheme={colorScheme}
                        variant={variant}
                        isLoading={isLoading}
                        ml={index > 0 ? 3 : 0}
                    >
                        {label}
                    </Button>
                ))}
            </ModalFooter>
        </ModalContent>
    </Modal>
));

/* ─── Delivery Schedule Section ─────────────────────────────────────────────── */
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DeliveryScheduleSection = ({ laundryId }) => {
    const toast = useToast();
    const [slots, setSlots] = useState([]);
    const [deliveryTimeInterval, setDeliveryTimeInterval] = useState(2);
    const [frequencyIntervals, setFrequencyIntervals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const authToken = localStorage.getItem('idToken');

    const FREQUENCY_OPTIONS = ['Weekly', 'Bi-weekly', 'Monthly'];

    useEffect(() => {
        const fetchSchedule = async () => {
            try {
                const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/delivery-schedule`, {
                    params: { laundryId },
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                const data = res.data?.body || res.data;
                if (data.deliveryTimeSlots) {
                    setSlots(data.deliveryTimeSlots);
                }
                if (data.deliveryTimeInterval) {
                    setDeliveryTimeInterval(data.deliveryTimeInterval);
                }
                if (data.frequencyIntervals) {
                    setFrequencyIntervals(data.frequencyIntervals);
                }
            } catch (err) {
                console.error(err);
                toast({ title: 'Error loading schedule', status: 'error', duration: 3000 });
            } finally {
                setLoading(false);
            }
        };
        if (laundryId) fetchSchedule();
    }, [laundryId]);

    const handleSlotChange = (day, field, value) => {
        setSlots(prev => {
            const existing = prev.find(s => s.day === day);
            if (existing) {
                return prev.map(s => s.day === day ? { ...s, [field]: value } : s);
            } else {
                return [...prev, { day, startTime: '08:00', endTime: '17:00', [field]: value }];
            }
        });
    };

    const toggleDay = (day, enabled) => {
        if (enabled) {
            setSlots(prev => [...prev, { day, startTime: '08:00', endTime: '17:00' }]);
        } else {
            setSlots(prev => prev.filter(s => s.day !== day));
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.put(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/delivery-schedule`, {
                laundryId,
                deliveryTimeSlots: slots,
                deliveryTimeInterval,
                frequencyIntervals,
            }, {
                headers: { Authorization: `Bearer ${authToken}` }
            });
            toast({ title: 'Schedule saved!', status: 'success', duration: 3000 });
        } catch (err) {
            console.error(err);
            toast({ title: 'Error saving schedule', status: 'error', duration: 3000 });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Flex justify="center" p={8}><Spinner size="lg" /></Flex>;

    return (
        <Box p={4}>
            <Text fontSize="xl" fontWeight="bold" mb={4}>Delivery Schedule</Text>
            <Text fontSize="sm" color="gray.600" mb={4}>
                Configure which days and hours are available for pickup/delivery. Instant Uber pickup is only available during these hours.
            </Text>

            <Box mb={6} maxW="300px">
                <Text fontWeight="semibold" mb={1}>Time Slot Interval (hours)</Text>
                <Select value={deliveryTimeInterval} onChange={(e) => setDeliveryTimeInterval(Number(e.target.value))}>
                    <option value={1}>1 hour</option>
                    <option value={2}>2 hours</option>
                    <option value={3}>3 hours</option>
                    <option value={4}>4 hours</option>
                </Select>
            </Box>

            <Box mb={6} p={4} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.100">
                <Text fontWeight="semibold" mb={2}>Recurring Pickup Frequency</Text>
                <Text fontSize="xs" color="gray.600" mb={3}>
                    Enable which frequencies customers can choose for Subscribe & Save recurring orders.
                </Text>
                <Flex gap={4} flexWrap="wrap">
                    {FREQUENCY_OPTIONS.map(freq => (
                        <label key={freq} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={frequencyIntervals.includes(freq)}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setFrequencyIntervals(prev => [...prev, freq]);
                                    } else {
                                        setFrequencyIntervals(prev => prev.filter(f => f !== freq));
                                    }
                                }}
                            />
                            <Text fontSize="sm" fontWeight="500">{freq}</Text>
                        </label>
                    ))}
                </Flex>
                {frequencyIntervals.length === 0 && (
                    <Text fontSize="xs" color="orange.600" mt={2}>
                        No frequencies enabled — "Subscribe & Save" won't appear for customers.
                    </Text>
                )}
            </Box>

            <Table variant="simple" size="sm" border="1px solid" borderColor="gray.200">
                <Thead bg="blue.50">
                    <Tr>
                        <Th>Day</Th>
                        <Th>Enabled</Th>
                        <Th>Start Time</Th>
                        <Th>End Time</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {DAYS_OF_WEEK.map(day => {
                        const slot = slots.find(s => s.day === day);
                        const enabled = !!slot;
                        return (
                            <Tr key={day}>
                                <Td fontWeight="semibold">{day}</Td>
                                <Td>
                                    <input
                                        type="checkbox"
                                        checked={enabled}
                                        onChange={(e) => toggleDay(day, e.target.checked)}
                                    />
                                </Td>
                                <Td>
                                    <Input
                                        type="time"
                                        size="sm"
                                        width="130px"
                                        value={slot?.startTime || '08:00'}
                                        isDisabled={!enabled}
                                        onChange={(e) => handleSlotChange(day, 'startTime', e.target.value)}
                                    />
                                </Td>
                                <Td>
                                    <Input
                                        type="time"
                                        size="sm"
                                        width="130px"
                                        value={slot?.endTime || '17:00'}
                                        isDisabled={!enabled}
                                        onChange={(e) => handleSlotChange(day, 'endTime', e.target.value)}
                                    />
                                </Td>
                            </Tr>
                        );
                    })}
                </Tbody>
            </Table>

            <Button colorScheme="blue" mt={4} onClick={handleSave} isLoading={saving}>
                Save Schedule
            </Button>
        </Box>
    );
};

/* ─── Payment Settings Section ──────────────────────────────────────────────── */
const PaymentSettingsSection = ({ laundryId }) => {
    const toast = useToast();
    const [stripePublicKey, setStripePublicKey] = useState("");
    const [stripePrivateKey, setStripePrivateKey] = useState("");
    const [stripeTerminalId, setStripeTerminalId] = useState("");
    const [hasPrivateKey, setHasPrivateKey] = useState(false);
    const [privateKeyChanged, setPrivateKeyChanged] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const authToken = localStorage.getItem('idToken');

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/payment-settings`, {
                    params: { laundryId },
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                const data = res.data?.body || res.data;
                if (data.stripePublicKey !== undefined) setStripePublicKey(data.stripePublicKey);
                if (data.stripePrivateKey !== undefined) setStripePrivateKey(data.stripePrivateKey);
                if (data.stripeTerminalId !== undefined) setStripeTerminalId(data.stripeTerminalId);
                if (data.hasPrivateKey !== undefined) setHasPrivateKey(data.hasPrivateKey);
            } catch (err) { console.error("Error fetching payment settings:", err); }
            finally { setLoading(false); }
        };
        if (laundryId) fetchSettings();
    }, [laundryId, authToken]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = { laundryId };
            // Always send public key and terminal ID
            payload.stripePublicKey = stripePublicKey;
            payload.stripeTerminalId = stripeTerminalId;
            // Only send private key if the user actually changed it
            if (privateKeyChanged) {
                payload.stripePrivateKey = stripePrivateKey;
            }
            await axios.put(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/payment-settings`, payload, {
                headers: { Authorization: `Bearer ${authToken}` }
            });
            toast({ title: 'Payment settings saved!', status: 'success', duration: 3000 });
            setPrivateKeyChanged(false);
        } catch (err) {
            toast({ title: 'Error saving payment settings', status: 'error', duration: 3000 });
        } finally { setSaving(false); }
    };

    if (loading) return <Flex justify="center" p={8}><Spinner size="lg" /></Flex>;

    return (
        <Box p={4}>
            <Text fontSize="xl" fontWeight="bold" mb={4}>💳 Payment Settings</Text>
            <Text fontSize="sm" color="gray.600" mb={6}>
                Configure your Stripe integration keys and terminal reader. These are used for processing payments in-store and online.
            </Text>

            <Box mb={6} maxW="500px" p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontWeight="semibold" mb={2}>Stripe Publishable Key</Text>
                <Input
                    value={stripePublicKey}
                    onChange={(e) => setStripePublicKey(e.target.value)}
                    placeholder="pk_live_... or pk_test_..."
                    mb={2}
                />
                <Text fontSize="xs" color="gray.500">
                    Your Stripe publishable key (starts with pk_). Found in Stripe Dashboard → Developers → API Keys.
                </Text>
            </Box>

            <Box mb={6} maxW="500px" p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontWeight="semibold" mb={2}>Stripe Secret Key</Text>
                <Input
                    type="password"
                    value={stripePrivateKey}
                    onChange={(e) => { setStripePrivateKey(e.target.value); setPrivateKeyChanged(true); }}
                    placeholder={hasPrivateKey ? "••••••• (key is set, type to replace)" : "sk_live_... or sk_test_..."}
                    mb={2}
                />
                <Text fontSize="xs" color="gray.500">
                    Your Stripe secret key (starts with sk_). Keep this confidential. Only update if you need to rotate keys.
                </Text>
            </Box>

            <Box mb={6} maxW="500px" p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontWeight="semibold" mb={2}>Stripe Terminal Reader ID</Text>
                <Input
                    value={stripeTerminalId}
                    onChange={(e) => setStripeTerminalId(e.target.value)}
                    placeholder="tmr_... (your terminal reader ID)"
                    mb={2}
                />
                <Text fontSize="xs" color="gray.500">
                    The Stripe Terminal reader ID (starts with tmr_). Found in Stripe Dashboard → Terminal → Readers.
                </Text>
            </Box>

            <Button colorScheme="blue" onClick={handleSave} isLoading={saving}>Save Payment Settings</Button>
        </Box>
    );
};

/* ─── System Settings Section ───────────────────────────────────────────────── */
const SystemSettingsSection = ({ laundryId }) => {
    const toast = useToast();
    const [taxRate, setTaxRate] = useState(0);
    const [subscriptionDiscount, setSubscriptionDiscount] = useState(0);
    const [smsEnabled, setSmsEnabled] = useState(false);
    const [smsCount, setSmsCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingSms, setSavingSms] = useState(false);
    const authToken = localStorage.getItem('idToken');

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/delivery-schedule`, {
                    params: { laundryId },
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                const data = res.data?.body || res.data;
                if (data.taxRate !== undefined) setTaxRate(data.taxRate);
                if (data.subscriptionDiscount !== undefined) setSubscriptionDiscount(data.subscriptionDiscount);
            } catch (err) { console.error(err); }

            // Fetch SMS settings
            try {
                const smsRes = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/sms-settings`, {
                    params: { laundryId },
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                const smsData = smsRes.data?.body || smsRes.data;
                if (smsData.smsEnabled !== undefined) setSmsEnabled(smsData.smsEnabled);
                if (smsData.smsCount !== undefined) setSmsCount(smsData.smsCount);
            } catch (err) { console.error("Error fetching SMS settings:", err); }

            setLoading(false);
        };
        if (laundryId) fetchSettings();
    }, [laundryId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.put(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/delivery-schedule`, {
                laundryId, taxRate, subscriptionDiscount,
            }, { headers: { Authorization: `Bearer ${authToken}` } });
            toast({ title: 'Settings saved!', status: 'success', duration: 3000 });
        } catch (err) {
            toast({ title: 'Error saving', status: 'error', duration: 3000 });
        } finally { setSaving(false); }
    };

    const handleSmsToggle = async (enabled) => {
        setSavingSms(true);
        try {
            await axios.put(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/sms-settings`, {
                laundryId, smsEnabled: enabled,
            }, { headers: { Authorization: `Bearer ${authToken}` } });
            setSmsEnabled(enabled);
            toast({ title: enabled ? 'SMS notifications enabled' : 'SMS notifications disabled', status: 'success', duration: 3000 });
        } catch (err) {
            toast({ title: 'Error updating SMS settings', status: 'error', duration: 3000 });
        } finally { setSavingSms(false); }
    };

    if (loading) return <Flex justify="center" p={8}><Spinner size="lg" /></Flex>;

    return (
        <Box p={4}>
            <Text fontSize="xl" fontWeight="bold" mb={4}>System Settings</Text>

            <Box mb={6} maxW="400px" p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontWeight="semibold" mb={2}>💰 Sales Tax</Text>
                <Input
                    type="number"
                    step="0.125"
                    min="0"
                    max="20"
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 8.25"
                    mb={2}
                />
                <Text fontSize="xs" color="gray.500">
                    {taxRate > 0 ? `Tax of ${taxRate}% will be added to all orders (online & in-store)` : 'Set to 0 to disable tax. Enter your local sales tax rate (e.g. 8.25 for 8.25%).'}
                </Text>
            </Box>

            <Box mb={6} maxW="400px" p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontWeight="semibold" mb={2}>📦 Subscribe & Save Discount</Text>
                <Input
                    type="number"
                    step="1"
                    min="0"
                    max="50"
                    value={subscriptionDiscount}
                    onChange={(e) => setSubscriptionDiscount(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 10"
                    mb={2}
                />
                <Text fontSize="xs" color="gray.500">
                    {subscriptionDiscount > 0
                        ? `Customers who subscribe to weekly per-bag service get ${subscriptionDiscount}% off each order.`
                        : 'Set to 0 to disable. Customers choosing weekly subscription on per-bag orders get this % discount.'}
                </Text>
            </Box>

            <Box mb={6} maxW="400px" p={4} bg="orange.50" borderRadius="md" border="1px solid" borderColor="orange.200">
                <Flex justify="space-between" align="center" mb={2}>
                    <Text fontWeight="semibold">📱 SMS Notifications</Text>
                    <Switch
                        colorScheme="orange"
                        isChecked={smsEnabled}
                        isDisabled={savingSms}
                        onChange={(e) => handleSmsToggle(e.target.checked)}
                    />
                </Flex>
                <Text fontSize="xs" color="gray.600" mb={2}>
                    {smsEnabled
                        ? "SMS is ON — customers will receive text notifications for order updates, delivery tracking, and reminders. Included in your platform fee — no per-message charge."
                        : "SMS is OFF — only login OTP texts will be sent. Enable to send order updates via SMS. Included in your platform fee — no per-message charge."}
                </Text>
                {smsCount > 0 && (
                    <Text fontSize="xs" color="orange.700" fontWeight="500">
                        📊 Total SMS sent: {smsCount}
                    </Text>
                )}
            </Box>

            <Button colorScheme="blue" onClick={handleSave} isLoading={saving}>Save Settings</Button>
        </Box>
    );
};

const LaundryInfoManagement = ({ validateEmpCredentials, type, empPrefix }) => {
    const { laundryId } = useParams();
    const [servicesData, setServicesData] = useState([]);
    // Phase 2: tenant master opt-in for minimum billable weight
    const [minWeightEnabled, setMinWeightEnabled] = useState(false);
    const [originalMinWeightEnabled, setOriginalMinWeightEnabled] = useState(false);
    // Phase 2: which order channels the minimum applies to ('all'|'online'|'instore')
    const [minWeightScope, setMinWeightScope] = useState("all");
    const [originalMinWeightScope, setOriginalMinWeightScope] = useState("all");

    // Phase 3: distance/flat delivery fee config (mode: none|flat|distance)
    const [deliveryFee, setDeliveryFee] = useState({
        mode: "none", flat: 0, base: 0, perMile: 0, freeRadiusMi: 0, max: "", roadFactor: 1.0, maxServiceableMi: "",
    });
    const [originalDeliveryFee, setOriginalDeliveryFee] = useState({
        mode: "none", flat: 0, base: 0, perMile: 0, freeRadiusMi: 0, max: "", roadFactor: 1.0, maxServiceableMi: "",
    });
    // Phase 2c: add-ons / processing extras catalog
    const [addonsData, setAddonsData] = useState([]);
    const [newAddons, setNewAddons] = useState([]);
    const [addonsToRemove, setAddonsToRemove] = useState([]);
    const [addonsEnabled, setAddonsEnabled] = useState(false);
    const [originalAddonsEnabled, setOriginalAddonsEnabled] = useState(false);
    const [isSavingAddons, setIsSavingAddons] = useState(false);
    const [loading, setLoading] = useState(true);
    const [newServices, setNewServices] = useState([]);
    const [empId, setEmpId] = useState("");
    const [passcode, setPasscode] = useState("");
    const [productsData, setProductsData] = useState([]);
    const [newProducts, setNewProducts] = useState([]);
    const [productsToUpdate, setProductsToUpdate] = useState([]);
    const [productsToRemove, setProductsToRemove] = useState([]);
    const [isServiceEditMode, setIsServiceEditMode] = useState(false); // Edit mode for services
    const [isProductEditMode, setIsProductEditMode] = useState(false); // Edit mode for products
    const [isServiceCredentialModalOpen, setIsServiceCredentialModalOpen] = useState(false);
    const [isProductCredentialModalOpen, setIsProductCredentialModalOpen] = useState(false); 
    const [servicesToRemove, setServicesToRemove] = useState([]);
    const toast = useToast();
    const [isValidatingEmployee, setIsValidatingEmployee] = useState(false); // for the employee validation updates state
    const [isSavingInfo, setIsSavingInfo] = useState(false); // For the service, product and location updates state
    const [currentServiceLimit, setCurrentServiceLimit] = useState(10);
    const [currentProductLimit, setCurrentProductLimit] = useState(10);
    const navigate = useNavigate();

    // States for serviceable locations
    const [locationsData, setLocationsData] = useState([]);
    const [newLocations, setNewLocations] = useState([]);
    const [locationsToRemove, setLocationsToRemove] = useState([]);
    const [isLocationEditMode, setIsLocationEditMode] = useState(false);
    const [isLocationCredentialModalOpen, setIsLocationCredentialModalOpen] = useState(false);

    // States for logo and domain adding
    const [isLogoDomainEditMode, setIsLogoDomainEditMode] = useState(false);
    const [logoFile, setLogoFile] = useState(null);
    const [adminDomain, setAdminDomain] = useState("");
    const [userDomain, setUserDomain] = useState("");
    const [isSavingLogoInfo, setIsSavingLogoInfo] = useState(false);
    const [laundryLogo, setLaundryLogo] = useState(null);  
    const [isLogoDomainFetched, setIsLogoDomainFetched] = useState(false);
    const { isOpen: isLogoDomainAlertOpen, onOpen: openLogoDomainAlert, onClose: closeLogoDomainAlert } = useDisclosure();
    const cancelRef = useRef();
    const [isLogoDomainCredentialModalOpen, setIsLogoDomainCredentialModalOpen] = useState(false);
    const [isEditButtonDisabled, setIsEditButtonDisabled] = useState(false);
    const authToken = localStorage.getItem('idToken');

    // Service categories state
    const [categories, setCategories] = useState([]);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [isSavingCategory, setIsSavingCategory] = useState(false);

    // Function to open credential modal when clicking "Edit" or "Add"
    const handleEditLogoDomainClick = () => {
        if (!isEditButtonDisabled) {
            setIsLogoDomainCredentialModalOpen(true);
        }
    };
    

    // Function to verify credentials and proceed with edit
    const validateAndEnableEdit = async () => {
        setIsValidatingEmployee(true);
        try {
            const fullEmpId = empPrefix + empId
            const { isValidated, role } = await validateEmpCredentials(laundryId, fullEmpId, passcode);
            if (isValidated && ( role === "Manager" || role === "Admin" )) {
                toast({
                    title: "Access Granted",
                    description: `Role: ${role}. You may now edit the logo and domain.`,
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });

                setIsLogoDomainCredentialModalOpen(false);
                setIsLogoDomainEditMode(true);
                setIsEditButtonDisabled(true); // Disable edit button after validation
                setEmpId("");
                setPasscode("");
            } else {
                toast({
                    title: "Access Denied",
                    description: isValidated
                        ? `Your role: ${role}. Only Admins and Managers can edit this section.`
                        : "Invalid credentials. Please try again.",
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });
            }
        } catch (error) {
            console.error("Error validating credentials:", error);
            toast({
                title: "Error",
                description: "An error occurred while validating credentials. Please try again.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        } finally {
            setIsValidatingEmployee(false);
        }
    };
    
    // Function to save logo & domain after confirmation
    const handleSaveWithConfirmation = async () => {
        const confirmSave = window.confirm(
            "This action will overwrite the existing data, replace the logo, and update the domain. Make sure you are updating the correct values. Do you want to proceed?"
        );
    
        if (confirmSave) {
            await handleSaveLogoAndDomain();
            setIsEditButtonDisabled(false); // Re-enable edit button after save
            navigate(0); // Navigate to the same route to refresh the data
        }
    };


    // Confirms edit action and enables edit mode
    const confirmEditLogoDomain = () => {
        closeLogoDomainAlert();
        setIsLogoDomainEditMode(true);
    };

    // Handlers for Load More
    const handleLoadMoreServices = () => {
        if (currentServiceLimit < servicesData.length) {
            setCurrentServiceLimit((prevLimit) => prevLimit + 10);
        }
    };

    const handleLoadMoreProducts = () => {
        if (currentProductLimit < productsData.length) {
            setCurrentProductLimit((prevLimit) => prevLimit + 10);
        }
    };

    const handleValidateSubmit = async (type) => {
        setIsValidatingEmployee(true);
        try {
            // Validate employee credentials and get role
            const fullEmpId = empPrefix + empId
            const { isValidated, role } = await validateEmpCredentials(laundryId, fullEmpId, passcode);
    
            if (isValidated && (role === "Admin" || role === "Manager")) {
                toast({
                    title: "Validation Success",
                    description: `Access granted. Role: ${role}. You can now edit ${type}.`,
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });
    
                // Close the modal and enable editing based on type
                if (type === "services") {
                    setIsServiceCredentialModalOpen(false);
                    setIsServiceEditMode(true);
                } else if (type === "products") {
                    setIsProductCredentialModalOpen(false);
                    setIsProductEditMode(true);
                } else if (type === "locations") {
                    setIsLocationCredentialModalOpen(false);
                    setIsLocationEditMode(true);
                }
    
                // Reset credentials
                setEmpId('');
                setPasscode('');
            } else {
                const errorMessage = isValidated
                    ? `Unauthorized action. Your role: ${role}. Only Admins and Managers can edit ${type}.`
                    : `Invalid credentials for ${type}. Please try again.`;
    
                toast({
                    title: "Access Denied",
                    description: errorMessage,
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });

            }
        } catch (error) {
            console.error("Error validating employee credentials:", error);
            toast({
                title: "Validation Error",
                description: "An error occurred during validation. Please try again.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });

        }
        finally {
            // Reset credentials after success or failure
            setEmpId("");
            setPasscode("");
            setIsValidatingEmployee(false);
        }
    };

    
    // Fetch Laundry Logo & Domain Info
    const fetchLaundryLogoAndDomain = async () => {
        const authToken = localStorage.getItem('idToken');
        try {
            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`,
                {
                    params: { operation: "viewLaundryInfoById", laundryId },
                    headers: {
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                        'Authorization': `Bearer ${authToken}`
                    },
                }
            );
    
            const laundryInfo = response.data?.body?.laundryInfo?.[0] || {};
            console.log("logo info",laundryInfo.laundryLogo);
            console.log("domain: ",laundryInfo.laundryDomain);
            setLaundryLogo(laundryInfo.laundryLogo || null);
            setAdminDomain(laundryInfo.laundryDomain?.adminDomain  || "");
            setUserDomain(laundryInfo.laundryDomain?.userDomain || "");
            setMinWeightEnabled(Boolean(laundryInfo.minWeightEnabled));
            setOriginalMinWeightEnabled(Boolean(laundryInfo.minWeightEnabled));
            setMinWeightScope(laundryInfo.minWeightScope || "all");
            setOriginalMinWeightScope(laundryInfo.minWeightScope || "all");
            const _df = {
                mode: laundryInfo.deliveryFeeMode || "none",
                flat: laundryInfo.deliveryFeeFlat ?? 0,
                base: laundryInfo.deliveryFeeBase ?? 0,
                perMile: laundryInfo.deliveryFeePerMile ?? 0,
                freeRadiusMi: laundryInfo.deliveryFeeFreeRadiusMi ?? 0,
                max: laundryInfo.deliveryFeeMax ?? "",
                roadFactor: laundryInfo.deliveryFeeRoadFactor ?? 1.0,
                maxServiceableMi: laundryInfo.maxServiceableDistanceMi ?? "",
            };
            setDeliveryFee(_df);
            setOriginalDeliveryFee(_df);
            setAddonsEnabled(Boolean(laundryInfo.addonsEnabled));
            setOriginalAddonsEnabled(Boolean(laundryInfo.addonsEnabled));
            setIsLogoDomainFetched(true);
        } catch (error) {
            console.error("Error fetching laundry logo & domain:", error);
            setIsLogoDomainFetched(true);
        }
    };
    
    
    // useEffect(() => {
    //
    //     if (laundryId) {
    //         fetchServices(); // Trigger the fetch operation
    //     }
    // }, [laundryId]);
    
    
    useEffect(() => {
        if (laundryId ) {
            //fetchLaundryServices();
            fetchServices(); // Trigger the fetch operation
            fetchProducts(); 
            fetchLocations();
            fetchLaundryLogoAndDomain();
            fetchCategories();
            fetchAddons();
        }
    }, [laundryId]);
    
    const fetchServices = async () => {
        setLoading(true); // Show the loading spinner
        try {
            const services = await fetchLaundryServices(laundryId); // Call the function
            setServicesData(services); // Update state with the fetched services
        } catch (error) {
            console.error("Error fetching services:", error);
            toast({
                title: "Error",
                description: "Failed to load services. Please try again.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        } finally {
            setLoading(false); // Hide the loading spinner
        }
    };

    // ─── Add-ons / processing extras (Phase 2c) ──────────────────────────────
    const fetchAddons = async () => {
        try {
            const authToken = localStorage.getItem('idToken');
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`,
                {
                    params: { operation: "viewAddons", laundryId },
                    headers: { 'Authorization': `Bearer ${authToken}` },
                }
            );
            setAddonsData(res.data?.body?.addons || []);
        } catch (error) {
            console.error("Error fetching add-ons:", error);
        }
    };

    const handleAddAddon = () => {
        setNewAddons((prev) => [
            ...prev,
            { addonName: "", description: "", pricingBasis: "per_item", unitPrice: "", customerAccess: true },
        ]);
    };

    const handleNewAddonChange = (index, field, value) => {
        setNewAddons((prev) =>
            prev.map((a, i) => (i === index ? { ...a, [field]: value } : a))
        );
    };

    const handleRemoveNewAddon = (index) => {
        setNewAddons((prev) => prev.filter((_, i) => i !== index));
    };

    const handleEditAddon = (index, field, value) => {
        setAddonsData((prev) =>
            prev.map((a, i) => (i === index ? { ...a, [field]: value, isModified: true } : a))
        );
    };

    const handleDeleteAddon = (index) => {
        const addon = addonsData[index];
        if (addon.addonId) {
            setAddonsToRemove((prev) => [...prev, addon.addonId]);
        }
        setAddonsData((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSaveAddons = async () => {
        const payload = {
            addonsEnabled,
            addonsToAdd: (newAddons || [])
                .filter((a) => (a.addonName || "").trim())
                .map((a) => ({
                    addonName: a.addonName.trim(),
                    description: a.description || "",
                    pricingBasis: a.pricingBasis === "per_pound" ? "per_pound" : "per_item",
                    unitPrice: parseFloat(a.unitPrice) || 0,
                    customerAccess: a.customerAccess ?? true,
                })),
            addonsToUpdate: (addonsData || [])
                .filter((a) => a.isModified && a.addonId)
                .map((a) => ({
                    addonId: a.addonId,
                    addonName: (a.addonName || "").trim(),
                    description: a.description || "",
                    pricingBasis: a.pricingBasis === "per_pound" ? "per_pound" : "per_item",
                    unitPrice: parseFloat(a.unitPrice) || 0,
                    customerAccess: a.customerAccess ?? true,
                })),
            addonsToRemove: addonsToRemove || [],
        };

        setIsSavingAddons(true);
        try {
            const authToken = localStorage.getItem('idToken');
            await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-products-services`,
                payload,
                {
                    params: { operation: "updateAddons", laundryId },
                    headers: { 'Authorization': `Bearer ${authToken}` },
                }
            );
            toast({
                title: "Add-ons saved",
                status: "success",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            setNewAddons([]);
            setAddonsToRemove([]);
            setOriginalAddonsEnabled(addonsEnabled);
            fetchAddons();
        } catch (error) {
            console.error("Error saving add-ons:", error);
            toast({
                title: "Error saving add-ons",
                description: "Please try again.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        } finally {
            setIsSavingAddons(false);
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/admin/service-categories`, {
                params: { laundryId },
                headers: { Authorization: `Bearer ${authToken}` },
            });
            setCategories(res.data?.categories || []);
        } catch (err) {
            console.error("Error fetching categories:", err);
        }
    };

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) return;
        setIsSavingCategory(true);
        try {
            const res = await axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/admin/service-categories`, {
                laundryId,
                categoryName: newCategoryName.trim(),
            }, { headers: { Authorization: `Bearer ${authToken}` } });
            if (res.data?.status === "success") {
                setCategories(prev => [...prev, res.data.category]);
                setNewCategoryName("");
                toast({ title: "Category added", status: "success", duration: 2000 });
            } else {
                toast({ title: res.data?.message || "Error", status: "error", duration: 3000 });
            }
        } catch (err) {
            toast({ title: "Error adding category", status: "error", duration: 3000 });
        } finally {
            setIsSavingCategory(false);
        }
    };

    const handleDeleteCategory = async (categoryId) => {
        if (!window.confirm("Delete this category? Make sure no services are assigned to it first.")) return;
        try {
            const res = await axios.delete(`${process.env.REACT_APP_AWS_API_URL}/api/admin/service-categories`, {
                params: { categoryId, laundryId },
                headers: { Authorization: `Bearer ${authToken}` },
            });
            if (res.data?.status === "error") {
                toast({ title: "Cannot Delete", description: res.data.message, status: "warning", duration: 5000, isClosable: true });
                return;
            }
            setCategories(prev => prev.filter(c => c.categoryId !== categoryId));
            toast({ title: "Category deleted", status: "success", duration: 2000 });
        } catch (err) {
            const msg = err.response?.data?.message || "Error deleting category";
            toast({ title: msg, status: "error", duration: 4000, isClosable: true });
        }
    };

    const handleReorderCategory = async (index, direction) => {
        const updated = [...categories];
        const swapIdx = direction === "up" ? index - 1 : index + 1;
        if (swapIdx < 0 || swapIdx >= updated.length) return;
        // Swap display orders
        const tempOrder = updated[index].displayOrder;
        updated[index].displayOrder = updated[swapIdx].displayOrder;
        updated[swapIdx].displayOrder = tempOrder;
        // Swap positions
        [updated[index], updated[swapIdx]] = [updated[swapIdx], updated[index]];
        setCategories(updated);
        // Persist both
        try {
            await Promise.all([
                axios.put(`${process.env.REACT_APP_AWS_API_URL}/api/admin/service-categories`, {
                    categoryId: updated[index].categoryId, laundryId, displayOrder: updated[index].displayOrder,
                }, { headers: { Authorization: `Bearer ${authToken}` } }),
                axios.put(`${process.env.REACT_APP_AWS_API_URL}/api/admin/service-categories`, {
                    categoryId: updated[swapIdx].categoryId, laundryId, displayOrder: updated[swapIdx].displayOrder,
                }, { headers: { Authorization: `Bearer ${authToken}` } }),
            ]);
        } catch (err) {
            console.error("Error reordering:", err);
        }
    };
    
    const validateServices = (services) => {
        for (const service of services) {
            if (!service.serviceName || service.serviceName.trim() === "" || !service.price || isNaN(service.price) || parseFloat(service.price) <= 0) {
                return { isValid: false, message: "Service name/price cannot be empty." };
            }
        }
        return { isValid: true };
    };
    
    // Fetch serviceable locations
    const fetchLocations = async () => {
        const authToken = localStorage.getItem('idToken');
        try {
            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`,
                {
                    params: { operation: "viewLaundryInfoById", laundryId },
                    headers: {
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                        'Authorization': `Bearer ${authToken}`
                    },
                }
            );
            setLocationsData(response.data?.body?.laundryInfo?.[0]?.serviceableZipCodes || []);
        } catch (error) {
            throw error;
        }
    };


    // Add a new location
    const handleAddLocation = () => {
        setNewLocations([...newLocations, ""]);
    };

    // Update new location value
    const handleNewLocationChange = (index, value) => {
        setNewLocations((prev) =>
            prev.map((loc, i) => (i === index ? value : loc))
        );
    };

    // Remove a new location before saving
    const handleRemoveNewLocation = (index) => {
        setNewLocations((prev) => prev.filter((_, i) => i !== index));
    };

    // Mark existing location for removal
    const handleDeleteLocation = (index) => {
        const locationToRemove = locationsData[index];
        setLocationsToRemove((prev) => [...prev, locationToRemove]);
        setLocationsData((prev) => prev.filter((_, i) => i !== index));
    };

    // Save serviceable locations
    const handleSaveLocations = async () => {

        const payload = {
            zipCodesToAdd: newLocations,
            zipCodesToRemove: locationsToRemove,
        };

        if (
            payload.zipCodesToAdd.length === 0 &&
            payload.zipCodesToRemove.length === 0
        ) {
            toast({
                title: "No Changes",
                description: "No locations were added or removed.",
                status: "info",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            setIsLocationEditMode(false);
            return;
        }
        setIsSavingInfo(true);
        try {
            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-products-services`,
                payload,
                {
                    params: { operation: "modifyServiceableZipCodes", laundryId: laundryId },
                    headers: {
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                        'Authorization': `Bearer ${authToken}`


                    },
                }
            );

            toast({
                title: "Save Successful",
                description: response.data?.body?.message || "Locations updated successfully.",
                status: "success",
                duration: 5000,
                isClosable: true,
                position: "top",
            });

            // Refresh data
            setNewLocations([]);
            setLocationsToRemove([]);
            fetchLocations();
            setIsLocationEditMode(false);
        } catch (error) {
            console.error("Error saving locations:", error);
            toast({
                title: "Save Failed",
                description: "An error occurred while saving locations.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        }
        finally {
            setIsSavingInfo(false);
        }
    };

    const handleSaveServices = async () => {

    const allServices = [...servicesData, ...newServices];

        // Validate services
        const validation = validateServices(allServices);
        if (!validation.isValid) {
            toast({
                title: "Validation Error",
                description: validation.message,
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            return;
        }
        const payload = {
            servicesToAdd: (newServices || []).map(({ serviceName, price, description, customerAccess, inputWeight, categoryId, minBillableWeight }) => ({
                serviceName,
                price: parseFloat(price) || 0,
                description: description || "N/A",
                customerAccess: customerAccess ?? false,
                inputWeight: inputWeight ?? false,
                categoryId: categoryId || null,
                minBillableWeight: (minBillableWeight === "" || minBillableWeight == null) ? null : parseFloat(minBillableWeight),
            })),
            servicesToUpdate: (servicesData || [])
                .filter((service) => service.isModified)
                .map(({ serviceName, originalServiceName, price, description, customerAccess, inputWeight, categoryId, minBillableWeight }) => ({
                    serviceName,
                    originalServiceName: originalServiceName || serviceName,
                    price: parseFloat(price) || 0,
                    description: description || "N/A",
                    customerAccess: customerAccess ?? false,
                    inputWeight: inputWeight ?? false,
                    categoryId: categoryId || null,
                    minBillableWeight: (minBillableWeight === "" || minBillableWeight == null) ? null : parseFloat(minBillableWeight),
                })),
            servicesToRemove: servicesToRemove || [],
            minWeightEnabled: minWeightEnabled,
            minWeightScope: minWeightScope,
            deliveryFeeMode: deliveryFee.mode,
            deliveryFeeFlat: parseFloat(deliveryFee.flat) || 0,
            deliveryFeeBase: parseFloat(deliveryFee.base) || 0,
            deliveryFeePerMile: parseFloat(deliveryFee.perMile) || 0,
            deliveryFeeFreeRadiusMi: parseFloat(deliveryFee.freeRadiusMi) || 0,
            deliveryFeeMax: (deliveryFee.max === "" || deliveryFee.max == null) ? null : parseFloat(deliveryFee.max),
            deliveryFeeRoadFactor: parseFloat(deliveryFee.roadFactor) || 1.0,
            maxServiceableDistanceMi: (deliveryFee.maxServiceableMi === "" || deliveryFee.maxServiceableMi == null) ? null : parseFloat(deliveryFee.maxServiceableMi),
        };
    
        const deliveryFeeChanged = JSON.stringify(deliveryFee) !== JSON.stringify(originalDeliveryFee);
        if (
            payload.servicesToAdd.length === 0 &&
            payload.servicesToUpdate.length === 0 &&
            payload.servicesToRemove.length === 0 &&
            minWeightEnabled === originalMinWeightEnabled &&
            minWeightScope === originalMinWeightScope &&
            !deliveryFeeChanged
        ) {
            toast({
                title: "No Changes",
                description: "No services were added, updated, or removed.",
                status: "info",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            setIsServiceEditMode(false);
            return;
        }
        setIsSavingInfo(true);
        try {
            const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-products-services`;
            const params = { operation: "updateServices", laundryId };
    
            const response = await axios.post(url, payload, {
                headers: {
                    // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                    'X-Amz-Date': laundryId,
                    'Authorization': `Bearer ${authToken}`

                },
                params,
            });
    
            if (response?.status === 200 && response?.data?.body?.message) {
                
                toast({
                    title: "Save Successful",
                    description: response.data.body.message,
                    status: "success",
                    duration: 5000,
                    isClosable: true,
                    position: "top",
                });
                setNewServices([]);
                setServicesToRemove([]);
                setOriginalMinWeightEnabled(minWeightEnabled);
                setOriginalMinWeightScope(minWeightScope);
                setOriginalDeliveryFee(deliveryFee);
                fetchServices();
                setIsServiceEditMode(false);
            } else {
                throw new Error("Unexpected API response");
            }
        } catch (error) {
            console.error("Error saving services:", error);
            toast({
                title: "Save Failed",
                description: error.response?.data?.message || "An error occurred while saving services.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        }
        finally {
            setIsSavingInfo(false);
        }
    };
        
    const handleEditService = (index, field, value) => {
        setServicesData((prev) =>
            prev.map((service, i) =>
                i === index
                    ? {
                        ...service,
                        [field]: field === "price" ? parseFloat(value) : value,
                        isModified: true,
                        // Track original name for rename support
                        originalServiceName: service.originalServiceName || service.serviceName,
                      }
                    : service
            )
        );
    };
 
    const handleAddService = () => {
        setNewServices([
            ...newServices,
            { serviceName: "", price: "", description: "", access: [], inputWeight: false, categoryId: null },
        ]);
    };    
    
    
    
    const handleNewServiceChange = (index, field, value) => {
        setNewServices((prev) =>
            prev.map((service, i) =>
                i === index
                    ? { ...service, [field]: field === "price" ? parseFloat(value) : value }
                    : service
            )
        );
    };
    
    const handleDeleteService = (index) => {
        const serviceToRemove = servicesData[index].serviceName;
        setServicesToRemove((prev) => [...prev, serviceToRemove]);
        setServicesData((prev) => prev.filter((_, i) => i !== index));
    };
    
    const handleRemoveNewService = (index) => {
        setNewServices((prev) => prev.filter((_, i) => i !== index));
    };
    
    const fetchProducts = async () => {
        setLoading(true);
        try {
            const products = await fetchLaundryProducts(laundryId);
            setProductsData(products);
            // console.log("products from laundry shop", products);
        } catch (error) {
            console.error("Error fetching products:", error);
            toast({
                title: "Error",
                description: "Failed to load services. Please try again.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            setProductsData([]);
        } finally {
            setLoading(false);
        }
    };
    
    // Add a new product to the "newProducts" list
    const handleAddProduct = () => {
        setNewProducts([
            ...newProducts,
            {
                productName: "",
                price: "", // Initialize as an empty string
                description: "",
                customerAccess: false, // Default to false
            },
        ]);
    };

    // Handle changes to fields in "newProducts"
    const handleNewProductChange = (index, field, value) => {
        const updatedProducts = [...newProducts];
        updatedProducts[index][field] =
            field === "price" ? parseFloat(value) || "" : 
            field === "customerAccess" ? value === "true" : value;
        setNewProducts(updatedProducts);
    };

    const handleEditProduct = (index, field, value) => {
        // Clone the productsData to avoid direct mutation
        const updatedProducts = [...productsData];

        // Handle the customerAccess toggle and other fields
        if (field === "price") {
            updatedProducts[index][field] = parseFloat(value) || ""; // Ensure price is a valid float
        } else if (field === "customerAccess") {
            updatedProducts[index][field] = value === "true"; // Convert "true"/"false" string to boolean
        } else {
            updatedProducts[index][field] = value; // Update other fields as is
        }

        // Update the state for productsData
        setProductsData(updatedProducts);

        // Track product updates in productsToUpdate
        const productName = updatedProducts[index]?.productName;

        setProductsToUpdate((prev) => {
            const existingUpdate = prev.find((prod) => prod.productName === productName);
            if (existingUpdate) {
                // Update the existing product in productsToUpdate
                return prev.map((prod) =>
                    prod.productName === productName
                        ? { ...prod, [field]: updatedProducts[index][field] }
                        : prod
                );
            } else {
                // Add a new product update if not already in productsToUpdate
                return [
                    ...prev,
                    { productName, [field]: updatedProducts[index][field] },
                ];
            }
        });
    };

    // Handle deleting a product from "productsData"
    const handleDeleteProduct = (index) => {
        const productToRemove = productsData[index];
        if (productToRemove?.productName) {
            setProductsToRemove((prev) => [...prev, productToRemove.productName]);
            setProductsData((prev) => prev.filter((_, i) => i !== index));
        } else {
            console.error("Error: Product name is missing for deletion.");
        }
    };

    const validateProducts = (products) => {
        for (const product of products) {

            if (
                !product.productName || // Check if product name is not provided
                typeof product.productName !== "string" || // Check if product name is not a string
                product.productName.trim() === "" || // Check if product name is an empty string
                product.price === undefined || // Check if price is not provided
                product.price === null || // Check if price is explicitly set to null
                product.price === "" || // Check if price is an empty string
                isNaN(Number(product.price)) || // Check if price is not a valid number
                parseFloat(product.price) <= 0 // Check if price is less than or equal to zero
            ) {
                console.log("Invalid product:", product);
                const errorMessage =
                    !product.productName || product.productName.trim() === ""
                        ? "Product name is required and cannot be empty."
                        : product.price === undefined || product.price === null || product.price === ""
                        ? "Product price is required and cannot be empty."
                        : isNaN(Number(product.price)) || parseFloat(product.price) <= 0
                        ? "Product price must be a valid positive number."
                        : "Invalid product data.";
            
                return { isValid: false, message: errorMessage };
            }
            
            
            
        }
        return { isValid: true };
    };
    
    
    const handleSaveProducts = async () => {
        const allProducts = [...productsData, ...newProducts];

        // Validate services
        if(newProducts.length > 0){
            // console.log("new products: ", newProducts);
        const validation = validateProducts(allProducts);
        // console.log("product validation:", validation);
        if (!validation.isValid) {
            toast({
                title: "Validation Error",
                description: validation.message,
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            return;
        }
    }

        const baseUrl = `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-products`;
        const params = { operation: "updateProducts", laundryId:laundryId };

        const payload = {
            productsToAdd: newProducts,
            productsToUpdate,
            productsToRemove,
        };

        // console.log("payload items: ", payload);
        setIsSavingInfo(true);
        try {
            const response = await axios.post(baseUrl, payload, {
                params,
                headers: {
                    // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                    'Authorization': `Bearer ${authToken}`

                },
            });
            const { message } = response.data.body;

            if (newProducts.length > 0 || productsToUpdate.length > 0 || productsToRemove.length > 0) {
                // Changes were made
                toast({
                    title: "Save Successful",
                    description: message,
                    status: "success",
                    duration: 5000,
                    isClosable: true,
                    position: "top",
                });
            } else {
                // No changes
                toast({
                    title: "No Changes",
                    description: "No products were added, updated, or removed.",
                    status: "info",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });
            }

            // Reset states after save
            setNewProducts([]);
            setProductsToUpdate([]);
            setProductsToRemove([]);
            fetchProducts();
            setIsProductEditMode(false); // Exit product edit mode
        } catch (error) {
            console.error("Error saving products:", error);
            toast({
                title: "Save Failed",
                description: "An error occurred while saving products.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        } finally {
            setIsSavingInfo(false);
            setEmpId("");
            setPasscode("");
        }
    };

    if (loading) {
        return (
            <Flex justifyContent="center" alignItems="center" height="200px">
                <Spinner size="xl" color="blue.500" />
            </Flex>
        );
    }

    if (servicesData.length === 0) {
        return <Text>Loading...</Text>;
    }

    const handleRemoveNewProduct = (index) => {
        setNewProducts((prev) => prev.filter((_, i) => i !== index));
    };

    // Handle File Upload
    const handleLogoUpload = (event) => {
        const file = event.target.files[0];
        setLogoFile(file);
    };

    // Handle Domain Change
    const handleAdminDomainChange = (event) => {
        setAdminDomain(event.target.value);
    };

    const handleUserDomainChange = (event) => {
        setUserDomain(event.target.value);
    };

    // Convert Image to Base64
    const convertToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(",")[1]); // Extract Base64 part
            reader.onerror = (error) => reject(error);
        });
    };

    // Handle Save Logo & Domain
    const handleSaveLogoAndDomain = async () => {
        if (!logoFile && !adminDomain && !userDomain) {
            toast({
                title: "Error",
                description: "At least one of logo or domain must be provided.",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
            return;
        }

        setIsSavingInfo(true);

        try {
            let base64Image = null;
            if (logoFile) {
                base64Image = await convertToBase64(logoFile);
            }

            const payload = {
                imageBase64: base64Image,
                laundryDomain: {
                    adminDomain: adminDomain || null,
                    userDomain: userDomain || null
                }
            };

            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-products-services`,
                payload,
                {
                    params: { operation: "updateLaundryInfo", laundryId: laundryId },
                    headers: {
                        // "x-api-key": process.env.REACT_APP_AWS_API_KEY
                        'Authorization': `Bearer ${authToken}`

                    },
                }
            );

            if (response.status === 200) {
                toast({
                    title: "Success",
                    description: "Laundry info updated successfully!",
                    status: "success",
                    duration: 3000,
                    isClosable: true,
                    position: "top",
                });
                setIsLogoDomainEditMode(false);
            } else {
                throw new Error(response.data.error || "Failed to update.");
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message,
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "top",
            });
        } finally {
            setIsSavingInfo(false);
        }
    };
    

    return (
        <Box 
            overflowX="auto" 
            mt={4} 
            bg = "white"
        >
        
        <Flex justify="space-between" alignItems="center" mb={4}>
            {type === "services" ? (
                isServiceEditMode ? (
                    <Flex>
                        <Button
                            colorScheme="green"
                            mr={4}
                            onClick={handleSaveServices}
                            isLoading={isSavingInfo}
                        >
                            Save Services
                        </Button>
                        <IconButton
                            aria-label="Add Service"
                            icon={<AddIcon />}
                            colorScheme="teal"
                            onClick={handleAddService}
                        />
                    </Flex>
                ) : (
                    <Button
                        colorScheme="teal"
                        onClick={() => setIsServiceCredentialModalOpen(true)}
                    >
                        Edit Services
                    </Button>
                )
            ) : type === "products" ? (
                isProductEditMode ? (
                    <Flex>
                        <Button
                            colorScheme="green"
                            mr={4}
                            onClick={handleSaveProducts}
                            isLoading={isSavingInfo}
                        >
                            Save Products
                        </Button>
                        <IconButton
                            aria-label="Add Product"
                            icon={<AddIcon />}
                            colorScheme="teal"
                            onClick={handleAddProduct}
                        />
                    </Flex>
                ) : (
                    <Button
                        colorScheme="teal"
                        onClick={() => setIsProductCredentialModalOpen(true)}
                    >
                        Edit Products
                    </Button>
                )
            ) : type === "zipCodes" ? (
                isLocationEditMode ? (
                    <Flex>
                        <Button
                            colorScheme="green"
                            mr={4}
                            onClick={handleSaveLocations}
                            isLoading={isSavingInfo}
                        >
                            Save Locations
                        </Button>
                        <IconButton
                            aria-label="Add Location"
                            icon={<AddIcon />}
                            colorScheme="teal"
                            onClick={handleAddLocation}
                        />
                    </Flex>
                ) : (
                    <Button
                        colorScheme="teal"
                        onClick={() => setIsLocationCredentialModalOpen(true)}
                    >
                        Edit Locations
                    </Button>
                )
            ) : type === "logoAndDomain" ? (
                isLogoDomainFetched ? (
                    <Box p={4}>
                        <Flex alignItems="center" mb={4}>
                            <Text fontSize="lg" fontWeight="bold" mr={4}>Laundry Logo:</Text>
                            {laundryLogo ? (
                                <img src={laundryLogo} alt="Laundry Logo" width="150" height="150" style={{ borderRadius: "5px" }} />
                            ) : (
                                <Text color="gray.500">No Logo Available</Text>
                            )}
                        </Flex>
            
                        <Flex alignItems="center" mb={4}>
                            <Text fontSize="lg" fontWeight="bold" mr={4}>Laundry Domain:</Text>
                            <Box>
                                {adminDomain && <Text fontSize="md"><b>Admin:</b> {adminDomain}</Text>}
                                {userDomain && <Text fontSize="md"><b>User:</b> {userDomain}</Text>}
                                {!adminDomain && !userDomain && <Text color="gray.500">No Domain Available</Text>}
                            </Box>
                        </Flex>
            
                        <Box>
                        {/* Button that triggers credential validation before editing */}
                        <Button colorScheme="teal" onClick={handleEditLogoDomainClick} isDisabled={isEditButtonDisabled}>
                            {laundryLogo || adminDomain || userDomain ? "Edit Logo & Domain" : "Add Logo & Domain"}
                        </Button>
                        <Text fontSize="sm" color="red.500" fontWeight="bold" mt={1}>
                            * Manager Access Only
                        </Text>
                        </Box>

                        {/* Credential Modal for Logo & Domain Edit */}
                        <ReusableModal
                            isOpen={isLogoDomainCredentialModalOpen}
                            onClose={() => {
                                setIsLogoDomainCredentialModalOpen(false);
                                setEmpId("");
                                setPasscode("");
                            }}
                            title="Enter Credentials to Edit Logo & Domain"
                            footerButtons={[
                                {
                                    label: "Submit",
                                    onClick: validateAndEnableEdit,
                                    colorScheme: "blue",
                                    isLoading: isValidatingEmployee,
                                },
                                {
                                    label: "Cancel",
                                    onClick: () => {
                                        setIsLogoDomainCredentialModalOpen(false);
                                        setEmpId("");  // Reset Employee ID
                                        setPasscode(""); // Reset Passcode
                                    },
                                    variant: "ghost",
                                },
                            ]}
                        >
                            
                            <InputGroup mb={4}>
                                <InputLeftAddon>{empPrefix}</InputLeftAddon>
                                <Input
                                    placeholder="EmpId"
                                    value={empId}
                                    onChange={(e) => setEmpId(e.target.value)}
                                />
                            </InputGroup>
                            <Input
                                placeholder="Passcode"
                                type="password"
                                value={passcode}
                                onChange={(e) => setPasscode(e.target.value)}
                            />
                        </ReusableModal>
            
                        {/* Form for Editing Logo and Domain (Only shown after validation) */}
                        {isLogoDomainEditMode && (
                            <Box p={4} mt={3}>
                                <Flex direction="column" gap={3}>
                                    <Box>
                                        <Text fontSize="md" fontWeight="bold">Upload Laundry Logo</Text>
                                        <Input type="file" accept="image/*" onChange={handleLogoUpload} />
                                    </Box>
            
                                    {/* <Box>
                                        <Text fontSize="md" fontWeight="bold">Admin Domain</Text>
                                        <Input placeholder="Enter Admin Domain" value={adminDomain} onChange={handleAdminDomainChange} />
                                    </Box> */}
                                    <Box>
                                        <Text fontSize="md" fontWeight="bold">Admin Domain</Text>
                                        <Input 
                                            placeholder="Enter Admin Domain" 
                                            value={isLogoDomainEditMode ? "" : adminDomain} 
                                            onChange={handleAdminDomainChange} 
                                        />
                                    </Box>
                                                
                                    <Box>
                                        <Text fontSize="md" fontWeight="bold">User Domain</Text>
                                        <Input 
                                            placeholder="Enter User Domain" 
                                            value={isLogoDomainEditMode ? "" : userDomain} 
                                            onChange={handleUserDomainChange} 
                                        />
                                    </Box>
            
                                    <Flex mt={3}>
                                        <Button colorScheme="green" mr={4} onClick={handleSaveWithConfirmation} isLoading={isSavingInfo} isDisabled={!logoFile && !adminDomain && !userDomain}>
                                            Save
                                        </Button>
                                        <Button colorScheme="red" onClick={() => {
                                            setIsLogoDomainEditMode(false);
                                            setIsEditButtonDisabled(false); // Re-enable edit button after cancel
                                        }}>
                                            Cancel
                                        </Button>
                                    </Flex>
                                </Flex>
                            </Box>
                        )}
                    </Box>
                ) : (
                    <Text>Loading...</Text>
                )
            ) : null }
            
        

        </Flex>

            {/* Homepage Promo Settings */}
            {type === "logoAndDomain" && (
                <Box mt={6} p={4} bg="orange.50" borderRadius="lg" border="1px solid" borderColor="orange.200">
                    <HomepagePromoSection laundryId={laundryId} />
                </Box>
            )}

            {/* Store Hours Settings */}
            {type === "logoAndDomain" && (
                <Box mt={4} p={4} bg="blue.50" borderRadius="lg" border="1px solid" borderColor="blue.200">
                    <StoreHoursSection laundryId={laundryId} />
                </Box>
            )}

            {/* Delivery Schedule */}
            {type === "deliverySchedule" && (
                <DeliveryScheduleSection laundryId={laundryId} />
            )}

            {/* System Settings */}
            {type === "systemSettings" && (
                <SystemSettingsSection laundryId={laundryId} />
            )}

            {/* Payment Settings */}
            {type === "paymentSettings" && (
                <PaymentSettingsSection laundryId={laundryId} />
            )}

            {/* Integrations */}
            {type === "integrations" && (
                <IntegrationsTab laundryId={laundryId} />
            )}

            {/* Website Services */}
            {type === "websiteServices" && (
                <ServiceCatalogManager laundryId={laundryId} />
            )}

            {/* Table for Services */}
            {type === "services" && (              
                <>
                    {/* Minimum billable weight — tenant master toggle (Phase 2) */}
                    <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                        <Flex justify="space-between" align="center">
                            <Box>
                                <Text fontWeight="bold">⚖️ Minimum Billable Weight</Text>
                                <Text fontSize="xs" color="gray.500" mt={1}>
                                    When on, per-pound services are billed at their minimum weight if the
                                    actual weight is lower. Set each service's minimum in the table below
                                    (leave blank for no minimum). When off, customers are always billed for
                                    the exact weight.
                                </Text>
                            </Box>
                            <Switch
                                colorScheme="blue"
                                isChecked={minWeightEnabled}
                                onChange={(e) => setMinWeightEnabled(e.target.checked)}
                                isDisabled={!isServiceEditMode}
                            />
                        </Flex>
                        {minWeightEnabled && (
                            <Flex align="center" gap={3} mt={3}>
                                <Text fontSize="sm" color="gray.700" fontWeight="500">Apply minimum to:</Text>
                                <select
                                    value={minWeightScope}
                                    onChange={(e) => setMinWeightScope(e.target.value)}
                                    disabled={!isServiceEditMode}
                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem", borderRadius: "6px", border: "1px solid #CBD5E0" }}
                                >
                                    <option value="all">All orders (online + in-store)</option>
                                    <option value="online">Online orders only</option>
                                    <option value="instore">In-store orders only</option>
                                </select>
                            </Flex>
                        )}
                        {!isServiceEditMode && (
                            <Text fontSize="xs" color="gray.400" mt={2}>
                                Click "Edit" to change these settings.
                            </Text>
                        )}
                    </Box>

                    {/* Delivery fee — tenant choice: none / flat / distance (Phase 3) */}
                    <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                        <Box>
                            <Text fontWeight="bold">🚚 Delivery Fee</Text>
                            <Text fontSize="xs" color="gray.500" mt={1}>
                                Choose whether to charge for delivery. <b>None</b> = free delivery.
                                <b> Flat</b> = one fixed fee per delivery. <b>Distance-based</b> = a base
                                fee plus a per-mile rate (with an optional free radius and cap). Applies to
                                the delivery leg only, and is skipped when a delivery is fulfilled by Uber.
                            </Text>
                        </Box>
                        <Flex align="center" gap={3} mt={3}>
                            <Text fontSize="sm" color="gray.700" fontWeight="500">Mode:</Text>
                            <select
                                value={deliveryFee.mode}
                                onChange={(e) => setDeliveryFee((p) => ({ ...p, mode: e.target.value }))}
                                disabled={!isServiceEditMode}
                                style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem", borderRadius: "6px", border: "1px solid #CBD5E0" }}
                            >
                                <option value="none">None (free delivery)</option>
                                <option value="flat">Flat fee</option>
                                <option value="distance">Distance-based</option>
                            </select>
                        </Flex>

                        {deliveryFee.mode === "flat" && (
                            <Flex align="center" gap={3} mt={3} wrap="wrap">
                                <Text fontSize="sm" color="gray.700" fontWeight="500">Flat fee ($):</Text>
                                <Input
                                    type="number" min="0" step="0.01" size="sm" width="120px"
                                    value={deliveryFee.flat}
                                    isDisabled={!isServiceEditMode}
                                    onChange={(e) => setDeliveryFee((p) => ({ ...p, flat: e.target.value }))}
                                />
                            </Flex>
                        )}

                        {deliveryFee.mode === "distance" && (
                            <Box mt={3}>
                                <Flex align="center" gap={3} mb={2} wrap="wrap">
                                    <Text fontSize="sm" color="gray.700" fontWeight="500" minW="140px">Base fee ($):</Text>
                                    <Input type="number" min="0" step="0.01" size="sm" width="120px"
                                        value={deliveryFee.base} isDisabled={!isServiceEditMode}
                                        onChange={(e) => setDeliveryFee((p) => ({ ...p, base: e.target.value }))} />
                                </Flex>
                                <Flex align="center" gap={3} mb={2} wrap="wrap">
                                    <Text fontSize="sm" color="gray.700" fontWeight="500" minW="140px">Per mile ($):</Text>
                                    <Input type="number" min="0" step="0.01" size="sm" width="120px"
                                        value={deliveryFee.perMile} isDisabled={!isServiceEditMode}
                                        onChange={(e) => setDeliveryFee((p) => ({ ...p, perMile: e.target.value }))} />
                                </Flex>
                                <Flex align="center" gap={3} mb={2} wrap="wrap">
                                    <Text fontSize="sm" color="gray.700" fontWeight="500" minW="140px">Free radius (mi):</Text>
                                    <Input type="number" min="0" step="0.1" size="sm" width="120px"
                                        value={deliveryFee.freeRadiusMi} isDisabled={!isServiceEditMode}
                                        onChange={(e) => setDeliveryFee((p) => ({ ...p, freeRadiusMi: e.target.value }))} />
                                </Flex>
                                <Flex align="center" gap={3} mb={2} wrap="wrap">
                                    <Text fontSize="sm" color="gray.700" fontWeight="500" minW="140px">Max cap ($, optional):</Text>
                                    <Input type="number" min="0" step="0.01" size="sm" width="120px" placeholder="no cap"
                                        value={deliveryFee.max} isDisabled={!isServiceEditMode}
                                        onChange={(e) => setDeliveryFee((p) => ({ ...p, max: e.target.value }))} />
                                </Flex>
                                <Flex align="center" gap={3} wrap="wrap">
                                    <Text fontSize="sm" color="gray.700" fontWeight="500" minW="140px">Road factor:</Text>
                                    <Input type="number" min="1" step="0.1" size="sm" width="120px"
                                        value={deliveryFee.roadFactor} isDisabled={!isServiceEditMode}
                                        onChange={(e) => setDeliveryFee((p) => ({ ...p, roadFactor: e.target.value }))} />
                                    <Text fontSize="xs" color="gray.400">multiplier for straight-line → driving distance (e.g. 1.3)</Text>
                                </Flex>
                            </Box>
                        )}

                        {/* Max serviceable distance — applies to all modes (serviceability gate) */}
                        <Flex align="center" gap={3} mt={4} pt={3} wrap="wrap" borderTop="1px dashed" borderColor="gray.200">
                            <Text fontSize="sm" color="gray.700" fontWeight="500" minW="180px">Max serviceable distance (mi):</Text>
                            <Input
                                type="number" min="0" step="0.1" size="sm" width="120px" placeholder="no limit"
                                value={deliveryFee.maxServiceableMi}
                                isDisabled={!isServiceEditMode}
                                onChange={(e) => setDeliveryFee((p) => ({ ...p, maxServiceableMi: e.target.value }))}
                            />
                        </Flex>
                        <Text fontSize="xs" color="gray.400" mt={1}>
                            When set, addresses farther than this from the shop are treated as not serviceable
                            (even if their zip is serviceable) — the customer is asked to call, and the address is
                            saved to demand. Distance uses the road factor above (so 30 ≈ 30 driving miles when
                            road factor is 1.3). Leave blank for no limit.
                        </Text>

                        {!isServiceEditMode && (
                            <Text fontSize="xs" color="gray.400" mt={2}>
                                Click "Edit" to change these settings.
                            </Text>
                        )}
                    </Box>

                    {/* Service Categories Management */}
                    <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                        <Text fontWeight="bold" mb={2}>📂 Service Categories</Text>
                        <Text fontSize="xs" color="gray.500" mb={3}>
                            Organize services into categories. Customers will see these as separate pricing cards.
                        </Text>
                        {categories.length > 0 && (
                            <Table size="sm" variant="simple" mb={3}>
                                <Thead>
                                    <Tr>
                                        <Th>Category Name</Th>
                                        <Th>Order</Th>
                                        <Th>Actions</Th>
                                    </Tr>
                                </Thead>
                                <Tbody>
                                    {categories.map((cat, idx) => (
                                        <Tr key={cat.categoryId}>
                                            <Td fontSize="sm" fontWeight="500">
                                                <Input
                                                    size="sm"
                                                    variant="flushed"
                                                    value={cat.categoryName}
                                                    fontWeight="500"
                                                    onChange={(e) => {
                                                        const updated = [...categories];
                                                        updated[idx] = { ...updated[idx], categoryName: e.target.value };
                                                        setCategories(updated);
                                                    }}
                                                    onBlur={async () => {
                                                        if (cat.categoryName.trim()) {
                                                            try {
                                                                await axios.put(`${process.env.REACT_APP_AWS_API_URL}/api/admin/service-categories`, {
                                                                    categoryId: cat.categoryId,
                                                                    laundryId,
                                                                    categoryName: cat.categoryName.trim(),
                                                                }, { headers: { Authorization: `Bearer ${authToken}` } });
                                                            } catch (err) {
                                                                toast({ title: "Error renaming category", status: "error", duration: 3000 });
                                                            }
                                                        }
                                                    }}
                                                />
                                            </Td>
                                            <Td fontSize="sm">{cat.displayOrder}</Td>
                                            <Td>
                                                <Flex gap={1}>
                                                    <Button size="xs" variant="ghost" isDisabled={idx === 0} onClick={() => handleReorderCategory(idx, "up")}>↑</Button>
                                                    <Button size="xs" variant="ghost" isDisabled={idx === categories.length - 1} onClick={() => handleReorderCategory(idx, "down")}>↓</Button>
                                                    <IconButton icon={<DeleteIcon />} size="xs" colorScheme="red" variant="ghost" onClick={() => handleDeleteCategory(cat.categoryId)} aria-label="Delete" />
                                                </Flex>
                                            </Td>
                                        </Tr>
                                    ))}
                                </Tbody>
                            </Table>
                        )}
                        <Flex gap={2} align="center">
                            <Input
                                size="sm"
                                placeholder="New category name (e.g. Per Pound, Dry Cleaning)"
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                maxW="300px"
                                onKeyPress={(e) => e.key === "Enter" && handleAddCategory()}
                            />
                            <Button size="sm" colorScheme="teal" onClick={handleAddCategory} isLoading={isSavingCategory}>
                                Add
                            </Button>
                        </Flex>
                    </Box>

                    <Table variant="simple" size="sm" colorScheme="blue" border="1px solid" borderColor="gray.200">
                        <Thead bg="#EBF8FF">
                            <Tr>
                                <Th fontWeight="bold" fontSize="md">Service Name</Th>
                                <Th fontWeight="bold" fontSize="md" isNumeric>Price</Th>
                                <Th fontWeight="bold" fontSize="md">Category</Th>
                                <Th fontWeight="bold" fontSize="md">Customer Access</Th>
                                <Th fontWeight="bold" fontSize="md">Description</Th>
                                <Th fontWeight="bold" fontSize="md">Input Weight</Th>
                                <Th fontWeight="bold" fontSize="md" isNumeric>Min Weight (lb)</Th>
                                {isServiceEditMode && <Th fontWeight="bold" fontSize="md">Actions</Th>}
                            </Tr>
                        </Thead>
                        <Tbody bg="#F7FAFC">
  {/* Newly added services first */}
  {isServiceEditMode &&
    (newServices || []).map((service, index) => (
      <Tr key={`new-${index}`}>
        <Td>
          <Input
            size="sm"
            placeholder="Service Name"
            value={service.serviceName || ""}
            onChange={(e) => handleNewServiceChange(index, "serviceName", e.target.value)}
          />
        </Td>
        <Td isNumeric>
          <Input
            size="sm"
            placeholder="Price"
            type="number"
            value={service.price || ""}
            onChange={(e) => handleNewServiceChange(index, "price", e.target.value)}
          />
        </Td>
        <Td>
          <select
            value={service.categoryId || ""}
            onChange={(e) => handleNewServiceChange(index, "categoryId", e.target.value ? parseInt(e.target.value) : null)}
            style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}
          >
            <option value="">— None —</option>
            {categories.map(cat => (
              <option key={cat.categoryId} value={cat.categoryId}>{cat.categoryName}</option>
            ))}
          </select>
        </Td>
        <Td>
          <select
            value={service.customerAccess ? "true" : "false"}
            onChange={(e) => handleNewServiceChange(index, "customerAccess", e.target.value === "true")}
            style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </Td>
        <Td>
          <Input
            size="sm"
            placeholder="Description"
            value={service.description || ""}
            onChange={(e) => handleNewServiceChange(index, "description", e.target.value)}
          />
        </Td>
        <Td>
          <select
            value={service.inputWeight ? "true" : "false"}
            onChange={(e) => handleNewServiceChange(index, "inputWeight", e.target.value === "true")}
            style={{ padding: "0.25rem", fontSize:"0.875rem", width: "100%" }}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </Td>
        <Td isNumeric>
          <Input
            size="sm"
            type="number"
            min="0"
            step="0.5"
            placeholder="—"
            isDisabled={!service.inputWeight}
            value={service.minBillableWeight ?? ""}
            onChange={(e) => handleNewServiceChange(index, "minBillableWeight", e.target.value)}
          />
        </Td>
        <Td>
          <IconButton
            icon={<DeleteIcon />}
            colorScheme="red"
            aria-label="Delete New Service"
            size="sm"
            onClick={() => handleRemoveNewService(index)}
          />
        </Td>
      </Tr>
    ))
  }

  {/* Existing services second */}
  {servicesData.slice(0, currentServiceLimit).map((service, index) => (
    <Tr key={index} _hover={{ bg: "blue.50" }} borderBottom="1px solid" borderColor="gray.200">
      <Td fontSize="sm">
        {isServiceEditMode ? (
          <Input
            size="sm"
            value={service.serviceName || ""}
            placeholder="Service Name"
            onChange={(e) => handleEditService(index, "serviceName", e.target.value)}
          />
        ) : (
          service.serviceName
        )}
      </Td>
      <Td fontSize="sm" isNumeric>
        {isServiceEditMode ? (
          <Input
            size="sm"
            type="number"
            value={service.price || ""}
            placeholder="Enter Price"
            onChange={(e) => handleEditService(index, "price", e.target.value)}
          />
        ) : (
          `$${service.price || "0.00"}`
        )}
      </Td>
      <Td fontSize="sm">
        {isServiceEditMode ? (
          <select
            value={service.categoryId || ""}
            onChange={(e) => handleEditService(index, "categoryId", e.target.value ? parseInt(e.target.value) : null)}
            style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}
          >
            <option value="">� None �</option>
            {categories.map(cat => (
              <option key={cat.categoryId} value={cat.categoryId}>{cat.categoryName}</option>
            ))}
          </select>
        ) : (
          categories.find(c => c.categoryId === service.categoryId)?.categoryName || "�"
        )}
      </Td>
      <Td fontSize="sm">
        {isServiceEditMode ? (
          <select
            value={service.customerAccess ? "true" : "false"}
            onChange={(e) =>
              handleEditService(index, "customerAccess", e.target.value === "true")
            }
            style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        ) : (
          service.customerAccess ? "True" : "False"
        )}
      </Td>
      <Td fontSize="sm">
        {isServiceEditMode ? (
          <Input
            size="sm"
            value={service.description || ""}
            placeholder="Enter Description"
            onChange={(e) => handleEditService(index, "description", e.target.value)}
          />
        ) : (
          service.description || "N/A"
        )}
      </Td>
      <Td fontSize="sm">
        {isServiceEditMode ? (
          <select
            value={service.inputWeight ? "true" : "false"}
            onChange={(e) =>
              handleEditService(index, "inputWeight", e.target.value === "true")
            }
            style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        ) : (
          service.inputWeight ? "True" : "False"
        )}
      </Td>
      <Td fontSize="sm" isNumeric>
        {isServiceEditMode ? (
          <Input
            size="sm"
            type="number"
            min="0"
            step="0.5"
            placeholder="—"
            isDisabled={!service.inputWeight}
            value={service.minBillableWeight ?? ""}
            onChange={(e) => handleEditService(index, "minBillableWeight", e.target.value)}
          />
        ) : (
          service.minBillableWeight != null && service.minBillableWeight !== ""
            ? `${service.minBillableWeight} lb`
            : "—"
        )}
      </Td>
      {isServiceEditMode && (
        <Td>
          <IconButton
            icon={<DeleteIcon />}
            colorScheme="red"
            aria-label="Delete Service"
            size="sm"
            onClick={() => handleDeleteService(index)}
          />
        </Td>
      )}
    </Tr>
  ))}
</Tbody>

                    </Table>

                    {currentServiceLimit < servicesData.length && (
                        <Flex justifyContent="center" mt={4}>
                            <Button colorScheme="blue" onClick={handleLoadMoreServices}>
                                Load More Services
                            </Button>
                        </Flex>
                    )}

                    {/* ─── Add-Ons & Extras (Phase 2c) ─────────────────────── */}
                    <Box mt={8} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                        <Flex justify="space-between" align="center" mb={2}>
                            <Box>
                                <Text fontWeight="bold">✨ Add-Ons & Extras</Text>
                                <Text fontSize="xs" color="gray.500" mt={1}>
                                    Optional upgrades customers can add to an order — e.g. fabric softener
                                    (per pound) or hangers (per item). Per-pound add-ons are billed on the
                                    order's weight; per-item on the quantity chosen.
                                </Text>
                            </Box>
                            <Flex align="center" gap={2}>
                                <Text fontSize="sm" color="gray.600">Enabled</Text>
                                <Switch
                                    colorScheme="blue"
                                    isChecked={addonsEnabled}
                                    onChange={(e) => setAddonsEnabled(e.target.checked)}
                                />
                            </Flex>
                        </Flex>

                        <Table variant="simple" size="sm" mt={3}>
                            <Thead bg="#EBF8FF">
                                <Tr>
                                    <Th>Add-On Name</Th>
                                    <Th>Pricing Basis</Th>
                                    <Th isNumeric>Unit Price</Th>
                                    <Th>Customer Access</Th>
                                    <Th>Actions</Th>
                                </Tr>
                            </Thead>
                            <Tbody bg="white">
                                {(newAddons || []).map((addon, index) => (
                                    <Tr key={`new-addon-${index}`}>
                                        <Td>
                                            <Input size="sm" placeholder="e.g. Fabric Softener"
                                                value={addon.addonName || ""}
                                                onChange={(e) => handleNewAddonChange(index, "addonName", e.target.value)} />
                                        </Td>
                                        <Td>
                                            <select value={addon.pricingBasis}
                                                onChange={(e) => handleNewAddonChange(index, "pricingBasis", e.target.value)}
                                                style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}>
                                                <option value="per_item">Per Item</option>
                                                <option value="per_pound">Per Pound</option>
                                            </select>
                                        </Td>
                                        <Td isNumeric>
                                            <Input size="sm" type="number" min="0" step="0.01" placeholder="0.00"
                                                value={addon.unitPrice}
                                                onChange={(e) => handleNewAddonChange(index, "unitPrice", e.target.value)} />
                                        </Td>
                                        <Td>
                                            <select value={addon.customerAccess ? "true" : "false"}
                                                onChange={(e) => handleNewAddonChange(index, "customerAccess", e.target.value === "true")}
                                                style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}>
                                                <option value="true">True</option>
                                                <option value="false">False</option>
                                            </select>
                                        </Td>
                                        <Td>
                                            <IconButton icon={<DeleteIcon />} colorScheme="red" size="sm"
                                                aria-label="Remove new add-on"
                                                onClick={() => handleRemoveNewAddon(index)} />
                                        </Td>
                                    </Tr>
                                ))}
                                {(addonsData || []).map((addon, index) => (
                                    <Tr key={addon.addonId || `addon-${index}`}>
                                        <Td>
                                            <Input size="sm" value={addon.addonName || ""}
                                                onChange={(e) => handleEditAddon(index, "addonName", e.target.value)} />
                                        </Td>
                                        <Td>
                                            <select value={addon.pricingBasis === "per_pound" ? "per_pound" : "per_item"}
                                                onChange={(e) => handleEditAddon(index, "pricingBasis", e.target.value)}
                                                style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}>
                                                <option value="per_item">Per Item</option>
                                                <option value="per_pound">Per Pound</option>
                                            </select>
                                        </Td>
                                        <Td isNumeric>
                                            <Input size="sm" type="number" min="0" step="0.01"
                                                value={addon.unitPrice ?? ""}
                                                onChange={(e) => handleEditAddon(index, "unitPrice", e.target.value)} />
                                        </Td>
                                        <Td>
                                            <select value={addon.customerAccess ? "true" : "false"}
                                                onChange={(e) => handleEditAddon(index, "customerAccess", e.target.value === "true")}
                                                style={{ padding: "0.25rem", fontSize: "0.875rem", width: "100%" }}>
                                                <option value="true">True</option>
                                                <option value="false">False</option>
                                            </select>
                                        </Td>
                                        <Td>
                                            <IconButton icon={<DeleteIcon />} colorScheme="red" size="sm"
                                                aria-label="Delete add-on"
                                                onClick={() => handleDeleteAddon(index)} />
                                        </Td>
                                    </Tr>
                                ))}
                                {(newAddons.length === 0 && addonsData.length === 0) && (
                                    <Tr>
                                        <Td colSpan={5}>
                                            <Text fontSize="sm" color="gray.400">No add-ons yet. Click "Add Add-On" to create one.</Text>
                                        </Td>
                                    </Tr>
                                )}
                            </Tbody>
                        </Table>

                        <Flex gap={2} mt={3}>
                            <Button size="sm" colorScheme="teal" onClick={handleAddAddon}>
                                + Add Add-On
                            </Button>
                            <Button size="sm" colorScheme="blue" onClick={handleSaveAddons} isLoading={isSavingAddons}>
                                Save Add-Ons
                            </Button>
                        </Flex>
                    </Box>

                </>
            )} 
            {type === "products" &&(
                <>
                
                    {/* Table for Products */}

                    <Table variant="simple" size="sm" colorScheme="blue" border="1px solid" borderColor="gray.200">
                    <Thead bg="#EBF8FF">
                        <Tr>
                        <Th fontWeight="bold" fontSize="md">Product Name</Th>
                        <Th fontWeight="bold" fontSize="md" isNumeric>Price</Th>
                        <Th fontWeight="bold" fontSize="md">Description</Th>
                        <Th fontWeight="bold" fontSize="md">Customer Access</Th>
                        {isProductEditMode && <Th fontWeight="bold" fontSize="md">Actions</Th>}
                        </Tr>
                    </Thead>
                    <Tbody bg="#F7FAFC">
                    {isProductEditMode && newProducts.map((product, index) => (
                        <Tr key={`new-${index}`} _hover={{ bg: "green.50" }}>
                            <Td>
                                <Input
                                    size="sm"
                                    placeholder="Product Name"
                                    value={product.productName}
                                    onChange={(e) =>
                                        handleNewProductChange(index, "productName", e.target.value)
                                    }
                                />
                            </Td>
                            <Td isNumeric>
                                <Input
                                    size="sm"
                                    placeholder="Price"
                                    type="number"
                                    value={product.price}
                                    onChange={(e) =>
                                        handleNewProductChange(index, "price", e.target.value)
                                    }
                                />
                            </Td>
                            <Td>
                                <Input
                                    size="sm"
                                    placeholder="Description"
                                    value={product.description}
                                    onChange={(e) =>
                                        handleNewProductChange(index, "description", e.target.value)
                                    }
                                />
                            </Td>
                            <Td>
                                <Select
                                    size="sm"
                                    value={product.customerAccess ? "true" : "false"}
                                    onChange={(e) =>
                                        handleNewProductChange(index, "customerAccess", e.target.value === "true")
                                    }
                                >
                                    <option value="true">True</option>
                                    <option value="false">False</option>
                                </Select>
                            </Td>
                            <Td>
                                <IconButton
                                    icon={<DeleteIcon />}
                                    colorScheme="red"
                                    aria-label="Delete New Product"
                                    size="sm"
                                    onClick={() => handleRemoveNewProduct(index)}
                                    _hover={{ bg: "red.600" }}
                                    ml={2}
                                />
                            </Td>
                        </Tr>
                    ))}
                    
                        {/* Existing Products */}
                        {productsData.slice(0, currentProductLimit).map((product, index) => (
                        <Tr key={index} _hover={{ bg: "green.50" }}>
                            <Td fontSize="sm">{product.productName}</Td>
                            <Td fontSize="sm" isNumeric>
                            {isProductEditMode ? (
                                <Input
                                size="sm"
                                type="number"
                                value={product.price}
                                placeholder="Enter Price"
                                onChange={(e) => handleEditProduct(index, "price", e.target.value)}
                                />
                            ) : (
                                `$${product.price}`
                            )}
                            </Td>
                            <Td fontSize="sm">
                            {isProductEditMode ? (
                                <Input
                                size="sm"
                                value={product.description}
                                placeholder="Enter Description"
                                onChange={(e) => handleEditProduct(index, "description", e.target.value)}
                                />
                            ) : (
                                product.description
                            )}
                            </Td>
                            <Td fontSize="sm">
                                {isProductEditMode ? (
                                    <Select
                                        size="sm"
                                        value={product.customerAccess ? "true" : "false"} // Set the selected value
                                        onChange={(e) => handleEditProduct(index, "customerAccess", e.target.value)} // Handle selection changes
                                    >
                                        <option value="true">True</option>
                                        <option value="false">False</option>
                                    </Select>
                                ) : (
                                    <Text>{product.customerAccess ? "Yes" : "No"}</Text> // Display "Yes" for true and "No" for false
                                )}
                            </Td>

                            {isProductEditMode && (
                            <Td>
                                <IconButton
                                icon={<DeleteIcon />}
                                colorScheme="red"
                                aria-label="Delete Product"
                                size="sm"
                                onClick={() => handleDeleteProduct(index)}
                                _hover={{ bg: "red.600" }}
                                ml={2}
                                />
                            </Td>
                            )}
                        </Tr>
                        ))}
                        
                    

                    </Tbody>
                    </Table>

                    {currentProductLimit < productsData.length && (
                        <Flex justifyContent="center" mt={4}>
                            <Button colorScheme="blue" onClick={handleLoadMoreProducts}>
                                Load More Products
                            </Button>
                        </Flex>
                    )}

                    
                </>
            )}        
            {type === "zipCodes" && (
                <>
                    <Table variant="simple" size="sm" colorScheme="blue">
                        <Thead bg="#EBF8FF">
                            <Tr>
                                <Th>Serviceable Zip Codes</Th>
                                {isLocationEditMode && <Th>Actions</Th>}
                            </Tr>
                        </Thead>
                        <Tbody bg="#F7FAFC">
                            {/* Existing locations */}
                            {locationsData.map((location, index) => (
                                <Tr key={index}>
                                    <Td>{location}</Td>
                                    {isLocationEditMode && (
                                        <Td>
                                            <IconButton
                                                icon={<DeleteIcon />}
                                                colorScheme="red"
                                                aria-label="Delete Location"
                                                size="sm"
                                                onClick={() => handleDeleteLocation(index)}
                                            />
                                        </Td>
                                    )}
                                </Tr>
                            ))}

                            {/* New locations */}
                            {isLocationEditMode &&
                                newLocations.map((location, index) => (
                                    <Tr key={`new-${index}`}>
                                        <Td>
                                            <Input
                                                size="sm"
                                                placeholder="Enter Zip Code"
                                                value={location}
                                                onChange={(e) =>
                                                    handleNewLocationChange(index, e.target.value)
                                                }
                                            />
                                        </Td>
                                        <Td>
                                            <IconButton
                                                icon={<DeleteIcon />}
                                                colorScheme="red"
                                                aria-label="Delete New Location"
                                                size="sm"
                                                onClick={() => handleRemoveNewLocation(index)}
                                            />
                                        </Td>
                                    </Tr>
                                ))}
                        </Tbody>
                    </Table>
                </>
            )}

            {/* Credential Modal for Services */}
            <ReusableModal
                isOpen={isServiceCredentialModalOpen}
                onClose={() => {
                    setIsServiceCredentialModalOpen(false);
                    setEmpId("");
                    setPasscode("");
                }}
                title="Enter Credentials for Service Edit"
                footerButtons={[
                    {
                        label: "Submit",
                        onClick: () => handleValidateSubmit("services"),
                        colorScheme: "blue",
                        isLoading: isValidatingEmployee,
                    },
                    {
                        label: "Cancel",
                        onClick: () => {
                            setIsServiceCredentialModalOpen(false);
                            setEmpId("");  // Reset Employee ID
                            setPasscode(""); // Reset Passcode
                        },
                        variant: "ghost",
                    },
                ]}
            >
                <InputGroup mb={4}>
                    <InputLeftAddon>{empPrefix}</InputLeftAddon>
                    <Input
                        placeholder="EmpId"
                        value={empId}
                        onChange={(e) => setEmpId(e.target.value)}
                    />
                </InputGroup>
                <Input
                    placeholder="Passcode"
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                />
            </ReusableModal>

            {/* Credential Modal for Products */}
            <ReusableModal
                isOpen={isProductCredentialModalOpen}
                onClose={() => {
                    setIsProductCredentialModalOpen(false);
                    setEmpId("");
                    setPasscode("");
                }}
                title="Enter Credentials for Product Edit"
                footerButtons={[
                    {
                        label: "Submit",
                        onClick: () => handleValidateSubmit("products"),
                        colorScheme: "blue",
                        isLoading: isValidatingEmployee,
                    },
                    {
                        label: "Cancel",
                        onClick: () => {
                            setIsProductCredentialModalOpen(false);
                            setEmpId("");  // Reset Employee ID
                            setPasscode(""); // Reset Passcode
                        },
                        variant: "ghost",
                    },

                ]}
            >
                <InputGroup mb={4}>
                    <InputLeftAddon>{empPrefix}</InputLeftAddon>
                    <Input
                        placeholder="EmpId"
                        value={empId}
                        onChange={(e) => setEmpId(e.target.value)}
                    />
                </InputGroup>
                <Input
                    placeholder="Passcode"
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                />
            </ReusableModal>

            {/* Add a new credential modal for locations */}
            <ReusableModal
                isOpen={isLocationCredentialModalOpen}
                onClose={() => {
                    setIsLocationCredentialModalOpen(false);
                    setEmpId("");
                    setPasscode("");
                }}
                title="Enter Credentials for Location Edit"
                footerButtons={[
                    {
                        label: "Submit",
                        onClick: () => handleValidateSubmit("locations"),
                        colorScheme: "blue",
                        isLoading: isValidatingEmployee,
                    },
                    {
                        label: "Cancel",
                        onClick: () => {
                            setIsLocationCredentialModalOpen(false);
                            setEmpId("");  // Reset Employee ID
                            setPasscode(""); // Reset Passcode
                        },
                        variant: "ghost",
                    },
                ]}
            >
                <InputGroup mb={4}>
                    <InputLeftAddon>{empPrefix}</InputLeftAddon>
                    <Input
                        placeholder="EmpId"
                        value={empId}
                        onChange={(e) => setEmpId(e.target.value)}
                    />
                </InputGroup>
                <Input
                    placeholder="Passcode"
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                />
            </ReusableModal>
        </Box>
    );

};

// Homepage Promo Settings Component
function HomepagePromoSection({ laundryId }) {
    const [promoCode, setPromoCode] = React.useState("");
    const [promoDiscount, setPromoDiscount] = React.useState("20");
    const [promoEnabled, setPromoEnabled] = React.useState(true);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const toast = useToast();

    React.useEffect(() => {
        axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/admin/homepage-promo`, {
            params: { laundryId },
            headers: { Authorization: `Bearer ${localStorage.getItem('idToken')}` }
        }).then(res => {
            setPromoCode(res.data.promoCode || "");
            setPromoDiscount(res.data.promoDiscount || "20");
            setPromoEnabled(res.data.promoEnabled !== false);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [laundryId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.put(`${process.env.REACT_APP_AWS_API_URL}/api/admin/homepage-promo`, {
                promoCode: promoCode.trim().toUpperCase(),
                promoDiscount,
                promoEnabled,
            }, {
                params: { laundryId },
                headers: { Authorization: `Bearer ${localStorage.getItem('idToken')}` }
            });
            toast({ title: "Promo settings saved", status: "success", duration: 2000 });
        } catch (err) {
            toast({ title: "Error saving promo", status: "error", duration: 3000 });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Spinner size="sm" />;

    return (
        <Box>
            <Flex align="center" justify="space-between" mb={3}>
                <Box>
                    <Text fontWeight="bold" fontSize="md" color="orange.700">🎉 Homepage Promo Banner</Text>
                    <Text fontSize="xs" color="gray.600">Displayed on landing page to attract first-time customers</Text>
                </Box>
                <Switch
                    isChecked={promoEnabled}
                    onChange={(e) => setPromoEnabled(e.target.checked)}
                    colorScheme="orange"
                />
            </Flex>
            {promoEnabled && (
                <Flex gap={3} flexWrap="wrap" align="flex-end">
                    <Box flex="1" minW="140px">
                        <Text fontSize="xs" fontWeight="bold" mb={1}>Promo Code</Text>
                        <Input
                            size="sm"
                            value={promoCode}
                            onChange={(e) => setPromoCode(e.target.value)}
                            placeholder="e.g. WELCOME20"
                            textTransform="uppercase"
                            fontFamily="mono"
                        />
                    </Box>
                    <Box minW="80px">
                        <Text fontSize="xs" fontWeight="bold" mb={1}>Discount %</Text>
                        <Input
                            size="sm"
                            type="number"
                            value={promoDiscount}
                            onChange={(e) => setPromoDiscount(e.target.value)}
                            w="80px"
                        />
                    </Box>
                    <Button size="sm" colorScheme="orange" onClick={handleSave} isLoading={saving}>
                        Save
                    </Button>
                </Flex>
            )}
            {promoEnabled && promoCode && (
                <Text fontSize="xs" color="gray.500" mt={2}>
                    Make sure promo code "{promoCode.toUpperCase()}" exists in Promotions with {promoDiscount}% discount.
                </Text>
            )}
        </Box>
    );
}

// Store Hours Section Component
function StoreHoursSection({ laundryId }) {
    const [hours, setHours] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const toast = useToast();

    React.useEffect(() => {
        axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/admin/store-hours`, {
            params: { laundryId },
            headers: { Authorization: `Bearer ${localStorage.getItem('idToken')}` }
        }).then(res => {
            const h = res.data.hours || [];
            setHours(h.length > 0 ? h : [{ day: "", time: "" }]);
        }).catch(() => {
            setHours([{ day: "", time: "" }]);
        }).finally(() => setLoading(false));
    }, [laundryId]);

    const handleChange = (index, field, value) => {
        setHours(prev => prev.map((h, i) => i === index ? { ...h, [field]: value } : h));
    };

    const addRow = () => setHours(prev => [...prev, { day: "", time: "" }]);
    const removeRow = (index) => setHours(prev => prev.filter((_, i) => i !== index));

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.put(`${process.env.REACT_APP_AWS_API_URL}/api/admin/store-hours`, {
                hours: hours.filter(h => h.day && h.time),
            }, {
                params: { laundryId },
                headers: { Authorization: `Bearer ${localStorage.getItem('idToken')}` }
            });
            toast({ title: "Store hours saved", status: "success", duration: 2000 });
        } catch (err) {
            toast({ title: "Error saving hours", status: "error", duration: 3000 });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Spinner size="sm" />;

    return (
        <Box>
            <Text fontWeight="bold" fontSize="md" color="blue.700" mb={2}>🕐 Store Operating Hours</Text>
            <Text fontSize="xs" color="gray.600" mb={3}>These hours show on your landing page, FAQ pages, and SEO pages</Text>
            {hours.map((h, i) => (
                <Flex key={i} gap={2} mb={2} align="center">
                    <Input size="sm" placeholder="e.g. Mon-Fri" value={h.day} onChange={e => handleChange(i, 'day', e.target.value)} w="130px" />
                    <Input size="sm" placeholder="e.g. 7AM - 10:30PM" value={h.time} onChange={e => handleChange(i, 'time', e.target.value)} w="160px" />
                    {hours.length > 1 && (
                        <Button size="xs" colorScheme="red" variant="ghost" onClick={() => removeRow(i)}>✕</Button>
                    )}
                </Flex>
            ))}
            <Flex gap={2} mt={2}>
                <Button size="xs" variant="outline" onClick={addRow}>+ Add Row</Button>
                <Button size="xs" colorScheme="blue" onClick={handleSave} isLoading={saving}>Save Hours</Button>
            </Flex>
        </Box>
    );
}

export default LaundryInfoManagement;
