# Smart Laundry Basket — Onboarding FAQ

Answers to common questions from businesses evaluating the platform. Everything
below reflects how the product actually works today.

---

## 1. We have several locations. Do we have to set up each one individually?

**Yes — each location is set up on its own, and you can group them under a single company for a combined view.**

- Every location is its own store in the system, with its own services, pricing,
  staff, and orders. You onboard each location separately (one location per
  onboarding run).
- When you set up your **first** location, choose **"Create a company"** during
  onboarding. You'll receive a **join code**.
- For each **additional** location, onboard it and choose **"Join a company"**
  using that join code. It's then linked to the same company. (A platform admin
  can also attach existing locations to a company afterward.)

**What grouping gives you:** a single **company admin login** (email + password)
with a **combined dashboard across all locations** — total revenue, order counts,
and a per-location breakdown — plus company-wide revenue, tips, sales-tax, and
performance reports. That same login can drill into any individual location's
admin panel.

**Current limits:**
- You add locations one at a time (no bulk "add many locations" in a single
  onboarding session).
- Day-to-day order processing is done per location; there isn't a single merged
  order-processing queue across locations.

---

## 2. How do you break out orders by location?

**Orders are separated by location automatically.**

- Every order is tied to a specific location. Each store's admin/POS sees only
  its own orders, customers, employees, and reports — locations never mix.
- At the **company level**, those roll up into a consolidated view: per-location
  revenue and order counts side by side, plus company-wide totals. Reports
  (revenue, tips, sales tax, performance) also break out by location.

**In short:** siloed per location for daily operations, with a consolidated
per-location breakdown available at the company level.

---

## 3. Do we have to offer pickup & delivery, or can we run standard in-store drop-off?

**Pickup & delivery is optional. You can run entirely on walk-in / in-store
drop-off.**

- There's a dedicated walk-in POS (QuickPOS) and in-store order flow. An in-store
  order needs only the location and the items (weight/services) — no address and
  no pickup/delivery scheduling required. There's even an anonymous
  "walk-in customer" option.
- Delivery is opt-in per order, and the default delivery method is your **own
  driver**, not a third party.
- Third-party delivery (Uber Direct) is a further optional add-on that only turns
  on if you provide your own Uber credentials — and if it's ever unavailable, it
  automatically falls back to your own driver.

**What needs extra setup:** automated Uber Direct dispatch requires your Uber
credentials. Everything else — in-store orders and your own-driver
pickup/delivery — works out of the box.

---

## 4. Do we have to link our website to take payments?

**No. Taking payments does not depend on the customer-facing website.**

- In-store payments are handled at the POS independently: **Cash**, **Card**,
  **Terminal** (card reader), and **Pay Later** are all supported at the counter.
- **Cash and Pay Later always work with zero payment setup.** Card and Terminal
  require you to connect your own payment processor (Stripe). Payment processing
  is per location.
- If you don't connect a card processor at all, the system runs
  **cash / invoice-only** — checkout falls back to "Pay at Pickup / Invoice" and
  no card is needed.
- The public website is simply the optional online-ordering channel; it's
  separate from how you collect payment in-store.

**What needs Stripe:** accepting card or terminal payments. Cash and invoice work
regardless.

---

## Quick reference: what you can do vs. what needs setup

| Capability | Works out of the box | Needs extra setup |
|-----------|----------------------|-------------------|
| Multiple locations | Yes — onboard each, group under a company | One location per onboarding run |
| Orders separated by location | Yes, automatic | — |
| Consolidated multi-location dashboard | Yes, via company admin login | Create/join a company during onboarding |
| Walk-in / in-store orders | Yes | — |
| Own-driver pickup & delivery | Yes (opt-in per order) | — |
| Uber Direct delivery | Optional | Your own Uber credentials |
| Cash / Pay Later / Invoice | Yes | — |
| Card / Terminal payments | — | Connect your Stripe account |
| Online ordering website | Optional channel | — |
