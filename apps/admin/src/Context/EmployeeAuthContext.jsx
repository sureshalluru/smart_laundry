/**
 * EmployeeAuthContext — lightweight auth context for employee QR scan sessions.
 * Separate from the admin AuthContext (which requires store-level JWT login).
 * Employees authenticate with a 4-digit PIN passcode only.
 * Session persists in sessionStorage — automatically cleared when browser tab closes.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const EmployeeAuthContext = createContext(null);

const API_URL = process.env.REACT_APP_AWS_API_URL || '';
const SESSION_KEY = 'empSession';

/**
 * Check if a session object is valid (matching laundryId if provided).
 * No expiration check needed — sessionStorage auto-clears on tab close.
 * @param {object|null} session - The session object from sessionStorage
 * @param {string} [laundryId] - Optional laundryId to verify scope
 * @returns {boolean}
 */
function checkSessionValidity(session, laundryId) {
  if (!session) return false;

  if (laundryId && session.laundryId !== String(laundryId)) return false;

  return true;
}

export function EmployeeAuthProvider({ children }) {
  const [session, setSession] = useState(null);

  // Load session from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (checkSessionValidity(parsed)) {
          setSession(parsed);
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      } catch (e) {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  /**
   * Authenticate an employee via 4-digit PIN passcode.
   * @param {string} laundryId
   * @param {string} passcode
   * @returns {Promise<object>} The session object on success
   * @throws {Error} On invalid credentials or network error
   */
  const login = useCallback(async (laundryId, passcode) => {
    const response = await axios.post(`${API_URL}/api/employees/validate-pin`, {
      laundryId,
      passcode,
    });

    const data = response.data?.body || response.data;

    if (!data.isValidated) {
      throw new Error(data.error || 'Invalid PIN');
    }

    const authenticatedAt = new Date().toISOString();

    const newSession = {
      employeeId: data.empId,
      laundryId: String(laundryId),
      role: data.role || 'Employee',
      fullName: data.fullName || data.empId,
      authenticatedAt,
    };

    sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    setSession(newSession);

    return newSession;
  }, []);

  /**
   * Clear the employee session.
   */
  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
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
