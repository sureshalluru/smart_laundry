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

Create a database:

```sql
CREATE DATABASE smart_laundry;
```

The app auto-runs migrations on startup — no manual schema setup needed.

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
# Build both React apps
cd apps/admin && npm run build && cd ../..
cd apps/customer && npm run build && cd ../..

# Start the server
cd services/api
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 — that's it. Everything runs on one port.

---

## URL Structure

| URL | What it serves |
|-----|---------------|
| `http://localhost:8000/` | Customer booking portal |
| `http://localhost:8000/admin/` | Admin/POS dashboard |
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

To skip migrations during development:
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

[Get Managed Hosting →](https://smartlaundrybasket.com/onboard)
