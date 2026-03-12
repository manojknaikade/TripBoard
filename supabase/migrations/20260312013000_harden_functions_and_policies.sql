-- Tighten function search_path and close remaining Supabase advisor findings.

-- Functions should not inherit a mutable search_path.
DO $$
BEGIN
    IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION public.handle_new_user() SET search_path = public';
    END IF;

    IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION public.update_updated_at_column() SET search_path = public';
    END IF;

    IF to_regprocedure('public.generate_daily_trip_summary()') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION public.generate_daily_trip_summary() SET search_path = public';
    END IF;

    IF to_regprocedure('public.process_telemetry()') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION public.process_telemetry() SET search_path = public';
    END IF;

    IF to_regprocedure('public.update_trip_stats()') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION public.update_trip_stats() SET search_path = public';
    END IF;
END
$$;

-- Tesla sessions are service-role only and should still have an explicit policy.
DROP POLICY IF EXISTS "Service role can manage tesla sessions" ON public.tesla_sessions;
CREATE POLICY "Service role can manage tesla sessions"
    ON public.tesla_sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Ensure trip waypoint policies exist in projects bootstrapped outside supabase/schema.sql.
DROP POLICY IF EXISTS "Users can view own waypoints" ON public.trip_waypoints;
CREATE POLICY "Users can view own waypoints"
    ON public.trip_waypoints
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.trips
            JOIN public.vehicles ON public.trips.vehicle_id::text = public.vehicles.id::text
            WHERE public.trips.id = trip_waypoints.trip_id
              AND public.vehicles.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can manage own waypoints" ON public.trip_waypoints;
CREATE POLICY "Users can manage own waypoints"
    ON public.trip_waypoints
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.trips
            JOIN public.vehicles ON public.trips.vehicle_id::text = public.vehicles.id::text
            WHERE public.trips.id = trip_waypoints.trip_id
              AND public.vehicles.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.trips
            JOIN public.vehicles ON public.trips.vehicle_id::text = public.vehicles.id::text
            WHERE public.trips.id = trip_waypoints.trip_id
              AND public.vehicles.user_id = auth.uid()
        )
    );

-- Restrict telemetry_events insertion to the service role instead of any caller.
DROP POLICY IF EXISTS "Anyone can insert telemetry" ON public.telemetry_events;
DROP POLICY IF EXISTS "Service can insert telemetry" ON public.telemetry_events;
CREATE POLICY "Service role can insert telemetry"
    ON public.telemetry_events
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Move pg_net out of public when present.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'pg_net'
    ) THEN
        CREATE SCHEMA IF NOT EXISTS extensions;
        EXECUTE 'ALTER EXTENSION pg_net SET SCHEMA extensions';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not move pg_net extension automatically: %', SQLERRM;
END
$$;
