# Smart Laundry Basket

Open source platform for service businesses — laundry, cleaning, detailing, grooming, and more. Handles customer bookings, POS, pickup & delivery, AI item tracking, recurring orders, and payments.

**Free to self-host. $49/month if you want us to run it for you.**

---

## Quick Start (Self-Hosted)

### Prerequisites

- **Node.js** 18+
- **Python** 3.11+
- **PostgreSQL** 14+

### 1. Clone & Install

```bash
git clone https://github.com/sureshalluru/smart_laundry.git
cd smart_laundry

# Install frontend dependencies
cd apps/admin && npm install && cd ../..
cd apps/customer && npm install && cd ../..

# Install backend dependencies
cd services/api
pip install -r requirements.txt
cd ../..
```

### 2. Set Up PostgreSQL

Create a fresh, empty database:

```sql
CREATE DATABASE smart_laundry;
```

That's all you need to do. On startup the app runs its migrations against
whatever database `DATABASE_URL` points at, building the **entire** schema from
scratch — schemas, enum types, and every table. You do not need our database,
a schema dump, or any external server. Point it at any empty PostgreSQL and the
first boot creates everything.

Migrations are idempotent, so restarting the app is always safe. To skip the
initial build (for example when connecting to an already-migrated database),
set `SKIP_MIGRATIONS=1`.

### 3. Configure Environment Variables

Copy the example and fill in your values:

```bash
cp services/api/.env.example services/api/.env
```

**Minimum required for basic operation:**

```env
# Database (required)
DATABASE_URL=postgresql://user:password@localhost:5432/smart_laundry

# JWT Secret (required — generate a random string)
JWT_SECRET_KEY=your-random-secret-key-here

# Google Maps (required for address autocomplete)
REACT_APP_GOOGLE_MAPS_API_KEY=your-google-maps-key

# Skip background scheduler for local dev
SKIP_SCHEDULER=1
```

**For full functionality, add these:**

```env
# Stripe (payments)
STRIPE_SECRET_KEY=sk_live_...

# Twilio (SMS/OTP login)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
TWILIO_VERIFY_SERVICE_SID=VA...

# Brevo (transactional email)
BREVO_API_KEY=xkeysib-...
SOURCE_EMAIL=your@email.com

# AWS S3 (image uploads)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# Anthropic Claude (AI item tracking & weight detection)
ANTHROPIC_API_KEY=sk-ant-...

# Google Maps (backend geocoding)
GOOGLE_MAPS_API_KEY=AIza...
```

### 4. Build & Run

```bash
# Build all three frontend apps (admin, customer, garment-counter)
npm run build:all

# Start the server
cd services/api
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`npm run build:all` builds the admin and customer React apps plus the
garment-counter PWA (served at `/counter`). To build just one, use
`npm run build:admin`, `build:customer`, or `build:counter`.

Open http://localhost:8000 — that's it. Everything runs on one port.

---

## Run It Locally on Windows (Step by Step)

A complete walkthrough for someone starting from a clean Windows machine and
creating their own laundry, all on their own computer with their own database.

### Prerequisites (install once)

- [Node.js 18+](https://nodejs.org)
- [Python 3.11+](https://python.org)
- [PostgreSQL 14+](https://www.postgresql.org/download/windows/) — note the
  password you set for the `postgres` user during install
- [Git](https://git-scm.com)

Open a fresh PowerShell window after installing so `node`, `python`, and `psql`
are on your PATH.

### Step 1 — Clone the repo

```powershell
git clone https://github.com/sureshalluru/smart_laundry.git
cd smart_laundry
```

### Step 2 — Create an empty database (no tables yet)

Using pgAdmin's Query Tool or `psql`:

```sql
CREATE DATABASE smart_laundry;
```

This creates only an empty database — an empty container with **no tables**.
The tables are created later, automatically, in Step 6.

### Step 3 — Install dependencies

```powershell
# Backend
cd services\api
pip install -r requirements.txt
cd ..\..

# Frontends
cd apps\admin && npm install && cd ..\..
cd apps\customer && npm install && cd ..\..
cd apps\garment-counter && npm install && cd ..\..
```

### Step 4 — Configure the backend `.env`

```powershell
Copy-Item services\api\.env.example services\api\.env
```

Edit `services\api\.env` and point `DATABASE_URL` at YOUR local database
(replace `YOUR_PG_PASSWORD` with the password from the Postgres install):

```env
DATABASE_URL=postgresql://postgres:YOUR_PG_PASSWORD@localhost:5432/smart_laundry
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smart_laundry
DB_USER=postgres
DB_PASSWORD=YOUR_PG_PASSWORD

