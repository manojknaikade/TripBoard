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
  - Detailed logs of every trip
  - **Interactive Maps:** View full route with start/end markers
  - **Geocoding:** Automatic address resolution for start/end locations
  - **Metrics:** Distance, duration, energy used, and efficiency (Wh/km or Wh/mi)
  - **Filtering:** Filter trips by Week, Month, or Custom Date Range

- **Advanced Analytics**
  - Visual charts for Daily Distance & Energy Consumption
  - Efficiency analysis over time
  - Aggregated stats (Total Distance, Total Energy, Avg Efficiency)

- **User Preferences**
  - Toggle between **Metric** (km, kWh) and **Imperial** (mi, kWh) units
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
   
   # Tesla Fleet API
   TESLA_CLIENT_ID=your_tesla_client_id
   TESLA_CLIENT_SECRET=your_tesla_client_secret
   NEXT_PUBLIC_TESLA_REDIRECT_URI=http://localhost:3000/api/auth/tesla/callback
   
   # Encryption (for token storage)
   TOKEN_ENCRYPTION_KEY=your_random_32_byte_string
   ```

4. **Database Setup**
   Run the `database_schema.sql` script in your Supabase SQL Editor to create the necessary tables (`vehicles`, `trips`, `settings`, etc.).

5. **Run the Development Server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📂 Project Structure

```text
src/
├── app/
│   ├── api/            # API Routes (Tesla, Analytics, Geocode)
│   ├── auth/           # Authentication pages
│   ├── dashboard/      # Main dashboard pages (Overview, Trips, Analytics)
│   └── layout.tsx      # Root layout
├── components/         # Reusable UI components
│   ├── TripDetailMap.tsx   # Interactive full-size map
│   ├── TripMiniMap.tsx     # Thumbnail map for list views
│   └── ...
├── lib/                # Utilities and helpers
├── stores/             # Zustand state stores
└── types/              # TypeScript type definitions
```

## 🗺️ Geocoding & Maps

TripBoard uses **OpenStreetMap Nominatim** for free reverse geocoding (converting coordinates to addresses). No additional API keys are required for basic map functionality.

- **Tiles:** CartoDB Dark Matter (via OpenStreetMap)
- **Geocoding:** Nominatim API

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any improvements or bug fixes.

## 📄 License

This project is licensed under the MIT License.
