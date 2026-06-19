# project-pincers-bbx
Local BBX Leaderboard for ZC Pincers

## Backend on Vercel

The backend is Vercel-ready as an Express-based serverless function.

When creating the Vercel project, set the project root directory to `server`.

Required Vercel environment variables:

- `FRONTEND_ORIGIN`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CHALLONGE_API_KEY`

Optional environment variables:

- `CHALLONGE_API_BASE_URL`
- `CHALLONGE_API_V21_BASE_URL`
- `CHALLONGE_COMMUNITY_ID`

Local serverless testing:

```bash
cd server
npm install
npm run vercel:dev
```

The Vercel function entrypoint is `server/api/index.js`. `server/vercel.json` rewrites all incoming requests to that function, so existing routes like `/api/leaderboard`, `/api/imports/preview`, and `/api/admin/pending-records` keep the same URLs.