JWT_SECRET_KEY=any-long-random-string
SKIP_SCHEDULER=1
```

Generate a JWT secret with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Everything else (Stripe, Twilio, S3, Anthropic, Uber) is optional — leave blank
for a local build. Those features simply stay off until you add keys.

> Make sure you overwrite `DATABASE_URL` with your local connection string so
> you are fully independent of any external/shared database.

### Step 5 — Build the React apps

From the repo root:

```powershell
npm run build:all
```

This builds all three frontend apps: admin, customer, and the garment-counter
PWA (served at `/counter`).

### Step 6 — Start the server (this creates the tables)

```powershell
npm start
```

On this first boot the app runs its migrations and **creates all the tables**
inside your empty database. Watch the console for:

```
Running database migrations...
Migration create_base_schema complete — foundation schemas, enums, and core tables created.
...
All migrations complete.
```

Seeing that confirms your schema is fully built. (Under the hood: `app/main.py`
runs `run_all()` on startup, which runs `create_base_schema` first to create the
`shop`/`orders` schemas, enum types, and foundation tables, then the `add_*`
migrations layer on the rest.)

### Step 7 — Create your own laundry

Open:

```
http://localhost:8000/onboard
```

The wizard collects your business name, address, services & pricing, schedule,
and branding, then **inserts** your laundry into the tables that already exist
(it does not create tables). On submit you get an admin URL and owner login
credentials (employee ID + passcode).

### Step 8 — Use it

| URL | What it is |
|-----|------------|
| `http://localhost:8000/` | Customer booking portal |
| `http://localhost:8000/{yourLaundryId}/site` | Your laundry's public page |
| `http://localhost:8000/{yourLaundryId}/admin` | Your admin/POS dashboard |
| `http://localhost:8000/counter` | Garment-counter PWA (iPad kiosk) |
| `http://localhost:8000/onboard` | Create another laundry |

### Where do the tables get created?

| Step | What it creates |
|------|-----------------|
| Step 2 (`CREATE DATABASE`) | The empty database only — **no tables** |
| Step 6 (`npm start`, first boot) | **All tables**, via the auto-run migrations |
| Step 7 (`/onboard`) | **Row data** (your laundry) — no new tables |

To verify: after Step 2 (before Step 6), `\dt shop.*` in psql shows nothing.
After Step 6 the tables are all present.

### Notes for local testing

- **Admin/owner login** works with no external services — use the employee ID
  and passcode from onboarding to explore the admin/POS side.
- **Customer OTP login** does not require Twilio. When `TWILIO_ACCOUNT_SID` is
  not set, the OTP code is printed to the server console/terminal instead of
  being sent via SMS. Check your terminal output for a line like
  `OTP for +1...: 123456` and enter that code in the app.
- **Email notifications** (welcome emails, order updates) require Brevo keys.
  Without them, emails are silently skipped but the app still functions.
- **Address autocomplete** needs a Google Maps key at build time
  (`REACT_APP_GOOGLE_MAPS_API_KEY`); without it, address fields work as plain
  text.

---

## URL Structure

| URL | What it serves |
|-----|---------------|
| `http://localhost:8000/` | Customer booking portal |
| `http://localhost:8000/admin/` | Admin/POS dashboard |
| `http://localhost:8000/counter` | Garment-counter PWA (iPad kiosk) |
| `http://localhost:8000/api/` | Backend API |

---

## Architecture

```
smart-laundry/
├── apps/
│   ├── admin/           # Admin/POS React app (Chakra UI)
│   └── customer/        # Customer-facing React app
├── services/
│   └── api/
│       ├── app/
│       │   ├── main.py          # FastAPI entry point
│       │   ├── config.py        # All settings from env vars
│       │   ├── database.py      # PostgreSQL connection pool
│       │   ├── scheduler.py     # Background jobs (recurring orders, engagement)
│       │   ├── migrations/      # Auto-run DB migrations
│       │   ├── routes/          # API endpoints
│       │   └── services/        # Business logic (vision AI, etc.)
│       └── requirements.txt
├── Dockerfile           # Multi-stage build for containerized deploy
├── render.yaml          # Render.com deployment config
└── package.json         # Root build scripts
```

---

## Development (Hot Reload)

For frontend development with live reload:

```bash
# Terminal 1: API server
cd services/api && uvicorn app.main:app --reload --port 8000

# Terminal 2: Admin app (hot reload on port 3000)
cd apps/admin && npm start

# Terminal 3: Customer app (hot reload on port 3001)
cd apps/customer && set PORT=3001 && npm start
```

