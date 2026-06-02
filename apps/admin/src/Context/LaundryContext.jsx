// src/contexts/LaundryContext.js
import { createContext, useContext, useState, useEffect } from 'react';

const LaundryContext = createContext();

export function LaundryProvider({ children }) {
    const [laundryInfo, setLaundryInfo] = useState(null);

    // Optional: Load from sessionStorage on initial load
    useEffect(() => {
        const storedLaundryInfo = sessionStorage.getItem('laundryInfo');
        if (storedLaundryInfo) {
            setLaundryInfo(JSON.parse(storedLaundryInfo));
        }
    }, []);

    // Save to sessionStorage whenever laundryInfo changes
    useEffect(() => {
        if (laundryInfo) {
            sessionStorage.setItem('laundryInfo', JSON.stringify(laundryInfo));
        }
    }, [laundryInfo]);

    const value = {
        laundryInfo,
        setLaundryInfo,
        clearLaundryInfo: () => {
            setLaundryInfo(null);
            sessionStorage.removeItem('laundryInfo');
        }
    };

    return (
        <LaundryContext.Provider value={value}>
            {children}
        </LaundryContext.Provider>
    );
}

export function useLaundry() {
    const context = useContext(LaundryContext);
    if (context === undefined) {
        throw new Error('useLaundry must be used within a LaundryProvider');
    }
    return context;
}