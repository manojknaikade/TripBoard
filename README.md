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
  - **Interactive Maps:** View full route with start/end markers
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
   
   # Encryption (used for Tesla token/session storage)
   # Generate with: openssl rand -base64 32
   TOKEN_ENCRYPTION_KEY=your_random_32_byte_string
   ```

   `TESLA_VEHICLE_COMMAND_PROXY_URL` is the Vehicle Command Proxy the app talks to for fleet telemetry config operations. `TESLA_TELEMETRY_HOSTNAME` and `TESLA_TELEMETRY_PORT` are the host/port Tesla vehicles should stream telemetry to.

4. **Database Setup**
   Use `supabase/schema.sql` as the bootstrap schema for a fresh Supabase project.
   After that, apply the SQL files in `supabase/migrations/` in chronological order to bring the database to the current app state.

   `database_schema.sql` is only a copied reference snapshot from Supabase for inspection. It is not the source of truth and should not be used for setup.

   **Key migrations:**
   - `supabase/migrations/20260312000000_create_tesla_sessions.sql` — Adds encrypted server-side Tesla session storage
   - `supabase/migrations/20260312010000_harden_public_table_rls.sql` — Enables RLS on exposed public tables and adds tighter policies
   - `supabase/migrations/20260311000000_trip_temperature_trigger.sql` — Adds temperature columns to `trips` and updates the `process_telemetry` trigger
   - `supabase/migrations/20260311000001_backfill_trip_temperatures.sql` — Backfills temperature data for all existing trips from raw telemetry
   - `supabase/migrations/20260313030000_add_map_style_setting.sql` — Adds a persisted per-user map style preference
   - `supabase/migrations/20260313040000_create_maintenance_records.sql` — Creates the base maintenance log with seeded tyre season history
   - `supabase/migrations/20260313050000_add_tyre_sets.sql` — Adds tyre set tracking and links seasonal records to specific sets
   - `supabase/migrations/20260313060000_add_record_odometer_ranges.sql` — Adds explicit start/end odometer fields for seasonal records
   - `supabase/migrations/20260313070000_add_maintenance_cost.sql` — Adds per-record service cost and currency fields

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
supabase/
├── schema.sql            # Canonical bootstrap schema for fresh projects
└── migrations/           # Incremental database changes
```

## ⚙️ Data Pipeline

TripBoard uses a **database-level trigger** (`process_telemetry`) on the `telemetry_raw` table to automatically:

- Update `vehicle_status` with the latest telemetry values
- Detect trip start/end based on gear changes (D/R → start, P → end)
- Track outside temperature (min/max/avg) during active trips
- Detect and record charging sessions with charger type classification
- Reconcile stale open charging sessions with `reconcile_stale_charging_sessions()`

The Go telemetry server on the VPS ingests raw Tesla Fleet Telemetry and inserts into `telemetry_raw`. All trip/charging logic runs as PL/pgSQL triggers in Supabase.
The legacy `scripts/vps-telemetry-server.js` charging detector is no longer part of the intended production path.
After applying the charging-detection migration in Supabase, stop any still-running legacy Node detector on the VPS to avoid duplicate `charging_sessions` writes.
The production `tesla-ingester.service` now loads its Supabase credentials from `/home/ubuntu/.env` via `EnvironmentFile=` instead of hardcoding secrets in the unit file. The Go binary expects `SUPABASE_KEY`, and that value should be the Supabase service role key.

## Maintenance Tracking Notes

- Maintenance records store odometer values in kilometers in the database. The UI converts to and from the user’s unit preference at the page boundary.
- Tyre mileage is derived from explicit start and end odometer ranges for each seasonal stint. It is not calculated by summing raw odometer readings.
- Tyre season and tyre rotation records can link to an existing tyre set or create a new set inline during record creation.
- Mounted/stored status is derived from seasonal history, while season itself remains the consistent visual accent for tyre sets.
- The maintenance dashboard now uses modal entry points for the maintenance form and the Tesla maintenance guide so the main page stays focused on KPI, tyre sets, and service history.
- Maintenance analytics uses the same maintenance data model, including open tyre stints that fall back to the current vehicle odometer when an explicit end odometer is not yet logged.

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
