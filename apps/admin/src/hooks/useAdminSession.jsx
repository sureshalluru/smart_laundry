import { useEffect, useState } from "react";

const SESSION_STORAGE_KEY = "adminSession";

export const useAdminSession = () => {
  const [adminSession, setAdminSession] = useState({
    isActive: false,
    validatedAt: null,
    lastActivity: null,
    empId: null,
  });

  const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 mins

  // 🔄 Load from sessionStorage on mount
  useEffect(() => {
    const storedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (storedSession) {
      const parsed = JSON.parse(storedSession);
      const now = Date.now();
      if (now - parsed.lastActivity <= INACTIVITY_LIMIT) {
        setAdminSession(parsed);
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  }, []);

  const isSessionValid = () => {
    if (!adminSession.isActive || !adminSession.validatedAt) return false;
    const now = Date.now();
    return now - adminSession.lastActivity <= INACTIVITY_LIMIT;
  };

  const refreshAdminActivity = () => {
    const updated = {
      ...adminSession,
      lastActivity: Date.now(),
    };
    setAdminSession(updated);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updated));
  };

  const startSession = (empId) => {
    const now = Date.now();
    const newSession = {
      isActive: true,
      validatedAt: now,
      lastActivity: now,
      empId: empId,
    };
    setAdminSession(newSession);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
  };

  const endSession = (silent = false) => {
    setAdminSession({
      isActive: false,
      validatedAt: null,
      lastActivity: null,
      empId: null
    });
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    // if (!silent) {
    //   toast({
    //     title: "Session Expired",
    //     description: "Please re-enter credentials.",
    //     status: "warning",
    //     duration: 4000,
    //     isClosable: true,
    //     position: "top",
    //   });
    // }
  };


  useEffect(() => {
    const interval = setInterval(() => {
      if (adminSession.isActive && !isSessionValid()) {
        endSession();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [adminSession]);
  // Add getter for employee ID
  const getEmpId = () => {
    return adminSession.empId;
  };
  return {
    isSessionValid,
    refreshAdminActivity,
    startSession,
    endSession,
    getEmpId,
    sessionActive: adminSession.isActive,
    timeLeftInMs: adminSession.isActive
      ? Math.max(0, INACTIVITY_LIMIT - (Date.now() - adminSession.lastActivity))
      : 0,
  };
};
