import React, { useEffect, useState } from "react";
import {
  Box,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Spinner,
  Flex,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerCloseButton,
  Button,
  Text,
  Stack,
  Divider,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Input,
  FormControl,
  FormLabel,
  IconButton,
  useToast,
  Menu,
  MenuItem,
  MenuButton,
  MenuList,
  InputGroup,
  InputLeftAddon
} from "@chakra-ui/react";
import { EditIcon, DeleteIcon } from "@chakra-ui/icons";
import axios from "axios";
import { useParams } from "react-router-dom";

const PromotionsPage = ({ validateEmpCredentials, fetchLaundryServices, empPrefix }) => {
  const { laundryId } = useParams();
  const [promotions, setPromotions] = useState([]);
  const [promotionsToAdd, setPromotionsToAdd] = useState([]);
  const [promotionsToDelete, setPromotionsToDelete] = useState([]);
  const [promotionsToEdit, setPromotionsToEdit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const [validationTouched, setValidationTouched] = useState({});
  const [availableServices, setAvailableServices] = useState([]);
  const [isPromoUpdating, setIsPromoUpdating] = useState(false);
  const [isEmployeeValidating, setIsEmployeeValidating] = useState(false);
  const [newPromotion, setNewPromotion] = useState({
    promoName: "",
    description: "",
    startDate: "",
    endDate: "",
    discountType: "percentage",
    discountValue: 0,
    applyOnWholeOrder: true, // Default to Whole Order
    minimumOrderValue: 0,
    specificServices: [], // Initialize as an empty array
    usageLimitPerCustomer: 0,
    isActive: true,
  });
  

  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isEditModalOpen,
    onOpen: onEditModalOpen,
    onClose: onEditModalClose,
  } = useDisclosure();
  const {
    isOpen: isAddPromotionOpen,
    onOpen: onAddPromotionOpen,
    onClose: onAddPromotionClose,
  } = useDisclosure();
  const authToken = localStorage.getItem('idToken');



  // Fetch promotions from API
  const fetchPromotions = async () => {
    try {
      const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info?operation=viewPromotions&laundryId=${laundryId}`;

      const response = await axios.get(url, {
        headers: {
          // "x-api-key": process.env.REACT_APP_AWS_API_KEY
          'Authorization': `Bearer ${authToken}`
        },
      });

      // Convert the object into an array of promotions for easier rendering
      const promotionsArray = Object.entries(response.data.body.promotions).map(
        ([promoCode, promoDetails]) => ({
          promoCode,
          ...promoDetails,
        })
      );

      setPromotions(promotionsArray);
      // console.log("promotionsArray: ",promotionsArray);
      setLoading(false);
    } catch (err) {
      setError("Failed to load promotions.");
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchPromotions();
  }, []); 


  const handlePromoClick = (promo) => {
    setSelectedPromotion(promo);
    onOpen();
  };

  const handleEditPromotions = async () => {
    setIsEmployeeValidating(true);
    try {
        // Validate credentials and retrieve role
        const fullEmpId = empPrefix + employeeId;
        const { isValidated, role } = await validateEmpCredentials(laundryId, fullEmpId, passcode);

        if (isValidated && (role === "Admin" || role === "Manager")) {
            toast({
                title: "Validation Success",
                description: `Access granted. Role: ${role}. You can now edit promotions.`,
                status: "success",
                duration: 3000,
                isClosable: true,
                position: "top",
            });

            setEditMode(true);
            onEditModalClose(); // Close the modal after successful validation
        } else {
            const errorMessage = isValidated
                ? `Unauthorized action. Your role: ${role}. Only Admins and Managers can edit promotions.`
                : "Invalid Employee ID or Passcode. Please try again.";

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
        console.error("Error validating credentials:", error);
        toast({
            title: "Error",
            description: "An error occurred while validating credentials.",
            status: "error",
            duration: 3000,
            isClosable: true,
            position: "top",
        });

    }
    finally {
      setEmployeeId('');
      setPasscode('');
      setIsEmployeeValidating(false);
    }
};

  const validatePromotion = (promotion) => {
    const errors = {};
  
    if (!promotion.promoName?.trim()) {
      errors.promoName = "Promotion Name is required";
    }
    if (!promotion.description?.trim()) {
      errors.description = "Promotion Description is required";
    }
    if (!promotion.startDate) {
      errors.startDate = "Start Date is required";
    }
    if (!promotion.endDate) {
      errors.endDate = "End Date is required";
    }
    if (!promotion.discountType) {
      errors.discountType = "Discount Type is required";
    }
    if (!promotion.discountValue || promotion.discountValue <= 0) {
      errors.discountValue = "Discount Value must be greater than 0";
    }
    if (!promotion.minimumOrderValue || promotion.minimumOrderValue <= 0) {
      errors.minimumOrderValue = "Minimum Order Value is required";
    }
    if (promotion.applyOnWholeOrder === undefined || promotion.applyOnWholeOrder === null) {
      errors.applyOnWholeOrder = "ApplyOnWholeOrder is required";
    }
    if (!promotion.usageLimitPerCustomer || promotion.usageLimitPerCustomer <= 0) {
      errors.usageLimitPerCustomer = "Usage Limit must be greater than 0";
    }
    if (
      !promotion.applyOnWholeOrder &&
      (!promotion.specificServices || promotion.specificServices.length === 0)
    ) {
      errors.specificServices = "At least one specific service is required";
    }
  
    return errors;
  };

  const handleAddPromotion = () => {
    const errors = validatePromotion(newPromotion);
  
    if (Object.keys(errors).length === 0) {
      const newPromo = {
        ...newPromotion,
        promoCode: `TEMP-${Date.now()}`, // Temporary promoCode for new promotions
        promoName: newPromotion.promotionName, // Ensure promoName is explicitly set
      };
  
      setPromotionsToAdd([...promotionsToAdd, newPromotion]);
      setPromotions([...promotions, newPromo]); // Add to promotions list
  
      // Reset the form
      setNewPromotion({
        promoName: "", 
        description: "", 
        startDate: "", 
        endDate: "", 
        discountType: "percentage", 
        discountValue: 0, 
        applyOnWholeOrder: true, 
        minimumOrderValue: 0, 
        specificServices: [], 
        usageLimitPerCustomer: 0, 
        isActive: true, 
      });
      
      setValidationErrors({});
      onAddPromotionClose();
    } else {
      setValidationErrors(errors);
      Object.values(errors).forEach((error) =>
        toast({
          title: "Validation Error",
          description: error,
          status: "error",
          duration: 3000,
          isClosable: true,
          position: "top",
        })
      );
    }
  };
  
  const handleAddPromotionFieldChange = (field, value) => {
    setNewPromotion({ ...newPromotion, [field]: value });
  
    // If the field is already touched, validate it
    if (validationTouched[field]) {
      const errors = validatePromotionField(field, value);
      setValidationErrors({ ...validationErrors, ...errors });
    }
  };
  
  const handleFieldBlur = (field) => {
    setValidationTouched({ ...validationTouched, [field]: true });
  
    // Validate the field when blurred
    const errors = validatePromotionField(field, newPromotion[field]);
    setValidationErrors({ ...validationErrors, ...errors });
  };
  
  const validatePromotionField = (field, value) => {
    const errors = {};
    if (!value || value.trim() === "") {
      errors[field] = `${field} is required`;
    }
    return errors;
  };

  // Handle delete promotion
  const handleDeletePromotion = (promoCode) => {
    setPromotionsToDelete([...promotionsToDelete, promoCode]);
    setPromotions(promotions.filter((promo) => promo.promoCode !== promoCode));
  };

  // Handle save changes
  const handleSaveChanges = async () => {
    if (
      promotionsToAdd.length === 0 &&
      promotionsToDelete.length === 0 &&
      promotionsToEdit.length === 0
    ) {
      toast({
        title: "No Changes",
        description: "No promotions were added, updated, or removed.",
        status: "info",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
      setEditMode(false);
      return; // Exit early since no changes were made
    }

    const payload = {
      promotionsToAdd: promotionsToAdd.map((promo) => ({
        promoName: promo.promoName, // Promotion name
        description: promo.description, // Description of the promotion
        startDate: promo.startDate, // Start date
        endDate: promo.endDate, // End date
        discountType: promo.discountType || "percentage", // Discount type, default to "percentage"
        discountValue: parseFloat(promo.discountValue) || 0, // Discount value, default to 0
        applyOnWholeOrder: promo.applyOnWholeOrder !== undefined ? promo.applyOnWholeOrder : true, // Apply on whole order, default to true
        minimumOrderValue: parseFloat(promo.minimumOrderValue) || 0, // Minimum order value, default to 0
        specificServices: (promo.specificServices || []).map((service) => ({
          serviceName: service.serviceName || "", // Service name
          weightOrCountLimit: service.weightOrCountLimit || 0, // Weight or count limit, default to 0
        })),
        usageLimitPerCustomer: parseInt(promo.usageLimitPerCustomer, 10) || 0, // Usage limit per customer, default to 0
        isActive: promo.isActive !== undefined ? promo.isActive : true, // Promotion active status, default to true
      })),
      promotionsToUpdate: promotionsToEdit.map((promo) => ({
        promoCode: promo.promoCode || "", // Promotion code
        description: promo.description || "", // Description of the promotion
      })),
      promotionsToRemove: promotionsToDelete || [], // Promotions to remove, default to empty array
    };
    
    // console.log("payload for promotions: ", payload);
    const params = {
      operation: "updatePromotions",
      laundryId: laundryId,
    };
    setIsPromoUpdating(true);
    try {
      const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-products-services`;
      const response = await axios.post(url, payload, {
        params,
        headers: {
          // "x-api-key": process.env.REACT_APP_AWS_API_KEY,
          'Authorization': `Bearer ${authToken}`

        },
      });
      toast({
        title: "Success",
        description: response.data.body.message,
        status: "success",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
      // Reset local states after successful API call
      fetchPromotions()
      setPromotionsToAdd([]);
      setPromotionsToDelete([]);
      setPromotionsToEdit([]);
      setEditMode(false);
      // console.log(response.data);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to save changes.",
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
      console.error(err);
    }
    finally {
      setIsPromoUpdating(false);
    }
  };

  const handleOpenAddPromotionModal = async () => {
    try {
      setLoading(true); // Set loading state while fetching services
      const services = await fetchLaundryServices(laundryId); // Fetch services
      // console.log("services fetching in promotion modal: ",services)
      setAvailableServices(services);
      onAddPromotionOpen(); // Open the modal after fetching services
    } catch (error) {
      console.error("Error fetching services:", error);
      toast({
        title: "Error",
        description: "Failed to fetch available services.",
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
    } finally {
      setLoading(false);
    }
  };
  

  return (
    <Box p={4}>

      {loading ? (
        <Flex justify="center" align="center" h="50vh">
          <Spinner size="lg" />
        </Flex>
      ) : error ? (
        <Text color="red.500" textAlign="center">
          {error}
        </Text>
      ) : (
        <Box overflowX="auto" maxW="100%">
          <Table variant="simple" size="sm" colorScheme="blue" border="1px solid" borderColor="gray.200">
                              <Thead bg="#EBF8FF">
          
              <Tr>
                <Th fontSize="sm">Promo Code</Th>
                <Th fontSize="sm">Promotion Name</Th>
                <Th fontSize="sm">Discount</Th>
                {/* <Th fontSize="sm">Applied On</Th> */}
                <Th fontSize="sm">Active</Th>
                {editMode && <Th fontSize="sm">Actions</Th>}
              </Tr>
            </Thead>
            <Tbody bg="#F7FAFC">
              {promotions.map((promo) => (
                <Tr key={promo.promoCode}>
                  <Td>
                    <Button
                      size="xs"
                      variant="link"
                      colorScheme="blue"
                      onClick={() => handlePromoClick(promo)}
                    >
                      {promo.promoCode}
                    </Button>
                  </Td>
                  <Td fontSize="sm">{promo.promoName || "N/A"}</Td>
                  <Td fontSize="sm">
                    {promo.discountType === "percentage"
                      ? `${promo.discountValue}%`
                      : `$${promo.discountValue}`}
                  </Td>
                  {/* <Td fontSize="sm">
                    {promo.appliedOn === "specificServices"
                      ? `Services: ${
                          promo.specificServices?.map((s) => s.serviceName).join(", ") || "N/A"
                        }`
                      : "Whole Order"}
                  </Td> */}
                  <Td>
                    <Badge
                      fontSize="0.8em"
                      colorScheme={promo.isActive ? "green" : "red"}
                    >
                      {promo.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                  {editMode && (
                    <Td>
                      <IconButton
                        icon={<DeleteIcon />}
                        aria-label="Delete Promotion"
                        size="sm"
                        variant="ghost"
                        colorScheme="red"
                        onClick={() => handleDeletePromotion(promo.promoCode)}
                      />
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      {editMode && (
        <Flex justify="space-between" mt={4}>
          <Button size="sm" colorScheme="green" onClick={handleOpenAddPromotionModal}>
            Add Promotion
          </Button>
          <Button size="sm" colorScheme="blue" onClick={handleSaveChanges} isLoading={isPromoUpdating}>
            Save Changes
          </Button>
        </Flex>
      )}

      {!editMode && (
        <Flex justify="center" mt={4}>
          <Button size="sm" colorScheme="blue" onClick={onEditModalOpen}>
            Edit Promotions
          </Button>
        </Flex>
      )}

      {/* Drawer for Promotion Details */}
      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="md">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>
            {selectedPromotion?.promoName || "Promotion Details"}
          </DrawerHeader>
          <DrawerBody>
            {selectedPromotion ? (
              <Stack spacing={4}>
                <Box>
                  <Text fontWeight="bold">Promo Code:</Text>
                  <Text>{selectedPromotion.promoCode}</Text>
                </Box>
                <Box>
                  <Text fontWeight="bold">Promotion Name:</Text>
                  <Text>{selectedPromotion.promoName || "N/A"}</Text>
                </Box>
                <Box>
                  <Text fontWeight="bold">Active:</Text>
                  <Badge colorScheme={selectedPromotion.isActive ? "green" : "red"}>
                    {selectedPromotion.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Text fontWeight="bold">Validity:</Text>
                  <Text>
                    {new Date(selectedPromotion.startDate).toLocaleDateString()} -{" "}
                    {new Date(selectedPromotion.endDate).toLocaleDateString()}
                  </Text>
                </Box>
                <Box>
                  <Text fontWeight="bold">Description:</Text>
                  <Text>{selectedPromotion.description || "N/A"}</Text>
                </Box>
                <Box>
                  <Text fontWeight="bold">Discount:</Text>
                  <Text>
                    {selectedPromotion.discountType === "percentage"
                      ? `${selectedPromotion.discountValue}%`
                      : `$${selectedPromotion.discountValue}`}
                  </Text>
                </Box>
                <Box>
                  <Text fontWeight="bold">Minimum Order Value:</Text>
                  <Text>{selectedPromotion.minimumOrderValue || "N/A"}</Text>
                </Box>
                
                
                <Box>
                  <Text fontWeight="bold">Applied On:</Text>
                  <Text>
                    {!selectedPromotion.applyOnWholeOrder
                      ? `Specific Services: ${selectedPromotion.specificServices
                          ?.map((service) => service.serviceName)
                          .join(", ") || "N/A"}`
                      : "Whole Order"}
                  </Text>
                </Box>
                <Box>
                  <Text fontWeight="bold">Usage Limit Per Customer:</Text>
                  <Text>{selectedPromotion.usageLimitPerCustomer || "N/A"}</Text>
                </Box>

                
              </Stack>
            ) : (
              <Text>No promotion selected</Text>
            )}
          </DrawerBody>
          <DrawerFooter>
            <Button colorScheme="blue" onClick={onClose}>
              Close
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Edit Promotions Modal */}
      <Modal isOpen={isEditModalOpen} onClose={onEditModalClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Enter Employee Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl>
              <FormLabel>Employee ID</FormLabel>
              <InputGroup mb={4}>
                <InputLeftAddon>{empPrefix}</InputLeftAddon>
                <Input
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                />
              </InputGroup>
              
            </FormControl>
            <FormControl mt={4}>
              <FormLabel>Passcode</FormLabel>
              <Input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={handleEditPromotions} isLoading={isEmployeeValidating}>
              Validate
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Add New Promotion Modal */}
<Modal isOpen={isAddPromotionOpen} onClose={onAddPromotionClose}>
  <ModalOverlay />
  <ModalContent>
    <ModalHeader>Add New Promotion</ModalHeader>
    <ModalCloseButton />
    <ModalBody>
      <Stack spacing={4}>
        {/* Promotion Name */}
        <FormControl isInvalid={validationErrors.promoName}>
          <FormLabel>
            Promotion Name <Text as="span" color="red.500">*</Text>
          </FormLabel>
          <Input
            value={newPromotion.promoName}
            onChange={(e) => handleAddPromotionFieldChange("promoName", e.target.value)}
            onBlur={() => handleFieldBlur("promoName")}
          />
          {validationErrors.promoName && (
            <Text color="red.500">{validationErrors.promoName}</Text>
          )}
        </FormControl>

        {/* Description */}
        <FormControl isInvalid={validationErrors.description}>
          <FormLabel>
            Description <Text as="span" color="red.500">*</Text>
          </FormLabel>
          <Input
            value={newPromotion.description}
            onChange={(e) => handleAddPromotionFieldChange("description", e.target.value)}
            onBlur={() => handleFieldBlur("description")}
          />
          {validationErrors.description && (
            <Text color="red.500">{validationErrors.description}</Text>
          )}
        </FormControl>

        {/* Start Date */}
        <FormControl isInvalid={validationErrors.startDate}>
          <FormLabel>
            Start Date <Text as="span" color="red.500">*</Text>
          </FormLabel>
          <Input
            type="date"
            value={newPromotion.startDate}
            onChange={(e) => handleAddPromotionFieldChange("startDate", e.target.value)}
            onBlur={() => handleFieldBlur("startDate")}
          />
          {validationErrors.startDate && (
            <Text color="red.500">{validationErrors.startDate}</Text>
          )}
        </FormControl>

        {/* End Date */}
        <FormControl isInvalid={validationErrors.endDate}>
          <FormLabel>
            End Date <Text as="span" color="red.500">*</Text>
          </FormLabel>
          <Input
            type="date"
            value={newPromotion.endDate}
            onChange={(e) => handleAddPromotionFieldChange("endDate", e.target.value)}
            onBlur={() => handleFieldBlur("endDate")}
          />
          {validationErrors.endDate && (
            <Text color="red.500">{validationErrors.endDate}</Text>
          )}
        </FormControl>

        {/* Discount Type */}
        <FormControl isInvalid={validationErrors.discountType}>
          <FormLabel>
            Discount Type <Text as="span" color="red.500">*</Text>
          </FormLabel>
          <Menu>
            <MenuButton as={Button} rightIcon="▼">
              {newPromotion.discountType || "Select Discount Type"}
            </MenuButton>
            <MenuList>
              <MenuItem onClick={() => handleAddPromotionFieldChange("discountType", "percentage")}>
                Percentage
              </MenuItem>
              <MenuItem onClick={() => handleAddPromotionFieldChange("discountType", "amount")}>
                Amount
              </MenuItem>
            </MenuList>
          </Menu>
          {validationErrors.discountType && (
            <Text color="red.500">{validationErrors.discountType}</Text>
          )}
        </FormControl>

        {/* Discount Value */}
        <FormControl isInvalid={validationErrors.discountValue}>
          <FormLabel>
            Discount Value <Text as="span" color="red.500">*</Text>
          </FormLabel>
          <Input
            type="number"
            value={newPromotion.discountValue}
            onChange={(e) => handleAddPromotionFieldChange("discountValue", e.target.value)}
            onBlur={() => handleFieldBlur("discountValue")}
          />
          {validationErrors.discountValue && (
            <Text color="red.500">{validationErrors.discountValue}</Text>
          )}
        </FormControl>

        {/* Minimum Order Value */}
        <FormControl isInvalid={validationErrors.minimumOrderValue}>
          <FormLabel>Minimum Order Value</FormLabel>
          <Input
            type="number"
            value={newPromotion.minimumOrderValue}
            onChange={(e) => handleAddPromotionFieldChange("minimumOrderValue", e.target.value)}
          />
        </FormControl>

        {/* Applied On: Whole Order or Specific Services */}
        <FormControl isInvalid={validationErrors.applyOnWholeOrder}>
          <FormLabel>
            Apply On Whole Order <Text as="span" color="red.500">*</Text>
          </FormLabel>
          <Menu>
            <MenuButton as={Button} rightIcon="▼">
              {newPromotion.applyOnWholeOrder ? "True" : "False"}
            </MenuButton>
            <MenuList>
              <MenuItem
                onClick={() =>
                  setNewPromotion((prev) => ({ ...prev, applyOnWholeOrder: true }))
                }
              >
                True
              </MenuItem>
              <MenuItem
                onClick={() =>
                  setNewPromotion((prev) => ({ ...prev, applyOnWholeOrder: false }))
                }
              >
                False
              </MenuItem>
            </MenuList>
          </Menu>
        </FormControl>

        {/* Specific Services Section - Shown only if applyOnWholeOrder is false */}
        {!newPromotion.applyOnWholeOrder && (
          <FormControl isInvalid={validationErrors.specificServices}>
          <FormLabel>Specific Services</FormLabel>
          <Stack spacing={4}>
            {/* Table for Selected Services */}
            <Table variant="simple" size="sm" colorScheme="teal">
              <Thead>
                <Tr>
                  <Th>Service Name</Th>
                  <Th>Weight/Count Limit</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {newPromotion.specificServices.map((service, index) => (
                  <Tr key={index}>
                    {/* Service Name (Read-only) */}
                    <Td>
                      <Text>{service.serviceName}</Text>
                    </Td>
                    {/* Weight/Count Limit Input */}
                    <Td>
                      <Input
                        type="number"
                        value={service.weightOrCount}
                        size="sm"
                        onChange={(e) => {
                          const updatedServices = [...newPromotion.specificServices];
                          updatedServices[index].weightOrCount = parseFloat(e.target.value);
                          setNewPromotion({
                            ...newPromotion,
                            specificServices: updatedServices,
                          });
                        }}
                      />
                    </Td>
                    {/* Remove Service Button */}
                    <Td>
                      <Button
                        size="sm"
                        colorScheme="red"
                        onClick={() => {
                          const updatedServices = newPromotion.specificServices.filter(
                            (_, i) => i !== index
                          );
                          setNewPromotion({
                            ...newPromotion,
                            specificServices: updatedServices,
                          });
                        }}
                      >
                        Remove
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            {/* Dropdown for Adding New Service */}
            <Menu>
              <MenuButton as={Button} rightIcon="▼" size="sm" colorScheme="blue">
                Select Service
              </MenuButton>
              <MenuList>
                {availableServices
                  .filter(
                    (service) =>
                      !newPromotion.specificServices.some(
                        (selectedService) => selectedService.serviceName === service.serviceName
                      )
                  )
                  .map((service, index) => (
                    <MenuItem
                      key={index}
                      onClick={() => {
                        setNewPromotion((prev) => ({
                          ...prev,
                          specificServices: [
                            ...prev.specificServices,
                            { serviceName: service.serviceName, weightOrCount: 0 },
                          ],
                        }));
                      }}
                    >
                      {service.serviceName}
                    </MenuItem>
                  ))}
              </MenuList>
            </Menu>
          </Stack>
        </FormControl>
        )}


        {/* Usage Limit Per Customer */}
        <FormControl isInvalid={validationErrors.usageLimitPerCustomer}>
          <FormLabel>
            Usage Limit Per Customer <Text as="span" color="red.500">*</Text>
          </FormLabel>
          <Input
            type="number"
            value={newPromotion.usageLimitPerCustomer}
            onChange={(e) =>
              handleAddPromotionFieldChange("usageLimitPerCustomer", e.target.value)
            }
            onBlur={() => handleFieldBlur("usageLimitPerCustomer")}
          />
          {validationErrors.usageLimitPerCustomer && (
            <Text color="red.500">{validationErrors.usageLimitPerCustomer}</Text>
          )}
        </FormControl>

        {/* Is Active */}
        <FormControl>
          <FormLabel>Active Status</FormLabel>
          <Menu>
            <MenuButton as={Button} rightIcon="▼">
              {newPromotion.isActive ? "Active" : "Inactive"}
            </MenuButton>
            <MenuList>
              <MenuItem onClick={() => handleAddPromotionFieldChange("isActive", true)}>
                Active
              </MenuItem>
              <MenuItem onClick={() => handleAddPromotionFieldChange("isActive", false)}>
                Inactive
              </MenuItem>
            </MenuList>
          </Menu>
        </FormControl>
      </Stack>
    </ModalBody>
    <ModalFooter>
      <Button colorScheme="green" onClick={handleAddPromotion}>
        Add
      </Button>
    </ModalFooter>
  </ModalContent>
</Modal>


    </Box>
  );
};

export default PromotionsPage;
