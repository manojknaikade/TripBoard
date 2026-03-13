-- TripBoard database bootstrap schema for Supabase.
-- Apply this file on a fresh project, then run all files in supabase/migrations in chronological order.
-- database_schema.sql is only a copied reference snapshot from Supabase and is not the source of truth.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  units TEXT DEFAULT 'imperial' CHECK (units IN ('imperial', 'metric')),
  region TEXT DEFAULT 'eu' CHECK (region IN ('na', 'eu', 'cn')),
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tesla_id TEXT NOT NULL,
  vin TEXT NOT NULL,
  display_name TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  region TEXT DEFAULT 'eu' CHECK (region IN ('na', 'eu', 'cn')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tesla_id)
);

CREATE TABLE IF NOT EXISTS tesla_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token_hash TEXT NOT NULL UNIQUE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  region TEXT NOT NULL DEFAULT 'eu' CHECK (region IN ('na', 'eu', 'cn')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global app settings used by server-side flows that do not rely on Supabase Auth.
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  region TEXT DEFAULT 'eu',
  units TEXT DEFAULT 'metric',
  notifications_enabled BOOLEAN DEFAULT true,
  data_source TEXT DEFAULT 'telemetry',
  polling_driving INTEGER DEFAULT 30,
  polling_charging INTEGER DEFAULT 60,
  polling_parked INTEGER DEFAULT 300,
  polling_sleeping INTEGER DEFAULT 600,
  home_latitude DOUBLE PRECISION,
  home_longitude DOUBLE PRECISION,
  home_address TEXT,
  currency TEXT DEFAULT 'CHF',
  date_format TEXT DEFAULT 'DD/MM',
  map_style TEXT DEFAULT 'streets' CHECK (map_style IN ('streets', 'dark')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-user settings for Supabase-authenticated flows.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  polling_driving INTEGER DEFAULT 30,
  polling_charging INTEGER DEFAULT 300,
  polling_parked INTEGER DEFAULT 1800,
  polling_sleeping INTEGER DEFAULT 3600,
  region TEXT DEFAULT 'eu' CHECK (region IN ('na', 'eu', 'cn')),
  units TEXT DEFAULT 'imperial' CHECK (units IN ('imperial', 'metric')),
  notifications_enabled BOOLEAN DEFAULT true,
  data_source TEXT DEFAULT 'telemetry' CHECK (data_source IN ('polling', 'telemetry')),
  map_style TEXT DEFAULT 'streets' CHECK (map_style IN ('streets', 'dark')),
  currency TEXT DEFAULT 'CHF',
  date_format TEXT DEFAULT 'DD/MM',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Polling settings per vehicle
CREATE TABLE IF NOT EXISTS polling_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driving_interval_sec INTEGER DEFAULT 30,
  charging_interval_sec INTEGER DEFAULT 300,
  parked_interval_sec INTEGER DEFAULT 1800,
  sleeping_interval_sec INTEGER DEFAULT 3600,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vehicle_id)
);

-- Trips table
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  start_latitude DOUBLE PRECISION,
  start_longitude DOUBLE PRECISION,
  start_address TEXT,
  end_latitude DOUBLE PRECISION,
  end_longitude DOUBLE PRECISION,
  end_address TEXT,
  distance_miles DOUBLE PRECISION DEFAULT 0,
  start_battery_pct INTEGER,
  end_battery_pct INTEGER,
  energy_used_kwh DOUBLE PRECISION,
  max_speed_mph DOUBLE PRECISION,
  avg_speed_mph DOUBLE PRECISION,
  route_polyline TEXT,
  is_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trip waypoints (detailed route tracking)
CREATE TABLE IF NOT EXISTS trip_waypoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed_mph DOUBLE PRECISION,
  battery_level INTEGER,
  odometer DOUBLE PRECISION,
  heading INTEGER
);

-- Charging sessions
CREATE TABLE IF NOT EXISTS charging_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  start_battery_pct INTEGER,
  end_battery_pct INTEGER,
  energy_added_kwh DOUBLE PRECISION,
  charge_rate_kw DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_name TEXT,
  charger_type TEXT, -- 'home', 'supercharger', 'destination', 'other'
  cost_estimate DOUBLE PRECISION,
  is_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicle snapshots (historical state data)
CREATE TABLE IF NOT EXISTS vehicle_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state TEXT, -- 'online', 'asleep', 'offline'
  battery_level INTEGER,
  battery_range DOUBLE PRECISION,
  charging_state TEXT,
  charge_limit_soc INTEGER,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  odometer DOUBLE PRECISION,
  inside_temp DOUBLE PRECISION,
  outside_temp DOUBLE PRECISION,
  is_climate_on BOOLEAN,
  shift_state TEXT,
  speed DOUBLE PRECISION
);

-- Raw telemetry payloads ingested from the external telemetry server.
CREATE TABLE IF NOT EXISTS telemetry_raw (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  vin TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);

