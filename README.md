# Smart Laundry — Single-Port Monorepo

Everything runs on **one port**. FastAPI serves the API and both React apps.

## URL Structure (single port)

```
http://localhost:8000/api/*        → Backend API
http://localhost:8000/admin/*      → Admin/POS React app
http://localhost:8000/*            → Customer ordering React app
```

## Local Development

### Option 1: Production-like (single port)

Build the React apps, then run the API:

```bash
# Build both frontends
cd apps/admin && npm install && npm run build
cd ../customer && npm install && npm run build

# Run the server
cd ../../services/api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Now open http://localhost:8000/admin/ for admin, http://localhost:8000/ for customer.

### Option 2: Dev mode (hot reload for React)

For frontend development with hot reload, run React dev servers separately:

```bash
# Terminal 1: API
cd services/api && uvicorn app.main:app --reload --port 8000

# Terminal 2: Admin (hot reload)
cd apps/admin && npm start   # localhost:3000, proxies API to :8000

# Terminal 3: Customer (hot reload)
cd apps/customer && set PORT=3001 && npm start  # localhost:3001
```

## Project Structure

```
smart-laundry/
├── apps/
│   ├── admin/           # Admin/POS React app
│   │   └── build/       # Built files served at /admin/*
│   └── customer/        # Customer React app
│       └── build/       # Built files served at /*
├── services/
│   └── api/
│       ├── app/
│       │   ├── main.py      # FastAPI + static file serving
│       │   ├── auth.py      # Cognito JWT validation
│       │   ├── routes/      # API endpoints (/api/*)
│       │   └── services/    # Business logic
│       ├── requirements.txt
│       └── Dockerfile
├── render.yaml          # Single-service Render deployment
└── package.json         # Build scripts
```

## Deployment (Render)

Push to GitHub → Render reads `render.yaml` → builds both React apps + starts FastAPI.
Everything deploys as one service on one URL.
