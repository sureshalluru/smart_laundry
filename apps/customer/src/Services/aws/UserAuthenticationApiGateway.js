import axios from "axios";

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export const handlePhoneNumberCheck = async (phoneNumber, laundryId) => {
    try {
        const response = await axios.get(`${API_URL}/api/customer/check-phone`, {
            params: {
                operation: 'checkPhoneNumber',
                phoneNumber: phoneNumber,
                laundryId: laundryId,
            },
        });
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

// Send OTP to phone number
export const initiateSignIn = async (phoneNumber, laundryId) => {
    try {
        const response = await axios.post(`${API_URL}/api/auth/send-otp`, {
            phoneNumber: phoneNumber,
            laundryId: laundryId || null,
        });
        if (response.data.status === 'success') {
            return { isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_IN' } };
        }
        throw new Error("Failed to send OTP");
    } catch (error) {
        console.error("Error initiating sign in:", error);
        throw error;
    }
};

// Verify OTP — returns auth tokens on success
let _pendingPhone = null;
let _pendingLaundryId = null;

export const setPendingAuth = (phone, laundryId) => {
    _pendingPhone = phone;
    _pendingLaundryId = laundryId;
};

export const verifyOTP = async (otpCode) => {
    try {
        const response = await axios.post(`${API_URL}/api/auth/verify-otp`, {
            phoneNumber: _pendingPhone,
            otpCode: otpCode,
            laundryId: _pendingLaundryId,
        });
        if (response.data.isSignedIn) {
            return {
                isSignedIn: true,
                accessToken: response.data.accessToken,
                refreshToken: response.data.refreshToken,
                user: response.data.user,
            };
        }
        return { isSignedIn: false, nextStep: { additionalInfo: { attemptsLeft: 2 } } };
    } catch (error) {
        if (error.response?.status === 401) {
            const detail = error.response.data.detail || '';
            if (detail.includes('Too many')) {
                return { isSignedIn: false, nextStep: { additionalInfo: { attemptsLeft: 0 } } };
            }
            return { isSignedIn: false, nextStep: { additionalInfo: { attemptsLeft: 2 } } };
        }
        throw new Error("Invalid OTP");
    }
};

// Sign up a new customer
export const initiateSignUp = async (laundryId, email, phoneNumber, firstName, lastName, inStore, receivePhoneNotification, isCommercial, billingEmail, referralCode) => {
    try {
        const response = await axios.post(`${API_URL}/api/auth/customer-register`, {
            phoneNumber,
            email,
            firstName,
            lastName,
            laundryId,
            receivePhoneNotification,
            isCommercial: isCommercial || false,
            billingEmail: billingEmail || '',
            referralCode: referralCode || null,
        });
        return {
            isSignUpComplete: response.data.isSignUpComplete || false,
            userId: response.data.userId,
            nextStep: response.data.nextStep || 'CONFIRM_SIGN_UP',
            error: null,
        };
    } catch (error) {
        const detail = error.response?.data?.detail || error.message;
        return {
            isSignUpComplete: false,
            userId: null,
            nextStep: null,
            error: detail.includes("UsernameExists") ? "UsernameExistsException" : detail,
        };
    }
};

// Compatibility: fetchAuthSession replacement
export const fetchAuthSession = async () => {
    const token = localStorage.getItem('idToken');
    const stored = localStorage.getItem('customerAuth');
    let loginId = null;
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            loginId = parsed.user?.phone;
        } catch (e) {}
    }
    return {
        tokens: {
            idToken: token,
            signInDetails: { loginId },
        },
    };
};
