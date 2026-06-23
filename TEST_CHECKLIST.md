# Smart Laundry — Full App Test Checklist (Production)

Test at `https://www.roundrocklaundry.com`

## Prerequisites
- [ ] Deploy successful on Render (check logs for "All migrations complete")
- [ ] ANTHROPIC_API_KEY set in Render env vars
- [ ] TWILIO credentials set in Render env vars
- [ ] GOOGLE_MAPS_API_KEY set in Render env vars

---

## 1. ROLES & PERMISSIONS

### 1.1 Admin Login
- [ ] Go to `https://www.roundrocklaundry.com/admin`
- [ ] Login with Admin credentials
- [ ] Verify sidebar shows: Home, Orders, Place Order, Products & Services, Dashboard, Route Planner, Employees, Promotions, Chat, Engagement, FAQ
- [ ] Verify Employees page shows Passcode column

### 1.2 Manager Login
- [ ] Log out (sign out button)
- [ ] Login with Manager credentials
- [ ] Verify sidebar shows: Home, Orders, Place Order, Route Planner, Employees, Promotions, Chat
- [ ] Verify sidebar does NOT show: Dashboard, Products & Services, Engagement
- [ ] Verify Add Employee only shows roles: Employee, Driver

### 1.3 Employee Login
- [ ] Log out
- [ ] Login with Employee credentials
- [ ] Verify sidebar shows: Home, Orders, Place Order, Chat
- [ ] Verify sidebar does NOT show: Route Planner, Employees, Dashboard

### 1.4 Driver Login
- [ ] Log out
- [ ] Login with Driver credentials
- [ ] Verify redirected to Driver Home
- [ ] Verify sidebar shows: Driver Home, Sign Out ONLY
- [ ] Verify typing `https://www.roundrocklaundry.com/1/admin/active-orders` redirects back to Driver Home

---

## 2. ITEM TRACKING (AI Vision)

### 2.1 QR Code & Mobile Upload (Desktop POS)
- [ ] Login as Admin/Employee
- [ ] Open any order → see "📷 Item Tracking" panel
- [ ] Click "Scan Intake" → QR code appears with "Waiting for photos..."
- [ ] Scan QR with phone → mobile upload page opens
- [ ] Verify page shows order ID and "INTAKE" badge
- [ ] Take 4 photos (left, right, front, top)
- [ ] Click "Analyze Photos" → items detected with counts
- [ ] Adjust counts with +/- if needed
- [ ] Click "All Batches Done — Confirm Intake" → success
- [ ] Verify POS shows results synced (stop polling)

### 2.2 Mobile Upload (Admin on Phone)
- [ ] Open admin on phone browser
- [ ] Open an order → click "📷 Upload Intake" (not QR)
- [ ] Upload page opens in new tab
- [ ] Take photos, confirm → close tab

### 2.3 Customer Notification
- [ ] After intake confirmed, check if SMS sent (check Twilio logs or phone)
- [ ] SMS should include item counts + tracking link
- [ ] Click tracking link → customer tracking page loads with photos and counts

### 2.4 Fold Phase
- [ ] Click "Scan Fold" for same order
- [ ] Upload fold photos → compare against intake
- [ ] If discrepancy: verify acknowledge flow works
- [ ] "Accept All" button works in one tap
- [ ] After fold confirmed: completion SMS sent to customer

### 2.5 Customer Feedback
- [ ] Open tracking link as customer
- [ ] Click "Something doesn't look right?"
- [ ] Adjust counts, submit
- [ ] Verify admin sees "⚠ Customer reported discrepancy" on order

---

## 3. ROUTE OPTIMIZATION

### 3.1 Route Planner Page
- [ ] Login as Admin or Manager
- [ ] Navigate to Route Planner
- [ ] Select today's date
- [ ] Verify pending stops load on map (or "No pending stops" if none)
- [ ] Check driver list loads (checkbox panel)

### 3.2 Clustering
- [ ] Select 2+ drivers
- [ ] Click "Optimize Routes"
- [ ] Verify stops get color-coded by driver on map
- [ ] Verify legend shows driver names with stop counts

### 3.3 Manual Assignment
- [ ] Click a pin on the map
- [ ] Use "Assign to driver" dropdown
- [ ] Verify pin changes color
- [ ] Verify stop count updates

### 3.4 Assign & Notify
- [ ] Click "Assign Routes"
- [ ] Verify success message
- [ ] Verify driver gets SMS notification (if Twilio configured)

### 3.5 Driver View
- [ ] Login as Driver
- [ ] Verify only assigned stops show in Driver Home
- [ ] Verify stops are in optimized sequence order
- [ ] Click "Navigate" → Google Maps opens with waypoints

---

## 4. ORDERS & POS

### 4.1 Create In-Store Order
- [ ] Login as Employee/Admin
- [ ] Go to Create Order → fill in customer phone
- [ ] Select services (price per pound — test +/- weight controls)
- [ ] Add tip
- [ ] Place order → verify order appears in Active Orders

### 4.2 Order Status Flow
- [ ] Change order status (ReceivedAtFacility → ProcessingStarted → ProcessingCompleted)
- [ ] Verify item tracking panel appears at correct statuses

### 4.3 Quick POS
- [ ] Open Quick POS page
- [ ] Create a quick order
- [ ] Collect payment

---

## 5. SERVICES & CATEGORIES

### 5.1 Category Management (Admin only)
- [ ] Go to Services page
- [ ] Add a new category
- [ ] Rename a category (click name, type, blur)
- [ ] Reorder with ↑↓
- [ ] Try to delete category with services → should block with message
- [ ] Remove services from category → delete succeeds

### 5.2 Service Editing
- [ ] Click "Edit" on services
- [ ] Change service name
- [ ] Change price
- [ ] Change category assignment
- [ ] Save → verify changes persist

---

## 6. EMPLOYEE TIPS

- [ ] Login as Admin
- [ ] Go to Employee Tips tab
- [ ] Verify tips show for the date range (both card and cash)
- [ ] Filter by Card/Cash
- [ ] Verify in-store order tips appear
- [ ] Verify online order tips appear

---

## 7. SMS NOTIFICATIONS

- [ ] Item tracking intake → customer gets SMS with counts + link
- [ ] Item tracking fold → customer gets completion SMS + link
- [ ] Route assignment → driver gets SMS with stop count
- [ ] (Optional) Order status change notifications

---

## 8. CUSTOMER APP

### 8.1 Landing & Ordering
- [ ] Go to `https://www.roundrocklaundry.com/1/site`
- [ ] Customer landing page loads with laundry branding
- [ ] Navigate to login → login/register
- [ ] Place an order (per bag or per pound)
- [ ] Verify order confirmation

### 8.2 Order Tracking Page
- [ ] Open tracking link from SMS
- [ ] Photos and item counts visible
- [ ] "Report Issue" button works
- [ ] "Close Tab" button works

---

## Notes
- If SMS doesn't send: check TWILIO env vars on Render dashboard
- If AI vision fails: check ANTHROPIC_API_KEY on Render dashboard
- If route stops don't load: check GOOGLE_MAPS_API_KEY on Render dashboard
- Default test laundry: laundry_id = 1
- To get credentials: login as Admin → Employees page → Passcode column
- Production URL: https://www.roundrocklaundry.com
