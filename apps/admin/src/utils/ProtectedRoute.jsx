import { Navigate, useParams } from 'react-router-dom';
import { getUserRole, hasPermission, normalizeRole } from './permissions';

/**
 * ProtectedRoute — wraps a page component and redirects to the appropriate
 * home page if the user doesn't have the required permission.
 *
 * Usage in App.js:
 *   <Route path="active-orders" element={
 *     <ProtectedRoute feature={FEATURES.ORDERS}><OrdersPage /></ProtectedRoute>
 *   } />
 *
 * Props:
 *   feature: string — the FEATURES key required to access this page
 *   children: ReactNode — the page component to render if authorized
 */
export default function ProtectedRoute({ feature, children }) {
  const { laundryId } = useParams();
  const role = normalizeRole(localStorage.getItem('empRole') || getUserRole());

  if (!hasPermission(role, feature)) {
    // Redirect to appropriate home based on role
    if (role === 'Driver') {
      return <Navigate to={`/${laundryId}/driver/home`} replace />;
    }
    // Everyone else goes to orders (if they have access) or login
    return <Navigate to={`/${laundryId}/admin/active-orders`} replace />;
  }

  return children;
}
