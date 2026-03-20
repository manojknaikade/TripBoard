# Telemetry Setup

This document describes the current TripBoard telemetry architecture and the steps required to run it safely in development and production.

## Overview

TripBoard uses Tesla Fleet Telemetry with a two-part backend:

1. A Go telemetry ingester receives Tesla telemetry over HTTPS/WSS with mTLS.
2. Supabase stores raw events in `telemetry_raw` and derives application data with database functions and triggers.

The Go ingester is responsible only for transport, decoding, and raw ingestion.
Trip detection, charging-session detection, and related state updates happen in Supabase.

## Current Architecture

### Ingestion

- The Go ingester listens on port `443`.
- Tesla vehicles connect to the ingester using Fleet Telemetry.
- The ingester decodes Tesla messages and writes JSON payloads into `public.telemetry_raw`.
- The ingester uses `SUPABASE_URL` and `SUPABASE_KEY` from its runtime environment.
- `SUPABASE_KEY` must be the Supabase service role key.

### Database Processing

Supabase owns the application-side telemetry processing:

- `public.process_telemetry()` updates `vehicle_status`
- `public.process_telemetry()` detects trip start and trip end
- `public.process_telemetry()` detects charging-session start and charging-session completion
- `public.reconcile_stale_charging_sessions(interval)` closes stale open charging sessions when explicit end events are missing
- `public.enqueue_supercharger_tesla_sync_job()` queues completed Supercharger sessions for one-time Tesla billing enrichment

Relevant baseline migration:

- [supabase/migrations/20260320010000_initial_public_schema.sql](/Users/manojnaikade/Documents/TripBoard/supabase/migrations/20260320010000_initial_public_schema.sql)

### App-Side Telemetry Configuration

The Next.js app configures Tesla Fleet Telemetry through:

- [src/app/api/tesla/telemetry-config/route.ts](/Users/manojnaikade/Documents/TripBoard/src/app/api/tesla/telemetry-config/route.ts)

That route talks to the Vehicle Command Proxy and tells Tesla vehicles which host and port to stream telemetry to.

## Prerequisites

- A Supabase project
- A working Tesla Fleet API application
- A Vehicle Command Proxy
- A public HTTPS endpoint for the Go ingester
- TLS and mTLS correctly configured for Tesla Fleet Telemetry
- A deployed Next.js app with the required server-side env vars

## Required Environment Variables

### Next.js App

Set these in local `.env.local` and in production on Vercel:

```dotenv
TESLA_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\nreplace_with_your_tesla_public_key\n-----END PUBLIC KEY-----"
TOKEN_ENCRYPTION_KEY_PREVIOUS=
TESLA_VEHICLE_COMMAND_PROXY_URL=https://your-vehicle-proxy.example.com:4443
TESLA_TELEMETRY_HOSTNAME=your-telemetry-host.example.com
TESLA_TELEMETRY_PORT=443
CHARGING_SYNC_SECRET=your_charging_sync_secret
```

Meaning:

- `TESLA_PUBLIC_KEY_PEM`: public key served from `/.well-known/appspecific/com.tesla.3p.public-key.pem` for Tesla partner registration
- `TOKEN_ENCRYPTION_KEY_PREVIOUS`: optional fallback Tesla token encryption key during staged key rotation
- `TESLA_VEHICLE_COMMAND_PROXY_URL`: base URL of the Vehicle Command Proxy used by the app
- `TESLA_TELEMETRY_HOSTNAME`: hostname written into Tesla fleet telemetry configuration
- `TESLA_TELEMETRY_PORT`: port written into Tesla fleet telemetry configuration
- `CHARGING_SYNC_SECRET`: bearer token you generate yourself for the internal Tesla charging-sync processor route

`CRON_SECRET` is also accepted by the route as a legacy alias, but new setups should use only `CHARGING_SYNC_SECRET`.

These variables are required. The telemetry-config route no longer falls back to hardcoded production values.

### Go Ingester

Set these on the telemetry server:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_key
```

Optional aliases may still exist in your environment, but the deployed ingester expects `SUPABASE_KEY`.

## Supabase Setup

Use:

- [supabase/migrations/20260320010000_initial_public_schema.sql](/Users/manojnaikade/Documents/TripBoard/supabase/migrations/20260320010000_initial_public_schema.sql) as the current clean bootstrap migration
- [supabase/schema.sql](/Users/manojnaikade/Documents/TripBoard/supabase/schema.sql) as the checked-in public schema snapshot

Required telemetry-related tables and functions:

- `public.telemetry_raw`
- `public.vehicle_status`
- `public.trips`
- `public.charging_sessions`
- `public.charging_session_tesla_sync_jobs`
- `public.process_telemetry()`
- `public.reconcile_stale_charging_sessions(interval)`
- `public.claim_pending_tesla_charging_sync_jobs(integer)`

## Go Ingester Deployment

### Recommended Location

- working directory: `/opt/tesla-telemetry/go-decoder`
- service file: `/etc/systemd/system/tesla-ingester.service`
- env file: `/home/ubuntu/.env`

### Recommended systemd Unit

```ini
[Unit]
Description=Tesla Telemetry Ingester
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/tesla-telemetry/go-decoder
EnvironmentFile=/home/ubuntu/.env
ExecStart=/opt/tesla-telemetry/go-decoder/ingest
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Recommended Secret Handling

1. Store secrets only in `/home/ubuntu/.env`
2. Keep the file private with `chmod 600 /home/ubuntu/.env`
3. Do not hardcode Supabase credentials in the systemd unit
4. Use the Supabase service role key for telemetry ingestion