-- Latest denormalized telemetry state for the vehicle.
CREATE TABLE IF NOT EXISTS vehicle_status (
  vin TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  shift_state TEXT,
  speed NUMERIC,
  odometer NUMERIC,
  battery_level NUMERIC,
  lat NUMERIC,
  lon NUMERIC,
  inside_temp NUMERIC,
  outside_temp NUMERIC,
  is_locked BOOLEAN,
  current_trip_id UUID,
  trip_start_battery NUMERIC,
  trip_start_odometer NUMERIC,
  sentry_mode BOOLEAN,
  charge_state TEXT,
  charger_power NUMERIC,
  is_climate_on BOOLEAN,
  car_version TEXT,
  door_df BOOLEAN DEFAULT false,
  door_dr BOOLEAN DEFAULT false,
  door_pf BOOLEAN DEFAULT false,
  door_pr BOOLEAN DEFAULT false,
  trunk_ft BOOLEAN DEFAULT false,
  trunk_rt BOOLEAN DEFAULT false,
  tpms_fl NUMERIC,
  tpms_fr NUMERIC,
  tpms_rl NUMERIC,
  tpms_rr NUMERIC,
  est_battery_range NUMERIC,
  charge_energy_added NUMERIC,
  time_to_full_charge NUMERIC,
  heading NUMERIC,
  rated_range NUMERIC,
  window_fd TEXT,
  window_fp TEXT,
  window_rd TEXT,
  window_rp TEXT,
  home_address TEXT,
  current_charging_session_id UUID,
  home_latitude NUMERIC,
  home_longitude NUMERIC
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tyre_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_key TEXT UNIQUE,
  name TEXT NOT NULL,
  season TEXT NOT NULL CHECK (season IN ('summer', 'winter', 'all_season')),
  purchase_date DATE,
  purchase_odometer_km INTEGER CHECK (purchase_odometer_km IS NULL OR purchase_odometer_km >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_key TEXT UNIQUE,
  tyre_set_id UUID REFERENCES tyre_sets(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL CHECK (
    service_type IN (
      'tyre_season',
      'tyre_rotation',
      'wheel_alignment',
      'cabin_air_filter',
      'hepa_filter',
      'brake_fluid_check',
      'brake_service',
      'wiper_blades',
      'ac_desiccant_bag',
      'twelve_volt_battery',
      'other'
    )
  ),
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  start_odometer_km INTEGER CHECK (start_odometer_km IS NULL OR start_odometer_km >= 0),
  end_odometer_km INTEGER CHECK (end_odometer_km IS NULL OR end_odometer_km >= 0),
  odometer_km INTEGER CHECK (odometer_km IS NULL OR odometer_km >= 0),
  cost_amount NUMERIC CHECK (cost_amount IS NULL OR cost_amount >= 0),
  cost_currency TEXT,
  season TEXT CHECK (season IS NULL OR season IN ('summer', 'winter', 'all_season')),
  rotation_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (
    rotation_status IN ('rotated', 'not_rotated', 'unknown', 'not_applicable')
  ),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_id ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_start_time ON trips(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_trip_waypoints_trip_id ON trip_waypoints(trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_waypoints_trip_id_timestamp ON trip_waypoints(trip_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_charging_sessions_vehicle_id ON charging_sessions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_snapshots_vehicle_id_timestamp ON vehicle_snapshots(vehicle_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(vehicle_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tyre_sets_status ON tyre_sets(status, season, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_start_date ON maintenance_records(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_service_type ON maintenance_records(service_type, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_tyre_set_id ON maintenance_records(tyre_set_id, start_date DESC);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tesla_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE polling_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE charging_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tyre_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Vehicles
CREATE POLICY "Users can view own vehicles" ON vehicles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vehicles" ON vehicles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vehicles" ON vehicles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own vehicles" ON vehicles FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage tesla sessions" ON tesla_sessions FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Global settings remain service-role only until modeled per user.
CREATE POLICY "Service role can manage app settings" ON app_settings FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Per-user settings
CREATE POLICY "Users can view own settings" ON user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE USING (auth.uid() = user_id);

-- Polling settings
CREATE POLICY "Users can view own polling settings" ON polling_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = polling_settings.vehicle_id AND vehicles.user_id = auth.uid()));
CREATE POLICY "Users can manage own polling settings" ON polling_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = polling_settings.vehicle_id AND vehicles.user_id = auth.uid()));

-- Trips
CREATE POLICY "Users can view own trips" ON trips FOR SELECT
  USING (EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = trips.vehicle_id AND vehicles.user_id = auth.uid()));
CREATE POLICY "Users can manage own trips" ON trips FOR ALL
  USING (EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = trips.vehicle_id AND vehicles.user_id = auth.uid()));

-- Trip waypoints
CREATE POLICY "Users can view own waypoints" ON trip_waypoints FOR SELECT
  USING (EXISTS (SELECT 1 FROM trips JOIN vehicles ON trips.vehicle_id::text = vehicles.id::text WHERE trips.id = trip_waypoints.trip_id AND vehicles.user_id = auth.uid()));
CREATE POLICY "Users can manage own waypoints" ON trip_waypoints FOR ALL
  USING (EXISTS (SELECT 1 FROM trips JOIN vehicles ON trips.vehicle_id::text = vehicles.id::text WHERE trips.id = trip_waypoints.trip_id AND vehicles.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM trips JOIN vehicles ON trips.vehicle_id::text = vehicles.id::text WHERE trips.id = trip_waypoints.trip_id AND vehicles.user_id = auth.uid()));

-- Charging sessions
CREATE POLICY "Users can view own charging sessions" ON charging_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = charging_sessions.vehicle_id AND vehicles.user_id = auth.uid()));
CREATE POLICY "Users can manage own charging sessions" ON charging_sessions FOR ALL
  USING (EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = charging_sessions.vehicle_id AND vehicles.user_id = auth.uid()));

-- Vehicle snapshots
CREATE POLICY "Users can view own snapshots" ON vehicle_snapshots FOR SELECT
  USING (EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = vehicle_snapshots.vehicle_id AND vehicles.user_id = auth.uid()));
CREATE POLICY "Users can manage own snapshots" ON vehicle_snapshots FOR ALL
  USING (EXISTS (SELECT 1 FROM vehicles WHERE vehicles.id = vehicle_snapshots.vehicle_id AND vehicles.user_id = auth.uid()));

-- Raw telemetry is only for server-side ingestion and maintenance.
CREATE POLICY "Service role can manage telemetry raw" ON telemetry_raw FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Vehicle status can be read by the owning user; writes stay service-role only.
CREATE POLICY "Users can view own vehicle status" ON vehicle_status FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM vehicles
      WHERE vehicles.user_id = auth.uid()
        AND vehicles.vin = REPLACE(vehicle_status.vin, 'vehicle_device.', '')
    )
  );
