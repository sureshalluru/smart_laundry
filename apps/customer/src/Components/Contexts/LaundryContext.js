// LaundryContext.js
import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

export const LaundryContext = createContext();

export const LaundryProvider = ({ children }) => {
    const { laundryId } = useParams();
    const navigate = useNavigate();
    const [laundryData, setLaundryData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchLaundryData() {
            try {
                const response = await axios.get(
                    `${process.env.REACT_APP_AWS_API_URL}/api/laundry/validate-laundry`,
                    {
                        params: { operation: 'checkLaundryId', laundryId },
                        headers: { 'x-api-key': process.env.REACT_APP_AWS_API_KEY },
                    }
                );

                if (response.data.status === 'success' && response.data.exists) {
                    // Save any data you need (e.g., laundryName, stripe keys)
                    setLaundryData(response.data);
                } else {
                    navigate('/invalid');
                }
            } catch (error) {
                console.error("Laundry validation error:", error);
                navigate('/invalid');
            } finally {
                setLoading(false);
            }
        }
        fetchLaundryData();
    }, [laundryId, navigate]);

    if (loading) {
        return <div>Fetching Laundry Information...</div>;
    }

    return (
        <LaundryContext.Provider value={{ laundryId, laundryData }}>
            {children}
        </LaundryContext.Provider>
    );
};
