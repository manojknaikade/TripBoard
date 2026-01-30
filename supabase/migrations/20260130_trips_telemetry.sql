-- TripBoard Database Schema
-- Migration: Create trips and telemetry tables

-- Vehicle snapshots table (stores periodic vehicle state)
CREATE TABLE IF NOT EXISTS vehicle_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vehicle_id TEXT NOT NULL,
    vin TEXT,
    
    -- Battery & Charge
    battery_level INTEGER,
    battery_range DECIMAL(10, 2),
    charging_state TEXT,
    charger_power DECIMAL(10, 2),
    
    -- Location
    latitude DECIMAL(10, 6),
    longitude DECIMAL(10, 6),
    heading INTEGER,
    
    -- Drive state
    speed DECIMAL(10, 2),
    odometer DECIMAL(12, 2),
    power INTEGER,
    shift_state TEXT,
    
    -- Climate
    inside_temp DECIMAL(5, 2),
    outside_temp DECIMAL(5, 2),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    source TEXT DEFAULT 'api' -- 'api' or 'telemetry'
);

-- Create index for querying by user and time
CREATE INDEX idx_snapshots_user_time ON vehicle_snapshots(user_id, created_at DESC);
CREATE INDEX idx_snapshots_vehicle ON vehicle_snapshots(vehicle_id, created_at DESC);

-- Trips table (stores detected driving trips)
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vehicle_id TEXT NOT NULL,
    
    -- Trip timing
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- Start location
    start_latitude DECIMAL(10, 6),
    start_longitude DECIMAL(10, 6),
    start_address TEXT,
    start_odometer DECIMAL(12, 2),
    start_battery_level INTEGER,
    
    -- End location
    end_latitude DECIMAL(10, 6),
    end_longitude DECIMAL(10, 6),
    end_address TEXT,
    end_odometer DECIMAL(12, 2),
    end_battery_level INTEGER,
    
    -- Trip stats
    distance_miles DECIMAL(10, 2),
    energy_used_kwh DECIMAL(10, 2),
    efficiency_wh_mi DECIMAL(10, 2),
    max_speed DECIMAL(10, 2),
    avg_speed DECIMAL(10, 2),
    
    -- Status
    status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'cancelled'
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for querying trips
CREATE INDEX idx_trips_user_time ON trips(user_id, started_at DESC);
CREATE INDEX idx_trips_vehicle ON trips(vehicle_id, started_at DESC);
CREATE INDEX idx_trips_status ON trips(status);

-- Telemetry events table (real-time streaming data)
CREATE TABLE IF NOT EXISTS telemetry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id TEXT NOT NULL,
    trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
    
    -- Event data
    event_type TEXT NOT NULL, -- 'location', 'battery', 'speed', etc.
    event_data JSONB,
    
    -- Common fields extracted for quick access
    latitude DECIMAL(10, 6),
    longitude DECIMAL(10, 6),
    speed DECIMAL(10, 2),
    battery_level INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partition by time for efficient queries (optional, for high volume)
CREATE INDEX idx_telemetry_vehicle_time ON telemetry_events(vehicle_id, created_at DESC);
CREATE INDEX idx_telemetry_trip ON telemetry_events(trip_id, created_at);

-- Enable Row Level Security
ALTER TABLE vehicle_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vehicle_snapshots
CREATE POLICY "Users can view own snapshots"
    ON vehicle_snapshots FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own snapshots"
    ON vehicle_snapshots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- RLS Policies for trips
CREATE POLICY "Users can view own trips"
    ON trips FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trips"
    ON trips FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trips"
    ON trips FOR UPDATE
    USING (auth.uid() = user_id);

-- Service role policy for telemetry (server-to-server)
-- Telemetry events are inserted by the telemetry server, queried by users
CREATE POLICY "Service can insert telemetry"
    ON telemetry_events FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can view telemetry for their trips"
    ON telemetry_events FOR SELECT
    USING (
        trip_id IN (
            SELECT id FROM trips WHERE user_id = auth.uid()
        )
    );

-- Function to update trip stats when ended
CREATE OR REPLACE FUNCTION update_trip_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
        -- Calculate duration
        NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at));
        
        -- Calculate distance
        IF NEW.start_odometer IS NOT NULL AND NEW.end_odometer IS NOT NULL THEN
            NEW.distance_miles := NEW.end_odometer - NEW.start_odometer;
        END IF;
        
        -- Calculate efficiency if we have energy data
        IF NEW.distance_miles > 0 AND NEW.start_battery_level IS NOT NULL AND NEW.end_battery_level IS NOT NULL THEN
            -- Rough estimate: assume 75 kWh pack, calculate energy used
            NEW.energy_used_kwh := (NEW.start_battery_level - NEW.end_battery_level) * 0.75;
            NEW.efficiency_wh_mi := (NEW.energy_used_kwh * 1000) / NEW.distance_miles;
        END IF;
        
        NEW.updated_at := NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_trip_stats
    BEFORE UPDATE ON trips
    FOR EACH ROW
    EXECUTE FUNCTION update_trip_stats();
