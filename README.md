# TripBoard ⚡️

A modern, real-time dashboard for tracking and analyzing Tesla vehicle data. TripBoard provides detailed insights into your trips, charging efficiency, and vehicle status with a beautiful, dark-themed UI.

![TripBoard Dashboard](https://github.com/user-attachments/assets/placeholder-image)

## 🚀 Features

- **Real-Time Dashboard**
  - Live vehicle status (Online/Asleep)
  - Current battery level and estimated range
  - Location tracking with interactive maps
  - Quick commands (Lock/Unlock, Climate, etc.)

- **Trip History & Maps**
  - Detailed logs of every trip with average speed
  - **Interactive Maps:** View exact recorded trip routes with start/end markers
  - **Route Thumbnails:** Trip list mini-maps render the recorded route instead of a straight-line placeholder
  - **Geocoding:** Automatic address resolution for start/end locations
  - **Map Style Preference:** Switch between street and dark basemaps
  - **Metrics:** Distance, duration, energy used, efficiency (Wh/km or Wh/mi), speed, and **outside temperature** (min/max/avg)
  - **Filtering:** Filter trips by Week, Month, or Custom Date Range
  - **Export:** Download trip data as CSV or JSON

- **Advanced Analytics**
  - Daily Distance & Energy Consumption bar charts
  - **All Time analytics support** with daily buckets preserved for long-range driving and charging charts
  - Efficiency by Time of Day (2-hour buckets, bar chart)
  - Aggregated stats with **trend percentages** vs. previous period
  - **Top Trips Leaderboard:** Longest, shortest, and most efficient trips
  - **Temperature Impact:** Chart correlating outside temperature with driving efficiency
  - **Vampire Drain:** Estimated energy loss while parked (trip-interstitial method)
  - Charging Sources breakdown (pie chart)
  - **Cost by Charging Source:** Horizontal bar chart showing costs per charger type
  - **Charging Loss Analytics:** Separate battery energy, charger-delivered energy, measured charging loss, and estimated wasted charging cost
  - **Maintenance analytics tab:** Service volume, spend, average service cost, tyre work, and tracked tyre-set mileage

- **Maintenance & Tyre Tracking**
  - Dedicated maintenance dashboard for tyre sets, seasonal swaps, rotations, and common Tesla service items
  - Track tyre sets separately from maintenance records, including mounted vs. stored sets
  - Record explicit service cost, start odometer, and end odometer for maintenance entries
  - Inline creation of a new tyre set while logging a tyre season change or rotation
  - Maintenance UI follows the app unit setting while persisting odometer values in kilometers
  - Maintenance analytics uses `This Year`, `Last Year`, and `All Time` filters for service reporting

- **User Preferences & Security**
  - Seamless authentication via **Tesla OAuth** or direct Tesla API token entry
  - Same-device sessions persist for up to 30 days via an **HttpOnly** session cookie
  - Tesla access and refresh tokens are stored **server-side in Supabase** and encrypted with `TOKEN_ENCRYPTION_KEY`
  - Toggle between **Metric** (km, kWh) and **Imperial** (mi, kWh) units
  - Set home address with interactive map picker
  - Settings persisted to **Supabase** (survives browser clears)
  - Selectable map style across dashboard, trip, charging, and settings maps
  - Customizable polling intervals

## 🛠 Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Database & Auth:** [Supabase](https://supabase.com/)
- **State Management:** [Zustand](https://github.com/pmndrs/zustand)
- **Maps:** [Leaflet](https://leafletjs.com/) with [React Leaflet](https://react-leaflet.js.org/) & OpenStreetMap
- **Charts:** [Recharts](https://recharts.org/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **API:** Tesla Fleet API Integration

## 🏁 Getting Started

### Prerequisites

- Node.js 18+ and npm
- A [Supabase](https://supabase.com/) project
- A Tesla Account (for Fleet API access)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/tripboard.git
   cd tripboard
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env.local` file in the root directory:

   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   # Tesla Fleet API
   TESLA_CLIENT_ID=your_tesla_client_id
   TESLA_CLIENT_SECRET=your_tesla_client_secret
   NEXT_PUBLIC_TESLA_REDIRECT_URI=http://localhost:3000/api/auth/tesla/callback
   TESLA_VEHICLE_COMMAND_PROXY_URL=https://your-vehicle-proxy.example.com:4443
   TESLA_TELEMETRY_HOSTNAME=your-telemetry-host.example.com
   TESLA_TELEMETRY_PORT=443
   CHARGING_SYNC_SECRET=your_charging_sync_secret
   
   # Encryption (used for Tesla token/session storage)
   # Generate with: openssl rand -base64 32
   TOKEN_ENCRYPTION_KEY=your_random_32_byte_string
   ```

   `TESLA_VEHICLE_COMMAND_PROXY_URL` is the Vehicle Command Proxy the app talks to for fleet telemetry config operations. `TESLA_TELEMETRY_HOSTNAME` and `TESLA_TELEMETRY_PORT` are the host/port Tesla vehicles should stream telemetry to. `CHARGING_SYNC_SECRET` protects the internal route that processes completed Supercharger sessions and writes Tesla billing data into `charging_sessions`.

4. **Database Setup**
   Use `supabase/schema.sql` as the current public-schema snapshot for a fresh Supabase project.
   Use `supabase/migrations/` for incremental schema changes going forward. Do not apply the full snapshot and then replay the full migration history on top of it.
   Whenever a migration is added or applied manually, refresh `supabase/schema.sql` from the live database so the checked-in snapshot stays accurate.

   If a migration fails with `relation ... does not exist`, the database is usually missing an earlier dependency or the expected base schema has not been applied yet.

   **Key migrations:**
   - `supabase/migrations/20260312000000_create_tesla_sessions.sql` — Adds encrypted server-side Tesla session storage
   - `supabase/migrations/20260312010000_harden_public_table_rls.sql` — Enables RLS on exposed public tables and adds tighter policies
   - `supabase/migrations/20260312013000_harden_functions_and_policies.sql` — Hardens exposed SQL functions and related policies after the base schema exists
   - `supabase/migrations/20260311000000_trip_temperature_trigger.sql` — Adds temperature columns to `trips` and updates the `process_telemetry` trigger
   - `supabase/migrations/20260311000001_backfill_trip_temperatures.sql` — Backfills temperature data for all existing trips from raw telemetry
   - `supabase/migrations/20260313030000_add_map_style_setting.sql` — Adds a persisted per-user map style preference
   - `supabase/migrations/20260313040000_create_maintenance_records.sql` — Creates the base maintenance log with seeded tyre season history
   - `supabase/migrations/20260313050000_add_tyre_sets.sql` — Adds tyre set tracking and links seasonal records to specific sets
   - `supabase/migrations/20260313060000_add_record_odometer_ranges.sql` — Adds explicit start/end odometer fields for seasonal records
   - `supabase/migrations/20260313070000_add_maintenance_cost.sql` — Adds per-record service cost and currency fields
   - `supabase/migrations/20260313080000_add_trip_route_waypoints.sql` — Captures exact route waypoints for future trips and backfills historical trip routes from `telemetry_raw`
   - `supabase/migrations/20260315021000_add_tesla_charging_sync_queue.sql` — Adds the Tesla Supercharger enrichment queue and extends `tesla_sessions` with `user_id`
   - `supabase/migrations/20260315190000_add_maintenance_summary_function.sql` — Adds an optional SQL aggregate used as a performance optimization for maintenance summary endpoints
   - `supabase/migrations/20260315220000_add_analytics_rollups_and_indexes.sql` — Adds charging analytics SQL rollups and partial time-range indexes used by the dashboard analytics routes
   - `supabase/migrations/20260315233000_add_list_summary_functions.sql` — Adds SQL rollups for trip-list and charging-list summary cards so those headers do not require scanning filtered rows in Next.js route handlers

5. **Run the Development Server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📂 Project Structure

```text
src/
├── app/
│   ├── api/              # API Routes
│   │   ├── analytics/    #   Analytics summary with trend %
│   │   ├── maintenance/  #   Maintenance records and tyre sets
│   │   ├── settings/     #   User settings & home location
│   │   ├── trips/        #   Trip data & CSV/JSON export
│   │   └── tesla/        #   Tesla Fleet API integration
│   ├── auth/             # Authentication pages
│   ├── dashboard/        # Dashboard, Trips, Charging, Analytics, Maintenance, Settings
│   └── layout.tsx        # Root layout
├── components/           # Reusable UI components
│   ├── TripDetailMap.tsx     # Interactive full-size map
│   ├── TripMiniMap.tsx       # Thumbnail map for list views
│   └── settings/             # Settings-specific components
├── lib/
│   ├── supabase/         # Supabase clients (server, admin)
│   ├── maintenance.ts    # Maintenance types and Tesla maintenance guide definitions
│   └── utils/            # Trip detection, polling, helpers
├── stores/               # Zustand state stores
└── types/                # TypeScript type definitions
scripts/
├── telemetry-server.js   # Legacy/local Node telemetry prototype
├── process-charging-sync.js # Standalone worker that enriches completed Supercharger sessions with Tesla billing data
supabase/
├── schema.sql            # Canonical bootstrap schema for fresh projects
└── migrations/           # Incremental database changes
```

## ⚙️ Data Pipeline

TripBoard uses a **database-level trigger** (`process_telemetry`) on the `telemetry_raw` table to automatically:

- Update `vehicle_status` with the latest telemetry values
- Detect trip start/end based on gear changes (D/R → start, P → end)
- Record `trip_waypoints` during active trips so trip detail maps and list thumbnails can render the exact route taken
- Track outside temperature (min/max/avg) during active trips
- Detect and record charging sessions with charger type classification
- Reconcile stale open charging sessions with `reconcile_stale_charging_sessions()`
- Queue completed Supercharger sessions for one-time Tesla billing enrichment

The Go telemetry server on the VPS ingests raw Tesla Fleet Telemetry and inserts into `telemetry_raw`. All trip/charging logic runs as PL/pgSQL triggers in Supabase.
Completed Supercharger sessions are queued in Supabase and can be processed either by calling `GET /api/internal/charging/tesla-sync` from a server-side cron with `Authorization: Bearer $CHARGING_SYNC_SECRET` (or `CRON_SECRET`), or by running `scripts/process-charging-sync.js` as a standalone worker on the VPS.
Historical trip routes can be backfilled from `telemetry_raw` into `trip_waypoints` by applying `supabase/migrations/20260313080000_add_trip_route_waypoints.sql`.
The legacy `scripts/vps-telemetry-server.js` charging detector is no longer part of the intended production path.
After applying the charging-detection migration in Supabase, stop any still-running legacy Node detector on the VPS to avoid duplicate `charging_sessions` writes.
The production `tesla-ingester.service` now loads its Supabase credentials from `/home/ubuntu/.env` via `EnvironmentFile=` instead of hardcoding secrets in the unit file. The Go binary expects `SUPABASE_KEY`, and that value should be the Supabase service role key.
The current production charging-billing enrichment runs as a separate `systemd` timer on the VPS using `scripts/process-charging-sync.js`, so completed Supercharger sessions are typically enriched within 30 seconds of being closed in Supabase.

## Performance Notes

- The app now uses a short-lived in-memory client fetch cache for selected dashboard pages and analytics views. It is intentionally a UX optimization, not a persistence layer.
- List pages such as trips, charging, and maintenance hydrate from a recent cached response when available, then refresh in the background so the first screen feels immediate without requiring a hard reload.
- Trips, charging, and maintenance service history now use windowed rendering so DOM cost stays bounded even after many pages have been loaded.
- Trips and charging prefetch the next page in the background before the user reaches the end of the current page, so scrolling feels continuous instead of waiting at the bottom.
- Maintenance uses a dedicated bootstrap endpoint (`/api/maintenance/bootstrap`) to load tyre sets, the first history page, summary cards, and current odometer in a single request.
- Dashboard and settings now prefetch their initial settings and Tesla vehicle summaries on the server, so those routes no longer depend on a client-only boot fetch before they can render useful content.
- Analytics pages also prefetch their default timeframe data on the server, so opening analytics does not start from a blank client shell and a full-screen loader.
- Trip and charging list summary cards prefer SQL rollups (`get_trip_list_summary()` and `get_charging_list_summary()`) and fall back to query-based aggregation if those functions are not deployed yet.
- The settings location search now goes through the app’s cached geocode route instead of calling Nominatim directly from the browser.
- Live vehicle fetches now use a shared short-TTL request layer, so concurrent dashboard/map consumers can reuse the same in-flight response instead of polling independently.

## Repo Hygiene

- Update `README.md` whenever product behavior, setup, migrations, or operational expectations change.
- Refresh `supabase/schema.sql` after database migrations are added or applied so the repo snapshot matches the live public schema.
- Do not commit `supabase/.temp/`; it is Supabase CLI working state only.

## Maintenance Tracking Notes

- Maintenance records store odometer values in kilometers in the database. The UI converts to and from the user’s unit preference at the page boundary.
- Tyre mileage is derived from explicit start and end odometer ranges for each seasonal stint. It is not calculated by summing raw odometer readings.
- Tyre season and tyre rotation records can link to an existing tyre set or create a new set inline during record creation.
- Mounted/stored status is derived from seasonal history, while season itself remains the consistent visual accent for tyre sets.
- The maintenance dashboard now uses modal entry points for the maintenance form and the Tesla maintenance guide so the main page stays focused on KPI, tyre sets, and service history.
- Maintenance analytics uses the same maintenance data model, including open tyre stints that fall back to the current vehicle odometer when an explicit end odometer is not yet logged.
- `get_maintenance_summary()` is an optimization, not a hard dependency. If the SQL function migration has not been applied yet, the maintenance APIs fall back to query-based summary calculation.

## Security Notes

- Tesla access and refresh tokens are never stored in `localStorage`.
- The browser only keeps an opaque `HttpOnly` session cookie named `tesla_session`.
- Tesla credentials live in the `tesla_sessions` table in Supabase and are encrypted at rest using `TOKEN_ENCRYPTION_KEY`.
- Rotating `TOKEN_ENCRYPTION_KEY` invalidates existing Tesla sessions until users reconnect.
- Public tables exposed through PostgREST should have RLS enabled. This repo now hardens `app_settings`, `telemetry_raw`, `notifications`, `vehicle_status`, and related tables through `supabase/migrations/20260312010000_harden_public_table_rls.sql`.
- Routes that use the Supabase service role key are additionally gated server-side in Next.js, because service-role access bypasses RLS by design.
- The production telemetry ingester should load secrets from `/home/ubuntu/.env` through systemd `EnvironmentFile=`. Avoid embedding Supabase keys directly in `/etc/systemd/system/tesla-ingester.service`.

## 🗺️ Geocoding & Maps

TripBoard uses **OpenStreetMap Nominatim** for free reverse geocoding (converting coordinates to addresses). No additional API keys are required for basic map functionality.

- **Tiles:** CartoDB Dark Matter (via OpenStreetMap)
- **Geocoding:** Nominatim API

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any improvements or bug fixes.

## 📄 License

This project is licensed under the MIT License.
