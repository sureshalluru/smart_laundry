import {
  Box,
  Flex,
  Text,
  VStack,
  HStack,
  Checkbox,
  IconButton,
  Input,
} from '@chakra-ui/react';

/**
 * AddonPicker — optional add-ons / processing extras for an order (Phase 2c).
 *
 * Renders only when the tenant has add-ons enabled and at least one add-on is
 * configured. Selection state is owned by the parent (LaundryPickupPage) via
 * `selected` (a map of addonId -> { addonId, addonName, pricingBasis, unitPrice,
 * quantity }) and `onChange`.
 *
 * per_pound add-ons are a simple on/off (priced on the order's weight at billing);
 * per_item add-ons have a quantity stepper.
 */
export default function AddonPicker({ addons, selected, onChange, billedWeight, saveAsDefault, onSaveAsDefaultChange }) {
  if (!addons || addons.length === 0) return null;

  const isSelected = (id) => Boolean(selected[id]);

  const toggle = (addon) => {
    const next = { ...selected };
    if (next[addon.addonId]) {
      delete next[addon.addonId];
    } else {
      next[addon.addonId] = {
        addonId: addon.addonId,
        addonName: addon.addonName,
        pricingBasis: addon.pricingBasis,
        unitPrice: addon.unitPrice,
        quantity: addon.pricingBasis === 'per_pound' ? null : 1,
      };
    }
    onChange(next);
  };

  const setQty = (addon, qty) => {
    const q = Math.max(1, parseInt(qty, 10) || 1);
    onChange({
      ...selected,
      [addon.addonId]: {
        ...(selected[addon.addonId] || {
          addonId: addon.addonId,
          addonName: addon.addonName,
          pricingBasis: addon.pricingBasis,
          unitPrice: addon.unitPrice,
        }),
        quantity: q,
      },
    });
  };

  const lineText = (addon) => {
    const price = parseFloat(addon.unitPrice) || 0;
    if (addon.pricingBasis === 'per_pound') {
      const est = price * (billedWeight || 0);
      return `$${price.toFixed(2)}/lb${billedWeight ? ` — est. $${est.toFixed(2)}` : ''}`;
    }
    return `$${price.toFixed(2)} each`;
  };

  return (
    <Box mt={4} p={4} borderRadius="xl" border="1px solid" borderColor="gray.200" bg="white">
      <Text fontWeight="700" fontSize="md" color="gray.800" mb={2}>
        Add-Ons & Extras
      </Text>
      <Text fontSize="xs" color="gray.500" mb={3}>
        Optional upgrades for this order.
      </Text>
      <VStack align="stretch" spacing={2}>
        {addons.map((addon) => (
          <Flex
            key={addon.addonId}
            justify="space-between"
            align="center"
            p={2}
            borderRadius="md"
            bg={isSelected(addon.addonId) ? 'blue.50' : 'transparent'}
          >
            <Checkbox
              isChecked={isSelected(addon.addonId)}
              onChange={() => toggle(addon)}
              colorScheme="blue"
            >
              <VStack align="flex-start" spacing={0}>
                <Text fontSize="sm" fontWeight="600">{addon.addonName}</Text>
                <Text fontSize="xs" color="gray.500">{lineText(addon)}</Text>
              </VStack>
            </Checkbox>
            {isSelected(addon.addonId) && addon.pricingBasis === 'per_item' && (
              <HStack spacing={1}>
                <IconButton
                  aria-label="Decrease"
                  size="xs"
                  icon={<Text>−</Text>}
                  onClick={() => setQty(addon, (selected[addon.addonId]?.quantity || 1) - 1)}
                />
                <Input
                  size="xs"
                  w="48px"
                  textAlign="center"
                  type="number"
                  min="1"
                  value={selected[addon.addonId]?.quantity || 1}
                  onChange={(e) => setQty(addon, e.target.value)}
                />
                <IconButton
                  aria-label="Increase"
                  size="xs"
                  icon={<Text>+</Text>}
                  onClick={() => setQty(addon, (selected[addon.addonId]?.quantity || 1) + 1)}
                />
              </HStack>
            )}
          </Flex>
        ))}
      </VStack>

      {Object.keys(selected || {}).length > 0 && onSaveAsDefaultChange && (
        <Checkbox
          mt={3}
          size="sm"
          colorScheme="blue"
          isChecked={Boolean(saveAsDefault)}
          onChange={(e) => onSaveAsDefaultChange(e.target.checked)}
        >
          <Text fontSize="xs" color="gray.600">Save these as my default add-ons for future orders</Text>
        </Checkbox>
      )}
    </Box>
  );
}
