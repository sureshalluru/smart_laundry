import React, {useContext, useEffect, useRef, useState, useReducer} from 'react';
import {
    Box,
    Button,
    Flex,
    Stack,
    Step,
    StepIndicator,
    StepSeparator,
    StepStatus,
    Stepper,
    StepTitle,
    FormControl, FormLabel, Input,
    useSteps, StepIcon, StepNumber, useToast, VStack, Image, Heading, Text, Badge,
    Skeleton, SkeletonText
} from "@chakra-ui/react";
import PaymentPage from '../Components/LaundryPickup/PaymentPage';
import UnifiedServicePage from '../Components/LaundryPickup/UnifiedServicePage';
import SchedulePage from '../Components/LaundryPickup/SchedulePage';
import UnifiedReviewPage from '../Components/LaundryPickup/UnifiedReviewPage';
import cartReducer, { initialCartState } from '../Components/LaundryPickup/cartReducer';
import { buildOrderPayload, getCartSubtotal, getAddonsTotal, getBilledWeight, derivePricingType } from '../Components/LaundryPickup/cartUtils';
import AddonPicker from '../Components/LaundryPickup/AddonPicker';
import {useNavigate, useSearchParams} from "react-router-dom";
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import axios from "axios";
import {StandaloneSearchBox} from "@react-google-maps/api";
import {formatISO, parseISO} from "date-fns";
import { toZonedTime, format } from 'date-fns-tz';
import {addDays} from 'date-fns';
import {LaundryContext} from "../Components/Contexts/LaundryContext";

