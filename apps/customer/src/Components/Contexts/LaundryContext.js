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
                    setLaundryData(response.data);
                    document.title = `${response.data.laundryName} - Free Pickup and Delivery`;
                    // Set dynamic favicon from laundry logo or generate from name
                    const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
                    link.rel = 'icon';
                    if (response.data.laundryLogo) {
                        const logo = response.data.laundryLogo;
                        if (logo.startsWith('http')) { link.href = logo; }
                        else if (logo.startsWith('data:')) { link.href = logo; }
                        else { link.href = `data:image/png;base64,${logo}`; }
                    } else {
                        // Generate letter favicon from laundry name
                        const name = response.data.laundryName || 'L';
                        const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                        const colors = { blue: '#3182CE', green: '#38A169', purple: '#805AD5', teal: '#319795', orange: '#DD6B20', red: '#E53E3E', pink: '#D53F8C', cyan: '#00B5D8' };
                        const bgColor = colors[response.data.themeColor] || colors.blue;
                        const canvas = document.createElement('canvas');
                        canvas.width = 64; canvas.height = 64;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = bgColor;
                        ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#FFFFFF';
                        ctx.font = `bold ${initials.length > 1 ? '24' : '32'}px -apple-system, sans-serif`;
                        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(initials, 32, 34);
                        link.href = canvas.toDataURL('image/png');
                    }
                    document.head.appendChild(link);
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
