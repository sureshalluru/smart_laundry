import { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  IconButton,
  Switch,
  Heading,
  useToast,
  Divider,
  Spinner,
} from '@chakra-ui/react';
import { FaArrowUp, FaArrowDown, FaPlus, FaTrash } from 'react-icons/fa';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * CategoryConfig — Settings panel for managing item tracking categories.
 * Allows adding, renaming, reordering, and deactivating categories.
 * Integrates into the LaundryInfoManagement settings page.
 */
function CategoryConfig({ laundryId }) {
  const toast = useToast();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    fetchCategories();
  }, [laundryId]);

  const fetchCategories = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/item-tracking/categories?laundryId=${laundryId}&includeInactive=true`
      );
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (e) {
      console.error('Failed to fetch categories:', e);
    }
    setLoading(false);
  };

  const saveCategories = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/item-tracking/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          laundryId,
          categories: categories.map((cat, i) => ({
            categoryId: cat.categoryId || null,
            name: cat.name,
            displayOrder: i,
            isActive: cat.isActive,
          })),
        }),
      });

      if (res.ok) {
        toast({ title: 'Categories saved', status: 'success', duration: 3000 });
        fetchCategories(); // Refresh to get any new IDs
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      toast({ title: 'Failed to save', status: 'error', duration: 3000 });
    }
    setSaving(false);
  };

  const addCategory = () => {
    if (!newCategoryName.trim()) return;
    if (categories.some(c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase())) {
      toast({ title: 'Category already exists', status: 'warning', duration: 3000 });
      return;
    }
    setCategories([
      ...categories,
      {
        categoryId: null,
        name: newCategoryName.trim(),
        displayOrder: categories.length,
        isActive: true,
      },
    ]);
    setNewCategoryName('');
  };

  const moveUp = (index) => {
    if (index === 0) return;
    const newCats = [...categories];
    [newCats[index - 1], newCats[index]] = [newCats[index], newCats[index - 1]];
    setCategories(newCats);
  };

  const moveDown = (index) => {
    if (index === categories.length - 1) return;
    const newCats = [...categories];
    [newCats[index], newCats[index + 1]] = [newCats[index + 1], newCats[index]];
    setCategories(newCats);
  };

  const toggleActive = (index) => {
    const newCats = [...categories];
    newCats[index] = { ...newCats[index], isActive: !newCats[index].isActive };
    setCategories(newCats);
  };

  const rename = (index, newName) => {
    const newCats = [...categories];
    newCats[index] = { ...newCats[index], name: newName };
    setCategories(newCats);
  };

  if (loading) {
    return (
      <Box p={4} textAlign="center">
        <Spinner size="sm" />
      </Box>
    );
  }

  return (
    <Box p={4} borderWidth="1px" borderRadius="md" bg="white">
      <VStack spacing={3} align="stretch">
        <Heading size="sm">Item Tracking Categories</Heading>
        <Text fontSize="xs" color="gray.500">
          Configure the item types used for AI-powered item counting.
        </Text>

        <Divider />

        {categories.map((cat, i) => (
          <HStack key={cat.categoryId || i} spacing={2}>
            <VStack spacing={0}>
              <IconButton
                icon={<FaArrowUp />}
                size="xs"
                variant="ghost"
                isDisabled={i === 0}
                onClick={() => moveUp(i)}
                aria-label="Move up"
              />
              <IconButton
                icon={<FaArrowDown />}
                size="xs"
                variant="ghost"
                isDisabled={i === categories.length - 1}
                onClick={() => moveDown(i)}
                aria-label="Move down"
              />
            </VStack>

            <Input
              size="sm"
              value={cat.name}
              onChange={(e) => rename(i, e.target.value)}
              flex={1}
              opacity={cat.isActive ? 1 : 0.5}
            />

            <Switch
              size="sm"
              isChecked={cat.isActive}
              onChange={() => toggleActive(i)}
              colorScheme="green"
            />
          </HStack>
        ))}

        {/* Add new category */}
        <HStack>
          <Input
            size="sm"
            placeholder="New category name..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          />
          <IconButton
            icon={<FaPlus />}
            size="sm"
            colorScheme="blue"
            onClick={addCategory}
            aria-label="Add category"
          />
        </HStack>

        <Button
          colorScheme="blue"
          size="sm"
          onClick={saveCategories}
          isLoading={saving}
        >
          Save Categories
        </Button>
      </VStack>
    </Box>
  );
}

export default CategoryConfig;
