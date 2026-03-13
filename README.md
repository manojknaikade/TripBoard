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
  - **Metrics:** Distance, duration, energy used, efficiency (Wh/km or Wh/mi), speed, and **outside temperature** (min/max/avg)
  - **Filtering:** Filter trips by Week, Month, or Custom Date Range
  - **Export:** Download trip data as CSV or JSON

- **Advanced Analytics**
  - Daily Distance & Energy Consumption bar charts
  - Efficiency by Time of Day (2-hour buckets, bar chart)
  - Aggregated stats with **trend percentages** vs. previous period
  - **Top Trips Leaderboard:** Longest, shortest, and most efficient trips
  - **Temperature Impact:** Chart correlating outside temperature with driving efficiency
  - **Vampire Drain:** Estimated energy loss while parked (trip-interstitial method)
  - Charging Sources breakdown (pie chart)
  - **Cost by Charging Source:** Horizontal bar chart showing costs per charger type

- **User Preferences & Security**
  - Seamless authentication via **Tesla OAuth** or direct Tesla API token entry
  - Same-device sessions persist for up to 30 days via an **HttpOnly** session cookie
  - Tesla access and refresh tokens are stored **server-side in Supabase** and encrypted with `TOKEN_ENCRYPTION_KEY`
  - Toggle between **Metric** (km, kWh) and **Imperial** (mi, kWh) units
  - Set home address with interactive map picker
  - Settings persisted to **Supabase** (survives browser clears)
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
   
   # Encryption (used for Tesla token/session storage)
   # Generate with: openssl rand -base64 32
   TOKEN_ENCRYPTION_KEY=your_random_32_byte_string
   ```

4. **Database Setup**
   Use `supabase/schema.sql` as the bootstrap schema for a fresh Supabase project.
   After that, apply the SQL files in `supabase/migrations/` in chronological order to bring the database to the current app state.

   `database_schema.sql` is only a copied reference snapshot from Supabase for inspection. It is not the source of truth and should not be used for setup.

   **Key migrations:**
   - `supabase/migrations/20260312000000_create_tesla_sessions.sql` — Adds encrypted server-side Tesla session storage
   - `supabase/migrations/20260312010000_harden_public_table_rls.sql` — Enables RLS on exposed public tables and adds tighter policies
   - `supabase/migrations/20260311000000_trip_temperature_trigger.sql` — Adds temperature columns to `trips` and updates the `process_telemetry` trigger
   - `supabase/migrations/20260311000001_backfill_trip_temperatures.sql` — Backfills temperature data for all existing trips from raw telemetry

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
│   │   ├── settings/     #   User settings & home location
│   │   ├── trips/        #   Trip data & CSV/JSON export
│   │   └── tesla/        #   Tesla Fleet API integration
│   ├── auth/             # Authentication pages
│   ├── dashboard/        # Dashboard, Trips, Analytics, Settings
│   └── layout.tsx        # Root layout
├── components/           # Reusable UI components
│   ├── TripDetailMap.tsx     # Interactive full-size map
│   ├── TripMiniMap.tsx       # Thumbnail map for list views
│   └── settings/             # Settings-specific components
├── lib/
│   ├── supabase/         # Supabase clients (server, admin)
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
