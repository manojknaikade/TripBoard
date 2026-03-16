CREATE OR REPLACE FUNCTION public.get_trip_speed_metrics(p_trip_id uuid)
RETURNS TABLE (
    max_speed_mph numeric,
    avg_speed_mph numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH trip_row AS (
        SELECT
            t.id,
            t.vin,
            t.start_time,
            COALESCE(t.end_time, NOW()) AS end_time
        FROM public.trips t
        WHERE t.id = p_trip_id
        LIMIT 1
    ),
    telemetry_samples AS (
        SELECT
            tr.timestamp,
            MAX(
                CASE
                    WHEN item->>'key' = 'VehicleSpeed'
                        THEN COALESCE(
                            (item->'value'->>'doubleValue')::numeric,
                            (item->'value'->>'intValue')::numeric
                        )
                    ELSE NULL
                END
            ) AS speed_mph
        FROM trip_row t
        JOIN public.telemetry_raw tr
          ON tr.vin = t.vin
         AND tr.timestamp >= t.start_time
         AND tr.timestamp <= t.end_time
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tr.payload->'data', '[]'::jsonb)) AS item
        GROUP BY tr.timestamp
    ),
    telemetry_stats AS (
        SELECT
            MAX(speed_mph)::numeric AS max_speed_mph,
            AVG(speed_mph)::numeric AS avg_speed_mph
        FROM telemetry_samples
        WHERE speed_mph IS NOT NULL
    ),
    waypoint_stats AS (
        SELECT
            MAX(tw.speed_mph)::numeric AS max_speed_mph,
            AVG(tw.speed_mph)::numeric AS avg_speed_mph
        FROM public.trip_waypoints tw
        WHERE tw.trip_id = p_trip_id
          AND tw.speed_mph IS NOT NULL
    )
    SELECT
        COALESCE(telemetry_stats.max_speed_mph, waypoint_stats.max_speed_mph) AS max_speed_mph,
        COALESCE(telemetry_stats.avg_speed_mph, waypoint_stats.avg_speed_mph) AS avg_speed_mph
    FROM telemetry_stats
    CROSS JOIN waypoint_stats;
$$;

ALTER FUNCTION public.get_trip_speed_metrics(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.sync_trip_speed_metrics_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.is_complete IS TRUE
       AND (
           COALESCE(OLD.is_complete, false) IS DISTINCT FROM true
           OR OLD.end_time IS DISTINCT FROM NEW.end_time
       ) THEN
        SELECT metrics.max_speed_mph, metrics.avg_speed_mph
        INTO NEW.max_speed_mph, NEW.avg_speed_mph
        FROM public.get_trip_speed_metrics(NEW.id) AS metrics;
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_trip_speed_metrics_on_completion() OWNER TO postgres;

DROP TRIGGER IF EXISTS trigger_sync_trip_speed_metrics_on_completion ON public.trips;

CREATE TRIGGER trigger_sync_trip_speed_metrics_on_completion
BEFORE UPDATE ON public.trips
FOR EACH ROW
WHEN (NEW.is_complete IS TRUE)
EXECUTE FUNCTION public.sync_trip_speed_metrics_on_completion();

WITH speed_metrics AS (
    SELECT
        t.id,
        metrics.max_speed_mph,
        metrics.avg_speed_mph
    FROM public.trips t
    CROSS JOIN LATERAL public.get_trip_speed_metrics(t.id) AS metrics
    WHERE t.vin IS NOT NULL
      AND (t.end_time IS NOT NULL OR t.is_complete IS TRUE)
)
UPDATE public.trips t
SET
    max_speed_mph = speed_metrics.max_speed_mph,
    avg_speed_mph = speed_metrics.avg_speed_mph
FROM speed_metrics
WHERE t.id = speed_metrics.id
  AND (
      speed_metrics.max_speed_mph IS NOT NULL
      OR speed_metrics.avg_speed_mph IS NOT NULL
  );