export default function LaundryPickupPage({laundryId,customerId,customerPaymentId,setCustomerPaymentId, laundryTimeZone, setLaundryTimeZone, specialInstructions, setSpecialInstructions}) {
    // Fixed 5-step stepper (Order Type + Services + Schedule + Payment + Review)
    // Effortless-ordering flow: lead with services, ask for address only after
    // the customer has built their cart. Serviceability is enforced at the
    // Address step (can't advance unless validated) and re-checked at place-order.
    const steps = [
        { title: 'Services' },
        { title: 'Address' },
        { title: 'Schedule' },
        { title: 'Payment' },
        { title: 'Review' },
    ];

    // Order type. There is no separate Order Type step anymore — the plan
    // (one-time / recurring / subscribe & save) is chosen on the Schedule page.
    // Default to one-time so the customer lands straight on Services.
    const [orderType, setOrderType] = useState('one-time'); // 'one-time' | 'frequency' | 'subscribe-save'

    // Pre-selected order type from landing page navigation
    const [preSelectedType] = useState(() => {
        const saved = localStorage.getItem('selectedOrderType');
        if (saved) {
            localStorage.removeItem('selectedOrderType');
            return saved;
        }
        return null;
    });

    // Cart state via useReducer (Task 5.3)
    const [cart, dispatch] = useReducer(cartReducer, initialCartState);

    const { laundryData } = useContext(LaundryContext);
    const {activeStep, setActiveStep} = useSteps({index: 0});
    const [isPaymentStepValid,setIsPaymentStepValid] = useState(false);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const toast = useToast();
    const authToken = localStorage.getItem('idToken');
    const [isAddressValidating,setIsAddressValidating] = useState(false);

    // State Management for scheduling
    const [pickupDate, setPickupDate] = useState('');
    const [pickupTime, setPickupTime] = useState('');
    const [dropoffDate, setDropoffDate] = useState('');
    const [dropoffTime, setDropoffTime] = useState('');
    const [frequency, setFrequency] = useState(null);
    const [promoCode, setPromoCode] = useState('');
    const [laundryBags, setLaundryBags] = useState(1);
    const [saveSpecialInstructions, setSaveSpecialInstructions] = useState(false);
    const [frequencyPromotions, setFrequencyPromotions] = useState([]);
    const [promoDescriptionMessage, setPromoDescriptionMessage] = useState('');

    // State management for the payment page
    const [existingPaymentMethods, setExistingPaymentMethods] = useState([]);
    const [payByInvoice, setPayByInvoice] = useState(false);
    const [isCommercialCustomer, setIsCommercialCustomer] = useState(false);

    // State management for the review order page
    const [orderProcessing, setOrderProcessing] = useState(false);
    const [tip, setTip] = useState({
        tipOption: '5',
        tipType: 'percentage',
        tipAmount: '0.00',
        tipPercentage: 5,
        tipReceivedId: '',
        tipMethod: 'Card',
        customTip: '',
    });

    // State variables for address validation
    const [address, setAddress] = useState(localStorage.getItem('customerAddress') || '');
    const [addressInstructions,setAddressInstructions] = useState('');
    const [doorNumber, setDoorNumber] = useState('');
    const [isAddressValidated, setIsAddressValidated] = useState(!!localStorage.getItem('customerAddress'));

    // For Google Maps API
    const searchBoxRef = useRef(null);

    // State variables for laundry info
    const [laundryServices, setLaundryServices] = useState([]);
    // Phase 2: tenant master opt-in for minimum billable weight
    const [minWeightEnabled, setMinWeightEnabled] = useState(false);
    // Phase 2c: add-ons
    const [laundryAddons, setLaundryAddons] = useState([]);
    const [addonsEnabled, setAddonsEnabled] = useState(false);
    const [selectedAddons, setSelectedAddons] = useState({}); // addonId -> {addonId, addonName, pricingBasis, unitPrice, quantity}
    const [saveAddonPrefs, setSaveAddonPrefs] = useState(false); // Phase 2d: save selection as default
    const [addonPrefsLoaded, setAddonPrefsLoaded] = useState(false);
    const [serviceCategories, setServiceCategories] = useState([]);
    const [servicesLoaded, setServicesLoaded] = useState(false);
    const [deliveryTimeSlots, setDeliveryTimeSlots] = useState([]);
    const [deliveryTimeInterval, setDeliveryTimeInterval] = useState(0);
    const [laundryFrequency, setLaundryFrequency] = useState([]);
    const [stripePromise, setStripePromise] = useState(null);
    const [pickupService, setPickupService] = useState("");
    const [dropoffService, setDropoffService] = useState("");
    const [uberExists, setUberExists] = useState(false);
    const [uberEnv, setUberEnv] = useState("");
    const [laundryAddress, setLaundryAddress] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [uberPickupFrequency, setUberPickupFrequency] = useState(false);
    const [uberDropoffFrequency, setUberDropoffFrequency] = useState(false);

    // Function to format dates in the laundry's time zone
    const getDateInTimeZone = (date, timeZone) => {
        const zonedDate = toZonedTime(date, timeZone);
        return format(zonedDate, 'yyyy-MM-dd', { timeZone });
    };

    // Check if customer is a commercial account and auto-set payByInvoice
    useEffect(() => {
        const checkCommercialStatus = async () => {
            if (!customerId || !laundryId || !authToken) return;
            try {
                const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/customer/get-orders-info`, {
                    params: { operation: 'getCustomerProfile', customerId, laundryId },
                    headers: { 'x-api-key': authToken },
                });
                const profile = response.data?.body;
                if (profile?.isCommercial) {
                    setIsCommercialCustomer(true);
                    setPayByInvoice(true);
                    setIsPaymentStepValid(true);
                }
            } catch (err) {
                // If the profile check fails, customer proceeds as non-commercial
                console.debug('Commercial status check skipped:', err.message);
            }
        };
        checkCommercialStatus();
    }, [customerId, laundryId, authToken]);

    // Fetch laundry info when the page loads.
    // Perf: stale-while-revalidate. The service catalog rarely changes, so we
    // render instantly from a per-tenant localStorage cache (no blank / no
    // skeleton wait for returning customers), then re-fetch in the background
    // and silently update if anything changed. A short TTL bounds staleness so
    // a price change is never shown stale for long.
    useEffect(() => {
        const CACHE_PREFIX = 'slb_laundryInfo_';
        const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min: show cache instantly, still revalidate every load

        const applyLaundryInfo = (data) => {
            const mwEnabled = data.minWeightEnabled === true;
            setMinWeightEnabled(mwEnabled);
            setLaundryServices(
                (data.laundryServices || []).map((s) => ({ ...s, minWeightEnabled: mwEnabled }))
            );
            setAddonsEnabled(data.addonsEnabled === true);
            setLaundryAddons(data.laundryAddons || []);
            setDeliveryTimeSlots(data.deliveryTimeSlots);
            setLaundryTimeZone(data.laundryTimeZone);
            setDeliveryTimeInterval(parseInt(data.deliveryTimeInterval, 10));
            setLaundryFrequency(data.frequencyInterval);
            setFrequencyPromotions(data.frequencyPromotions || []);
            setLaundryAddress(data.laundryAddress || '');
            setContactPhone(data.contactPhone || '');
            setUberEnv(data.uberEnv || '');
            setUberExists(data?.uberCredentialsExist === true);
            setServiceCategories(data.serviceCategories || []);
            setServicesLoaded(true);
            if (data.stripePublicKey) {
                setStripePromise(loadStripe(data.stripePublicKey));
            } else if (laundryData?.stripePublicKey) {
                setStripePromise(loadStripe(laundryData.stripePublicKey));
            }
        };

        const fetchLaundryInfo = async () => {
            if (!authToken) {
                toast({
                    title: "Please Authenticate first",
                    description: "User not Logged In!",
                    status: "warning",
                    duration: 3000,
                    isClosable: true,
                });
                navigate(`/${laundryId}/login`);
                return;
            }

            // 1) Instant render from a fresh-enough cache (skips the 1s blank).
            const cacheKey = `${CACHE_PREFIX}${laundryId}`;
            let cachedPayload = null;
            try {
                const raw = localStorage.getItem(cacheKey);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    cachedPayload = parsed?.data || null;
                    if (cachedPayload && parsed.ts && (Date.now() - parsed.ts) < CACHE_TTL_MS) {
                        applyLaundryInfo(cachedPayload);
                    }
                }
            } catch (e) {
                cachedPayload = null; // corrupt cache — ignore, fall through to fetch
            }

            // 2) Always revalidate in the background; update only if changed.
            try {
                const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/laundry/get-info`, {
                    params: { operation: 'getLaundryInfo', laundryId: laundryId, isCustomer: true },
                    headers: { 'x-api-key': authToken },
                });
                if (response.data.status === 'success') {
                    const fresh = response.data;
                    const changed = JSON.stringify(fresh) !== JSON.stringify(cachedPayload);
                    if (changed || !servicesLoaded) {
                        applyLaundryInfo(fresh);
                    }
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: fresh }));
                    } catch (e) { /* storage full / disabled — cache is best-effort */ }
                } else if (!cachedPayload) {
                    // Only surface an error when we have nothing to show.
                    toast({ title: "Error fetching laundry info", status: "error", duration: 3000, isClosable: true });
                }
            } catch (error) {
                if (!cachedPayload) {
                    toast({ title: "Error", description: error.message, status: "error", duration: 3000, isClosable: true });
                }
                // If we already rendered from cache, a background failure is silent.
            }
        };
        fetchLaundryInfo();

    }, [toast, navigate, laundryId, authToken, setLaundryTimeZone]); // eslint-disable-line react-hooks/exhaustive-deps

    // Initialize pickupDate and dropoffDate after laundryTimeZone is available
    useEffect(() => {
        if (laundryTimeZone && !pickupDate && !dropoffDate) {
            const today = new Date();
            const initialPickupDate = getDateInTimeZone(addDays(today,1), laundryTimeZone);
            const initialDropoffDate = getDateInTimeZone(addDays(today, 2), laundryTimeZone);
            setPickupDate(initialPickupDate);
            setDropoffDate(initialDropoffDate);
        }
    }, [laundryTimeZone,pickupDate,dropoffDate,isAddressValidated]);

    // Track cart-started for abandoned cart SMS recovery
    useEffect(() => {
        if (servicesLoaded && customerId && laundryId) {
            axios.post(`${process.env.REACT_APP_AWS_API_URL}/api/customer/cart-started`, {
                customerId,
                laundryId,
            }).catch(() => {}); // Silent — never block the order flow
        }
    }, [servicesLoaded, customerId, laundryId]);

    // Phase 2d: prefill the add-on picker from the customer's saved defaults so
    // they don't have to re-select their usual extras. Runs once the add-on
    // catalog is available; matches saved ids against the live catalog so prices
    // and basis are always current.
    useEffect(() => {
        if (addonPrefsLoaded) return;
        if (!addonsEnabled || !customerId || !laundryId || laundryAddons.length === 0) return;
        setAddonPrefsLoaded(true);
        axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/customer/addon-preferences`, {
            params: { customerId, laundryId },
            headers: { 'x-api-key': authToken },
        }).then((res) => {
            const saved = res.data?.addons || [];
            if (saved.length === 0) return;
            const next = {};
            saved.forEach((s) => {
                const id = s.addonId ?? s.addon_id;
                const cat = laundryAddons.find((a) => a.addonId === id);
                if (!cat) return; // add-on no longer offered — skip
                next[id] = {
                    addonId: cat.addonId,
                    addonName: cat.addonName,
                    pricingBasis: cat.pricingBasis,
                    unitPrice: cat.unitPrice,
                    quantity: cat.pricingBasis === 'per_pound' ? null : (s.quantity || 1),
                };
            });
            if (Object.keys(next).length > 0) setSelectedAddons(next);
        }).catch(() => {}); // Silent — never block the order flow
    }, [addonsEnabled, customerId, laundryId, laundryAddons, addonPrefsLoaded, authToken]);

    // Task 5.5: Single-service auto-add logic (no auto-skip)
    // If only 1 service exists, auto-add it to cart but let customer stay on step 1
    // so they can optionally enter weight before continuing
    useEffect(() => {
        if (servicesLoaded && laundryServices.length === 1 && cart.items.length === 0 && orderType && activeStep === 0) {
            const singleService = laundryServices[0];
            const isWeight = singleService.inputWeight === true || singleService.inputWeight === 'true';
            dispatch({
                type: 'ADD_ITEM',
                payload: {
                    serviceId: singleService.serviceId || singleService.serviceName,
                    serviceName: singleService.serviceName,
                    categoryId: singleService.categoryId || 'uncategorized',
                    categoryName: singleService.categoryName || 'Uncategorized',
                    price: parseFloat(singleService.price),
                    inputWeight: isWeight,
                    quantity: isWeight ? 1 : 1,
                },
            });
            // Don't auto-advance — let customer see the service, enter weight, and click Continue
        }
    }, [servicesLoaded, laundryServices, cart.items.length, orderType, activeStep]);

    // The current cart's pricing shape drives which plans are offered on the
    // Schedule page. Subscribe & Save applies to bag-only (all per-item) carts.
    const cartPricingType = derivePricingType(cart.items); // 'per_pound'|'per_item'|'per_bag'|'mixed'
    const cartIsBagOnly = cartPricingType === 'per_item' || cartPricingType === 'per_bag';
    // Tenant offers Subscribe & Save when it has frequency options AND at least
    // one per-bag (per-item) service in its catalog.
    const tenantHasPerBag = laundryServices.some(
        (s) => s.inputWeight === false || s.inputWeight === 'false'
    );
    const subscribeSaveAvailable =
        (laundryFrequency && laundryFrequency.length > 0) && tenantHasPerBag;

    // Plan selection now happens on the Schedule page (no separate Order Type
    // step). This sets orderType + frequency WITHOUT clearing the cart or
    // changing the step. Subscribe & Save is only selectable for a bag-only cart
    // (rule C): if the cart isn't bag-only we fall back to recurring.
    const handleSelectPlan = (type) => {
        if (type === 'subscribe-save' && !(subscribeSaveAvailable && cartIsBagOnly)) {
            return; // guarded by UI, but never accept S&S for a non-bag cart
        }
        setOrderType(type);
        if (type === 'one-time') {
            setFrequency(null);
        } else if (!frequency && laundryFrequency.length > 0) {
            // Recurring / Subscribe & Save: default the interval so the customer
            // can continue without an extra tap. Prefer Weekly when the tenant
            // offers it, else fall back to the first available interval.
            const weekly = laundryFrequency.find(
                (f) => String(f).toLowerCase().replace(/[-\s]/g, '') === 'weekly'
            );
            setFrequency(weekly || laundryFrequency[0]);
        }
    };

    // Safety net: if the cart stops being bag-only while Subscribe & Save is
    // selected (customer went back and added a per-pound item), demote to a
    // plain recurring order so the bag-only discount never applies to a mixed cart.
    useEffect(() => {
        if (orderType === 'subscribe-save' && !cartIsBagOnly) {
            setOrderType('frequency');
        }
    }, [orderType, cartIsBagOnly]);

    // Honor a plan pre-selected from the landing page (e.g. a "Recurring" or
    // "Subscribe & Save" CTA). The Order Type step is gone, so seed orderType
    // once on mount. Subscribe & Save is only seeded when the tenant offers it;
    // the bag-only rule is still enforced on the Schedule page + safety net.
    useEffect(() => {
        if (!preSelectedType) return;
        // Seed a default interval (prefer Weekly) so a deep-linked recurring /
        // Subscribe & Save order can proceed without a manual frequency pick.
        const seedFrequency = () => {
            if (frequency || laundryFrequency.length === 0) return;
            const weekly = laundryFrequency.find(
                (f) => String(f).toLowerCase().replace(/[-\s]/g, '') === 'weekly'
            );
            setFrequency(weekly || laundryFrequency[0]);
        };
        if (preSelectedType === 'frequency' && laundryFrequency.length > 0) {
            setOrderType('frequency');
            seedFrequency();
        } else if (preSelectedType === 'subscribe-save' && subscribeSaveAvailable) {
            setOrderType('subscribe-save');
            seedFrequency();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preSelectedType, laundryFrequency, subscribeSaveAvailable]);

    // Updated handlePlaceOrder using buildOrderPayload (Task 5.3)
    const handlePlaceOrder = async () => {
        if (cart.items.length === 0) {
            toast({ title: "Error", description: "Cart is empty.", status: "error", duration: 3000, isClosable: true });
            return false;
        }
        // Serviceability backstop: never place an order without a validated,
        // serviceable address, even if the flow was reached out of order.
        if (!address || !isAddressValidated) {
            toast({ title: "Address needed", description: "Please enter and confirm a serviceable pickup address.", status: "error", duration: 4000, isClosable: true });
            setActiveStep(1); // Address step
            return false;
        }
        if (!pickupDate || !pickupTime || !dropoffDate || !dropoffTime) {
            toast({ title: "Error", description: "Please fill in all schedule fields.", status: "error", duration: 3000, isClosable: true });
            return false;
        }
        if (!customerPaymentId && !payByInvoice) {
            toast({ title: "Payment Information Missing", description: "Please add payment info.", status: "error", duration: 3000, isClosable: true });
            return false;
        }

        // Compute grand total (Phase 2c: include selected add-ons)
        const selectedAddonList = Object.values(selectedAddons);
        const billedWeight = getBilledWeight(cart.items);
        const addonsTotal = getAddonsTotal(selectedAddonList, billedWeight);
        const subtotal = getCartSubtotal(cart.items) + addonsTotal;
        // Plan-aware discount: Subscribe & Save (per-bag) uses subscriptionDiscount;
        // the plain Recurring plan uses recurringDiscount; one-time gets none.
        // Mirrors the backend weigh-in recalc so the first order matches renewals.
        const planDiscount = orderType === 'subscribe-save'
            ? (laundryData?.subscriptionDiscount || 0)
            : orderType === 'frequency'
                ? (laundryData?.recurringDiscount || 0)
                : 0;
        const discountAmount = planDiscount > 0 ? subtotal * (planDiscount / 100) : 0;
        const taxableAmount = subtotal - discountAmount;
        const taxRate = laundryData?.taxRate || 0;
        const tax = taxRate > 0 ? taxableAmount * (taxRate / 100) : 0;
        // For a percentage tip, compute the dollar amount from the taxable
        // subtotal (there is no tip selector on the review screen that would
        // have computed it). Otherwise use the entered custom amount.
        const tipAmount = tip.tipType === 'percentage'
            ? Math.round(taxableAmount * ((parseFloat(tip.tipPercentage) || 0) / 100) * 100) / 100
            : (parseFloat(tip.tipAmount || '0') || 0);
        const grandTotal = taxableAmount + tax + tipAmount;

        const payload = buildOrderPayload(cart, {
            customerId,
            laundryId,
            address,
            doorNumber,
            addressInstructions,
            specialInstructions,
            pickupDate: formatISO(parseISO(pickupDate), { representation: 'date' }),
            pickupTimeInterval: pickupTime,
            dropoffDate: formatISO(parseISO(dropoffDate), { representation: 'date' }),
            dropoffTimeInterval: dropoffTime,
            frequency: frequency || null,
            laundryBags,
            grandTotal: grandTotal.toFixed(2),
            subTotal: subtotal.toFixed(2),
            addons: selectedAddonList,
            saveAddonPrefs,
            tip: {
                tipAmount: tipAmount.toFixed(2),
                tipPercentage: tip.tipPercentage,
                tipType: tip.tipType,
                tipMethod: tip.tipMethod,
                tipReceiverId: tip.tipReceivedId,
            },
            coupon: promoCode,
            pickupService: pickupService || 'LaundryDriver',
            dropoffService: dropoffService || 'LaundryDriver',
            customerPaymentId,
            payByInvoice,
        });

        // If using Uber, change operation
        if (pickupService === 'Uber' || dropoffService === 'Uber') {
            payload.operation = 'uberPlaceOrder';
        }
        payload.uberPickupFrequency = uberPickupFrequency;
        payload.uberDropoffFrequency = uberDropoffFrequency;
        payload.saveSpecialInstructions = saveSpecialInstructions;
        payload.autoCharge = !!frequency;

        try {
            setOrderProcessing(true);
            const response = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/customer/place-order`,
                payload,
                { headers: { 'x-api-key': authToken } }
            );
            if (response.data.status === 'success') {
                toast({ title: "Order Confirmed", description: "Your order has been placed!", status: "success", duration: 3000, isClosable: true });
                setOrderProcessing(false);
                navigate(`/${laundryId}/user/order-success`);
                return true;
            } else {
                // Check if card was declined — send customer to Payment step to update card
                if (response.data.code === 'CARD_DECLINED') {
                    toast({ title: "Card Declined", description: response.data.message || "Please update your payment method.", status: "warning", duration: 5000, isClosable: true });
                    setIsPaymentStepValid(false);
                    setActiveStep(3); // Send back to Payment step
                } else {
                    toast({ title: "Order Failed", description: response.data.message || "Failed.", status: "error", duration: 3000, isClosable: true });
                }
                setOrderProcessing(false);
                return false;
            }
        } catch (error) {
            toast({ title: "Error", description: error.message || "Failed.", status: "error", duration: 3000, isClosable: true });
            setOrderProcessing(false);
            return false;
        }
    };

    // Function to validate the address
    const validateAddress = async (addr) => {
        try {
            setIsAddressValidating(true);
            const response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/laundry/validate-address`,
                {
                    params: {
                        operation: 'validateAddress',
                        laundryId: laundryId,
                        address: addr,
                    },
                    headers: {
                        'x-api-key': process.env.REACT_APP_AWS_API_KEY,
                    },
                }
            );
            const data = response.data;
            if (data.status === 'success') {
                if (data.serviceable) {
                    setIsAddressValidated(true);
                    localStorage.setItem('customerAddress', addr);
                    return true;
                } else if (data.reason === 'too_far') {
                    // Serviceable zip but beyond the shop's max delivery distance.
                    // Backend already captured it as demand; ask them to call.
                    toast({
                        title: "Outside delivery range",
                        description: data.contactPhone
                            ? `This address is beyond our delivery range. Please call us at ${data.contactPhone}.`
                            : "This address is beyond our delivery range. Please contact us.",
                        status: "warning",
                        duration: 8000,
                        isClosable: true,
                    });
                    setIsAddressValidated(false);
                    return false;
                } else {
                    toast({
                        title: "Address Not Serviceable",
                        description: "The entered address is not serviceable. Please enter a different address.",
                        status: "error",
                        duration: 5000,
                        isClosable: true,
                    });
                    setIsAddressValidated(false);
                    return false;
                }
            } else {
                toast({
                    title: "Error",
                    description: `Error: ${data.message}`,
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
                setIsAddressValidated(false);
                return false;
            }
        } catch (error) {
            console.error('Error checking serviceability:', error);
            toast({
                title: "Error",
                description: 'An error occurred while checking the serviceability. Please try again.',
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            setIsAddressValidated(false);
            return false;
        }
        finally {
            setIsAddressValidating(false);
        }
    };

    // Address step Continue: validate serviceability, then advance to Schedule
    // (step 3) only when the address is confirmed serviceable. A cached-but-
    // already-validated address still re-validates here so a stale localStorage
    // entry can never carry an unserviceable address forward.
    const handleAddressContinue = async () => {
        if (!address) {
            toast({
                title: "Address required",
                description: "Please enter your pickup address to continue.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            return;
        }
        const ok = await validateAddress(address);
        if (ok) {
            setActiveStep(2); // Schedule
        }
    };

    // Google Maps API to populate Address
    const handlePlacesChanged = () => {
        const places = searchBoxRef.current.getPlaces();
        if (places.length > 0) {
            const place = places[0];
            setAddress(place.formatted_address);
        }
    };

    // Smart Defaults: advance step with payment skip logic.
    // Steps: 0 Services, 1 Address, 2 Schedule, 3 Payment, 4 Review.
    // Payment can be skipped when leaving Schedule (step 2).
    const advanceStep = (fromStep) => {
        if (fromStep === 2) {
            // Skip payment step ONLY when we're confident payment is covered:
            // 1. No Stripe configured → pay at pickup (always safe)
            // 2. Commercial account → pay by invoice (always safe)
            // 3. Reorder path (card was already validated on a prior order)
            // For normal flow with card on file, still go through payment step
            // so the $1 hold can verify the card is valid.
            const isReorder = !!searchParams.get('reorder');
            const canSkipPayment = !stripePromise || isCommercialCustomer || (!!customerPaymentId && isReorder);

            if (canSkipPayment) {
                setIsPaymentStepValid(true);
                if (!stripePromise && !customerPaymentId) {
                    setPayByInvoice(true);
                }
                setActiveStep(4); // Review
                return;
            }
        }
        setActiveStep(fromStep + 1);
    };

    // Quick Reorder: handle ?reorder=orderId query param
    useEffect(() => {
        const reorderOrderId = searchParams.get('reorder');
        if (!reorderOrderId || !servicesLoaded || !authToken) return;

        axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/customer/get-order-id-info`, {
            params: { operation: 'getCustomerOrderInfo', orderId: reorderOrderId, laundryId },
            headers: { 'x-api-key': authToken },
        }).then(res => {
            const order = res.data?.body?.data || res.data?.order || res.data;
            if (!order || !order.services) return;

            // Pre-fill cart from previous order
            dispatch({ type: 'CLEAR_CART' });
            (order.services || []).forEach(svc => {
                dispatch({
                    type: 'ADD_ITEM',
                    payload: {
                        serviceId: svc.serviceName,
                        serviceName: svc.serviceName,
                        categoryId: 'reorder',
                        categoryName: 'Reorder',
                        price: parseFloat(svc.servicePrice || 0),
                        inputWeight: parseFloat(svc.weightOrCount || 0) > 0 && parseFloat(svc.weightOrCount) !== 1,
                        quantity: parseFloat(svc.weightOrCount || 1),
                    },
                });
            });

            // Set order type to one-time for reorders
            setOrderType('one-time');

            // Auto-validate payment if possible
            if (customerPaymentId || !stripePromise) {
                setIsPaymentStepValid(true);
                if (!stripePromise) setPayByInvoice(true);
            }

            // Jump to Review (step 5) when we already have a validated address
            // (cached from a prior order); otherwise land on the Address step (1)
            // so serviceability is confirmed before the reorder can be placed.
            setActiveStep(isAddressValidated && address ? 4 : 1);
        }).catch(err => {
            console.error('Reorder fetch failed:', err);
            // Fall back to normal flow on error
        });
    }, [servicesLoaded, searchParams, authToken]); // eslint-disable-line react-hooks/exhaustive-deps

    const themeGradient = (() => {
        const gradientMap = {
            blue: "linear-gradient(180deg, #EBF8FF 0%, #F7FAFC 100%)",
            green: "linear-gradient(180deg, #F0FFF4 0%, #F7FAFC 100%)",
            purple: "linear-gradient(180deg, #FAF5FF 0%, #F7FAFC 100%)",
            teal: "linear-gradient(180deg, #E6FFFA 0%, #F7FAFC 100%)",
            orange: "linear-gradient(180deg, #FFFAF0 0%, #F7FAFC 100%)",
            red: "linear-gradient(180deg, #FFF5F5 0%, #F7FAFC 100%)",
            pink: "linear-gradient(180deg, #FFF5F7 0%, #F7FAFC 100%)",
            cyan: "linear-gradient(180deg, #EDFDFD 0%, #F7FAFC 100%)",
        };
        return gradientMap[laundryData?.themeColor] || gradientMap.blue;
    })();

    return (
        <Box padding={[2,4,6]} bg={themeGradient} minHeight="100vh">
            <Stack spacing={[4,6,8]} maxWidth={["100%", "600px", "800px"]} margin="auto" px={[2, 4, 6]} py={[4, 6, 8]}>
                {(
                    // Order Flow with 6-step stepper (services-first; address is step 2)
                    <>
                        {/* Show confirmed address with change option once validated */}
                        {address && isAddressValidated && (
                            <Flex justify="space-between" align="center" bg="white" borderRadius="lg" px={4} py={2} mb={3} border="1px solid" borderColor="gray.100">
                                <Box>
                                    <Box fontSize="xs" color="gray.500">Pickup Address</Box>
                                    <Box fontSize="sm" fontWeight="500" color="gray.700" noOfLines={1}>{address}</Box>
                                </Box>
                                <Button size="xs" variant="ghost" colorScheme="blue" onClick={() => { setIsAddressValidated(false); localStorage.removeItem('customerAddress'); setActiveStep(1); }}>
                                    Change
                                </Button>
                            </Flex>
                        )}
                        {laundryData?.laundryLogo && activeStep === 0 && (
                            <Box mb={2} textAlign="center">
                                <Image src={laundryData.laundryLogo} alt={laundryData?.laundryName} maxH={{ base: '60px', md: '80px' }} objectFit="contain" mx="auto" />
                            </Box>
                        )}
                        <Stepper index={activeStep} size="md" gap="0" colorScheme="blue">
                            {steps.map((step, index) => (
                                <Step key={index}>
                                    <StepIndicator>
                                        <StepStatus complete={<StepIcon />} incomplete={<StepNumber />} active={<StepNumber />} />
                                    </StepIndicator>
                                    <StepTitle fontSize={['xs','sm','md']}>{step.title}</StepTitle>
                                    {index !== steps.length - 1 && <StepSeparator />}
                                </Step>
                            ))}
                        </Stepper>

                        <Box bg="white" borderRadius="2xl" boxShadow="sm" border="1px solid" borderColor="gray.100" padding={[4,5,6]}>
                            {/* Services skeleton — shown while the catalog loads so the
                                Services step never flashes an empty white box. */}
                            {activeStep === 0 && !servicesLoaded && (
                                <VStack spacing={4} align="stretch" py={2}>
                                    <Skeleton height="20px" width="140px" borderRadius="md" />
                                    {[0, 1, 2, 3].map((i) => (
                                        <Box key={i} p={3} borderRadius="lg" border="1px solid" borderColor="gray.100">
                                            <Skeleton height="16px" width="60%" mb={2} borderRadius="md" />
                                            <SkeletonText noOfLines={1} skeletonHeight="3" width="40%" />
                                        </Box>
                                    ))}
                                </VStack>
                            )}

                            {/* Step 0: Unified Service Page (full catalog — no order-type filtering) */}
                            {activeStep === 0 && servicesLoaded && (
                                <UnifiedServicePage
                                    laundryServices={laundryServices}
                                    serviceCategories={serviceCategories}
                                    cart={cart}
                                    dispatch={dispatch}
                                    onContinue={() => setActiveStep(1)}
                                    themeColor={laundryData?.themeColor || 'blue'}
                                    contactPhone={contactPhone}
                                    laundryAddress={laundryAddress}
                                    addonsTotal={getAddonsTotal(Object.values(selectedAddons), getBilledWeight(cart.items))}
                                    footerSlot={
                                        addonsEnabled && laundryAddons.length > 0 ? (
                                            <AddonPicker
                                                addons={laundryAddons}
                                                selected={selectedAddons}
                                                onChange={setSelectedAddons}
                                                billedWeight={getBilledWeight(cart.items)}
                                                saveAsDefault={saveAddonPrefs}
                                                onSaveAsDefaultChange={setSaveAddonPrefs}
                                            />
                                        ) : null
                                    }
                                />
                            )}

                            {/* Step 1: Address */}
                            {activeStep === 1 && (
                                <VStack spacing={5} align="stretch">
                                    <Box>
                                        <Heading size="md" color="gray.800" mb={1}>Where should we pick up?</Heading>
                                        <Text fontSize="sm" color="gray.500">Enter your pickup address so we can confirm we serve your area.</Text>
                                    </Box>
                                    <FormControl id="address" isRequired>
                                        <FormLabel fontSize="sm" fontWeight="600" color="gray.700">
                                            Pickup Address
                                        </FormLabel>
                                        <StandaloneSearchBox
                                            onLoad={ref => (searchBoxRef.current = ref)}
                                            onPlacesChanged={handlePlacesChanged}
                                        >
                                            <Input
                                                type="text"
                                                placeholder="Enter your address"
                                                value={address}
                                                size="lg"
                                                autoComplete="off"
                                                onChange={(e) => { setAddress(e.target.value); if (isAddressValidated) setIsAddressValidated(false); }}
                                            />
                                        </StandaloneSearchBox>
                                    </FormControl>
                                    <FormControl id="doorNumber">
                                        <FormLabel fontSize="sm" fontWeight="600" color="gray.700">
                                            Apartment or Unit Number
                                        </FormLabel>
                                        <Input
                                            type="text"
                                            placeholder="Apt, Suite, Unit (optional)"
                                            value={doorNumber}
                                            onChange={(e) => setDoorNumber(e.target.value)}
                                        />
                                    </FormControl>
                                    <FormControl id="addressInstructions">
                                        <FormLabel fontSize="sm" fontWeight="600" color="gray.700">
                                            Delivery Instructions
                                        </FormLabel>
                                        <Input
                                            type="text"
                                            placeholder="e.g. Leave at front door"
                                            value={addressInstructions}
                                            onChange={(e) => setAddressInstructions(e.target.value)}
                                        />
                                    </FormControl>
                                    <Button
                                        colorScheme="blue"
                                        size="lg"
                                        borderRadius="xl"
                                        w="100%"
                                        isLoading={isAddressValidating}
                                        loadingText="Checking your area..."
                                        boxShadow="md"
                                        onClick={handleAddressContinue}
                                    >
                                        Continue
                                    </Button>
                                </VStack>
                            )}

                            {/* Step 2: Schedule Page (plan + frequency + schedule) */}
                            {activeStep === 2 && (
                                <SchedulePage
                                    orderType={orderType}
                                    setOrderType={handleSelectPlan}
                                    subscribeSaveAvailable={subscribeSaveAvailable}
                                    cartIsBagOnly={cartIsBagOnly}
                                    subscriptionDiscount={laundryData?.subscriptionDiscount || 0}
                                    recurringDiscount={laundryData?.recurringDiscount || 0}
                                    pickupDate={pickupDate} setPickupDate={setPickupDate}
                                    pickupTime={pickupTime} setPickupTime={setPickupTime}
                                    dropoffDate={dropoffDate} setDropoffDate={setDropoffDate}
                                    dropoffTime={dropoffTime} setDropoffTime={setDropoffTime}
                                    pickupService={pickupService} setPickupService={setPickupService}
                                    dropoffService={dropoffService} setDropoffService={setDropoffService}
                                    frequency={frequency} setFrequency={setFrequency}
                                    promoCode={promoCode} setPromoCode={setPromoCode}
                                    specialInstructions={specialInstructions} setSpecialInstructions={setSpecialInstructions}
                                    setSaveSpecialInstructions={setSaveSpecialInstructions}
                                    laundryBags={laundryBags} setLaundryBags={setLaundryBags}
                                    deliveryTimeSlots={deliveryTimeSlots}
                                    deliveryTimeInterval={deliveryTimeInterval}
                                    laundryTimeZone={laundryTimeZone}
                                    laundryFrequency={laundryFrequency}
                                    frequencyPromotions={frequencyPromotions}
                                    promoDescriptionMessage={promoDescriptionMessage}
                                    setPromoDescriptionMessage={setPromoDescriptionMessage}
                                    uberEnv={uberEnv}
                                    uberExists={uberExists} setUberExists={setUberExists}
                                    laundryAddress={laundryAddress}
                                    address={address}
                                    uberPickupFrequency={uberPickupFrequency} setUberPickupFrequency={setUberPickupFrequency}
                                    uberDropoffFrequency={uberDropoffFrequency} setUberDropoffFrequency={setUberDropoffFrequency}
                                    laundryId={laundryId}
                                    onContinue={() => advanceStep(2)}
                                    onBack={() => setActiveStep(1)}
                                />
                            )}

                            {/* Step 3: Payment */}
                            {activeStep === 3 && isCommercialCustomer && (
                                <Box p={6} textAlign="center">
                                    <Text fontSize="lg" fontWeight="bold" mb={2}>💼 Commercial Account</Text>
                                    <Text color="gray.600" mb={4}>
                                        Your order will be invoiced. No card payment required.
                                    </Text>
                                    <Badge colorScheme="purple" fontSize="md" px={3} py={1} mb={4}>Pay by Invoice</Badge>
                                    <Button colorScheme="blue" onClick={() => { setActiveStep(4); }} w="100%">
                                        Continue to Review
                                    </Button>
                                </Box>
                            )}
                            {activeStep === 3 && !isCommercialCustomer && stripePromise && (
                                <Elements stripe={stripePromise}>
                                    <PaymentPage
                                        customerId={customerId}
                                        laundryId={laundryId}
                                        customerPaymentId={customerPaymentId}
                                        setCustomerPaymentId={setCustomerPaymentId}
                                        setIsPaymentStepValid={setIsPaymentStepValid}
                                        isPaymentStepValid={isPaymentStepValid}
                                        existingPaymentMethods={existingPaymentMethods}
                                        setExistingPaymentMethods={setExistingPaymentMethods}
                                        handleNextStep={() => setActiveStep(4)}
                                        payByInvoice={payByInvoice}
                                        setPayByInvoice={setPayByInvoice}
                                    />
                                </Elements>
                            )}
                            {activeStep === 3 && !isCommercialCustomer && !stripePromise && (
                                <Box p={6} textAlign="center">
                                    <Text fontSize="lg" fontWeight="bold" mb={2}>💵 Pay at Pickup</Text>
                                    <Text color="gray.600" mb={4}>
                                        This location accepts payment when your laundry is picked up or delivered. No card needed right now.
                                    </Text>
                                    <Button colorScheme="blue" onClick={() => { setIsPaymentStepValid(true); setPayByInvoice(true); setActiveStep(4); }}>
                                        Continue to Review
                                    </Button>
                                </Box>
                            )}

                            {/* Step 4: Review Order */}
                            {activeStep === 4 && (
                                <UnifiedReviewPage
                                    cart={cart}
                                    dispatch={dispatch}
                                    laundryId={laundryId}
                                    address={address}
                                    dropoffService={dropoffService}
                                    pickupDate={pickupDate}
                                    pickupTime={pickupTime}
                                    dropoffDate={dropoffDate}
                                    dropoffTime={dropoffTime}
                                    tip={tip}
                                    setTip={setTip}
                                    taxRate={laundryData?.taxRate || 0}
                                    promoCode={promoCode}
                                    promoDescriptionMessage={promoDescriptionMessage}
                                    frequency={frequency}
                                    subscriptionDiscount={orderType === 'subscribe-save'
                                        ? (laundryData?.subscriptionDiscount || 0)
                                        : orderType === 'frequency'
                                            ? (laundryData?.recurringDiscount || 0)
                                            : 0}
                                    selectedAddons={Object.values(selectedAddons)}
                                    onPlaceOrder={handlePlaceOrder}
                                    onEdit={() => setActiveStep(0)}
                                    orderProcessing={orderProcessing}
                                />
                            )}
                        </Box>

                        <Flex justify="space-between" mt={4}>
                            <Button
                                onClick={() => setActiveStep(activeStep - 1)}
                                isDisabled={activeStep === 0}
                                variant="ghost"
                                colorScheme="gray"
                            >
                                Previous
                            </Button>
                        </Flex>
                    </>
                )}
            </Stack>
        </Box>
    );
}
