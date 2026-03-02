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
  - **Metrics:** Distance, duration, energy used, efficiency (Wh/km or Wh/mi), and speed
  - **Filtering:** Filter trips by Week, Month, or Custom Date Range
  - **Export:** Download trip data as CSV or JSON

- **Advanced Analytics**
  - Daily Distance & Energy Consumption bar charts
  - Efficiency by Time of Day (2-hour buckets, bar chart)
  - Aggregated stats with **trend percentages** vs. previous period
  - Charging Sources breakdown (pie chart)

- **User Preferences & Security**
  - Seamless authentication via **Tesla OAuth** with extended 30-day active sessions
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
   
   # Encryption (for token storage)
   TOKEN_ENCRYPTION_KEY=your_random_32_byte_string
   ```

4. **Database Setup**
   Run the `database_schema.sql` script in your Supabase SQL Editor to create the necessary tables (`vehicles`, `trips`, etc.).
   Then run `scripts/create-app-settings.sql` to create the `app_settings` table for persistent user preferences.

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
├── telemetry-server.js   # Tesla telemetry ingest server
└── create-app-settings.sql  # App settings table migration
```

## 🗺️ Geocoding & Maps

TripBoard uses **OpenStreetMap Nominatim** for free reverse geocoding (converting coordinates to addresses). No additional API keys are required for basic map functionality.

- **Tiles:** CartoDB Dark Matter (via OpenStreetMap)
- **Geocoding:** Nominatim API

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any improvements or bug fixes.

## 📄 License

This project is licensed under the MIT License.