### Build

```bash
cd /opt/tesla-telemetry/go-decoder
go build -o ingest main.go
```

### Service Operations

```bash
sudo systemctl daemon-reload
sudo systemctl enable tesla-ingester
sudo systemctl restart tesla-ingester
sudo systemctl status tesla-ingester
sudo journalctl -u tesla-ingester -f
```

## Tesla Fleet Telemetry Configuration

TripBoard pushes telemetry configuration through the app, not manually from the server.

The app route:

- resolves the vehicle VIN when needed
- calls the Vehicle Command Proxy
- configures Tesla telemetry to stream to `TESLA_TELEMETRY_HOSTNAME:TESLA_TELEMETRY_PORT`
- serves the Tesla public key from environment configuration at `/.well-known/appspecific/com.tesla.3p.public-key.pem`

Fields currently configured include:

- `Location`
- `BatteryLevel`
- `Odometer`
- `VehicleSpeed`
- `Gear`
- `InsideTemp`
- `OutsideTemp`
- `DetailedChargeState`
- `FastChargerPresent`
- `FastChargerType`
- `LocatedAtHome`
- `DCChargingEnergyIn`
- `ACChargingEnergyIn`
- `ACChargingPower`
- `DCChargingPower`
- `DoorState`
- `TpmsPressureFl`
- `TpmsPressureFr`
- `TpmsPressureRl`
- `TpmsPressureRr`
- `Version`
- `EstBatteryRange`
- `RatedRange`
- `FdWindow`
- `FpWindow`
- `RdWindow`
- `RpWindow`

## Charging and Trip Detection

### Trips

Trips are derived in Supabase from telemetry state transitions, primarily gear changes:

- `D` or `R` starts a trip if no active trip exists
- `P` completes the active trip

### Charging Sessions

Charging sessions are derived in Supabase from charge-state and power telemetry:

- `DetailedChargeStateCharging` or `DetailedChargeStateStarting` starts a session
- completion states finish the session
- charger type is classified from fast-charger flags, power, and home-location context

### Stale Session Reconciliation

If telemetry does not send an explicit charging end event, stale sessions can be closed with:

```sql
select public.reconcile_stale_charging_sessions(interval '15 minutes');
```

If `pg_cron` is enabled, schedule that function every 10 to 15 minutes.

### Tesla Billing Enrichment

Completed Supercharger sessions are queued in `public.charging_session_tesla_sync_jobs`.
Process that queue from a backend cron, not from the frontend:

```bash
curl -fsS \
  -H "Authorization: Bearer $CHARGING_SYNC_SECRET" \
  "https://your-app.example.com/api/internal/charging/tesla-sync?limit=10"
```

That route fetches Tesla charging history once for each queued session and writes delivered kWh, Tesla cost, Tesla rate, and the sync marker back into `public.charging_sessions`.

## Production Cutover Notes

The legacy Node charging detector is no longer part of the intended production path.

If an old `vps-telemetry-server.js` process is still running, stop it after the Supabase charging-session migration is applied. Running both systems at the same time can create duplicate `charging_sessions` writes.

## Verification Checklist

After deployment, verify:

1. `tesla-ingester.service` is active
2. New rows are appearing in `public.telemetry_raw`
3. `process_telemetry()` is updating `vehicle_status`
4. Trips are being created in `public.trips`
5. Charging sessions are being created in `public.charging_sessions`
6. Completed Supercharger sessions are being inserted into `public.charging_session_tesla_sync_jobs`
7. `GET /api/internal/charging/tesla-sync` is processing queued jobs successfully
8. The telemetry-config API works from the app
9. The Vehicle Command Proxy is reachable from the app

Useful checks:

```bash
sudo systemctl status tesla-ingester
sudo journalctl -u tesla-ingester -f
```

```sql
select created_at, vin
from public.telemetry_raw
order by created_at desc
limit 20;
```

```sql
select *
from public.vehicle_status
order by updated_at desc
limit 20;
```

## Troubleshooting

### Telemetry Config API Returns Server Configuration Error

Check that these exist in the Next.js runtime environment:

- `TESLA_VEHICLE_COMMAND_PROXY_URL`
- `TESLA_TELEMETRY_HOSTNAME`
- `TESLA_TELEMETRY_PORT`

### No New Rows in `telemetry_raw`

Check:

- ingester service status
- TLS and mTLS setup
- Tesla Fleet Telemetry configuration
- server logs
- Supabase service role key on the ingester host

### Charging Sessions Not Closing

Check:

- `DetailedChargeState` is included in the Tesla telemetry config
- `process_telemetry()` migration is applied
- `reconcile_stale_charging_sessions()` is scheduled if you rely on stale-session cleanup

### Readable Location Names Are Missing

This is expected in the current design.

The DB-side charging detector stores coordinates in `charging_sessions`. Human-readable addresses can be enriched separately in the app if needed.

### TLS Handshake Noise in Ingester Logs

Public port `443` will attract scanner traffic. Random TLS handshake errors from unknown Internet clients do not necessarily indicate a Tesla integration failure.

Validate ingestion by checking for fresh rows in `telemetry_raw` rather than assuming every TLS error is application-impacting.

## Notes

- Tesla has moved from legacy `ChargeState` toward `DetailedChargeState`
- `DetailedChargeState` values may arrive with prefixes such as `DetailedChargeStateCharging`
- TripBoard normalizes those values in Supabase processing
- updating the app alone does not change the car stream; Tesla telemetry configuration must be pushed again when field definitions change
