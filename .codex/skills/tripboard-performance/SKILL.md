---
name: tripboard-performance
description: Use for performance and snappiness work in TripBoard, especially list rendering, analytics boot paths, dashboard live state, and fetch/caching patterns across trips, charging, maintenance, and settings.
---

# TripBoard Performance

- Default verification:

```bash
npm run lint
npm run build
```

## Preferred Patterns In This Repo

- Use the short-lived client cache in `src/lib/client/fetchCache.ts` for route data that benefits from stale-while-revalidate behavior.
- For long lists, use `src/components/VirtualizedList.tsx` to cap DOM growth.
- For trips and charging history, prefetch the next page before the sentinel enters view so scrolling stays continuous.
- For analytics first paint, prefer server-fetched initial payloads via `src/lib/analytics/server.ts` and let client fetches handle timeframe changes.
- For dashboard/live vehicle data, reuse `src/lib/vehicle/liveData.ts` instead of adding independent polling loops.
- When list summary cards become expensive, push aggregation into SQL/RPC with an in-route fallback rather than scanning large row sets in the client.

## Existing Performance Building Blocks

- `src/app/dashboard/trips/page.tsx`
- `src/app/dashboard/charging/page.tsx`
- `src/app/dashboard/maintenance/page.tsx`
- `src/components/dashboard/DashboardClient.tsx`
- `src/components/analytics/*AnalyticsClient.tsx`
- `src/app/api/trips/route.ts`
- `src/app/api/charging/route.ts`

## Documentation Rule

- If the performance architecture changes in a user-visible or operationally meaningful way, update `README.md`.
