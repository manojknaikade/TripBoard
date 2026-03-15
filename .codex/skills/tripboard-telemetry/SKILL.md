---
name: tripboard-telemetry
description: Use for Tesla telemetry ingestion, VPS/systemd workflows, raw telemetry debugging, and Supercharger charging-sync worker tasks in TripBoard.
---

# TripBoard Telemetry

## Current Production Shape

- The Go ingester on the VPS writes raw Tesla Fleet Telemetry into `public.telemetry_raw`.
- Supabase triggers and functions derive `vehicle_status`, trips, trip waypoints, charging sessions, and related summaries from that raw stream.
- Completed Supercharger sessions are enriched separately through either:
  - `GET /api/internal/charging/tesla-sync` with `Authorization: Bearer $CHARGING_SYNC_SECRET` (or `CRON_SECRET`)
  - `scripts/process-charging-sync.js` on the VPS

## Debugging Guidance

- Validate ingestion by checking for fresh rows in `public.telemetry_raw`.
- Do not assume every TLS or transport log line is app-impacting if ingestion is still producing fresh rows.
- For VPS service checks, the common commands are:

```bash
sudo systemctl status tesla-ingester
sudo journalctl -u tesla-ingester -f
```

## Dependency Notes

- The charging-sync worker depends on the Tesla session and charging queue schema being present.
- The repo docs for this area are `TELEMETRY_SETUP.md` and the telemetry/charging sections in `README.md`.