CREATE POLICY "Service role can manage vehicle status" ON vehicle_status FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Notifications can be read by the owning user; writes stay service-role only.
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM vehicles
      WHERE vehicles.id = notifications.vehicle_id
        AND vehicles.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role can manage notifications" ON notifications FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage tyre sets" ON tyre_sets FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Maintenance log is currently managed through server-side flows only.
CREATE POLICY "Service role can manage maintenance records" ON maintenance_records FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for new user profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_polling_settings_updated_at BEFORE UPDATE ON polling_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tyre_sets_updated_at BEFORE UPDATE ON tyre_sets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_maintenance_records_updated_at BEFORE UPDATE ON maintenance_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO app_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

INSERT INTO tyre_sets (
  source_key,
  name,
  season,
  purchase_date,
  purchase_odometer_km,
  status,
  notes
)
VALUES
  (
    'initial-tyre-set-summer',
    'Summer set',
    'summer',
    NULL,
    NULL,
    'active',
    'Inferred from existing seasonal tyre history.'
  ),
  (
    'initial-tyre-set-winter',
    'Winter set',
    'winter',
    NULL,
    NULL,
    'active',
    'Inferred from existing seasonal tyre history.'
  )
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO maintenance_records (
  source_key,
  tyre_set_id,
  service_type,
  title,
  start_date,
  end_date,
  start_odometer_km,
  end_odometer_km,
  odometer_km,
  cost_amount,
  cost_currency,
  season,
  rotation_status,
  notes
)
VALUES
  (
    'initial-tyre-summer-2024',
    (SELECT id FROM tyre_sets WHERE source_key = 'initial-tyre-set-summer'),
    'tyre_season',
    'Summer tyres installed',
    DATE '2024-05-01',
    DATE '2024-10-10',
    0,
    6881,
    6881,
    NULL,
    NULL,
    'summer',
    'unknown',
    'Odometer reading logged at changeover. Start month provided as May 2024; assumed 2024-05-01.'
  ),
  (
    'initial-tyre-winter-2024',
    (SELECT id FROM tyre_sets WHERE source_key = 'initial-tyre-set-winter'),
    'tyre_season',
    'Winter tyres installed',
    DATE '2024-10-10',
    DATE '2025-04-16',
    6881,
    15841,
    15841,
    NULL,
    NULL,
    'winter',
    'unknown',
    'Odometer reading logged at changeover.'
  ),
  (
    'initial-tyre-summer-2025',
    (SELECT id FROM tyre_sets WHERE source_key = 'initial-tyre-set-summer'),
    'tyre_season',
    'Summer tyres installed',
    DATE '2025-04-16',
    DATE '2025-10-30',
    15841,
    27848,
    27848,
    NULL,
    NULL,
    'summer',
    'unknown',
    'Odometer reading logged at changeover. Original note: "Summer without rotation?"'
  ),
  (
    'initial-tyre-winter-2025',
    (SELECT id FROM tyre_sets WHERE source_key = 'initial-tyre-set-winter'),
    'tyre_season',
    'Winter tyres installed',
    DATE '2025-10-30',
    NULL,
    27848,
    NULL,
    NULL,
    NULL,
    NULL,
    'winter',
    'not_applicable',
    'Current open winter season. No odometer value was provided in the source log.'
  )
ON CONFLICT (source_key) DO NOTHING;
