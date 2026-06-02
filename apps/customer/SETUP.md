# Customer App Setup

Copy your customer ordering React app here, then make these changes:

## 1. Update API URL in .env

```
REACT_APP_API_URL=http://localhost:8000
```

## 2. Build

```bash
npm install
npm run build
```

The build output goes to `build/` which FastAPI serves at `/*`.
