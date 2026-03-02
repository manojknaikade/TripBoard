-- Create app_settings table for application settings
-- This table is NOT tied to Supabase Auth (uses Tesla OAuth instead)
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
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Disable RLS for this table (single-user app with Tesla OAuth)
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

-- Insert default row
INSERT INTO app_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
