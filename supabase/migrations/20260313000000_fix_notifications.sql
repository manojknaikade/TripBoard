-- Fix notification generation for the current schema.
-- 1. Charging completion notifications should be emitted from charging_sessions updates.
-- 2. Daily trip summaries must resolve the current trips -> vehicles relationship and use is_complete.

CREATE OR REPLACE FUNCTION public.create_charging_complete_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_location text;
    v_battery_pct numeric;
    v_energy_suffix text;
BEGIN
    IF NOT NEW.is_complete OR COALESCE(OLD.is_complete, false) THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.notifications
        WHERE type = 'charging_complete'
          AND data->>'session_id' = NEW.id::text
    ) THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.vehicles vehicles
        LEFT JOIN public.user_settings user_settings
          ON user_settings.user_id = vehicles.user_id
        WHERE vehicles.id = NEW.vehicle_id
          AND COALESCE(user_settings.notifications_enabled, true) = false
    ) THEN
        RETURN NEW;
    END IF;

    v_location := COALESCE(NULLIF(NEW.location_name, ''), 'Unknown location');
    v_battery_pct := COALESCE(NEW.end_battery_pct, NEW.start_battery_pct, 0);
    v_energy_suffix := CASE
        WHEN COALESCE(NEW.energy_added_kwh, 0) > 0
            THEN format(' (+%s kWh)', round(NEW.energy_added_kwh::numeric, 1))
        ELSE ''
    END;

    INSERT INTO public.notifications (vehicle_id, type, title, message, data)
    VALUES (
        NEW.vehicle_id,
        'charging_complete',
        'Charging Complete',
        format('Charged to %s%% at %s%s', v_battery_pct, v_location, v_energy_suffix),
        jsonb_build_object(
            'session_id', NEW.id,
            'battery_pct', v_battery_pct,
            'energy_kwh', NEW.energy_added_kwh,
            'location', v_location,
            'charger_type', NEW.charger_type
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS charging_complete_notification ON public.charging_sessions;
CREATE TRIGGER charging_complete_notification
    AFTER UPDATE ON public.charging_sessions
    FOR EACH ROW
    WHEN (NEW.is_complete = true AND COALESCE(OLD.is_complete, false) = false)
    EXECUTE FUNCTION public.create_charging_complete_notification();

INSERT INTO public.notifications (vehicle_id, type, title, message, data)
SELECT
    charging_sessions.vehicle_id,
    'charging_complete',
    'Charging Complete',
    format(
        'Charged to %s%% at %s%s',
        COALESCE(charging_sessions.end_battery_pct, charging_sessions.start_battery_pct, 0),
        COALESCE(NULLIF(charging_sessions.location_name, ''), 'Unknown location'),
        CASE
            WHEN COALESCE(charging_sessions.energy_added_kwh, 0) > 0
                THEN format(' (+%s kWh)', round(charging_sessions.energy_added_kwh::numeric, 1))
            ELSE ''
        END
    ),
    jsonb_build_object(
        'session_id', charging_sessions.id,
        'battery_pct', COALESCE(charging_sessions.end_battery_pct, charging_sessions.start_battery_pct, 0),
        'energy_kwh', charging_sessions.energy_added_kwh,
        'location', COALESCE(NULLIF(charging_sessions.location_name, ''), 'Unknown location'),
        'charger_type', charging_sessions.charger_type
    )
FROM public.charging_sessions
JOIN public.vehicles
  ON public.vehicles.id = charging_sessions.vehicle_id
LEFT JOIN public.user_settings
  ON public.user_settings.user_id = public.vehicles.user_id
WHERE charging_sessions.is_complete = true
  AND COALESCE(public.user_settings.notifications_enabled, true) = true
  AND NOT EXISTS (
      SELECT 1
      FROM public.notifications
      WHERE type = 'charging_complete'
        AND data->>'session_id' = charging_sessions.id::text
  );

CREATE OR REPLACE FUNCTION public.generate_daily_trip_summary()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_record record;
    v_trip_count integer;
    v_total_distance double precision;
    v_total_energy double precision;
    v_avg_efficiency double precision;
    v_message text;
    v_yesterday_start timestamptz;
    v_yesterday_end timestamptz;
BEGIN
    v_yesterday_start := (current_date - interval '1 day')::timestamptz;
    v_yesterday_end := current_date::timestamptz;

    FOR v_record IN
        SELECT
            vehicles.id AS vehicle_id,
            count(*) AS trip_count,
            coalesce(sum(trips.distance_miles), 0) AS total_distance,
            coalesce(sum(trips.energy_used_kwh), 0) AS total_energy
        FROM public.trips
        JOIN public.vehicles
          ON (
              public.vehicles.vin = REPLACE(public.trips.vin, 'vehicle_device.', '')
              OR public.vehicles.vin = public.trips.vehicle_id
              OR public.vehicles.tesla_id = public.trips.vehicle_id
              OR public.vehicles.id::text = public.trips.vehicle_id
          )
        LEFT JOIN public.user_settings
          ON public.user_settings.user_id = public.vehicles.user_id
        WHERE public.trips.start_time >= v_yesterday_start
          AND public.trips.start_time < v_yesterday_end
          AND public.trips.is_complete = true
          AND COALESCE(public.user_settings.notifications_enabled, true) = true
        GROUP BY public.vehicles.id
    LOOP
        v_trip_count := v_record.trip_count;
        v_total_distance := round(v_record.total_distance::numeric, 1);
        v_total_energy := round(v_record.total_energy::numeric, 1);

        IF v_total_distance > 0 THEN
            v_avg_efficiency := round(((v_total_energy * 1000) / v_total_distance)::numeric, 0);
        ELSE
            v_avg_efficiency := 0;
        END IF;

        v_message := format(
            '%s trip%s yesterday: %s mi, %s kWh used, %s Wh/mi avg',
            v_trip_count,
            CASE WHEN v_trip_count = 1 THEN '' ELSE 's' END,
            v_total_distance,
            v_total_energy,
            v_avg_efficiency
        );

        IF NOT EXISTS (
            SELECT 1
            FROM public.notifications
            WHERE vehicle_id = v_record.vehicle_id
              AND type = 'trip_summary'
              AND data->>'date' = to_char(v_yesterday_start, 'YYYY-MM-DD')
        ) THEN
            INSERT INTO public.notifications (vehicle_id, type, title, message, data)
            VALUES (
                v_record.vehicle_id,
                'trip_summary',
                'Daily Trip Summary',
                v_message,
                jsonb_build_object(
                    'trip_count', v_trip_count,
                    'total_distance_miles', v_total_distance,
                    'total_energy_kwh', v_total_energy,
                    'avg_efficiency_wh_mi', v_avg_efficiency,
                    'date', to_char(v_yesterday_start, 'YYYY-MM-DD')
                )
            );
        END IF;
    END LOOP;
END;
$$;
