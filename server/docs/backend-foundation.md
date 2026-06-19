# Project Pincers Backend Foundation

This backend treats one real Beyblade event as one `tournaments` row. Challonge links are saved as `tournament_sources`; a required `main` source feeds Swiss data, and an optional `top_cut` source becomes the authoritative Top Cut / Final Stage source.

## Recommended Project Structure

```text
src/
  app.js
  server.js
  config/env.js
  lib/supabase.js
  middleware/auth.js
  routes/
    adminRoutes.js
    importRoutes.js
    leaderboardRoutes.js
  services/
    challongeService.js
    importService.js
    reviewFlagService.js
    scoringService.js
  utils/errors.js
supabase/migrations/
  202606020001_initial_bbx_schema.sql
docs/
  backend-foundation.md
```

## Database Schema

The migration creates these MVP tables:

- `profiles`: Supabase Auth user profile and role (`player`, `admin`).
- `tournaments`: one real-life event, with fetched Challonge name/date and approval lock fields.
- `tournament_sources`: required `main` Challonge source plus optional `top_cut` source.
- `tournament_participants`: imported participants for dropdown and claim status.
- `player_tournament_records`: one user claim/result for one main Challonge participant.
- `match_records`: normalized matches for review and auditing.
- `review_flags`: admin review queue for ambiguous imports and rule exceptions.
- `leaderboard`: verified-record aggregate ordered by the required tie-breakers.
- `player_profile_stats`: verified player summary for profile pages.

Duplicate prevention is enforced with:

```sql
unique (main_challonge_tournament_id, main_challonge_participant_id)
```

## RLS Recommendations

RLS is enabled on every public table. Public reads are limited to verified tournaments/records and leaderboard/profile aggregates. Users can read their own pending records and related flags. Admin writes are checked through `private.is_admin()`, a private `security definer` helper. Backend import/admin operations should use `SUPABASE_SERVICE_ROLE_KEY` only on the server.

Do not store authorization in user-editable metadata. Role is stored in `profiles.role`; if you later mirror roles into JWT app metadata, keep it in `app_metadata`, not `user_metadata`.

## API Routes

### `GET /health`

Purpose: readiness check.

Response:

```json
{ "data": { "ok": true } }
```

### `POST /api/imports/participants`

Purpose: fetch Challonge participants for the frontend dropdown and mark already claimed participants disabled.

Request:

```json
{ "mainLink": "https://challonge.com/example" }
```

Response:

```json
{
  "data": {
    "source": { "challongeTournamentId": 123, "name": "Event Name" },
    "participants": [{ "challongeParticipantId": 1, "name": "Player", "claimed": false, "disabled": false }]
  }
}
```

### `POST /api/imports/preview`

Purpose: import data, apply MVP scoring, detect duplicates, and return flags without saving a final record.

Request:

```json
{
  "mainLink": "https://challonge.com/main",
  "topCutLink": "https://challonge.com/top-cut",
  "mainParticipantId": 42
}
```

Response:

```json
{
  "data": {
    "swissWins": 3,
    "topCutEntry": true,
    "isSwissKing": false,
    "finalPlacement": 2,
    "totalPoints": 13,
    "reviewFlags": []
  }
}
```

### `POST /api/imports/confirm`

Purpose: recalculate the import server-side and save the result as a pending review record. The frontend preview is informational only; trusted points come from the backend.

Request:

```json
{
  "mainLink": "https://challonge.com/main",
  "topCutLink": "https://challonge.com/top-cut",
  "mainParticipantId": 42,
  "deck": {
    "blade1": "optional",
    "blade2": "optional",
    "blade3": "optional"
  }
}
```

Response:

```json
{
  "data": {
    "tournamentId": "uuid",
    "recordId": "uuid",
    "status": "pending_review",
    "reviewFlagCount": 1
  }
}
```

### `GET /api/leaderboard`

Purpose: return verified rankings only.

Response:

