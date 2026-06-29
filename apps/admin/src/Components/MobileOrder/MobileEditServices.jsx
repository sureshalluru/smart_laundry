import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  IconButton,
  Input,
  InputGroup,
  InputRightAddon,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerCloseButton,
  Divider,
  Badge,
  Spinner,
  useToast,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Icon,
  Center,
} from '@chakra-ui/react';
import { FaPlus, FaMinus, FaTrash, FaShoppingBag, FaTshirt, FaBox, FaEdit } from 'react-icons/fa';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

/**
 * Calculate total price from services and products arrays.
 */
function calculateTotal(services, products) {
  const serviceTotal = services.reduce(
    (sum, svc) =>
      sum + parseFloat(svc.servicePrice || 0) * parseFloat(svc.weightOrCount || 0),
    0
  );
  const productTotal = products.reduce(
    (sum, prod) =>
      sum +
      parseFloat(prod.productPrice || prod.price || 0) *
        parseInt(prod.productCount || 0, 10),
    0
  );
  return Math.round((serviceTotal + productTotal) * 100) / 100;
}

/**
 * MobileEditServices — Drawer component for editing services and products on an order.
 *
 * Props:
 * - order: the current order object
 * - laundryId: the laundry shop ID
 * - isOpen: controls drawer visibility
 * - onClose: callback to close the drawer
 * - onOrderUpdated: callback when order is successfully saved
 */
