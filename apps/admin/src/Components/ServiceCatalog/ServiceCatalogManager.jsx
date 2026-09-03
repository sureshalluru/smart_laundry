import React, { useEffect, useState } from "react";
import {
    Box,
    Text,
    Flex,
    Switch,
    Button,
    Input,
    Textarea,
    SimpleGrid,
    Icon,
    Spinner,
    useToast,
    FormControl,
    FormLabel,
    FormErrorMessage,
    Badge,
    VStack,
    HStack,
} from "@chakra-ui/react";
import { FiPackage, FiDroplet, FiTruck, FiSun } from "react-icons/fi";
import { FaShoppingBag } from "react-icons/fa";
import axios from "axios";

const iconMap = {
    package: FiPackage,
    droplet: FiDroplet,
    truck: FiTruck,
    sun: FiSun,
    bag: FaShoppingBag,
};

const ICON_OPTIONS = [
    { key: "package", label: "Package", icon: FiPackage },
    { key: "droplet", label: "Droplet", icon: FiDroplet },
    { key: "truck", label: "Truck", icon: FiTruck },
    { key: "sun", label: "Sun", icon: FiSun },
    { key: "bag", label: "Bag", icon: FaShoppingBag },
];

const COLOR_OPTIONS = [
    "blue", "green", "orange", "purple", "red", "teal", "cyan", "pink", "yellow",
];

/**
 * ServiceCatalogManager — Admin panel for selecting, customizing, and
 * creating services that appear on the tenant's public landing page.
 *
 * Props:
 *   - laundryId: string
 *   - currentServices: array (optional) — existing site_content.services for reconciliation
 */
