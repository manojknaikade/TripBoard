-- Harden public tables flagged by the Supabase database linter.
-- These tables were reachable through PostgREST without RLS enabled.

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temp_charging_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- app_settings is currently a global singleton row, so keep it service-role only
-- until it is modeled per user.
DROP POLICY IF EXISTS "Service role can manage app settings" ON public.app_settings;
CREATE POLICY "Service role can manage app settings"
    ON public.app_settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service insert" ON public.telemetry_raw;
DROP POLICY IF EXISTS "Service role can manage telemetry raw" ON public.telemetry_raw;
CREATE POLICY "Service role can manage telemetry raw"
    ON public.telemetry_raw
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
    ON public.notifications
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.vehicles vehicles
            WHERE vehicles.id = notifications.vehicle_id
              AND vehicles.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Service role can manage notifications" ON public.notifications;
CREATE POLICY "Service role can manage notifications"
    ON public.notifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own vehicle status" ON public.vehicle_status;
CREATE POLICY "Users can view own vehicle status"
    ON public.vehicle_status
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.vehicles vehicles
            WHERE vehicles.user_id = auth.uid()
              AND vehicles.vin = REPLACE(vehicle_status.vin, 'vehicle_device.', '')
        )
    );

DROP POLICY IF EXISTS "Service role can manage vehicle status" ON public.vehicle_status;
CREATE POLICY "Service role can manage vehicle status"
    ON public.vehicle_status
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own temp charging sessions" ON public.temp_charging_sessions;
CREATE POLICY "Users can view own temp charging sessions"
    ON public.temp_charging_sessions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.vehicles vehicles
            WHERE vehicles.id = temp_charging_sessions.vehicle_id
              AND vehicles.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Service role can manage temp charging sessions" ON public.temp_charging_sessions;
CREATE POLICY "Service role can manage temp charging sessions"
    ON public.temp_charging_sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own trips" ON public.trips;
CREATE POLICY "Users can view own trips"
    ON public.trips
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.vehicles vehicles
            WHERE vehicles.user_id = auth.uid()
              AND (
                  vehicles.vin = REPLACE(trips.vin, 'vehicle_device.', '')
                  OR vehicles.vin = trips.vehicle_id
                  OR vehicles.tesla_id = trips.vehicle_id
                  OR vehicles.id::text = trips.vehicle_id
              )
        )
    );

DROP POLICY IF EXISTS "Service role can manage trips" ON public.trips;
CREATE POLICY "Service role can manage trips"
    ON public.trips
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
