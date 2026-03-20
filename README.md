# TripBoard

TripBoard is a self-hosted Tesla dashboard built around Supabase and the Tesla Fleet API. From the codebase, the app’s core job is to authenticate users, link one Tesla account to a TripBoard account, ingest Tesla telemetry, and turn that telemetry into trip history, charging sessions, route maps, analytics, notifications, and maintenance tracking.

## What The App Does

- Shows live Tesla vehicle state and fleet summaries
- Tracks trips with route waypoints, distance, speed, efficiency, and temperature stats
- Tracks charging sessions with charger classification, costs, delivered energy, and loss metrics
- Provides analytics pages for driving, charging, and maintenance trends
- Stores Tesla OAuth tokens server-side in encrypted Supabase tables
- Supports Tesla Fleet Telemetry configuration plus an optional charging-sync worker for Supercharger billing enrichment
- Includes maintenance records and tyre-set tracking alongside trip and charging history

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth, PostgREST, and PostgreSQL
- `@supabase/ssr` and `@supabase/supabase-js`
- TanStack React Query
- Zustand
- Leaflet and React Leaflet
- Recharts
- date-fns
- Lucide React
- Tesla Fleet API
- OpenStreetMap / Carto tiles and Nominatim geocoding

## Prerequisites

- Node.js 20+ and npm
- Docker Desktop or another local Docker runtime
- Supabase CLI 2.x
- A Supabase project for hosted usage, or the local Supabase stack for development
- A Tesla developer application if you want Tesla OAuth, telemetry, or vehicle integration features
- `openssl` if you want to generate `TOKEN_ENCRYPTION_KEY` locally

## Environment Variables

Create `.env.local` from `.env.example` and fill in the values you need.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL used by the browser and server helpers |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key used by the browser and SSR clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side privileged Supabase access for Tesla session storage and internal routes |
| `TESLA_CLIENT_ID` | Yes | Tesla OAuth client ID used for sign-in and partner token flows |
| `TESLA_CLIENT_SECRET` | Yes | Tesla OAuth client secret |
| `NEXT_PUBLIC_TESLA_REDIRECT_URI` | Yes | Tesla OAuth callback URL, typically `http://localhost:3000/api/auth/tesla/callback` in local dev |
| `TESLA_PUBLIC_KEY_PEM` | Optional | Public key served from `/.well-known/appspecific/com.tesla.3p.public-key.pem` for Tesla partner registration; required if you want to register your own Tesla app/domain |
| `TOKEN_ENCRYPTION_KEY` | Yes | 32-byte key used to encrypt Tesla access and refresh tokens before storing them in Supabase |
| `TOKEN_ENCRYPTION_KEY_PREVIOUS` | Optional | Comma-separated old encryption keys accepted for fallback decryption during token-key rotation; successfully loaded Tesla sessions are re-encrypted with `TOKEN_ENCRYPTION_KEY` |
| `TESLA_VEHICLE_COMMAND_PROXY_URL` | Optional | Required only if you want the app to push Tesla Fleet Telemetry configuration through the Vehicle Command Proxy |
| `TESLA_TELEMETRY_HOSTNAME` | Optional | Required with telemetry configuration; hostname TripBoard tells Tesla vehicles to stream telemetry to |
| `TESLA_TELEMETRY_PORT` | Optional | Required with telemetry configuration; port for the telemetry ingester |
| `CHARGING_SYNC_SECRET` | Optional | Secret accepted by `/api/internal/charging/tesla-sync` and the standalone charging-sync worker |
| `CRON_SECRET` | Optional | Alternate secret name accepted by the same internal charging-sync route |
| `SUPABASE_URL` | Optional | Worker-only alias used by `scripts/process-charging-sync.js` if you do not want to reuse `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_KEY` | Optional | Worker-only alias used by `scripts/process-charging-sync.js` if you do not want to reuse `SUPABASE_SERVICE_ROLE_KEY` |
| `CHARGING_SYNC_LIMIT` | Optional | Max jobs claimed per worker run, default `10` |

Generate a token encryption key with:

```bash
openssl rand -base64 32
```

## Local Setup

1. Clone the repository.

```bash
git clone <your-private-repo-url> tripboard
cd tripboard
```

2. Install dependencies.

```bash
npm install
```

3. Copy the environment template.

```bash
cp .env.example .env.local
```

4. Start the local Supabase stack.

```bash
supabase start
```

5. Print the local Supabase credentials and copy the values you need into `.env.local`.

```bash
supabase status -o env
```

6. Apply the local database schema from the consolidated migration.

```bash
supabase db reset --local
```

7. Start the Next.js app.

```bash
npm run dev
```

8. Open `http://localhost:3000`.

## Supabase Setup

The repo now uses a single clean baseline migration for first-time setup:

- `supabase/migrations/20260320010000_initial_public_schema.sql`

That file was consolidated from the previous iterative migration history and represents the current public schema, including tables, constraints, indexes, functions, triggers, grants, and RLS policies required by the app.

For local development:

```bash
supabase start
supabase db reset --local
```

`supabase start` boots the local stack. `supabase db reset --local` recreates the local database and initializes it from the consolidated migration file above. An empty `supabase/seed.sql` is included so local resets work without extra seed data.

`supabase/schema.sql` is now a checked-in snapshot of the current public schema for reference, review, and diffing. It is not the primary bootstrap source for local setup. The executable source of truth for first-time database setup is the baseline migration in `supabase/migrations/`.

