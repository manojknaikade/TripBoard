---
description: common debugging pitfalls and resolutions for TripBoard
---

# TripBoard Debugging Context & Gotchas

This document records severe bugs, crashes, and pitfalls previously encountered and resolved during the development of TripBoard. **Review this document before implementing new features or debugging production issues.**

## 1. Next.js App Router API & Vercel 500 Crashes

**Symptom:** The Vercel production app returns a `500 Internal Server Error` with `SyntaxError: Unexpected end of JSON input` in the browser console.
**Root Cause:** The Vercel Serverless Function crashed synchronously (e.g., throwing a raw Error before any JSON response was formed).
**Most Common Trigger:** Adding a new `process.env.*` variable to `.env.local` but forgetting to add it to the live Vercel Dashboard Environment Variables. For example, `SUPABASE_SERVICE_ROLE_KEY`.
**Solution:**

- Always wrap the entire Edge/Serverless logic block in `try { ... } catch (err) { return NextResponse.json({ success: false, error: err.message }, { status: 500 }); }`. This catches synchronous Vercel crashes and returns a parsable JSON payload alerting the frontend to the missing variable.
- Remind the user to sync all new `.env.local` keys to Vercel and redeploy.

## 2. Node.js `JavaScript heap out of memory` (OOM)

**Symptom:** Running `npm run dev` crashes the terminal entirely with a FATAL ERROR indicating V8 ran out of memory, usually triggered when viewing robust dashboard pages like "Analytics".
**Root Cause:** Using `supabase.from('trips').select('*')` on large tables without pagination limit constraints. In TripBoard, a "trip" might contain massive metadata arrays (like high-res GPS paths). Selecting `*` for hundreds of trips simultaneously serializes hundreds of megabytes of JSON directly into Node's memory limit.
**Solution:**

- Never use `.select('*')` for aggregated analytics routes.
- ALWAYS use explicitly targeted scalar fields: `.select('id, distance_miles, energy_used_kwh, start_time')`. This reduces the DB payload from megabytes down to mere kilobytes.

## 3. React `useEffect` Infinite Fetch Loops

**Symptom:** The frontend crashes the backend (or causes the OOM error above) by spamming the database with hundreds of API requests per second. The browser's network tab shows identical requests firing constantly.
**Root Cause:** Mismanaging the dependency array of a `useEffect` hook that triggers an API call. For example, placing a non-memoized `fetchAnalytics` function reference inside the dependency array recalculates it and triggers a re-fetch endlessly.
**Solution:**

- Do not put the fetch function in the dependency array unless wrapped in `useCallback`.
- Alternatively, include `// eslint-disable-next-line react-hooks/exhaustive-deps` and only list the specific trigger variables (like `timeframe`, `customStart`) inside the `useEffect` dependency array.

## 4. Production vs. Localhost Authentication Cookies

**Symptom:** API routes return `401 Unauthorized` only when running `npm run build && npm run start` (production mode on localhost). `npm run dev` works perfectly.
**Root Cause:** Production Next.js enforces `secure: true` on cookies. The browser will refuse to send a `secure` cookie over HTTP to `localhost:3000`.
**Solution:**

- Ensure auth scripts (like `tesla/callback/route.ts`) conditionally disable the `secure` flag if evaluating against localhost, even if `NODE_ENV === 'production'`.
- `secure: process.env.NODE_ENV === 'production' && !request.url.includes('localhost')`

## 5. Supabase RLS Blocking Server-Side Data Exports

**Symptom:** API routes fetch trip data successfully, but charging session data returns empty arrays — even though data exists in the database.
**Root Cause:** The standard Supabase client (`createClient`) respects Row-Level Security. If no Supabase Auth user session is attached (e.g., auth is handled via Tesla OAuth cookies, not Supabase Auth), RLS silently returns zero rows.
**Solution:**

- Use `createAdminClient()` (service role key) for export or analytics routes where the user is already authenticated via other means (Tesla OAuth).
- Never use the admin client for user-facing write operations without additional authorization checks.

## 6. Client-Side Date Filtering With Hard Fetch Limits

**Symptom:** Date filters like "Last 30 Days" or "Last 3 Months" show empty or incomplete results, but shorter ranges like "Last 7 Days" work fine.
**Root Cause:** The frontend fetches a fixed number of records (e.g., `?limit=50`) and then filters client-side by date. When data grows, older records fall outside the fetch window.
**Solution:**

- Move date filtering **server-side**: pass `from` and `to` ISO date params to the API, and use `.gte('start_time', from).lte('start_time', to)` in the Supabase query.
- Only apply `.range()` pagination if no date range is provided (backward-compatible).
- The frontend should re-fetch (via `useEffect` dependency on `timeframe`) whenever the user switches filters.

## 7. Leaflet Map Thumbnails Overlapping Sticky Headers

**Symptom:** Mini-map thumbnails in list cards render on top of the sticky navigation bar when scrolling.
**Root Cause:** Leaflet injects its own high `z-index` values on map tiles and containers, which override the app's stacking context.
**Solution:**

- Wrap the map div with `z-0 relative` to create a new stacking context that contains Leaflet's z-indices.
- Ensure the sticky header uses a sufficiently high z-index (e.g., `z-50`).
