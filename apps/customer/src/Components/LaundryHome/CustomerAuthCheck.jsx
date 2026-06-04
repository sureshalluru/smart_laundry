import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../../Context/AuthContext';
import { LaundryContext } from '../Contexts/LaundryContext';
import { handlePhoneNumberCheck } from "../../Services/aws/UserAuthenticationApiGateway";

const CustomerAuthCheck = ({ children }) => {
    const { laundryId } = useContext(LaundryContext);
    const navigate = useNavigate();
    const { authStatus, user } = useCustomerAuth();
    const [loading, setLoading] = useState(true);
    const [customerId, setCustomerId] = useState(null);
    const [customerPaymentId, setCustomerPaymentId] = useState('');
    const [specialInstructions, setSpecialInstructions] = useState('');

    useEffect(() => {
        const validateAndFetchCustomerDetails = async () => {
            try {
                if (authStatus === "authenticated" && user) {
                    const phoneNumber = user.phone;
                    if (phoneNumber && laundryId) {
                        const response = await handlePhoneNumberCheck(phoneNumber, laundryId);
                        if (response.exists) {
                            setCustomerId(response.customerId);
                            setCustomerPaymentId(response.customerPaymentId || '');
                            setSpecialInstructions(response.specialInstructions || '');

                            // Fetch and cache customer's saved address if not already in localStorage
                            if (!localStorage.getItem('customerAddress') && response.customerId) {
                                try {
                                    const token = localStorage.getItem('idToken');
                                    const infoRes = await fetch(
                                        `${process.env.REACT_APP_AWS_API_URL}/api/customer/get-customer-info?operation=getCustomerInfo&customerId=${response.customerId}`,
                                        { headers: { 'x-api-key': token } }
                                    );
                                    const infoData = await infoRes.json();
                                    const parsed = typeof infoData.body === 'string' ? JSON.parse(infoData.body) : infoData.body;
                                    const addresses = parsed?.data?.addresses || [];
                                    if (addresses.length > 0) {
                                        localStorage.setItem('customerAddress', addresses[0].address);
                                    }
                                } catch (addrErr) {
                                    console.warn("Could not fetch customer address:", addrErr);
                                }
                            }
                        }
                    } else {
                        // Use customer ID from token
                        setCustomerId(user.sub);
                    }
                } else if (authStatus === "unauthenticated") {
                    const currentPath = window.location.pathname + window.location.search;
                    navigate(`/${laundryId}/login?redirectTo=${encodeURIComponent(currentPath)}`);
                }
            } catch (error) {
                console.error("Validation error:", error);
                navigate('/invalid');
            } finally {
                setLoading(false);
            }
        };

        if (authStatus !== 'configuring') {
            validateAndFetchCustomerDetails();
        }
    }, [authStatus, user, laundryId, navigate]);

    if (loading || authStatus === 'configuring') {
        return <div>Loading...</div>;
    }

    if (customerId !== null) {
        return React.cloneElement(children, { laundryId, customerId, customerPaymentId, specialInstructions });
    }

    return null;
};

export default CustomerAuthCheck;