`supabase/seed.sql` is only the local post-migration seed hook used by `supabase db reset --local`. It is currently empty on purpose so resets succeed without loading demo data.

If you change the database schema later:

1. Add a new tracked migration in `supabase/migrations/`.
2. Apply it with the Supabase CLI.
3. Refresh `supabase/schema.sql` from the resulting live public schema.

## Tesla And Telemetry Notes

- Supabase email/password and magic-link auth are used for TripBoard sign-in
- Tesla integration is a second step after app authentication
- Tesla tokens are encrypted before being stored in `public.tesla_sessions`
- Trip and charging detection are handled in PostgreSQL via `public.process_telemetry()`
- Telemetry configuration is pushed from the Next.js route at `src/app/api/tesla/telemetry-config/route.ts`
- The Tesla partner public key is not stored in the repo anymore; the well-known PEM endpoint now serves `TESLA_PUBLIC_KEY_PEM` from environment configuration
- Reverse geocoding uses Nominatim through `src/app/api/geocode/route.ts`; no Mapbox key is required by the current codebase
- `scripts/process-charging-sync.js` is an optional worker that enriches completed Supercharger sessions with Tesla charging-history data

## Project Structure

```text
src/
  app/            Next.js App Router pages, API routes, auth flows, and the Tesla well-known PEM route
  components/     UI for dashboard, trips, charging, maintenance, settings, and auth
  lib/            Supabase helpers, Tesla integration, analytics, charging, trips, notifications, and settings logic
  stores/         Zustand client state
scripts/
  process-charging-sync.js     Optional Tesla charging-history worker
  reencrypt-tesla-sessions.js  One-off Tesla token re-encryption migration script
  setup-telemetry.sh           Telemetry setup helper
supabase/
  config.toml                  Local Supabase CLI configuration
  migrations/                  Executable schema history; includes the baseline bootstrap migration
  schema.sql                   Checked-in public-schema snapshot for reference and diffing
  seed.sql                     Optional local seed hook run by `supabase db reset --local`
```

## Verification

Default project verification for app changes:

```bash
npm run lint
npm run build
```

## Deploying On Vercel

TripBoard works well as a Vercel-hosted Next.js app, but all maintainer-specific credentials should live in Vercel environment variables, not in the public repo.

Set these in Vercel Project Settings -> Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TESLA_CLIENT_ID`
- `TESLA_CLIENT_SECRET`
- `NEXT_PUBLIC_TESLA_REDIRECT_URI`
- `TESLA_PUBLIC_KEY_PEM`
- `TOKEN_ENCRYPTION_KEY`
- any optional telemetry or charging-sync secrets you use in production

For `TESLA_PUBLIC_KEY_PEM`, paste the full PEM value directly. Vercel supports multiline values, and the app also accepts escaped `\n` sequences.

Example:

```env
TESLA_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\nreplace_with_your_tesla_public_key\n-----END PUBLIC KEY-----"
```

After setting variables, redeploy the project so the well-known Tesla PEM endpoint and Tesla server routes use the updated configuration.

## Rotating Secrets

Use the same rollout pattern across all environments that run TripBoard code:

- local `.env.local`
- Vercel project environment variables
- VPS or worker env files such as `/home/ubuntu/.env`
- any cron jobs, CI jobs, or one-off scripts that call Supabase or Tesla directly

### `SUPABASE_SERVICE_ROLE_KEY`

1. Rotate the service role key in Supabase.
2. Update every environment that uses it:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_KEY` if your worker uses that alias
3. Redeploy Vercel and restart any VPS workers.

### `TESLA_CLIENT_SECRET`

1. Rotate the client secret in the Tesla developer console.
2. Update every environment that uses `TESLA_CLIENT_SECRET`.
3. Redeploy Vercel and restart any worker that refreshes Tesla tokens.

### `NEXT_PUBLIC_SUPABASE_ANON_KEY`

This key is intended to be public-facing. Rotation is optional and usually only needed if you are doing a full Supabase key refresh.

### `TOKEN_ENCRYPTION_KEY`

TripBoard supports safe staged rotation for Tesla session encryption:

1. Generate a new `TOKEN_ENCRYPTION_KEY`.
   Example:

   ```bash
   openssl rand -base64 32
   ```

   Use the generated value as the new `TOKEN_ENCRYPTION_KEY`.
2. Move the old active key into `TOKEN_ENCRYPTION_KEY_PREVIOUS`.
3. Deploy the new env values everywhere the app or charging-sync worker runs.
4. Existing Tesla sessions will still decrypt with the old key and will be lazily re-encrypted with the new key when users sign in, refresh Tesla sessions, or when the charging-sync worker refreshes a stored session.
5. After you are confident old sessions have been migrated, remove `TOKEN_ENCRYPTION_KEY_PREVIOUS`.

Example rollout:

```env
TOKEN_ENCRYPTION_KEY=new_active_key
TOKEN_ENCRYPTION_KEY_PREVIOUS=old_active_key
```

If you have rotated more than once before all old rows were touched, `TOKEN_ENCRYPTION_KEY_PREVIOUS` can contain multiple older keys separated by commas.

If you prefer an immediate one-off rewrite instead of waiting for lazy migration, run:

```bash
npm run reencrypt:tesla-sessions -- --dry-run
npm run reencrypt:tesla-sessions
```

Optional flags:

- `--user-id <uuid>` to migrate one user first
- `--limit <n>` to cap the number of rows processed
- `--batch-size <n>` to adjust page size