---

## Database

- **Engine:** PostgreSQL 14+
- **Connection:** psycopg3 with connection pooling (2-20 connections)
- **Migrations:** Auto-run on startup (safe to re-run, idempotent)
- **Schema:** Created automatically — just provide an empty database

### How the schema is built

Point the app at any empty PostgreSQL and the first boot builds everything —
no external database or schema dump required. Migrations run in order:

1. `create_base_schema` — creates the `shop` and `orders` schemas, the enum
   types (`order_status_enum`, `frequency_enum`, `employee_role_enum`), and all
   foundation tables (`laundry_shops`, `customers`, `orders`, `laundry_services`,
   `laundry_frequency`, and the rest).
2. The `add_*` migrations then layer on newer columns, tables, and indexes for
   individual features.

Every migration uses `CREATE ... IF NOT EXISTS` / guarded `ALTER`, so the whole
chain is idempotent — restarting the app never re-creates or corrupts existing
data.

To skip migrations during development (e.g. against an already-migrated DB):
```env
SKIP_MIGRATIONS=1
```

---

## Background Jobs

The app runs two scheduled jobs internally (via APScheduler):

| Job | Schedule | Purpose |
|-----|----------|---------|
| Frequency Processor | 6:00 AM CT daily | Creates recurring subscription orders |
| Engagement Processor | 10:00 AM CT daily | Sends customer re-engagement reminders |

To disable the scheduler locally:
```env
SKIP_SCHEDULER=1
```

---

## External Services

### Required

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| PostgreSQL | Database | Yes (Render, Supabase, Railway) |
| Google Maps | Address autocomplete | $200/month free credit |

### Optional (enable features as needed)

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| Stripe | Card payments | Pay-as-you-go |
| Twilio | SMS OTP login | Trial credits |
| Brevo | Email notifications | 300 emails/day free |
| AWS S3 | Image storage | 5 GB free |
| Anthropic Claude | AI item/weight detection | Pay-as-you-go |
| Uber Direct | Delivery integration | API access required |

The platform works without optional services — features gracefully degrade (no SMS = no OTP login, no Anthropic = no AI tracking, etc.).

---

## Docker Deployment

```bash
docker build -t smart-laundry \
  --build-arg REACT_APP_GOOGLE_MAPS_API_KEY=your-key \
  .

docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e JWT_SECRET_KEY=your-secret \
  smart-laundry
```

---

## Deploy to Render (One-Click)

1. Fork this repo
2. Create a new Web Service on Render
3. Connect your GitHub repo
4. Render reads `render.yaml` automatically
5. Add environment variables in the Render dashboard
6. Deploy

---

## Deploy to Railway / Fly.io / DigitalOcean

The app is a standard Python web service with static React builds. Deploy anywhere that supports:
- Python 3.11+ runtime
- PostgreSQL database
- Environment variables
- Port binding (`$PORT` env var)

Build command:
```bash
cd apps/admin && npm install && npm run build && cd ../..
cd apps/customer && npm install && npm run build && cd ../..
cd services/api && pip install -r requirements.txt
```

Start command:
```bash
cd services/api && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

---

## Onboarding Your First Business

After deployment, visit `/onboard` to create your first laundry/service business. The onboarding wizard collects:
- Business name & address
- Services & pricing
- Operating schedule
- Branding (logo, theme color)
- Payment setup (Stripe keys)

This creates the business in the database and gives you admin login credentials.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, uvicorn |
| Database | PostgreSQL 14+, psycopg3 |
| Frontend | React 18, Chakra UI, React Router |
| Payments | Stripe (direct to merchant) |
| SMS | Twilio Verify |
| Email | Brevo (SendinBlue) |
| AI Vision | Anthropic Claude |
| Maps | Google Maps Platform |
| Images | AWS S3 |

---

## License

Licensed under the [Elastic License 2.0](LICENSE). You may use this software freely for your own business. You may not offer it as a hosted/managed service to third parties.

In plain English:
- ✅ Deploy it for your own laundry/service business — free forever
- ✅ Modify and customize the code
- ✅ Use it commercially for your own operations
- ❌ You cannot resell it as a hosted service (that's our business)

---

## Support

- **Self-hosted:** Community support via GitHub Issues
- **Managed ($49/mo):** Priority email support, hosting, backups, updates included

[Get Managed Hosting →](https://smartlaundrybasket.ai/onboard)
