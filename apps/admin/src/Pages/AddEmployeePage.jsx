import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Input,
  VStack,
  HStack,
  useDisclosure,
  useToast,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Text,
  Divider,
  Heading,
  Spinner,
  IconButton,
  Menu, MenuButton, MenuList, MenuItem
} from "@chakra-ui/react";
import { DeleteIcon, EmailIcon, ChevronDownIcon } from "@chakra-ui/icons";
import axios from "axios";

const AddEmployeePage = () => {
  const { laundryId } = useParams();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const roles = ["Admin", "Manager", "Attendant", "LaundryCare Specialist", "Delivery Driver"];
  const [isAdding, setIsAdding] = useState(false); // Employee add status state
  const [isDeleting, setIsDeleting] = useState(false); // Employee delete status state
  const [loadingNotifications, setLoadingNotifications] = useState({}); // Employee notifications status state
  const [newEmp, setNewEmp] = useState({
    firstName: "",
    lastName: "",
    joiningDate: "",
    role: "",
    phone: "",
    email: "",
    address: {
      street: "",
      city: "",
      state: "",
      country: "",
      zipCode: "",
    },
    laundryId,
  });
  const [errors, setErrors] = useState({});
  const {
    isOpen: isDeleteModalOpen,
    onOpen: onDeleteModalOpen,
    onClose: onDeleteModalClose,
  } = useDisclosure();
  const authToken = localStorage.getItem('idToken');


  useEffect(() => {
    const fetchEmployees = async () => {
      setLoading(true);
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_AWS_API_URL}/api/admin/show-all-employees`,
          {
            params: {
              operation: "showAllEmployees",
              laundryId,
            },
            headers: {
              // "x-api-key": process.env.REACT_APP_AWS_API_KEY,
              'Authorization': `Bearer ${authToken}`
            },
          }
        );

        const employeesData = response.data.body.employees.map((emp) => ({
          employeeId: emp.employeeId,
          fullName: emp.fullName,
          contact: {
            email: emp.contact.email,
            phone: emp.contact.phone,
          },
          laundryId: emp.laundryId,
          joiningDate: emp.joiningDate,
          role: emp.role,
        }));

        setEmployees(employeesData);
      } catch (error) {
        console.error("Error fetching employees:", error);
      } finally {
        setLoading(false); 
      }
    };
    fetchEmployees();
  }, [laundryId]);

  const validateField = (fieldName, value) => {
    let error = "";

    switch (fieldName) {
      case "firstName":
        if (!value) error = "First Name is required.";
        else if (value.length < 2)
          error = "First Name must be at least 2 characters.";
        break;
      case "lastName":
        if (!value) error = "Last Name is required.";
        else if (value.length < 2)
          error = "Last Name must be at least 2 characters.";
        break;
      case "joiningDate":
        if (!value) error = "Joining Date is required.";
        break;
      case "role":
        if (!value) error = "Role is required.";
        break;
      case "phone":
        const phoneRegex = /^\d{10}$/;
        if (!value) error = "Phone number is required.";
        else if (!phoneRegex.test(value))
          error = "Phone number must be exactly 10 digits.";
        break;
      case "email":
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!value) error = "Email is required.";
        else if (!emailRegex.test(value))
          error = "Please enter a valid email address.";
        break;
      case "address.street":
      case "address.city":
      case "address.state":
      case "address.country":
      case "address.zipCode":
        if (!value) error = "This field is required.";
        break;
      default:
        break;
    }

    setErrors((prev) => ({
      ...prev,
      [fieldName]: error,
    }));

    return !error;
  };

  const validateForm = () => {
    let isValid = true;

    for (const field in newEmp) {
      if (field === "address") {
        for (const subField in newEmp.address) {
          const valid = validateField(`address.${subField}`, newEmp.address[subField]);
          if (!valid) isValid = false;
        }
      } else {
        const valid = validateField(field, newEmp[field]);
        if (!valid) isValid = false;
      }
    }

    return isValid;
  };

  const handleChange = (field, value) => {
    if (field.includes("address")) {
      const addressField = field.split(".")[1];
      setNewEmp((prev) => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value,
        },
      }));
      validateField(field, value);
    } else {
      setNewEmp((prev) => ({ ...prev, [field]: value }));
      validateField(field, value);
    }
  };

  const handleAddEmployee = async () => {
    if (!validateForm()) {
      toast({
        title: "Validation Errors",
        description: "Please correct the errors before submitting.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }
    setIsAdding(true);
    try {
      const response = await axios.post(
        `${process.env.REACT_APP_AWS_API_URL}/api/admin/create-employee`,
        newEmp,
        {
          params: {
            operation: "createEmployee",
          },
          headers: {
            // "x-api-key": process.env.REACT_APP_AWS_API_KEY,
            'X-Amz-Date': laundryId,
            'Authorization': `Bearer ${authToken}`

          },
        }
      );

      const { createdEmployees, failedEmployees } = response.data.body;

      // Check for failed employees and show the errors in a toast
      if (failedEmployees && failedEmployees.length > 0) {
        failedEmployees.forEach((failed) => {
          toast({
            title: "Error adding employee.",
            description: `${failed.error}: ${failed.data.email ? failed.data.email : "No Email Provided"}`,
            status: "error",
            duration: 5000,
            isClosable: true,
          });
        });
        return;
      }

      const createdEmployee = createdEmployees?.[0];
      if (!createdEmployee || !createdEmployee.empId) {
        throw new Error("Invalid API response: empId is missing");
      }

      setEmployees((prev) => [
        ...prev,
        {
          employeeId: createdEmployee.empId,
          fullName: `${newEmp.firstName} ${newEmp.lastName}`,
          contact: {
            email: createdEmployee.email,
            phone: newEmp.phone,
          },
          laundryId: newEmp.laundryId,
          joiningDate: newEmp.joiningDate,
          role: newEmp.role,
        },
      ]);

      toast({
        title: "Employee added successfully.",
        description: `Employee ID: ${createdEmployee.empId}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      onClose();
      setNewEmp({
        firstName: "",
        lastName: "",
        joiningDate: "",
        role: "",
        phone: "",
        email: "",
        address: {
          street: "",
          city: "",
          state: "",
          country: "",
          zipCode: "",
        },
        laundryId,
      });
      setErrors({});
    } catch (error) {
      console.error("Error adding employee:", error);

      toast({
        title: "Error adding employee.",
        description: error.message || "Please try again later.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
    finally {
      setIsAdding(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    setIsDeleting(true);
    try {
      const response = await axios.post(
        `${process.env.REACT_APP_AWS_API_URL}/api/admin/create-employee`,
        { empId: employeeToDelete.employeeId }, // Body
        {
          params: {
            operation: "deleteEmployee",
            laundryId,
          },
          headers: {
            // "x-api-key": process.env.REACT_APP_AWS_API_KEY,
            'X-Amz-Date': laundryId,
            'Authorization': `Bearer ${authToken}`

          },
        }
      );
  
      toast({
        title: "Employee Deleted",
        description: response.data.body.message,
        status: "success",
        duration: 5000,
        isClosable: true,
      });
  
      // Update the employee list
      setEmployees((prev) =>
        prev.filter((emp) => emp.employeeId !== employeeToDelete.employeeId)
      );
  
      setEmployeeToDelete(null);
      onDeleteModalClose();
    } catch (error) {
      console.error("Error deleting employee:", error);
      toast({
        title: "Error Deleting Employee",
        description:
          error.response?.data?.message || "An error occurred. Please try again.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      onDeleteModalClose();
    }
    finally {
      setIsDeleting(false);
    }
  };

  const handleSendNotification = async (empId) => {
    setLoadingNotifications((prev) => ({ ...prev, [empId]: true }));
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_AWS_API_URL}/api/admin/show-all-employees`,
        {
          params: {
            operation: "sendEmpCredentials",
            empId, 
            laundryId, 
          },
          headers: {
            'Authorization': `Bearer ${authToken}`
            // "x-api-key": process.env.REACT_APP_AWS_API_KEY,
          },
        }
      );

      toast({
        title: "Notification Sent",
        description: `Credentials successfully sent to Employee ID: ${empId}.`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      console.error("Error sending notification:", error);
      toast({
        title: "Error Sending Notification",
        description: error.response?.data?.message || "An error occurred.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
    finally {
      setLoadingNotifications((prev) => ({ ...prev, [empId]: false }));
    }
  };
  
  return (
    <Box>
      <Heading as="h2" size="lg" mb={4} textAlign="center">
        Employee Management
      </Heading>

      {loading ? ( // Conditional rendering for loading state
      <VStack spacing={4} mt={6} align="center">
        <Spinner
          thickness="4px"
          speed="0.65s"
          emptyColor="gray.200"
          color="blue.500"
          size="xl"
        />
        <Text fontSize="lg" textAlign="center" color="gray.500">
          Fetching employee details...
        </Text>
      </VStack>
      )  : (
      <Table variant="simple" mb={6}>
        <Thead bg="#EBF8FF">
          <Tr>
            <Th>Employee ID</Th>
            <Th>Name</Th>
            <Th>Contact</Th>
            <Th>Laundry ID</Th>
            <Th>Joining Date</Th>
            <Th>Role</Th>
            <Th>Action</Th>
          </Tr>
        </Thead>
        <Tbody bg="#F7FAFC">
          {employees.map((emp) => (
            <Tr key={emp.employeeId}>
              <Td>{emp.employeeId}</Td>
              <Td>{emp.fullName}</Td>
              <Td>
                <VStack align="start" spacing={1}>
                  <Text>Email: {emp.contact.email}</Text>
                  <Text>Phone: {emp.contact.phone}</Text>
                </VStack>
              </Td>
              <Td>{emp.laundryId}</Td>
              <Td>{emp.joiningDate}</Td>
              <Td>{emp.role}</Td>
              <Td>
              <HStack spacing={2}>
                <IconButton
                  aria-label="Send Notification"
                  icon={<EmailIcon />} // Email icon for sending notifications
                  colorScheme="blue"
                  isLoading={loadingNotifications[emp.employeeId]}
                  onClick={() => handleSendNotification(emp.employeeId)} // Trigger the notification
                />


                {emp.role !== "Admin" && (
                <IconButton
                  aria-label="Delete Employee"
                  icon={<DeleteIcon />}
                  colorScheme="red"
                  onClick={() => {
                    setEmployeeToDelete(emp);
                    onDeleteModalOpen();
                  }}
                />
                )}
                </HStack>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      )}

      <Button colorScheme="blue" onClick={onOpen} >Add Employee</Button>


      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add New Employee</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={6} align="stretch">
              {/* Personal Information Section */}
              <Heading as="h3" size="md" mb={2}>
                Personal Information
              </Heading>
              <Divider />
              <FormControl isInvalid={!!errors.firstName}>
                <FormLabel>
                  First Name <Text as="span" color="red">*</Text>
                </FormLabel>
                <Input
                  placeholder="Enter First Name"
                  value={newEmp.firstName}
                  onChange={(e) => handleChange("firstName", e.target.value)}
                />
                <FormErrorMessage>{errors.firstName}</FormErrorMessage>
              </FormControl>
              <FormControl isInvalid={!!errors.lastName}>
                <FormLabel>
                  Last Name <Text as="span" color="red">*</Text>
                </FormLabel>
                <Input
                  placeholder="Enter Last Name"
                  value={newEmp.lastName}
                  onChange={(e) => handleChange("lastName", e.target.value)}
                />
                <FormErrorMessage>{errors.lastName}</FormErrorMessage>
              </FormControl>

              {/* Contact Details Section */}
              <Heading as="h3" size="md" mb={2}>
                Contact Details
              </Heading>
              <Divider />
              <FormControl isInvalid={!!errors.phone}>
                <FormLabel>
                  Phone Number <Text as="span" color="red">*</Text>
                </FormLabel>
                <Input
                  placeholder="Enter 10-digit Phone Number"
                  value={newEmp.phone}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow only numeric input
                    if (/^\d*$/.test(value)) {
                      handleChange("phone", value);
                    }
                  }}
                  onBlur={() => validateField("phone", newEmp.phone)} // Trigger validation on blur
                  maxLength={10} // Restrict input to 10 digits
                />
                <FormErrorMessage>{errors.phone}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={!!errors.email}>
                <FormLabel>
                  Email Address <Text as="span" color="red">*</Text>
                </FormLabel>
                <Input
                  placeholder="Enter Email Address"
                  value={newEmp.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                />
                <FormErrorMessage>{errors.email}</FormErrorMessage>
              </FormControl>

              {/* Address Section */}
              <Heading as="h3" size="md" mb={2}>
                Address Information
              </Heading>
              <Divider />
              <HStack spacing={4}>
                <FormControl isInvalid={!!errors["address.street"]}>
                  <FormLabel>
                    Street <Text as="span" color="red">*</Text>
                  </FormLabel>
                  <Input
                    placeholder="E.g., ABC Long Dr"
                    value={newEmp.address.street}
                    onChange={(e) =>
                      handleChange("address.street", e.target.value)
                    }
                  />
                  <FormErrorMessage>{errors["address.street"]}</FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={!!errors["address.city"]}>
                  <FormLabel>
                    City <Text as="span" color="red">*</Text>
                  </FormLabel>
                  <Input
                    placeholder="E.g., Austin"
                    value={newEmp.address.city}
                    onChange={(e) =>
                      handleChange("address.city", e.target.value)
                    }
                  />
                  <FormErrorMessage>{errors["address.city"]}</FormErrorMessage>
                </FormControl>
              </HStack>
              <HStack spacing={4}>
                <FormControl isInvalid={!!errors["address.state"]}>
                  <FormLabel>
                    State <Text as="span" color="red">*</Text>
                  </FormLabel>
                  <Input
                    placeholder="E.g., Texas"
                    value={newEmp.address.state}
                    onChange={(e) =>
                      handleChange("address.state", e.target.value)
                    }
                  />
                  <FormErrorMessage>{errors["address.state"]}</FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={!!errors["address.country"]}>
                  <FormLabel>
                    Country <Text as="span" color="red">*</Text>
                  </FormLabel>
                  <Input
                    placeholder="E.g., USA"
                    value={newEmp.address.country}
                    onChange={(e) =>
                      handleChange("address.country", e.target.value)
                    }
                  />
                  <FormErrorMessage>
                    {errors["address.country"]}
                  </FormErrorMessage>
                </FormControl>
              </HStack>
              <FormControl isInvalid={!!errors["address.zipCode"]}>
                <FormLabel>
                  Zip Code <Text as="span" color="red">*</Text>
                </FormLabel>
                <Input
                  placeholder="E.g., 78701"
                  value={newEmp.address.zipCode}
                  onChange={(e) =>
                    handleChange("address.zipCode", e.target.value)
                  }
                />
                <FormErrorMessage>{errors["address.zipCode"]}</FormErrorMessage>
              </FormControl>

              {/* Other Information */}
              <Heading as="h3" size="md" mb={2}>
                Other Information
              </Heading>
              <Divider />
              {/* <FormControl isInvalid={!!errors.role}>
                <FormLabel>
                  Role <Text as="span" color="red">*</Text>
                </FormLabel>
                <Select
                  placeholder="Select Role"
                  value={newEmp.role}
                  onChange={(e) => handleChange("role", e.target.value)}
                >
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Delivery Executive">Delivery Executive</option>
                </Select>
                <FormErrorMessage>{errors.role}</FormErrorMessage>
              </FormControl> */}
              <FormControl isInvalid={!!errors.role}>
                <FormLabel>
                  Role <Text as="span" color="red">*</Text>
                </FormLabel>

                <Menu>
                  <MenuButton as={Button} rightIcon={<ChevronDownIcon />} width="100%" textAlign="left">
                    {newEmp.role || "Select Role"}
                  </MenuButton>
                  <MenuList>
                    {roles.map((role, index) => (
                      <MenuItem key={index} onClick={() => handleChange("role", role)}>
                        {role}
                      </MenuItem>
                    ))}
                  </MenuList>
                </Menu>

                <FormErrorMessage>{errors.role}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={!!errors.joiningDate}>
                <FormLabel>
                  Joining Date <Text as="span" color="red">*</Text>
                </FormLabel>
                <Input
                  type="date"
                  placeholder="Select Joining Date"
                  value={newEmp.joiningDate}
                  onChange={(e) =>
                    handleChange("joiningDate", e.target.value)
                  }
                />
                <FormErrorMessage>{errors.joiningDate}</FormErrorMessage>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button
              colorScheme="blue"
              onClick={handleAddEmployee}
              isDisabled={Object.values(errors).some((err) => !!err)}
              isLoading={isAdding}
            >
              Save Employee
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={onDeleteModalClose}>
  <ModalOverlay />
  <ModalContent>
    <ModalHeader>Confirm Employee Deletion</ModalHeader>
    <ModalCloseButton />
    <ModalBody>
      {employeeToDelete && (
        <Text>
          Are you sure you want to delete employee{" "}
          <strong>{employeeToDelete.fullName}</strong> with ID{" "}
          <strong>{employeeToDelete.employeeId}</strong>?
        </Text>
      )}
    </ModalBody>
    <ModalFooter>
      <Button
        colorScheme="red"
        onClick={handleDeleteEmployee}
        isLoading={isDeleting}
        mr={3}
      >
        Yes, Delete
      </Button>
      <Button variant="ghost" onClick={onDeleteModalClose}>
        Cancel
      </Button>
    </ModalFooter>
  </ModalContent>
</Modal>

    </Box>
  );
};

export default AddEmployeePage;
