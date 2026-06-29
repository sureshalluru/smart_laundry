/**
 * EmployeeAuthContext — lightweight auth context for employee QR scan sessions.
 * Separate from the admin AuthContext (which requires store-level JWT login).
 * Employees authenticate with their emp ID + 4-digit passcode.
 * Session persists for 8 hours in localStorage.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const EmployeeAuthContext = createContext(null);

const API_URL = process.env.REACT_APP_AWS_API_URL || '';
const SESSION_KEY = 'empSession';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

/**
 * Check if a session object is still valid (not expired and matching laundryId).
 * @param {object|null} session - The session object from localStorage
 * @param {string} [laundryId] - Optional laundryId to verify scope
 * @returns {boolean}
 */
function checkSessionValidity(session, laundryId) {
  if (!session || !session.expiresAt) return false;

  const now = new Date();
  const expiresAt = new Date(session.expiresAt);

  if (now >= expiresAt) return false;

  if (laundryId && session.laundryId !== String(laundryId)) return false;

  return true;
}

export function EmployeeAuthProvider({ children }) {
  const [session, setSession] = useState(null);

  // Load session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (checkSessionValidity(parsed)) {
          setSession(parsed);
        } else {
          // Expired or invalid — clear it
          localStorage.removeItem(SESSION_KEY);
        }
      } catch (e) {
        localStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  /**
   * Authenticate an employee via ID + passcode.
   * @param {string} laundryId
   * @param {string} empId
   * @param {string} passcode
   * @returns {Promise<object>} The session object on success
   * @throws {Error} On invalid credentials or network error
   */
  const login = useCallback(async (laundryId, empId, passcode) => {
    const response = await axios.post(`${API_URL}/api/employees/validate-credentials`, {
      laundryId,
      empId,
      passcode,
    });

    const data = response.data?.body || response.data;

    if (!data.isValidated) {
      throw new Error(data.error || 'Invalid credentials');
    }

    const authenticatedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    const newSession = {
      employeeId: data.empId,
      laundryId: String(laundryId),
      role: data.role || 'Employee',
      fullName: data.fullName || data.empId,
      authenticatedAt,
      expiresAt,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    setSession(newSession);

    return newSession;
  }, []);

  /**
   * Clear the employee session.
   */
  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  /**
   * Check if the current session is valid and optionally scoped to a laundryId.
   * @param {string} [laundryId] - Optional laundryId to verify scope match
   * @returns {boolean}
   */
  const isAuthenticated = useCallback((laundryId) => {
    return checkSessionValidity(session, laundryId);
  }, [session]);

  /**
   * Get the current session data.
   * @returns {object|null}
   */
  const getSession = useCallback(() => {
    return session;
  }, [session]);

  const value = {
    session,
    login,
    logout,
    isAuthenticated,
    getSession,
  };

  return (
    <EmployeeAuthContext.Provider value={value}>
      {children}
    </EmployeeAuthContext.Provider>
  );
}

/**
 * Hook to access the employee auth context.
 * Must be used within an EmployeeAuthProvider.
 */
export function useEmployeeAuth() {
  const context = useContext(EmployeeAuthContext);
  if (!context) {
    throw new Error('useEmployeeAuth must be used within an EmployeeAuthProvider');
  }
  return context;
}

export { checkSessionValidity };
export default EmployeeAuthContext;
