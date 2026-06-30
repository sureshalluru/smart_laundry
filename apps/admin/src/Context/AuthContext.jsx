/**
 * Self-hosted auth context — replaces react-oidc-context + Cognito.
 * Provides login, logout, token management, and user state.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [error, setError] = useState(null);

    // Load user from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('auth');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                // Check if token is expired
                const payload = JSON.parse(atob(parsed.accessToken.split('.')[1]));
                if (payload.exp * 1000 > Date.now()) {
                    setUser({ ...parsed.user, id_token: parsed.accessToken });
                    setIsAuthenticated(true);
                    // Set default auth header
                    axios.defaults.headers.common['Authorization'] = `Bearer ${parsed.accessToken}`;
                } else {
                    // Try refresh if refresh token is available
                    if (parsed.refreshToken) {
                        refreshToken(parsed.refreshToken);
                    } else {
                        localStorage.removeItem('auth');
                    }
                }
            } catch (e) {
                localStorage.removeItem('auth');
            }
        }
        // Also check if a valid company token can serve as auth (for company admin navigating into a laundry)
        if (!localStorage.getItem('auth')) {
            const companyStored = localStorage.getItem('companyToken');
            if (companyStored) {
                try {
                    const parsed = JSON.parse(companyStored);
                    const payload = JSON.parse(atob(parsed.accessToken.split('.')[1]));
                    if (payload.exp * 1000 > Date.now() && payload.role === 'company_admin') {
                        setUser({ id_token: parsed.accessToken, role: 'company_admin', ...payload });
                        setIsAuthenticated(true);
                        axios.defaults.headers.common['Authorization'] = `Bearer ${parsed.accessToken}`;
                        // Also set idToken for existing code that reads it
                        localStorage.setItem('idToken', parsed.accessToken);
                    }
                } catch (e) { /* ignore invalid company token */ }
            }
        }
        setIsLoading(false);
    }, []);

    const login = useCallback(async (credentials) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await axios.post(`${API_URL}/api/auth/login`, credentials);
            const data = response.data;
            if (data.status === 'success') {
                const userWithToken = { ...data.user, id_token: data.accessToken };
                setUser(userWithToken);
                setIsAuthenticated(true);
                localStorage.setItem('auth', JSON.stringify(data));
                localStorage.setItem('idToken', data.accessToken);
                axios.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
                return data;
            } else {
                throw new Error(data.message || 'Login failed');
            }
        } catch (e) {
            const msg = e.response?.data?.detail || e.message || 'Login failed';
            setError({ message: msg });
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const refreshToken = useCallback(async (token) => {
        try {
            const response = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken: token });
            if (response.data.status === 'success') {
                const stored = JSON.parse(localStorage.getItem('auth') || '{}');
                stored.accessToken = response.data.accessToken;
                localStorage.setItem('auth', JSON.stringify(stored));
                localStorage.setItem('idToken', response.data.accessToken);
                axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.accessToken}`;
                setIsAuthenticated(true);
                setUser(stored.user);
            }
        } catch (e) {
            logout();
        }
    }, []);

    const logout = useCallback(() => {
        setUser(null);
        setIsAuthenticated(false);
        localStorage.removeItem('auth');
        localStorage.removeItem('idToken');
        localStorage.removeItem('empRole');
        delete axios.defaults.headers.common['Authorization'];
    }, []);

    // Auto-refresh token before expiry
    useEffect(() => {
        if (!isAuthenticated) return;
        const stored = JSON.parse(localStorage.getItem('auth') || '{}');
        if (!stored.accessToken) return;

        const payload = JSON.parse(atob(stored.accessToken.split('.')[1]));
        const expiresIn = (payload.exp * 1000) - Date.now() - 60000; // refresh 1 min before expiry

        if (expiresIn <= 0) {
            refreshToken(stored.refreshToken);
            return;
        }

        const timer = setTimeout(() => refreshToken(stored.refreshToken), expiresIn);
        return () => clearTimeout(timer);
    }, [isAuthenticated, refreshToken]);

    const value = {
        user,
        isLoading,
        isAuthenticated,
        error,
        login,
        logout,
        // Compatibility with react-oidc-context API used in existing code
        signinRedirect: login,
        removeUser: logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
