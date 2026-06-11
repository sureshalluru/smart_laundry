import axios from "axios";

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export const handlePhoneNumberCheck = async (phoneNumber, laundryId) => {
    try {
        const response = await axios.get(
            `${API_URL}/api/customers/info`,
            {
                params: {
                    operation: 'checkPhoneNumber',
                    phoneNumber: phoneNumber,
                    laundryId: laundryId,
                },
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('idToken')}`
                }
            }
        );
        return {
            exists: response.data.exists,
            customerId: response.data.customerId,
            customerPaymentId: response.data.customerPaymentId,
            customerFirstName: response.data.firstName,
            specialInstructions: response.data.specialInstructions,
        };
    } catch (error) {
        console.error("Error checking phone number:", error);
        throw new Error("Unable to check phone number");
    }
};

export const initiateSignUp = async (laundryId, email, phoneNumber, firstName, lastName, inStore, receivePhoneNotification) => {
    try {
        const response = await axios.post(`${API_URL}/api/auth/register`, {
            phoneNumber,
            email,
            firstName,
            lastName,
            password: "Password123!",
            laundryId,
            inStore,
            receivePhoneNotification,
        });
        return {
            isSignUpComplete: true,
            userId: response.data.user?.sub || response.data.userId,
            nextStep: "DONE",
            error: null
        };
    } catch (error) {
        console.error("Error during sign up:", error);
        const detail = error.response?.data?.detail || error.message;
        return {
            isSignUpComplete: false,
            userId: null,
            nextStep: null,
            error: detail.includes("already registered") ? "UsernameExistsException" : detail
        };
    }
};
