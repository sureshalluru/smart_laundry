# Admin App Setup

Copy your `smart-laundry-admin` code here, then make these changes:

## 1. Set homepage in package.json

Add this to package.json:
```json
"homepage": "/admin"
```

## 2. Update BrowserRouter in index.js

Change:
```jsx
<BrowserRouter>
```
To:
```jsx
<BrowserRouter basename="/admin">
```

## 3. Update API URL in .env

Change:
```
REACT_APP_API_URL=http://localhost:8000
```

The API is now at the same origin, so you can use relative URLs:
```
REACT_APP_AWS_API_URL=http://localhost:8000
```

## 4. Update redirect_uri for Cognito

In index.js, change redirect_uri to:
```javascript
redirect_uri: "http://localhost:8000/admin/callback"  // dev
// redirect_uri: "https://your-render-url.onrender.com/admin/callback"  // prod
```

## 5. Build

```bash
npm install
npm run build
```

The build output goes to `build/` which FastAPI serves at `/admin/*`.
