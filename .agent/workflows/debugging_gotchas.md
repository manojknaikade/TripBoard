---
description: common debugging pitfalls and resolutions for TripBoard
---

# TripBoard Debugging Gotchas

This document contains common pitfalls and their resolutions when developing TripBoard.

## 1. MacOS Terminal Permissions (EPERM)

When running commands like `npx supabase migration up` or `npm run build` locally, you might encounter an `EPERM: operation not permitted` error on macOS (often failing to read `.env.local` or `node_modules`).
**Resolution:** This is usually a MacOS security restriction on the terminal app. For database schema changes, either run them directly in the Supabase Dashboard SQL Editor or grant your terminal Full Disk Access in MacOS System Settings > Privacy & Security.

## 2. OpenStreetMap Nominatim Reverse Geocoding

When using the `/api/geocode` endpoint or calling Nominatim directly from the VPS Node script, requests may fail or hang if a `User-Agent` header is not provided.
**Resolution:** OpenStreetMap requires a valid `User-Agent` for reverse geocoding API requests. Always attach `User-Agent: TripBoard-VPS/1.0` (or similar) to the `https.get` options.

## 3. Leaflet Map fitBounds on Single Coordinates

When rendering a Map using `react-leaflet` for a single location (like a charging session where start and end coordinates are identical), calling `map.fitBounds(bounds, { padding: [50, 50] })` on a zero-size bounding box will cause the map to zoom to its absolute maximum level (`maxZoom: 19`), rendering it unreadable.
**Resolution:** Detect if the coordinates are identical (`startLat === endLat`). If they are, bypass `fitBounds` entirely and instead use `map.setZoom(14)` or artificially expand the bounding box by `0.02` degrees in all directions to force a reasonable zoom level.

## 4. Next.js 15+ Async Params

When creating dynamic API routes (e.g., `/api/[id]/route.ts`), accessing `params.id` synchronously will cause a `400 Bad Request` or server error in modern Next.js.
**Resolution:** Always `await` the params object: `const { id } = await params`.
