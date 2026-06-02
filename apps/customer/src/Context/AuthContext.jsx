/**
 * Customer Auth Context — replaces Amplify Authenticator.
 * Provides phone + OTP login, signup, and token management.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);
const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export function CustomerAuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [authStatus, setAuthStatus] = useState('configuring'); // configuring | authenticated | unauthenticated
    const [isLoading, setIsLoading] = useState(true);

    // Restore session on mount
    useEffect(() => {
        const stored = localStorage.getItem('customerAuth');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const payload = JSON.parse(atob(parsed.accessToken.split('.')[1]));
                if (payload.exp * 1000 > Date.now()) {
                    setUser(parsed.user);
                    setAuthStatus('authenticated');
                    axios.defaults.headers.common['Authorization'] = `Bearer ${parsed.accessToken}`;
                    localStorage.setItem('idToken', parsed.accessToken);
                } else {
                    localStorage.removeItem('customerAuth');
                    localStorage.removeItem('idToken');
                    setAuthStatus('unauthenticated');
                }
            } catch (e) {
                localStorage.removeItem('customerAuth');
                setAuthStatus('unauthenticated');
            }
        } else {
            setAuthStatus('unauthenticated');
        }
        setIsLoading(false);
    }, []);

    const signOut = useCallback(() => {
        setUser(null);
        setAuthStatus('unauthenticated');
        localStorage.removeItem('customerAuth');
        localStorage.removeItem('idToken');
        delete axios.defaults.headers.common['Authorization'];
    }, []);

    const onOTPVerified = useCallback((data) => {
        // Called after successful OTP verification
        setUser(data.user);
        setAuthStatus('authenticated');
        localStorage.setItem('customerAuth', JSON.stringify(data));
        localStorage.setItem('idToken', data.accessToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
    }, []);

    const value = {
        user,
        authStatus,
        isLoading,
        signOut,
        onOTPVerified,
        // Compatibility with useAuthenticator
        signInDetails: user ? { loginId: user.phone } : null,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCustomerAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
    return context;
}

/**
 * Compatibility hook that mimics useAuthenticator from @aws-amplify/ui-react
 */
export function useAuthenticator(selector) {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuthenticator must be used within CustomerAuthProvider');
    return {
        authStatus: ctx.authStatus,
        user: ctx.user,
        signOut: ctx.signOut,
        signInDetails: ctx.signInDetails,
    };
}

export default AuthContext;
