ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS minimum_trip_distance_miles numeric;

UPDATE public.user_settings
SET minimum_trip_distance_miles = 0.3
WHERE minimum_trip_distance_miles IS NULL;

ALTER TABLE public.user_settings
    ALTER COLUMN minimum_trip_distance_miles SET DEFAULT 0.3,
    ALTER COLUMN minimum_trip_distance_miles SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_settings_minimum_trip_distance_miles_check'
          AND conrelid = 'public.user_settings'::regclass
    ) THEN
        ALTER TABLE public.user_settings
            ADD CONSTRAINT user_settings_minimum_trip_distance_miles_check
            CHECK (minimum_trip_distance_miles >= 0);
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_trip_list_summary(
    p_from timestamp with time zone DEFAULT NULL,
    p_to timestamp with time zone DEFAULT NULL,
    p_vehicle_id uuid DEFAULT NULL
)
RETURNS TABLE(
    total_trips bigint,
    total_distance numeric,
    total_energy numeric,
    avg_efficiency numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH current_settings AS (
    SELECT GREATEST(
        COALESCE(
            (
                SELECT user_settings.minimum_trip_distance_miles
                FROM public.user_settings AS user_settings
                WHERE user_settings.user_id = auth.uid()
            ),
            0.3
        ),
        0
    ) AS minimum_trip_distance_miles
),
filtered_trips AS (
    SELECT
        GREATEST(
            COALESCE(
                trip.distance_miles,
                CASE
                    WHEN trip.start_odometer IS NOT NULL AND trip.end_odometer IS NOT NULL
                        THEN trip.end_odometer - trip.start_odometer
                    ELSE NULL
                END,
                0
            ),
            0
        ) AS distance_miles,
        CASE
            WHEN trip.energy_used_kwh IS NOT NULL THEN trip.energy_used_kwh
            WHEN trip.start_battery_pct IS NOT NULL
                AND trip.end_battery_pct IS NOT NULL
                AND trip.start_battery_pct > trip.end_battery_pct
                THEN ((trip.start_battery_pct - trip.end_battery_pct) / 100.0) * 75
            ELSE 0
        END AS energy_kwh
    FROM public.trips AS trip
    JOIN public.vehicles AS vehicle
      ON vehicle.id = trip.vehicle_id
     AND vehicle.user_id = auth.uid()
    WHERE (p_from IS NULL OR trip.start_time >= p_from)
      AND (p_to IS NULL OR trip.start_time <= p_to)
      AND (p_vehicle_id IS NULL OR trip.vehicle_id = p_vehicle_id)
),
qualifying_trips AS (
    SELECT filtered_trips.*
    FROM filtered_trips
    CROSS JOIN current_settings
    WHERE filtered_trips.distance_miles >= current_settings.minimum_trip_distance_miles
)
SELECT
    COUNT(*)::bigint AS total_trips,
    ROUND(COALESCE(SUM(distance_miles), 0)::numeric, 3) AS total_distance,
    ROUND(COALESCE(SUM(energy_kwh), 0)::numeric, 3) AS total_energy,
    CASE
        WHEN COALESCE(SUM(distance_miles), 0) > 0
            THEN ROUND((SUM(energy_kwh) * 1000 / SUM(distance_miles))::numeric, 2)
        ELSE 0
    END AS avg_efficiency
FROM qualifying_trips;
$$;

GRANT EXECUTE ON FUNCTION public.get_trip_list_summary(timestamp with time zone, timestamp with time zone, uuid)
    TO anon, authenticated, service_role;