const ServiceCatalogManager = ({ laundryId, currentServices }) => {
    const toast = useToast();
    const authToken = localStorage.getItem("idToken");

    // State
    const [catalog, setCatalog] = useState([]);
    const [enabledIds, setEnabledIds] = useState(new Set());
    const [overrides, setOverrides] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [fetchError, setFetchError] = useState(false);

    // Custom service form
    const [customForm, setCustomForm] = useState({
        title: "",
        description: "",
        iconKey: "package",
        color: "blue",
    });
    const [customFormError, setCustomFormError] = useState("");
    const [creatingCustom, setCreatingCustom] = useState(false);

    // Trust badges (storefront hero badges)
    const [badges, setBadges] = useState([]);
    const [savingBadges, setSavingBadges] = useState(false);

    // Hero content (headline / subheadline)
    const [hero, setHero] = useState({ headline: "", subheadline: "" });
    const [savingHero, setSavingHero] = useState(false);

    // Section visibility flags (true = hidden on public site)
    const [sections, setSections] = useState({
        hideHowItWorks: false,
        hidePricing: false,
        hideLocation: false,
        hideAbout: false,
        hideNavServices: false,
        hideNavStaffLinks: false,
        hidePickupOnlyCopy: false,
    });
    const [savingSections, setSavingSections] = useState(false);

    // Public site theme color (site_content.themeColor).
    const THEME_COLOR_OPTIONS = ["blue", "green", "purple", "teal", "orange", "red", "pink", "cyan"];
    const [themeColor, setThemeColor] = useState("blue");
    const [savingTheme, setSavingTheme] = useState(false);

    // Fetch catalog on mount
    useEffect(() => {
        fetchCatalog();
        fetchBadges();
        fetchHero();
        fetchSections();
        fetchTheme();
    }, [laundryId]);

    const fetchTheme = async () => {
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/site-theme`,
                { params: { laundryId }, headers: { Authorization: `Bearer ${authToken}` } }
            );
            if (res.data?.themeColor) setThemeColor(res.data.themeColor);
        } catch (err) {
            console.error("Error fetching site theme:", err);
        }
    };

    const handleSelectTheme = async (color) => {
        const prev = themeColor;
        setThemeColor(color); // optimistic
        setSavingTheme(true);
        try {
            await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/site-theme`,
                { themeColor: color },
                { params: { laundryId }, headers: { Authorization: `Bearer ${authToken}` } }
            );
            toast({ title: "Theme color updated", status: "success", duration: 2000, isClosable: true });
        } catch (err) {
            console.error("Error saving site theme:", err);
            setThemeColor(prev); // revert on failure
            toast({ title: "Could not update theme", status: "error", duration: 3000, isClosable: true });
        } finally {
            setSavingTheme(false);
        }
    };

    const fetchSections = async () => {
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/site-sections`,
                { params: { laundryId }, headers: { Authorization: `Bearer ${authToken}` } }
            );
            setSections({
                hideHowItWorks: !!res.data?.hideHowItWorks,
                hidePricing: !!res.data?.hidePricing,
                hideLocation: !!res.data?.hideLocation,
                hideAbout: !!res.data?.hideAbout,
                hideNavServices: !!res.data?.hideNavServices,
                hideNavStaffLinks: !!res.data?.hideNavStaffLinks,
                hidePickupOnlyCopy: !!res.data?.hidePickupOnlyCopy,
            });
        } catch (err) {
            console.error("Error fetching site sections:", err);
        }
    };

    const handleSaveSections = async (next) => {
        setSavingSections(true);
        try {
            const res = await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/site-sections`,
                next,
                { params: { laundryId }, headers: { Authorization: `Bearer ${authToken}` } }
            );
            setSections({
                hideHowItWorks: !!res.data?.hideHowItWorks,
                hidePricing: !!res.data?.hidePricing,
                hideLocation: !!res.data?.hideLocation,
                hideAbout: !!res.data?.hideAbout,
                hideNavServices: !!res.data?.hideNavServices,
                hideNavStaffLinks: !!res.data?.hideNavStaffLinks,
                hidePickupOnlyCopy: !!res.data?.hidePickupOnlyCopy,
            });
            toast({
                title: "Sections updated",
                status: "success",
                duration: 2000,
                isClosable: true,
            });
        } catch (err) {
            console.error("Error saving site sections:", err);
            toast({
                title: "Error saving sections",
                description: "Please try again.",
                status: "error",
                duration: 4000,
                isClosable: true,
            });
            // Reload authoritative state on failure
            fetchSections();
        } finally {
            setSavingSections(false);
        }
    };

    // A toggle shows "section visible" (inverse of the hide flag); flipping it
    // saves immediately so the tenant gets instant feedback.
    const handleToggleSection = (hideKey) => {
        const next = { ...sections, [hideKey]: !sections[hideKey] };
        setSections(next);
        handleSaveSections(next);
    };

    const fetchBadges = async () => {
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/trust-badges`,
                { params: { laundryId }, headers: { Authorization: `Bearer ${authToken}` } }
            );
            setBadges(res.data?.trustBadges || []);
        } catch (err) {
            console.error("Error fetching trust badges:", err);
        }
    };

    const fetchHero = async () => {
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/hero-content`,
                { params: { laundryId }, headers: { Authorization: `Bearer ${authToken}` } }
            );
            setHero({
                headline: res.data?.headline || "",
                subheadline: res.data?.subheadline || "",
            });
        } catch (err) {
            console.error("Error fetching hero content:", err);
        }
    };

    const handleSaveHero = async () => {
        setSavingHero(true);
        try {
            const res = await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/hero-content`,
                { headline: hero.headline.trim(), subheadline: hero.subheadline.trim() },
                { params: { laundryId }, headers: { Authorization: `Bearer ${authToken}` } }
            );
            setHero({
                headline: res.data?.headline || "",
                subheadline: res.data?.subheadline || "",
            });
            toast({
                title: "Headline saved!",
                description: "Your storefront headline is updated.",
                status: "success",
                duration: 3000,
                isClosable: true,
            });
        } catch (err) {
            console.error("Error saving hero content:", err);
            toast({
                title: "Error saving headline",
                description: "Please try again.",
                status: "error",
                duration: 4000,
                isClosable: true,
            });
        } finally {
            setSavingHero(false);
        }
    };

    const handleBadgeChange = (index, value) => {
        setBadges((prev) => prev.map((b, i) => (i === index ? value : b)));
    };

    const handleAddBadge = () => {
        setBadges((prev) => (prev.length >= 6 ? prev : [...prev, ""]));
    };

    const handleRemoveBadge = (index) => {
        setBadges((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSaveBadges = async () => {
        setSavingBadges(true);
        try {
            const cleaned = badges.map((b) => b.trim()).filter(Boolean);
            const res = await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/trust-badges`,
                { trustBadges: cleaned },
                { params: { laundryId }, headers: { Authorization: `Bearer ${authToken}` } }
            );
            setBadges(res.data?.trustBadges || cleaned);
            toast({
                title: "Badges saved!",
                description: "Your storefront badges are updated.",
                status: "success",
                duration: 3000,
                isClosable: true,
            });
        } catch (err) {
            console.error("Error saving trust badges:", err);
            toast({
                title: "Error saving badges",
                description: "Please try again.",
                status: "error",
                duration: 4000,
                isClosable: true,
            });
        } finally {
            setSavingBadges(false);
        }
    };

    const fetchCatalog = async () => {
        setLoading(true);
        setFetchError(false);
        try {
            const res = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/service-catalog`,
                { headers: { Authorization: `Bearer ${authToken}` } }
            );
            const items = res.data?.body?.catalog || [];
            setCatalog(items);
            reconcileWithCurrent(items);
        } catch (err) {
            console.error("Error fetching service catalog:", err);
            setFetchError(true);
        } finally {
            setLoading(false);
        }
    };

    // Reconcile current site_content.services with catalog to set enabled/overrides
    const reconcileWithCurrent = (catalogItems) => {
        const services = currentServices || [];
        if (!services.length) return;

        const newEnabled = new Set();
        const newOverrides = {};

        services.forEach((svc) => {
            const match = catalogItems.find(
                (c) => c.title.toLowerCase() === svc.title?.toLowerCase()
            );
            if (match) {
                newEnabled.add(match.id);
                if (svc.description && svc.description !== match.description) {
                    newOverrides[match.id] = { description: svc.description };
                }
            }
        });

        setEnabledIds(newEnabled);
        setOverrides(newOverrides);
    };

    // Toggle a service on/off
    const handleToggle = (id) => {
        setEnabledIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Update description override
    const handleDescriptionChange = (id, value) => {
        setOverrides((prev) => ({
            ...prev,
            [id]: { ...prev[id], description: value },
        }));
    };

    // Save configuration
    const handleSave = async () => {
        setSaving(true);
        try {
            const services = catalog
                .filter((item) => enabledIds.has(item.id))
                .map((item) => ({
                    title: item.title,
                    description:
                        overrides[item.id]?.description ?? item.description,
                    icon: item.iconKey,
                    color: item.color,
                }));

            await axios.put(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/service-catalog/config`,
                { laundryId, services },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            toast({
                title: "Services saved!",
                description: `${services.length} service(s) will appear on your website.`,
                status: "success",
                duration: 3000,
                isClosable: true,
            });
        } catch (err) {
            console.error("Error saving service config:", err);
            toast({
                title: "Error saving services",
                description: "Please try again.",
                status: "error",
                duration: 4000,
                isClosable: true,
            });
        } finally {
            setSaving(false);
        }
    };

    // Create custom service
    const handleCreateCustom = async () => {
        setCustomFormError("");

        if (!customForm.title.trim()) {
            setCustomFormError("Title is required");
            return;
        }

        setCreatingCustom(true);
        try {
            const res = await axios.post(
                `${process.env.REACT_APP_AWS_API_URL}/api/admin/service-catalog`,
                {
                    laundryId,
                    title: customForm.title.trim(),
                    description: customForm.description,
                    iconKey: customForm.iconKey,
                    color: customForm.color,
                },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            if (res.data?.statusCode === 409) {
                setCustomFormError("A service with this title already exists");
                return;
            }
            if (res.data?.statusCode === 400) {
                setCustomFormError(res.data?.body?.error || "Invalid input");
                return;
            }

            const newEntry = res.data?.body;
            if (newEntry?.id) {
                // Add to catalog and auto-enable
                setCatalog((prev) => [...prev, newEntry]);
                setEnabledIds((prev) => new Set([...prev, newEntry.id]));
                setCustomForm({ title: "", description: "", iconKey: "package", color: "blue" });
                toast({
                    title: "Custom service created!",
                    status: "success",
                    duration: 2000,
                    isClosable: true,
                });
            }
        } catch (err) {
            const errMsg = err.response?.data?.body?.error || "Failed to create service";
            setCustomFormError(errMsg);
        } finally {
            setCreatingCustom(false);
        }
    };

    if (loading) {
        return (
            <Flex justify="center" align="center" p={8}>
                <Spinner size="lg" />
            </Flex>
        );
    }

    if (fetchError) {
        return (
            <Box p={4} textAlign="center">
                <Text color="red.500" mb={3}>Failed to load service catalog.</Text>
                <Button size="sm" onClick={fetchCatalog}>Retry</Button>
            </Box>
        );
    }

    return (
        <Box p={4}>
            <Text fontSize="xl" fontWeight="bold" mb={1}>Website Services</Text>
            <Text fontSize="sm" color="gray.600" mb={6}>
                Select which services appear on your public website. Toggle services on or off, customize descriptions, or add your own. Your selection here is private to your laundry and only affects your own site.
            </Text>

            {/* Hero headline editor */}
            <Box mb={8} p={4} borderWidth="1px" borderRadius="md" borderColor="gray.200" bg="gray.50">
                <Text fontWeight="bold" mb={1}>Homepage Headline</Text>
                <Text fontSize="xs" color="gray.500" mb={3}>
                    The large headline and supporting line at the top of your public site. Wrap a word or two in &lt;span&gt;...&lt;/span&gt; to highlight it (e.g. "Concierge Laundry, &lt;span&gt;Delivered&lt;/span&gt;"). Leave blank to use the default.
                </Text>
                <FormControl mb={2}>
                    <FormLabel fontSize="sm">Headline</FormLabel>
                    <Input
                        size="sm"
                        value={hero.headline}
                        maxLength={120}
                        placeholder="We Pick Up, Wash & <span>Deliver</span>"
                        onChange={(e) => setHero((h) => ({ ...h, headline: e.target.value }))}
                    />
                </FormControl>
                <FormControl mb={3}>
                    <FormLabel fontSize="sm">Subheadline</FormLabel>
                    <Textarea
                        size="sm"
                        value={hero.subheadline}
                        maxLength={240}
                        rows={2}
                        placeholder="Schedule a free pickup and we handle the rest — washed, folded, delivered."
                        onChange={(e) => setHero((h) => ({ ...h, subheadline: e.target.value }))}
                    />
                </FormControl>
                <Button size="sm" colorScheme="blue" onClick={handleSaveHero} isLoading={savingHero} loadingText="Saving...">
                    Save Headline
                </Button>
            </Box>

            {/* Trust badges editor */}
            <Box mb={8} p={4} borderWidth="1px" borderRadius="md" borderColor="gray.200" bg="gray.50">
                <Text fontWeight="bold" mb={1}>Trust Badges</Text>
                <Text fontSize="xs" color="gray.500" mb={3}>
                    Short highlights shown at the top of your public site (e.g. "Free Pickup & Delivery", "Eco-Friendly", "Locally Owned"). Up to 6. Leave empty to hide badges.
                </Text>
                <VStack spacing={2} align="stretch" mb={3}>
                    {badges.map((badge, i) => (
                        <HStack key={`badge-${i}`} spacing={2}>
                            <Input
                                size="sm"
                                value={badge}
                                maxLength={40}
                                placeholder="e.g. Free Pickup & Delivery"
                                onChange={(e) => handleBadgeChange(i, e.target.value)}
                            />
                            <Button size="sm" variant="ghost" colorScheme="red" onClick={() => handleRemoveBadge(i)}>
                                Remove
                            </Button>
                        </HStack>
                    ))}
                    {badges.length === 0 && (
                        <Text fontSize="sm" color="gray.400">No badges — your site will show none until you add some.</Text>
                    )}
                </VStack>
                <HStack spacing={3}>
                    <Button size="sm" variant="outline" onClick={handleAddBadge} isDisabled={badges.length >= 6}>
                        + Add badge
                    </Button>
                    <Button size="sm" colorScheme="blue" onClick={handleSaveBadges} isLoading={savingBadges} loadingText="Saving...">
                        Save Badges
                    </Button>
                </HStack>
            </Box>

            {/* Public site theme color */}
            <Box mb={8} p={4} borderWidth="1px" borderRadius="md" borderColor="gray.200" bg="gray.50">
                <Text fontWeight="bold" mb={1}>Theme Color</Text>
                <Text fontSize="xs" color="gray.500" mb={3}>
                    Sets the accent color for your public site — buttons, badges, and highlights. Click a swatch to apply. Saves automatically.
                </Text>
                <HStack spacing={3} flexWrap="wrap">
                    {THEME_COLOR_OPTIONS.map((color) => (
                        <Box
                            key={color}
                            as="button"
                            type="button"
                            onClick={() => handleSelectTheme(color)}
                            disabled={savingTheme}
                            title={color}
                            aria-label={`Theme ${color}`}
                            w="36px"
                            h="36px"
                            borderRadius="full"
                            bg={`${color}.500`}
                            border="3px solid"
                            borderColor={themeColor === color ? "gray.800" : "transparent"}
                            boxShadow={themeColor === color ? "md" : "none"}
                            cursor={savingTheme ? "not-allowed" : "pointer"}
                            transition="all 0.15s"
                            _hover={{ transform: savingTheme ? "none" : "scale(1.1)" }}
                        />
                    ))}
                </HStack>
                <Text fontSize="xs" color="gray.500" mt={2}>
                    Current: <Badge colorScheme={themeColor}>{themeColor}</Badge>
                </Text>
            </Box>

            {/* Homepage section visibility toggles */}
            <Box mb={8} p={4} borderWidth="1px" borderRadius="md" borderColor="gray.200" bg="gray.50">
                <Text fontWeight="bold" mb={1}>Homepage Sections</Text>
                <Text fontSize="xs" color="gray.500" mb={3}>
                    Choose which sections appear on your public site. Turn one off to hide it (useful for pickup-and-delivery-only businesses). Changes save automatically.
                </Text>
                <VStack spacing={2} align="stretch">
                    {[
                        { key: "hideHowItWorks", label: "How It Works" },
                        { key: "hidePricing", label: "Pricing" },
                        { key: "hideLocation", label: "Location / Service Area" },
                        { key: "hideAbout", label: "About" },
                    ].map((row) => (
                        <Flex key={row.key} justify="space-between" align="center">
                            <Text fontSize="sm">{row.label}</Text>
                            <Switch
                                colorScheme="green"
                                isChecked={!sections[row.key]}
                                isDisabled={savingSections}
                                onChange={() => handleToggleSection(row.key)}
                            />
                        </Flex>
                    ))}
                </VStack>
            </Box>

            {/* Navigation & public link toggles */}
            <Box mb={8} p={4} borderWidth="1px" borderRadius="md" borderColor="gray.200" bg="gray.50">
                <Text fontWeight="bold" mb={1}>Navigation & Public Links</Text>
                <Text fontSize="xs" color="gray.500" mb={3}>
                    Control which links and buttons appear to public visitors. Turn one on to show it, off to hide it.
                    Hiding Admin & Driver keeps them out of the public menu — you still reach them from your own bookmarks.
                    Changes save automatically.
                </Text>
                <VStack spacing={2} align="stretch">
                    {[
                        { key: "hideNavServices", label: "\"Services\" menu link" },
                        { key: "hideNavStaffLinks", label: "Admin & Driver links (staff)" },
                        { key: "hidePickupOnlyCopy", label: "\"Visit Our Location\" button (storefront)" },
                    ].map((row) => (
                        <Flex key={row.key} justify="space-between" align="center">
                            <Text fontSize="sm">{row.label}</Text>
                            <Switch
                                colorScheme="green"
                                isChecked={!sections[row.key]}
                                isDisabled={savingSections}
                                onChange={() => handleToggleSection(row.key)}
                            />
                        </Flex>
                    ))}
                </VStack>
            </Box>

            {/* Catalog list with toggles */}
            <VStack spacing={3} align="stretch" mb={8}>
                {catalog.map((item) => {
                    const isEnabled = enabledIds.has(item.id);
                    const IconComponent = iconMap[item.iconKey] || FiPackage;

                    return (
                        <Box
                            key={item.id}
                            p={4}
                            border="1px solid"
                            borderColor={isEnabled ? `${item.color}.200` : "gray.200"}
                            borderRadius="md"
                            bg={isEnabled ? `${item.color}.50` : "white"}
                            transition="all 0.2s"
                        >
                            <Flex justify="space-between" align="center">
                                <HStack spacing={3}>
                                    <Box
                                        bg={`${item.color}.100`}
                                        borderRadius="md"
                                        p={2}
                                    >
                                        <Icon
                                            as={IconComponent}
                                            boxSize={5}
                                            color={`${item.color}.500`}
                                        />
                                    </Box>
                                    <Box>
                                        <Text fontWeight="600" fontSize="sm">
                                            {item.title}
                                        </Text>
                                        {!isEnabled && (
                                            <Text fontSize="xs" color="gray.500">
                                                {item.description}
                                            </Text>
                                        )}
                                    </Box>
                                    {item.sourceType === "tenant" && (
                                        <Badge colorScheme="purple" fontSize="xs">
                                            Custom
                                        </Badge>
                                    )}
                                </HStack>
                                <Switch
                                    isChecked={isEnabled}
                                    onChange={() => handleToggle(item.id)}
                                    colorScheme={item.color}
                                />
                            </Flex>

                            {/* Inline description editing for enabled services */}
                            {isEnabled && (
                                <Box mt={3}>
                                    <Text fontSize="xs" color="gray.600" mb={1}>
                                        Description (displayed on your website):
                                    </Text>
                                    <Textarea
                                        size="sm"
                                        value={
                                            overrides[item.id]?.description ??
                                            item.description
                                        }
                                        onChange={(e) =>
                                            handleDescriptionChange(
                                                item.id,
                                                e.target.value
                                            )
                                        }
                                        placeholder="Enter a custom description..."
                                        rows={2}
                                    />
                                </Box>
                            )}
                        </Box>
                    );
                })}
            </VStack>

            {/* Save button */}
            <Button
                colorScheme="blue"
                onClick={handleSave}
                isLoading={saving}
                mb={8}
                size="md"
            >
                Save Services ({enabledIds.size} selected)
            </Button>

            {/* Custom service creation form */}
            <Box
                p={5}
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                bg="gray.50"
            >
                <Text fontWeight="bold" mb={3}>
                    Add Custom Service
                </Text>
                <Text fontSize="xs" color="gray.500" mb={4}>
                    Heads up: custom services are added to the shared platform
                    catalog and become selectable presets for every business on
                    the platform. Choosing which services appear on YOUR public
                    site is separate and stays private to your laundry. Only add
                    a custom service here if you're comfortable it being a shared
                    preset.
                </Text>

                <FormControl isInvalid={!!customFormError} mb={3}>
                    <FormLabel fontSize="sm">Title</FormLabel>
                    <Input
                        size="sm"
                        placeholder="e.g. Eco-Friendly Wash"
                        value={customForm.title}
                        onChange={(e) =>
                            setCustomForm((f) => ({ ...f, title: e.target.value }))
                        }
                        maxLength={100}
                    />
                    {customFormError && (
                        <FormErrorMessage fontSize="xs">{customFormError}</FormErrorMessage>
                    )}
                </FormControl>

                <FormControl mb={3}>
                    <FormLabel fontSize="sm">Description</FormLabel>
                    <Textarea
                        size="sm"
                        placeholder="Describe the service..."
                        value={customForm.description}
                        onChange={(e) =>
                            setCustomForm((f) => ({ ...f, description: e.target.value }))
                        }
                        rows={2}
                    />
                </FormControl>

                {/* Icon picker */}
                <FormControl mb={3}>
                    <FormLabel fontSize="sm">Icon</FormLabel>
                    <SimpleGrid columns={5} spacing={2}>
                        {ICON_OPTIONS.map((opt) => (
                            <Box
                                key={opt.key}
                                p={2}
                                borderRadius="md"
                                border="2px solid"
                                borderColor={
                                    customForm.iconKey === opt.key
                                        ? "blue.400"
                                        : "gray.200"
                                }
                                bg={
                                    customForm.iconKey === opt.key
                                        ? "blue.50"
                                        : "white"
                                }
                                cursor="pointer"
                                textAlign="center"
                                onClick={() =>
                                    setCustomForm((f) => ({ ...f, iconKey: opt.key }))
                                }
                                transition="all 0.15s"
                                _hover={{ borderColor: "blue.300" }}
                            >
                                <Icon as={opt.icon} boxSize={5} mb={1} />
                                <Text fontSize="xs">{opt.label}</Text>
                            </Box>
                        ))}
                    </SimpleGrid>
                </FormControl>

                {/* Color picker */}
                <FormControl mb={4}>
                    <FormLabel fontSize="sm">Color</FormLabel>
                    <Flex flexWrap="wrap" gap={2}>
                        {COLOR_OPTIONS.map((c) => (
                            <Box
                                key={c}
                                w="32px"
                                h="32px"
                                borderRadius="md"
                                bg={`${c}.400`}
                                border="3px solid"
                                borderColor={
                                    customForm.color === c ? "gray.800" : "transparent"
                                }
                                cursor="pointer"
                                onClick={() =>
                                    setCustomForm((f) => ({ ...f, color: c }))
                                }
                                title={c}
                                transition="all 0.15s"
                                _hover={{ transform: "scale(1.1)" }}
                            />
                        ))}
                    </Flex>
                </FormControl>

                <Button
                    colorScheme="green"
                    size="sm"
                    onClick={handleCreateCustom}
                    isLoading={creatingCustom}
                >
                    Create Service
                </Button>
            </Box>
        </Box>
    );
};

export default ServiceCatalogManager;
