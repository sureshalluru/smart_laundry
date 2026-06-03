# Smart Laundry — Migration TODO

## ✅ Completed

### Backend (FastAPI)
- [x] Project structure and config
- [x] Self-hosted JWT auth (replaces Cognito for admin)
- [x] Database connection to existing AWS RDS Postgres
- [x] Orders listing (active/completed/canceled) with pagination
- [x] Single order details
- [x] Order updates (edit services, weight, status, save to DB)
- [x] In-store order placement
- [x] Employee credential validation
- [x] Laundry validation (checkLaundryId, getLaundryInfo)
- [x] Laundry shop info, services, products CRUD
- [x] Zip codes management
- [x] Employee list, create
- [x] Employee reviews
- [x] Laundry stats / monthly summary
- [x] Customer phone lookup
- [x] In-store payment capture (cash)
- [x] Driver orders view
- [x] Notifications (email/SMS via SES/Twilio)
- [x] Payment service (Stripe integration scaffolded)

### Admin Frontend
- [x] Copied to monorepo (apps/admin/)
- [x] Replaced Cognito with self-hosted JWT auth
- [x] New login page (employee ID + passcode)
- [x] Removed all react-oidc-context / aws-amplify dependencies
- [x] All pages working: orders, driver, services, products, zip codes, employees, reviews

### Infrastructure
- [x] Single-port serving (FastAPI serves API + React builds)
- [x] render.yaml for deployment
- [x] start.bat / dev.bat scripts

---

## 🔲 Next: Per-Bag Pricing + Order Flow Redesign

### New Feature: Per-Bag Pricing Option
- [x] Add "Choose Pricing" step at start of order flow:
  - Option A: "Per Bag" — flat $30/bag (configurable per laundry in DB)
  - Option B: "Per Pound" — existing per-lb service selection
- [x] Per Bag flow: select # bags → schedule pickup/dropoff → payment → place order
- [x] Per Pound flow: existing service selection → schedule → payment → place order
- [x] Backend: store bag_price in shop.laundry_shops table
- [x] Backend: handle bag-based orders in place-order endpoint
- [ ] Admin: show bag orders properly in order list (auto-handled via "Per Bag Service" in order_services)
- [x] Mobile-first UI with clean card selection (inspired by HappyNest)

### Customer App UI Polish (continued)
- [ ] Redesign service selection page layout
- [ ] Redesign checkout/review page
- [ ] Redesign My Orders page cards
- [ ] Redesign Account page sections

### 1. Auth — Replace Cognito OTP with Twilio Verify
- [ ] Backend: Add `/api/auth/send-otp` endpoint (uses Twilio Verify to send code)
- [ ] Backend: Add `/api/auth/verify-otp` endpoint (verifies code, issues JWT)
- [ ] Backend: Add Twilio Verify service to config/env
- [ ] Frontend: Create new `AuthContext.jsx` for customer app (phone + OTP flow)
- [ ] Frontend: Replace Amplify Authenticator with custom OTP UI
- [ ] Frontend: Remove `aws-amplify` and `@aws-amplify/ui-react` dependencies
- [ ] Test: Customer can log in with phone + OTP, get JWT, access protected pages

### 2. API Endpoints for Customer App
- [ ] Scan all frontend API calls in customer app
- [ ] Map each to existing FastAPI routes or add new ones
- [ ] Key endpoints needed:
  - [ ] Get laundry info (services, time slots, promotions)
  - [ ] Place online order
  - [ ] Get customer order history
  - [ ] Get single order details
  - [ ] Update customer profile
  - [ ] Manage addresses (add/edit/delete)
  - [ ] Manage saved cards
  - [ ] Frequency (recurring order) management
  - [ ] Cancel order
  - [ ] Leave review
  - [ ] Validate address (zip code check)
  - [ ] Apply promo code

### 3. Frontend Updates
- [ ] Update all API base URLs to use REACT_APP_AWS_API_URL
- [ ] Update auth-related imports
- [ ] Remove Cognito/Amplify config from index.js and App.js
- [ ] Test all pages: login, services, cart, checkout, orders, account, reviews

### 4. Build & Test
- [ ] `npm install && npm run build` in apps/customer/
- [ ] Serve from FastAPI at `/*` routes
- [ ] Full end-to-end test (login, place order, view orders, leave review)

---

## 🔲 Future: Before Production Deploy

### Deployment
- [ ] Push to GitHub
- [ ] Connect to Render
- [ ] Set environment variables on Render
- [ ] Update Cognito callback URLs (if keeping Cognito temporarily)
- [ ] Test on Render URL

### Data & Security
- [ ] Ensure RDS security group allows Render IPs
- [ ] Set strong JWT_SECRET_KEY in production
- [ ] Audit .env files are in .gitignore
- [ ] Remove stripe_private_key from API responses (currently exposed in viewLaundryInfoById)

### Features to Port (lower priority)
- [ ] Uber delivery integration (quote, schedule, cancel, webhooks)
- [ ] Order frequency auto-generation (cron job on Render)
- [ ] S3 image upload (order photos, review photos, logos)
- [ ] Email invoice generation
- [ ] Terminal payments (Stripe Terminal)

### Cleanup
- [ ] Remove `lambda/` folder from repo (keep as reference elsewhere)
- [ ] Remove `smart-laundry-admin/.env` secrets
- [ ] Remove `restore_zipcodes.py` script
- [ ] Update README with final instructions
