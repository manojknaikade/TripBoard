-- TripBoard Database Schema for Supabase
-- Run this in the Supabase SQL Editor

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

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_id ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_start_time ON trips(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_trip_waypoints_trip_id ON trip_waypoints(trip_id);
CREATE INDEX IF NOT EXISTS idx_charging_sessions_vehicle_id ON charging_sessions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_snapshots_vehicle_id_timestamp ON vehicle_snapshots(vehicle_id, timestamp DESC);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE polling_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE charging_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_snapshots ENABLE ROW LEVEL SECURITY;

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
  USING (EXISTS (SELECT 1 FROM trips JOIN vehicles ON trips.vehicle_id = vehicles.id WHERE trips.id = trip_waypoints.trip_id AND vehicles.user_id = auth.uid()));
CREATE POLICY "Users can manage own waypoints" ON trip_waypoints FOR ALL
  USING (EXISTS (SELECT 1 FROM trips JOIN vehicles ON trips.vehicle_id = vehicles.id WHERE trips.id = trip_waypoints.trip_id AND vehicles.user_id = auth.uid()));

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

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_polling_settings_updated_at BEFORE UPDATE ON polling_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
