/**
 * EmployeeAuthGuard — wrapper component that protects routes requiring employee auth.
 * If the employee is not authenticated for the current laundryId, redirects to the
 * employee login page with a returnUrl so they come back after login.
 */
import React from 'react';
import { Navigate, useParams, useLocation } from 'react-router-dom';
import { useEmployeeAuth } from './EmployeeAuthContext';

export default function EmployeeAuthGuard({ children }) {
  const { laundryId } = useParams();
  const location = useLocation();
  const { isAuthenticated } = useEmployeeAuth();

  if (!isAuthenticated(laundryId)) {
    const returnUrl = encodeURIComponent(location.pathname);
    return (
      <Navigate
        to={`/${laundryId}/admin/pin?returnUrl=${returnUrl}`}
        replace
      />
    );
  }

  return children;
}
