/**
 * Role-based permissions for the admin app.
 * 
 * Hierarchy (each role inherits all permissions below it):
 * Admin > Manager > Employee > Driver
 * 
 * Driver: View assigned routes, navigate
 * Employee: Create/edit orders, collect payments, item tracking
 * Manager: Employee + Driver + add employees + route planning
 * Admin: Manager + dashboard + pricing + laundry settings
 */

// Feature keys used for access control
export const FEATURES = {
  DRIVER_ROUTE: 'driverRoute',
  ORDERS: 'orders',
  PAYMENTS: 'payments',
  ITEM_TRACKING: 'itemTracking',
  ROUTE_PLANNING: 'routePlanning',
  ADD_EMPLOYEES: 'addEmployees',
  DASHBOARD: 'dashboard',
  PRICING: 'pricing',
  LAUNDRY_SETTINGS: 'laundrySettings',
  PROMOTIONS: 'promotions',
  ENGAGEMENT: 'engagement',
  CHAT: 'chat',
};

// Permissions per role
const ROLE_PERMISSIONS = {
  Driver: [
    FEATURES.DRIVER_ROUTE,
  ],
  Employee: [
    FEATURES.DRIVER_ROUTE,
    FEATURES.ORDERS,
    FEATURES.PAYMENTS,
    FEATURES.ITEM_TRACKING,
    FEATURES.CHAT,
  ],
  Manager: [
    FEATURES.DRIVER_ROUTE,
    FEATURES.ORDERS,
    FEATURES.PAYMENTS,
    FEATURES.ITEM_TRACKING,
    FEATURES.ROUTE_PLANNING,
    FEATURES.ADD_EMPLOYEES,
    FEATURES.CHAT,
    FEATURES.PROMOTIONS,
  ],
  Admin: [
    FEATURES.DRIVER_ROUTE,
    FEATURES.ORDERS,
    FEATURES.PAYMENTS,
    FEATURES.ITEM_TRACKING,
    FEATURES.ROUTE_PLANNING,
    FEATURES.ADD_EMPLOYEES,
    FEATURES.DASHBOARD,
    FEATURES.PRICING,
    FEATURES.LAUNDRY_SETTINGS,
    FEATURES.PROMOTIONS,
    FEATURES.ENGAGEMENT,
    FEATURES.CHAT,
  ],
};

/**
 * Check if a role has access to a specific feature.
 * @param {string} role - The user's role (Admin, Manager, Employee, Driver)
 * @param {string} feature - Feature key from FEATURES
 * @returns {boolean}
 */
export function hasPermission(role, feature) {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(feature);
}

/**
 * Get the user's role from the JWT token stored in localStorage.
 * Normalizes legacy role names to the new standard ones.
 * @returns {string} Role (Admin, Manager, Employee, Driver) or 'Employee' as default
 */
export function getUserRole() {
  try {
    const token = localStorage.getItem('idToken');
    if (!token) return 'Employee';
    
    // Decode JWT payload (base64)
    const payload = JSON.parse(atob(token.split('.')[1]));
    return normalizeRole(payload.role || 'Employee');
  } catch (e) {
    return 'Employee';
  }
}

/**
 * Normalize legacy role names to the standard four roles.
 * Handles old values like "Delivery Driver", "Attendant", "LaundryCare Specialist"
 */
export function normalizeRole(role) {
  if (!role) return 'Employee';
  
  const r = role.trim();
  
  // Exact matches
  if (r === 'Admin' || r === 'Manager' || r === 'Employee' || r === 'Driver') return r;
  
  // Legacy Driver aliases
  if (r === 'Delivery Driver' || r === 'delivery driver' || r.toLowerCase().includes('driver')) return 'Driver';
  
  // Legacy Employee aliases
  if (r === 'Attendant' || r === 'LaundryCare Specialist' || r.toLowerCase().includes('attendant')) return 'Employee';
  
  // Default
  return 'Employee';
}

/**
 * Get the user's employee ID from the JWT token.
 * @returns {string}
 */
export function getUserEmpId() {
  try {
    const token = localStorage.getItem('idToken');
    if (!token) return '';
    
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub || '';
  } catch (e) {
    return '';
  }
}
