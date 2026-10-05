# Project TOPCUT Client

MVP React frontend for Local Beyblade Rankings.

## Setup

```bash
cd client
npm install
npm run dev
```

## Environment

Create `.env.local` from `.env.example`.

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
VITE_API_BASE_URL=http://localhost:4000
```

Only publishable Supabase credentials belong in this frontend. Do not add `SUPABASE_SERVICE_ROLE_KEY` or `CHALLONGE_API_KEY`.

## Folder Structure

```text
src/
  components/      Shared UI and route guards
  contexts/        Supabase auth/session state
  lib/             Supabase and backend API clients
  pages/           MVP screens
  utils/           Formatting helpers
```

## Backend Response Assumptions

- API responses are wrapped as `{ data }`.
- `POST /api/imports/participants` returns `{ source, participants }`.
- Participant rows include `challongeParticipantId`, `name`, `seed`, `finalRank`, `claimed`, and `disabled`.
- `POST /api/imports/preview` returns the import preview from `server/src/services/importService.js`.
- Deck input is sent as `{ notes: string }` when present.
- Admin visibility is based on `profiles.role === "admin"` when readable through Supabase RLS.
