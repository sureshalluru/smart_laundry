/**
 * CompanyAuthContext — auth context for company-level admin sessions.
 * Separate from the individual admin AuthContext.
 * Company admins authenticate with email + password and get a JWT
 * carrying company_id + laundry_ids for multi-location access.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const CompanyAuthContext = createContext(null);

const API_URL = process.env.REACT_APP_AWS_API_URL || '';
const STORAGE_KEY = 'companyToken';

export function CompanyAuthProvider({ children }) {
    const [companyUser, setCompanyUser] = useState(null);
    const [companyToken, setCompanyToken] = useState(null);
    const [isCompanyAuthenticated, setIsCompanyAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Load company session from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                // Check if token is expired
                const payload = JSON.parse(atob(parsed.accessToken.split('.')[1]));
                if (payload.exp * 1000 > Date.now()) {
                    setCompanyToken(parsed.accessToken);
                    setCompanyUser({
                        company_id: payload.company_id,
                        laundry_ids: payload.laundry_ids || [],
                        name: payload.name || '',
                        email: payload.email || '',
                    });
                    setIsCompanyAuthenticated(true);
                } else {
                    // Token expired — clear it
                    localStorage.removeItem(STORAGE_KEY);
                }
            } catch (e) {
                localStorage.removeItem(STORAGE_KEY);
            }
        }
        setIsLoading(false);
    }, []);

    /**
     * Login as a company admin.
     * @param {string} email
     * @param {string} password
     * @returns {Promise<object>} Login response data
     */
    const companyLogin = useCallback(async (email, password) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await axios.post(`${API_URL}/api/auth/login`, {
                type: 'company_admin',
                email,
                password,
            });
            const data = response.data;
            if (data.status === 'success') {
                const token = data.accessToken;
                const payload = JSON.parse(atob(token.split('.')[1]));

                const user = {
                    company_id: payload.company_id,
                    laundry_ids: payload.laundry_ids || [],
                    name: payload.name || '',
                    email: payload.email || '',
                };

                setCompanyToken(token);
                setCompanyUser(user);
                setIsCompanyAuthenticated(true);

                // Store in localStorage
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

                return { ...data, user };
            } else {
                throw new Error(data.message || 'Login failed');
            }
        } catch (e) {
            const msg = e.response?.data?.detail || e.response?.data?.message || e.message || 'Login failed';
            setError(msg);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Logout the company admin — clears localStorage and state.
     */
    const companyLogout = useCallback(() => {
        setCompanyUser(null);
        setCompanyToken(null);
        setIsCompanyAuthenticated(false);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const value = {
        companyUser,
        companyToken,
        isCompanyAuthenticated,
        isLoading,
        error,
        companyLogin,
        companyLogout,
    };

    return (
        <CompanyAuthContext.Provider value={value}>
            {children}
        </CompanyAuthContext.Provider>
    );
}

/**
 * Hook to access the company auth context.
 * Must be used within a CompanyAuthProvider.
 */
export function useCompanyAuth() {
    const context = useContext(CompanyAuthContext);
    if (!context) {
        throw new Error('useCompanyAuth must be used within a CompanyAuthProvider');
    }
    return context;
}

export default CompanyAuthContext;
