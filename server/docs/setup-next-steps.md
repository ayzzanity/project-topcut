# Setup Next Steps

## 1. Apply the Supabase schema

The Supabase CLI is not installed locally, so use the dashboard SQL editor for now.

1. Open your Supabase project dashboard.
2. Go to **SQL Editor**.
3. Open [../supabase/migrations/202606020001_initial_bbx_schema.sql](../supabase/migrations/202606020001_initial_bbx_schema.sql).
4. Copy the full SQL file into the SQL editor.
5. Run it once.

After it succeeds, your project will have the MVP tables, views, RLS policies, and admin helper function.

## 2. Create your first admin without a frontend

Add these temporary local-only values to `server/.env`:

```env
DEV_ADMIN_EMAIL=you@example.com
DEV_ADMIN_PASSWORD=use-a-local-dev-password
DEV_ADMIN_DISPLAY_NAME=Your Name
```

Then run:

```powershell
npm.cmd run create-admin
```

This creates a Supabase Auth user with confirmed email and upserts a matching `profiles` row with `role = 'admin'`.

To get a bearer token for API testing:

```powershell
npm.cmd run get-token
```

Copy the printed token and use it as:

```text
Authorization: Bearer YOUR_PRINTED_TOKEN
```

## Alternative: create your profile manually

Sign up or create a user through Supabase Auth so your user exists in `auth.users`.

Then insert a matching profile row:

```sql
insert into public.profiles (id, display_name, role)
values ('YOUR_AUTH_USER_ID', 'Your Name', 'admin')
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role;
```

Use `admin` for your own account so you can verify records. Regular users should stay `player`.

## 3. Test backend endpoints

From `server`:

```powershell
npm.cmd run dev
```

Then check:

```text
http://localhost:4000/
http://localhost:4000/health
```

The import endpoints require a Supabase bearer token from a signed-in user.

## 4. MVP API call order

1. `POST /api/imports/participants`
2. `POST /api/imports/preview`
3. `POST /api/imports/confirm`
4. Admin reviews with `GET /api/admin/review-flags`
5. Admin verifies with `PATCH /api/admin/records/:recordId/decision`
6. Public rankings read from `GET /api/leaderboard`

## Challonge two-stage tournaments

The backend tries Challonge API v2.1 first because v2.1 distinguishes group-stage matches from final-stage matches with `group_id`. It falls back to v1 when v2.1 cannot access the event.

If a community-hosted tournament returns incomplete group-stage data, add the community id to `server/.env` and restart the backend:

```env
CHALLONGE_API_V21_BASE_URL=https://api.challonge.com/v2.1
CHALLONGE_COMMUNITY_ID=your_challonge_community_id
```

When v2.1 is available:

- matches with `group_id` are treated as Swiss/group-stage matches
- matches with `group_id = null` are treated as final-stage/Top Cut matches

When only v1 is available for a built-in two-stage tournament, the backend flags the import for admin review instead of guessing Swiss wins.

## Automatic user profiles

Apply `supabase/migrations/202606070001_auto_create_profiles.sql` after the initial schema.

It:

- creates a `public.profiles` row whenever Supabase Auth creates a user
- backfills profiles for existing Auth users
- preserves existing profiles and admin roles

The backend auth middleware also creates a missing player profile before protected API calls as a fallback.

## Organizer field rollback

If the organizer migration was previously applied, run
`supabase/migrations/202606070003_remove_tournament_organizer.sql`.

Tournament imports use the existing Challonge source URL and do not require separate organizer fields.

## Tournament date

Apply `supabase/migrations/202606070004_use_start_date_for_tournament_date.sql`.

The BBX `event_date` is derived from Challonge `start_at` / `started_at`, not
`completed_at`. The migration backfills existing tournaments using Asia/Manila
local time.

## Placement points

Apply `supabase/migrations/202606190001_remove_3rd_to_8th_placement_points.sql`.

The backend awards placement points only for confirmed 1st and 2nd place.

## Swiss King points

Apply `supabase/migrations/202606160002_reduce_swiss_king_points_to_5.sql`.

Swiss King is worth `5` points. The migration recalculates existing record totals
using the current MVP point table.
