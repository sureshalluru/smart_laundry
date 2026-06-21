/**
 * Item Tracking components barrel export.
 *
 * Integration guide for OrdersInfoManagement.jsx:
 *
 * 1. Import the panel:
 *    import ItemTrackingPanel from '../Components/ItemTracking/ItemTrackingPanel';
 *
 * 2. Add inline within the order detail section (where order status is displayed):
 *    <ItemTrackingPanel
 *      orderId={selectedOrder.orderId}
 *      laundryId={laundryId}
 *      orderStatus={selectedOrder.orderStatus}
 *      employeeId={currentEmployeeId}
 *      onSkip={() => { /* mark order as "Intake Not Recorded" */ }}
 *    />
 *
 * 3. For Category Config in LaundryInfoManagement.jsx:
 *    import CategoryConfig from '../Components/ItemTracking/CategoryConfig';
 *    <CategoryConfig laundryId={laundryId} />
 */

export { default as ItemTrackingPanel } from './ItemTrackingPanel';
export { default as ItemTrackingQR } from './ItemTrackingQR';
export { default as ItemTrackingResults } from './ItemTrackingResults';
export { default as DiscrepancyAlert } from './DiscrepancyAlert';
export { default as CategoryConfig } from './CategoryConfig';
