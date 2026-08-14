# Doxa Analytics Dashboard

Standalone dark/light analytics UI for Doxa Wallet metrics (wallets, transactions, USD fees, Uptodown downloads).

## Setup

1. On an **existing** Supabase metrics DB, run only `backend/supabase/doxa_metrics_analytics_dashboard_migration.sql` (additive; keeps current rows).
2. Set backend env:
   - `DOXA_ANALYTICS_DASHBOARD_SECRET`
   - `DOXA_UPTODOWN_APP_URL` — skip until the app is on Uptodown
3. Copy `.env.example` to `.env` and set:
   - `VITE_ANALYTICS_API_URL`
   - `VITE_ANALYTICS_DASHBOARD_SECRET`
4. Install and run:

```bash
cd analytics-dashboard
npm install
npm run dev
```

Open http://localhost:5174

## Deploy

### GitHub
Push this folder to `https://github.com/citiridemobility/doxa-analytics-dashboard`.

### Railway
1. Create a Railway service from that repo (or `railway up` from this folder).
2. Set build-time variables:
   - `VITE_ANALYTICS_API_URL=https://doxa-backend.up.railway.app/analytics`
   - `VITE_ANALYTICS_DASHBOARD_SECRET=<same value as backend DOXA_ANALYTICS_DASHBOARD_SECRET>`
3. Generate a public domain for the service.
4. Ensure backend CORS allows the dashboard origin and header `x-doxa-analytics-secret`.


After uploading the APK to Uptodown:

- Sync from page: dashboard **Sync Uptodown** button, or  
  `POST /analytics/downloads/sync-uptodown` with the dashboard secret
- Or record manually: `POST /analytics/downloads` with `{ "source": "uptodown", "downloadCount": 1234 }`