```json
{
  "data": [
    {
      "user_id": "uuid",
      "display_name": "Player",
      "total_points": 40,
      "champion_count": 2,
      "swiss_king_count": 1,
      "finisher_count": 0,
      "total_valid_wins": 20,
      "most_recent_approved_tournament_date": "2026-06-01"
    }
  ]
}
```

### `GET /api/leaderboard/players/:userId/stats`

Purpose: player profile statistics from verified records.

### `GET /api/admin/review-flags`

Purpose: list open admin review flags. Requires admin profile.

### `PATCH /api/admin/records/:recordId/decision`

Purpose: verify or reject a player tournament record. Verified records are locked.

Request:

```json
{ "status": "approved" }
```

## Challonge API Service Design

`challongeService` parses full links or raw identifiers, calls the Challonge v1 tournament show endpoint, and requests `include_participants=1` and `include_matches=1`. The API key remains server-only.

The service normalizes:

- tournament id, name, type, start/completion timestamps
- participants
- matches
- raw Challonge response for audit/debugging

## Import Preview Logic

1. Fetch main Challonge source.
2. Fetch optional Top Cut source.
3. Verify selected main participant exists.
4. Reject duplicate claims by main tournament id plus main participant id.
5. Count Swiss wins from main source.
6. If Top Cut link exists, ignore built-in Top Cut data from main source and match the player by normalized participant name in the Top Cut source.
7. Infer final placement from authoritative Top Cut participant when present, otherwise from the main participant.
8. Calculate points on the backend.
9. Generate review flags for byes, forfeit/DQ-like scores, unknown winners, unclear Swiss King, and separate Top Cut override.

## Point Calculation

The backend source of truth is `scoringService`:

- Swiss Round Win: `1`
- Top Cut Entry: `2`
- Swiss King: `5`
- Finisher / 2nd Place: `8`
- Champion: `10`

Champion and 2nd are mutually exclusive placement bonuses. Swiss King and Champion can stack. Top Cut entry and final placement can stack. Placement points are only awarded when Challonge provides a confirmed `final_rank` of 1 or 2.

## Confirm Import Transaction Flow

For production, wrap this in a Postgres RPC or explicit transaction-capable database client:

1. Re-check duplicate claim.
2. Find or create the single `tournaments` row for the main Challonge source.
3. Find or create the required main source and optional authoritative Top Cut source.
4. Insert imported `tournament_participants`.
5. Insert `player_tournament_records`.
6. Insert `match_records`.
7. Insert `review_flags`.
8. Mark participants as claimed.

The current skeleton creates or reuses the tournament, creates or reuses sources, then creates the player record, claimed participant rows, match audit rows, and review flags. Move this flow into a database transaction/RPC before production traffic.

## Error Format

```json
{
  "error": {
    "code": "duplicate_claim",
    "message": "This Challonge participant has already been claimed.",
    "details": {}
  }
}
```

## Environment Variables

- `PORT`
- `NODE_ENV`
- `FRONTEND_ORIGIN`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CHALLONGE_API_BASE_URL`
- `CHALLONGE_API_KEY`

## Recommended Implementation Order

1. Apply the Supabase migration.
2. Create the first admin profile after signup.
3. Install Node dependencies.
4. Wire frontend auth token into backend requests.
5. Validate Challonge imports against 3-5 real historical tournaments.
6. Finish participant and match persistence in confirm flow.
7. Move confirm flow into a transaction/RPC.
8. Add admin review UI.
9. Add integration tests around scoring, duplicate claims, and approval locking.

## Backend Risks And Assumptions

- Challonge can represent Swiss, groups, and bracket stages inconsistently. Ambiguous records should favor review flags over automatic points.
- Top Cut participant matching by name is MVP-friendly but imperfect. Admin review is required when names differ.
- Bye rounds, DQ, and forfeits are not automatically counted as wins.
- Swiss King inference from `final_rank` is an assumption. If organizer data is unclear, flag it.
- The frontend must never calculate trusted points or receive the Challonge API key.
- Verified records should only be changed through admin actions.