const MobileEditServices = ({ order, laundryId, isOpen, onClose, onOrderUpdated }) => {
  const toast = useToast();

  // Local editable copies
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);

  // Available services/products for adding
  const [availableServices, setAvailableServices] = useState([]);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Track mutations for the API
  const [servicesToAdd, setServicesToAdd] = useState([]);
  const [servicesToRemove, setServicesToRemove] = useState([]);
  const [productsToAdd, setProductsToAdd] = useState([]);
  const [productsToRemove, setProductsToRemove] = useState([]);
  const [productsToUpdate, setProductsToUpdate] = useState([]);

  // Initialize local state from order when drawer opens
  useEffect(() => {
    if (isOpen && order) {
      setServices((order.services || []).map((svc, idx) => ({ ...svc, _idx: idx })));
      setProducts(
        (order.products || []).map((prod, idx) => ({
          ...prod,
          productPrice: prod.productPrice || prod.price || 0,
          productCount: prod.productCount || prod.product_count || 1,
          productName: prod.productName || prod.product_name || 'Product',
          _idx: idx,
        }))
      );
      // Reset mutation tracking
      setServicesToAdd([]);
      setServicesToRemove([]);
      setProductsToAdd([]);
      setProductsToRemove([]);
      setProductsToUpdate([]);
    }
  }, [isOpen, order]);

  // Fetch available services and products
  const fetchAvailable = useCallback(async () => {
    if (!laundryId) return;
    setLoadingAvailable(true);
    try {
      const authToken = localStorage.getItem('idToken');
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      // Fetch services
      const servicesRes = await axios.get(`${API_URL}/api/admin/orders-info`, {
        params: { operation: 'fetchServices', laundryId },
        headers,
      });
      const servicesData =
        servicesRes.data?.body?.data || servicesRes.data?.laundryServices || [];
      setAvailableServices(servicesData);

      // Fetch products
      const productsRes = await axios.get(`${API_URL}/api/admin/laundry-products-info`, {
        params: { operation: 'viewAllProducts', laundryId },
        headers,
      });
      const productsData = Object.values(productsRes.data?.body?.products || {});
      setAvailableProducts(productsData);
    } catch (err) {
      console.error('Failed to fetch available services/products:', err);
      toast({
        title: 'Error',
        description: 'Failed to load available services. Please try again.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoadingAvailable(false);
    }
  }, [laundryId, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchAvailable();
    }
  }, [isOpen, fetchAvailable]);

  // --- Service Handlers ---

  const handleServiceQtyChange = (index, delta) => {
    setServices((prev) =>
      prev.map((svc, i) => {
        if (i !== index) return svc;
        const newVal = Math.max(0.1, parseFloat(svc.weightOrCount || 0) + delta);
        const rounded = Math.round(newVal * 10) / 10;
        return { ...svc, weightOrCount: svc.inputWeight ? rounded : Math.max(1, Math.round(newVal)) };
      })
    );
  };

  const handleServiceWeightChange = (index, value) => {
    setServices((prev) =>
      prev.map((svc, i) => (i === index ? { ...svc, weightOrCount: value } : svc))
    );
  };

  const handleRemoveService = (index) => {
    if (services.length <= 1) {
      toast({
        title: 'Cannot Remove',
        description: 'At least one service is required.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    const removed = services[index];
    setServices((prev) => prev.filter((_, i) => i !== index));
    // Track removal
    setServicesToRemove((prev) => [...prev, removed.id || removed.service]);
    // Remove from additions if it was just added
    setServicesToAdd((prev) =>
      prev.filter((s) => s.service !== removed.service)
    );
  };

  const handleAddService = (svc) => {
    const newService = {
      service: svc.serviceName,
      weightOrCount: svc.inputWeight ? 0.1 : 1,
      servicePrice: svc.price || svc.servicePrice || 0,
      inputWeight: svc.inputWeight || false,
    };
    setServices((prev) => [...prev, newService]);
    setServicesToAdd((prev) => [...prev, newService]);
    // Remove from removals if it was previously removed
    setServicesToRemove((prev) =>
      prev.filter((id) => id !== svc.serviceName)
    );
  };

  // --- Product Handlers ---

  const handleProductCountChange = (index, delta) => {
    setProducts((prev) =>
      prev.map((prod, i) => {
        if (i !== index) return prod;
        const newCount = Math.max(1, parseInt(prod.productCount || 1, 10) + delta);
        return { ...prod, productCount: newCount };
      })
    );
    // Track product update
    const updatedProd = products[index];
    if (updatedProd) {
      const newCount = Math.max(1, parseInt(updatedProd.productCount || 1, 10) + delta);
      setProductsToUpdate((prev) => {
        const exists = prev.find((p) => p.productName === updatedProd.productName);
        if (exists) {
          return prev.map((p) =>
            p.productName === updatedProd.productName
              ? { ...p, productCount: newCount }
              : p
          );
        }
        return [...prev, { productName: updatedProd.productName, productCount: newCount }];
      });
    }
  };

  const handleRemoveProduct = (index) => {
    const removed = products[index];
    setProducts((prev) => prev.filter((_, i) => i !== index));
    // Track removal
    setProductsToRemove((prev) => [...prev, removed.productName]);
    // Remove from additions if it was just added
    setProductsToAdd((prev) =>
      prev.filter((p) => p.productName !== removed.productName)
    );
    // Remove from updates
    setProductsToUpdate((prev) =>
      prev.filter((p) => p.productName !== removed.productName)
    );
  };

  const handleAddProduct = (prod) => {
    const newProduct = {
      productName: prod.productName,
      productPrice: prod.price || prod.productPrice || 0,
      productCount: 1,
    };
    setProducts((prev) => [...prev, newProduct]);
    setProductsToAdd((prev) => [...prev, { productName: prod.productName, productCount: 1 }]);
    // Remove from removals if previously removed
    setProductsToRemove((prev) =>
      prev.filter((name) => name !== prod.productName)
    );
  };

  // --- Save ---

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const authToken = localStorage.getItem('idToken');
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      const payload = {
        orderStatus: order.orderStatus,
        servicesToUpdate: services.map(({ _idx, ...svc }) => svc),
      };

      if (servicesToAdd.length > 0) {
        payload.servicesToAdd = servicesToAdd;
      }
      if (servicesToRemove.length > 0) {
        payload.servicesToRemove = servicesToRemove;
      }
      if (productsToAdd.length > 0) {
        payload.productsToAdd = productsToAdd.map(({ productName, productCount }) => ({
          productName,
          productCount,
        }));
      }
      if (productsToRemove.length > 0) {
        payload.productsToRemove = productsToRemove;
      }
      if (productsToUpdate.length > 0) {
        payload.productsToUpdate = productsToUpdate.map(({ productName, productCount }) => ({
          productName,
          productCount,
        }));
      }

      const response = await axios.put(`${API_URL}/api/admin/update-order`, payload, {
        params: {
          operation: 'updateOrder',
          orderId: order.orderId,
          laundryId: laundryId,
          empId: '',
        },
        headers,
      });

      const statusCode = response.data?.statusCode;

      if (statusCode === 200) {
        toast({
          title: 'Order Updated',
          description: 'Services and products updated successfully.',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        if (onOrderUpdated) {
          onOrderUpdated();
        }
        onClose();
      } else {
        const errorMsg = response.data?.body?.message || 'Failed to update order.';
        toast({
          title: 'Update Failed',
          description: errorMsg,
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    } catch (err) {
      console.error('Failed to save order:', err);
      toast({
        title: 'Error',
        description: 'Failed to save changes. Please try again.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Computed
  const newTotal = calculateTotal(services, products);

  // Filter available services/products that aren't already in the order
  const existingServiceNames = services.map((s) => (s.service || '').toLowerCase());
  const filteredAvailableServices = availableServices.filter(
    (s) => !existingServiceNames.includes((s.serviceName || '').toLowerCase())
  );

  const existingProductNames = products.map((p) => (p.productName || '').toLowerCase());
  const filteredAvailableProducts = availableProducts.filter(
    (p) => !existingProductNames.includes((p.productName || '').toLowerCase())
  );

  return (
    <Drawer isOpen={isOpen} placement="bottom" onClose={onClose} size="full">
      <DrawerOverlay />
      <DrawerContent maxH="90vh" borderTopRadius="xl">
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px" fontSize="md" py={3}>
          <HStack spacing={2}>
            <Icon as={FaEdit} color="orange.500" />
            <Text>Edit Services & Products</Text>
          </HStack>
        </DrawerHeader>

        <DrawerBody px={3} py={3} overflowY="auto">
          {loadingAvailable ? (
            <Center py={8}>
              <Spinner size="lg" color="blue.500" />
            </Center>
          ) : (
            <Tabs variant="soft-rounded" colorScheme="blue" size="sm">
              <TabList mb={3}>
                <Tab minH="44px" fontSize="xs">
                  <Icon as={FaTshirt} mr={1} /> Services ({services.length})
                </Tab>
                <Tab minH="44px" fontSize="xs">
                  <Icon as={FaBox} mr={1} /> Products ({products.length})
                </Tab>
                <Tab minH="44px" fontSize="xs">
                  <Icon as={FaPlus} mr={1} /> Add New
                </Tab>
              </TabList>

              <TabPanels>
                {/* Current Services Tab */}
                <TabPanel px={0}>
                  <VStack spacing={3} align="stretch">
                    {services.length === 0 ? (
                      <Text fontSize="sm" color="gray.500" textAlign="center" py={4}>
                        No services on this order
                      </Text>
                    ) : (
                      services.map((svc, idx) => (
                        <Box
                          key={`svc-${idx}-${svc.service}`}
                          bg="white"
                          border="1px solid"
                          borderColor="gray.200"
                          borderRadius="lg"
                          p={3}
                        >
                          <HStack justify="space-between" mb={2}>
                            <VStack align="start" spacing={0} flex={1}>
                              <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
                                {svc.service || svc.serviceName || 'Service'}
                              </Text>
                              <Text fontSize="xs" color="gray.500">
                                ${parseFloat(svc.servicePrice || 0).toFixed(2)}
                                {svc.inputWeight ? '/lb' : '/piece'}
                              </Text>
                            </VStack>
                            <IconButton
                              icon={<FaTrash />}
                              size="sm"
                              variant="ghost"
                              colorScheme="red"
                              minH="44px"
                              minW="44px"
                              onClick={() => handleRemoveService(idx)}
                              aria-label="Remove service"
                            />
                          </HStack>

                          <HStack justify="space-between" align="center">
                            {svc.inputWeight ? (
                              <InputGroup size="sm" maxW="150px">
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0.1"
                                  value={svc.weightOrCount || ''}
                                  onChange={(e) =>
                                    handleServiceWeightChange(idx, e.target.value)
                                  }
                                  textAlign="center"
                                  bg="gray.50"
                                  minH="44px"
                                />
                                <InputRightAddon minH="44px">lbs</InputRightAddon>
                              </InputGroup>
                            ) : (
                              <HStack spacing={2}>
                                <IconButton
                                  icon={<FaMinus />}
                                  size="sm"
                                  variant="outline"
                                  colorScheme="gray"
                                  minH="44px"
                                  minW="44px"
                                  onClick={() => handleServiceQtyChange(idx, -1)}
                                  isDisabled={parseInt(svc.weightOrCount || 1) <= 1}
                                  aria-label="Decrease quantity"
                                />
                                <Text
                                  fontSize="md"
                                  fontWeight="bold"
                                  minW="30px"
                                  textAlign="center"
                                >
                                  {parseInt(svc.weightOrCount || 1)}
                                </Text>
                                <IconButton
                                  icon={<FaPlus />}
                                  size="sm"
                                  variant="outline"
                                  colorScheme="gray"
                                  minH="44px"
                                  minW="44px"
                                  onClick={() => handleServiceQtyChange(idx, 1)}
                                  aria-label="Increase quantity"
                                />
                              </HStack>
                            )}

                            <Text fontSize="sm" fontWeight="bold" color="blue.600">
                              $
                              {(
                                parseFloat(svc.servicePrice || 0) *
                                parseFloat(svc.weightOrCount || 0)
                              ).toFixed(2)}
                            </Text>
                          </HStack>
                        </Box>
                      ))
                    )}
                  </VStack>
                </TabPanel>

                {/* Current Products Tab */}
                <TabPanel px={0}>
                  <VStack spacing={3} align="stretch">
                    {products.length === 0 ? (
                      <Text fontSize="sm" color="gray.500" textAlign="center" py={4}>
                        No products on this order
                      </Text>
                    ) : (
                      products.map((prod, idx) => (
                        <Box
                          key={`prod-${idx}-${prod.productName}`}
                          bg="white"
                          border="1px solid"
                          borderColor="gray.200"
                          borderRadius="lg"
                          p={3}
                        >
                          <HStack justify="space-between" mb={2}>
                            <VStack align="start" spacing={0} flex={1}>
                              <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
                                {prod.productName}
                              </Text>
                              <Text fontSize="xs" color="gray.500">
                                ${parseFloat(prod.productPrice || 0).toFixed(2)} each
                              </Text>
                            </VStack>
                            <IconButton
                              icon={<FaTrash />}
                              size="sm"
                              variant="ghost"
                              colorScheme="red"
                              minH="44px"
                              minW="44px"
                              onClick={() => handleRemoveProduct(idx)}
                              aria-label="Remove product"
                            />
                          </HStack>

                          <HStack justify="space-between" align="center">
                            <HStack spacing={2}>
                              <IconButton
                                icon={<FaMinus />}
                                size="sm"
                                variant="outline"
                                colorScheme="gray"
                                minH="44px"
                                minW="44px"
                                onClick={() => handleProductCountChange(idx, -1)}
                                isDisabled={parseInt(prod.productCount || 1) <= 1}
                                aria-label="Decrease count"
                              />
                              <Text
                                fontSize="md"
                                fontWeight="bold"
                                minW="30px"
                                textAlign="center"
                              >
                                {parseInt(prod.productCount || 1)}
                              </Text>
                              <IconButton
                                icon={<FaPlus />}
                                size="sm"
                                variant="outline"
                                colorScheme="gray"
                                minH="44px"
                                minW="44px"
                                onClick={() => handleProductCountChange(idx, 1)}
                                aria-label="Increase count"
                              />
                            </HStack>

                            <Text fontSize="sm" fontWeight="bold" color="blue.600">
                              $
                              {(
                                parseFloat(prod.productPrice || 0) *
                                parseInt(prod.productCount || 1, 10)
                              ).toFixed(2)}
                            </Text>
                          </HStack>
                        </Box>
                      ))
                    )}
                  </VStack>
                </TabPanel>

                {/* Add New Tab */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    {/* Add Services Section */}
                    <Box>
                      <Text fontSize="sm" fontWeight="bold" color="gray.700" mb={2}>
                        <Icon as={FaTshirt} mr={1} /> Available Services
                      </Text>
                      {filteredAvailableServices.length === 0 ? (
                        <Text fontSize="xs" color="gray.400" textAlign="center" py={2}>
                          All services already added
                        </Text>
                      ) : (
                        <VStack spacing={2} align="stretch">
                          {filteredAvailableServices.map((svc) => (
                            <Button
                              key={svc.serviceName}
                              variant="outline"
                              colorScheme="blue"
                              size="md"
                              minH="44px"
                              justifyContent="space-between"
                              onClick={() => handleAddService(svc)}
                              width="100%"
                            >
                              <Text fontSize="xs" noOfLines={1} flex={1} textAlign="left">
                                {svc.serviceName}
                              </Text>
                              <Badge colorScheme="blue" fontSize="2xs" ml={2}>
                                ${parseFloat(svc.price || 0).toFixed(2)}
                                {svc.inputWeight ? '/lb' : '/pc'}
                              </Badge>
                            </Button>
                          ))}
                        </VStack>
                      )}
                    </Box>

                    <Divider />

                    {/* Add Products Section */}
                    <Box>
                      <Text fontSize="sm" fontWeight="bold" color="gray.700" mb={2}>
                        <Icon as={FaBox} mr={1} /> Available Products
                      </Text>
                      {filteredAvailableProducts.length === 0 ? (
                        <Text fontSize="xs" color="gray.400" textAlign="center" py={2}>
                          All products already added
                        </Text>
                      ) : (
                        <VStack spacing={2} align="stretch">
                          {filteredAvailableProducts.map((prod) => (
                            <Button
                              key={prod.productName}
                              variant="outline"
                              colorScheme="green"
                              size="md"
                              minH="44px"
                              justifyContent="space-between"
                              onClick={() => handleAddProduct(prod)}
                              width="100%"
                            >
                              <Text fontSize="xs" noOfLines={1} flex={1} textAlign="left">
                                {prod.productName}
                              </Text>
                              <Badge colorScheme="green" fontSize="2xs" ml={2}>
                                ${parseFloat(prod.price || prod.productPrice || 0).toFixed(2)}
                              </Badge>
                            </Button>
                          ))}
                        </VStack>
                      )}
                    </Box>
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>
          )}
        </DrawerBody>

        <DrawerFooter borderTopWidth="1px" flexDirection="column" px={3} py={3}>
          {/* Order Total */}
          <HStack justify="space-between" w="100%" mb={3}>
            <Text fontSize="sm" fontWeight="bold" color="gray.700">
              New Subtotal:
            </Text>
            <Text fontSize="lg" fontWeight="bold" color="blue.600">
              ${newTotal.toFixed(2)}
            </Text>
          </HStack>

          {/* Action Buttons */}
          <HStack w="100%" spacing={3}>
            <Button
              variant="outline"
              colorScheme="gray"
              flex={1}
              minH="44px"
              onClick={onClose}
              isDisabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              flex={1}
              minH="44px"
              onClick={handleSave}
              isLoading={isSaving}
              loadingText="Saving..."
              leftIcon={<FaShoppingBag />}
            >
              Save Changes
            </Button>
          </HStack>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default MobileEditServices;
