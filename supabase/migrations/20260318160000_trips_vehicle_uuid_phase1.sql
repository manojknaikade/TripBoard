ALTER TABLE public.trips
    ADD COLUMN IF NOT EXISTS vehicle_uuid uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'trips_vehicle_uuid_fkey'
          AND conrelid = 'public.trips'::regclass
    ) THEN
        ALTER TABLE public.trips
            ADD CONSTRAINT trips_vehicle_uuid_fkey
            FOREIGN KEY (vehicle_uuid) REFERENCES public.vehicles(id) ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_trips_vehicle_uuid_start_time
    ON public.trips USING btree (vehicle_uuid, start_time DESC);

WITH matched_trips AS (
    SELECT
        trip.id,
        (
            SELECT candidate.id
            FROM (
                SELECT vehicle.id, 1 AS priority
                FROM public.vehicles AS vehicle
                WHERE vehicle.id::text = trip.vehicle_id

                UNION ALL

                SELECT vehicle.id, 2 AS priority
                FROM public.vehicles AS vehicle
                WHERE vehicle.vin = REPLACE(trip.vin, 'vehicle_device.', '')

                UNION ALL

                SELECT vehicle.id, 3 AS priority
                FROM public.vehicles AS vehicle
                WHERE vehicle.vin = REPLACE(trip.vehicle_id, 'vehicle_device.', '')

                UNION ALL

                SELECT vehicle.id, 4 AS priority
                FROM public.vehicles AS vehicle
                WHERE vehicle.tesla_id = trip.vehicle_id
            ) AS candidate
            ORDER BY candidate.priority
            LIMIT 1
        ) AS vehicle_uuid
    FROM public.trips AS trip
)
UPDATE public.trips AS trip
SET vehicle_uuid = matched_trips.vehicle_uuid
FROM matched_trips
WHERE trip.id = matched_trips.id
  AND matched_trips.vehicle_uuid IS NOT NULL
  AND trip.vehicle_uuid IS DISTINCT FROM matched_trips.vehicle_uuid;

DROP FUNCTION IF EXISTS public.get_trip_list_summary(timestamp with time zone, timestamp with time zone, text);

CREATE OR REPLACE FUNCTION public.get_trip_list_summary(
    p_from timestamp with time zone DEFAULT NULL,
    p_to timestamp with time zone DEFAULT NULL,
    p_vehicle_uuid uuid DEFAULT NULL
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
WITH filtered_trips AS (
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
    WHERE (p_from IS NULL OR trip.start_time >= p_from)
      AND (p_to IS NULL OR trip.start_time <= p_to)
      AND (p_vehicle_uuid IS NULL OR trip.vehicle_uuid = p_vehicle_uuid)
      AND EXISTS (
          SELECT 1
          FROM public.vehicles AS vehicle
          WHERE vehicle.user_id = auth.uid()
            AND (
                vehicle.id = trip.vehicle_uuid
                OR vehicle.vin = REPLACE(trip.vin, 'vehicle_device.', '')
                OR vehicle.vin = REPLACE(trip.vehicle_id, 'vehicle_device.', '')
                OR vehicle.tesla_id = trip.vehicle_id
                OR vehicle.id::text = trip.vehicle_id
            )
      )
),
qualifying_trips AS (
    SELECT *
    FROM filtered_trips
    WHERE distance_miles >= 0.3
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

DROP POLICY IF EXISTS "Users can manage own trips" ON public.trips;
CREATE POLICY "Users can manage own trips"
ON public.trips
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.vehicles
        WHERE public.vehicles.user_id = auth.uid()
          AND (
              public.vehicles.id = public.trips.vehicle_uuid
              OR public.vehicles.vin = REPLACE(public.trips.vin, 'vehicle_device.', '')
              OR public.vehicles.vin = REPLACE(public.trips.vehicle_id, 'vehicle_device.', '')
              OR public.vehicles.tesla_id = public.trips.vehicle_id
              OR public.vehicles.id::text = public.trips.vehicle_id
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.vehicles
        WHERE public.vehicles.user_id = auth.uid()
          AND (
              public.vehicles.id = public.trips.vehicle_uuid
              OR public.vehicles.vin = REPLACE(public.trips.vin, 'vehicle_device.', '')
              OR public.vehicles.vin = REPLACE(public.trips.vehicle_id, 'vehicle_device.', '')
              OR public.vehicles.tesla_id = public.trips.vehicle_id
              OR public.vehicles.id::text = public.trips.vehicle_id
          )
    )
);

DROP POLICY IF EXISTS "Users can view own trips" ON public.trips;
CREATE POLICY "Users can view own trips"
ON public.trips
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.vehicles AS vehicles
        WHERE vehicles.user_id = auth.uid()
          AND (
              vehicles.id = public.trips.vehicle_uuid
              OR vehicles.vin = REPLACE(public.trips.vin, 'vehicle_device.', '')
              OR vehicles.vin = REPLACE(public.trips.vehicle_id, 'vehicle_device.', '')
              OR vehicles.tesla_id = public.trips.vehicle_id
              OR vehicles.id::text = public.trips.vehicle_id
          )
    )
);

DROP POLICY IF EXISTS "Users can manage own waypoints" ON public.trip_waypoints;
CREATE POLICY "Users can manage own waypoints"
ON public.trip_waypoints
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.trips
        JOIN public.vehicles
          ON public.vehicles.user_id = auth.uid()
         AND (
             public.vehicles.id = public.trips.vehicle_uuid
             OR public.vehicles.vin = REPLACE(public.trips.vin, 'vehicle_device.', '')
             OR public.vehicles.vin = REPLACE(public.trips.vehicle_id, 'vehicle_device.', '')
             OR public.vehicles.tesla_id = public.trips.vehicle_id
             OR public.vehicles.id::text = public.trips.vehicle_id
         )
        WHERE public.trips.id = public.trip_waypoints.trip_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.trips
        JOIN public.vehicles
          ON public.vehicles.user_id = auth.uid()
         AND (
             public.vehicles.id = public.trips.vehicle_uuid
             OR public.vehicles.vin = REPLACE(public.trips.vin, 'vehicle_device.', '')
             OR public.vehicles.vin = REPLACE(public.trips.vehicle_id, 'vehicle_device.', '')
             OR public.vehicles.tesla_id = public.trips.vehicle_id
             OR public.vehicles.id::text = public.trips.vehicle_id
         )
        WHERE public.trips.id = public.trip_waypoints.trip_id
    )
);

DROP POLICY IF EXISTS "Users can view own waypoints" ON public.trip_waypoints;
CREATE POLICY "Users can view own waypoints"
ON public.trip_waypoints
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.trips
        JOIN public.vehicles
          ON public.vehicles.user_id = auth.uid()
         AND (
             public.vehicles.id = public.trips.vehicle_uuid
             OR public.vehicles.vin = REPLACE(public.trips.vin, 'vehicle_device.', '')
             OR public.vehicles.vin = REPLACE(public.trips.vehicle_id, 'vehicle_device.', '')
             OR public.vehicles.tesla_id = public.trips.vehicle_id
             OR public.vehicles.id::text = public.trips.vehicle_id
         )
        WHERE public.trips.id = public.trip_waypoints.trip_id
    )
);

CREATE OR REPLACE FUNCTION public.process_telemetry() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
AS $$
DECLARE
    _data jsonb;
    _key text;
    _val jsonb;
    _value_obj jsonb;
    _vin text;
    _vehicle_uuid uuid;
    _event_time timestamptz;
    _gear text := NULL;
    _sentry_state text;
    _charge_state text := NULL;
    _effective_charge_state text := NULL;
    _prev_charge_state text;
    _ac_power numeric := NULL;
    _dc_power numeric := NULL;
    _ac_energy numeric := NULL;
    _dc_energy numeric := NULL;
    _charge_power numeric := 0;
    _charge_energy_added numeric := NULL;
    _fast_charger_present boolean := false;
    _fast_charger_type text := NULL;
    _located_at_home boolean := false;
    _is_charge_active boolean := false;
    _session_id uuid;
    _lat numeric;
    _lon numeric;
    _batt numeric;
    _speed numeric := NULL;
    _heading numeric := NULL;
    _home_lat numeric;
    _home_lon numeric;
    _outside_temp numeric := NULL;
    _charging_type text := 'other';
BEGIN
    _vin := NEW.vin;
    _event_time := COALESCE(NEW.timestamp, NEW.created_at, NOW());
    _data := NEW.payload->'data';

    IF _data IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id
    INTO _vehicle_uuid
    FROM public.vehicles
    WHERE vin = REPLACE(_vin, 'vehicle_device.', '')
    LIMIT 1;

    INSERT INTO public.vehicle_status (vin, updated_at)
    VALUES (_vin, _event_time)
    ON CONFLICT (vin) DO UPDATE
    SET updated_at = EXCLUDED.updated_at;

    SELECT
        charge_state,
        current_charging_session_id,
        lat,
        lon,
        battery_level,
        home_latitude,
        home_longitude
    INTO
        _prev_charge_state,
        _session_id,
        _lat,
        _lon,
        _batt,
        _home_lat,
        _home_lon
    FROM public.vehicle_status
    WHERE vin = _vin;

    IF _home_lat IS NULL OR _home_lon IS NULL THEN
        SELECT user_settings.home_latitude, user_settings.home_longitude
        INTO _home_lat, _home_lon
        FROM public.vehicles
        LEFT JOIN public.user_settings
            ON public.user_settings.user_id = public.vehicles.user_id
        WHERE public.vehicles.id = _vehicle_uuid
        LIMIT 1;
    END IF;

    FOR _val IN SELECT * FROM jsonb_array_elements(_data)
    LOOP
        _key := _val->>'key';
        _value_obj := _val->'value';

        CASE _key
            WHEN 'BatteryLevel' THEN
                _batt := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );
                UPDATE public.vehicle_status
                SET battery_level = _batt
                WHERE vin = _vin;

            WHEN 'Odometer' THEN
                UPDATE public.vehicle_status
                SET odometer = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'VehicleSpeed' THEN
                _speed := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );
                UPDATE public.vehicle_status
                SET speed = _speed
                WHERE vin = _vin;

            WHEN 'InsideTemp' THEN
                UPDATE public.vehicle_status
                SET inside_temp = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'OutsideTemp' THEN
                _outside_temp := (_value_obj->>'doubleValue')::numeric;
                UPDATE public.vehicle_status
                SET outside_temp = _outside_temp
                WHERE vin = _vin;

            WHEN 'ACChargingPower' THEN
                _ac_power := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );

            WHEN 'DCChargingPower' THEN
                _dc_power := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );

            WHEN 'ACChargingEnergyIn' THEN
                _ac_energy := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );

            WHEN 'DCChargingEnergyIn' THEN
                _dc_energy := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );

            WHEN 'DetailedChargeState' THEN
                _charge_state := COALESCE(
                    _value_obj->>'detailedChargeStateValue',
                    _value_obj->>'stringValue'
                );
                IF _charge_state LIKE 'DetailedChargeState%' THEN
                    _charge_state := REPLACE(_charge_state, 'DetailedChargeState', '');
                END IF;

            WHEN 'ChargeState' THEN
                IF _charge_state IS NULL THEN
                    _charge_state := _value_obj->>'stringValue';
                END IF;

            WHEN 'FastChargerPresent' THEN
                _fast_charger_present := COALESCE(
                    (_value_obj->>'booleanValue')::boolean,
                    (_value_obj->>'boolean_value')::boolean,
                    false
                );

            WHEN 'FastChargerType' THEN
                _fast_charger_type := COALESCE(
                    _value_obj->>'fastChargerValue',
                    _value_obj->>'stringValue'
                );

            WHEN 'LocatedAtHome' THEN
                _located_at_home := COALESCE(
                    (_value_obj->>'booleanValue')::boolean,
                    (_value_obj->>'boolean_value')::boolean,
                    false
                );

            WHEN 'EstBatteryRange' THEN
                UPDATE public.vehicle_status
                SET est_battery_range = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'RatedRange' THEN
                UPDATE public.vehicle_status
                SET rated_range = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'TpmsPressureFl' THEN
                UPDATE public.vehicle_status
                SET tpms_fl = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'TpmsPressureFr' THEN
                UPDATE public.vehicle_status
                SET tpms_fr = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'TpmsPressureRl' THEN
                UPDATE public.vehicle_status
                SET tpms_rl = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'TpmsPressureRr' THEN
                UPDATE public.vehicle_status
                SET tpms_rr = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'Locked' THEN
                UPDATE public.vehicle_status
                SET is_locked = (_value_obj->>'booleanValue')::boolean
                WHERE vin = _vin;

            WHEN 'SentryMode' THEN
                _sentry_state := _value_obj->>'sentryModeStateValue';
                UPDATE public.vehicle_status
                SET sentry_mode = (_sentry_state != 'SentryModeStateOff')
                WHERE vin = _vin;

            WHEN 'Version' THEN
                UPDATE public.vehicle_status
                SET car_version = _value_obj->>'stringValue'
                WHERE vin = _vin;

            WHEN 'Location' THEN
                _lat := (_value_obj->'locationValue'->>'latitude')::numeric;
                _lon := (_value_obj->'locationValue'->>'longitude')::numeric;
                UPDATE public.vehicle_status
                SET lat = _lat, lon = _lon
                WHERE vin = _vin;

            WHEN 'Gear' THEN
                _gear := _value_obj->>'shiftStateValue';
                IF _gear IS NOT NULL AND _value_obj->>'invalid' IS NULL THEN
                    _gear := REPLACE(REPLACE(REPLACE(REPLACE(_gear, 'ShiftStateD', 'D'), 'ShiftStateR', 'R'), 'ShiftStateP', 'P'), 'ShiftStateN', 'N');
                    UPDATE public.vehicle_status
                    SET shift_state = _gear
                    WHERE vin = _vin;
                END IF;

            WHEN 'Heading' THEN
                _heading := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );
                UPDATE public.vehicle_status
                SET heading = _heading
                WHERE vin = _vin;

            WHEN 'DoorState' THEN
                UPDATE public.vehicle_status
                SET
                    door_df = COALESCE((_value_obj->'doorValue'->>'DriverFront')::boolean, false),
                    door_dr = COALESCE((_value_obj->'doorValue'->>'DriverRear')::boolean, false),
                    door_pf = COALESCE((_value_obj->'doorValue'->>'PassengerFront')::boolean, false),
                    door_pr = COALESCE((_value_obj->'doorValue'->>'PassengerRear')::boolean, false),
                    trunk_ft = COALESCE((_value_obj->'doorValue'->>'TrunkFront')::boolean, false),
                    trunk_rt = COALESCE((_value_obj->'doorValue'->>'TrunkRear')::boolean, false)
                WHERE vin = _vin;

            WHEN 'FdWindow' THEN
                UPDATE public.vehicle_status
                SET window_fd = _value_obj->>'windowStateValue'
                WHERE vin = _vin;

            WHEN 'FpWindow' THEN
                UPDATE public.vehicle_status
                SET window_fp = _value_obj->>'windowStateValue'
                WHERE vin = _vin;

            WHEN 'RdWindow' THEN
                UPDATE public.vehicle_status
                SET window_rd = _value_obj->>'windowStateValue'
                WHERE vin = _vin;

            WHEN 'RpWindow' THEN
                UPDATE public.vehicle_status
                SET window_rp = _value_obj->>'windowStateValue'
                WHERE vin = _vin;

            ELSE NULL;
        END CASE;
    END LOOP;

    _charge_power := COALESCE(_ac_power, 0) + COALESCE(_dc_power, 0);
    IF _ac_energy IS NOT NULL OR _dc_energy IS NOT NULL THEN
        _charge_energy_added := COALESCE(_ac_energy, 0) + COALESCE(_dc_energy, 0);
    END IF;

    UPDATE public.vehicle_status
    SET
        charger_power = NULLIF(_charge_power, 0),
        charge_energy_added = _charge_energy_added,
        charge_state = COALESCE(_charge_state, _prev_charge_state)
    WHERE vin = _vin;

    IF _outside_temp IS NULL THEN
        SELECT outside_temp
        INTO _outside_temp
        FROM public.vehicle_status
        WHERE vin = _vin;
    END IF;

    IF _gear IS NOT NULL THEN
        DECLARE
            _trip uuid;
            _odo numeric;
            _current_speed numeric;
            _current_heading numeric;
        BEGIN
            SELECT current_trip_id, odometer, speed, heading
            INTO _trip, _odo, _current_speed, _current_heading
            FROM public.vehicle_status
            WHERE vin = _vin;

            IF (_gear IN ('D', 'R')) AND _trip IS NULL THEN
                INSERT INTO public.trips (
                    vin,
                    vehicle_uuid,
                    vehicle_id,
                    start_time,
                    start_odometer,
                    start_latitude,
                    start_longitude,
                    start_battery_pct,
                    min_outside_temp,
                    max_outside_temp,
                    avg_outside_temp
                )
                VALUES (
                    _vin,
                    _vehicle_uuid,
                    COALESCE(_vehicle_uuid::text, _vin),
                    _event_time,
                    _odo,
                    _lat,
                    _lon,
                    _batt,
                    _outside_temp,
                    _outside_temp,
                    _outside_temp
                )
                RETURNING id INTO _trip;

                UPDATE public.vehicle_status
                SET current_trip_id = _trip
                WHERE vin = _vin;
            END IF;

            IF _gear = 'P' AND _trip IS NOT NULL THEN
                IF _lat IS NOT NULL AND _lon IS NOT NULL THEN
                    INSERT INTO public.trip_waypoints (
                        trip_id,
                        timestamp,
                        latitude,
                        longitude,
                        speed_mph,
                        battery_level,
                        odometer,
                        heading
                    )
                    VALUES (
                        _trip,
                        _event_time,
                        _lat,
                        _lon,
                        _current_speed,
                        ROUND(_batt)::integer,
                        _odo,
                        CASE
                            WHEN _current_heading IS NULL THEN NULL
                            ELSE ROUND(_current_heading)::integer
                        END
                    )
                    ON CONFLICT (trip_id, timestamp) DO UPDATE
                    SET
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        speed_mph = COALESCE(EXCLUDED.speed_mph, trip_waypoints.speed_mph),
                        battery_level = COALESCE(EXCLUDED.battery_level, trip_waypoints.battery_level),
                        odometer = COALESCE(EXCLUDED.odometer, trip_waypoints.odometer),
                        heading = COALESCE(EXCLUDED.heading, trip_waypoints.heading);
                END IF;

                UPDATE public.trips
                SET
                    end_time = _event_time,
                    end_odometer = _odo,
                    end_latitude = _lat,
                    end_longitude = _lon,
                    end_battery_pct = _batt,
                    is_complete = true
                WHERE id = _trip;

                UPDATE public.vehicle_status
                SET current_trip_id = NULL
                WHERE vin = _vin;
            END IF;
        END;
    END IF;

    IF _lat IS NOT NULL AND _lon IS NOT NULL THEN
        DECLARE
            _active_trip uuid;
            _active_odo numeric;
            _active_speed numeric;
            _active_heading numeric;
        BEGIN
            SELECT current_trip_id, odometer, speed, heading
            INTO _active_trip, _active_odo, _active_speed, _active_heading
            FROM public.vehicle_status
            WHERE vin = _vin;

            IF _active_trip IS NOT NULL THEN
                INSERT INTO public.trip_waypoints (
                    trip_id,
                    timestamp,
                    latitude,
                    longitude,
                    speed_mph,
                    battery_level,
                    odometer,
                    heading
                )
                VALUES (
                    _active_trip,
                    _event_time,
                    _lat,
                    _lon,
                    _active_speed,
                    ROUND(_batt)::integer,
                    _active_odo,
                    CASE
                        WHEN _active_heading IS NULL THEN NULL
                        ELSE ROUND(_active_heading)::integer
                    END
                )
                ON CONFLICT (trip_id, timestamp) DO UPDATE
                SET
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    speed_mph = COALESCE(EXCLUDED.speed_mph, trip_waypoints.speed_mph),
                    battery_level = COALESCE(EXCLUDED.battery_level, trip_waypoints.battery_level),
                    odometer = COALESCE(EXCLUDED.odometer, trip_waypoints.odometer),
                    heading = COALESCE(EXCLUDED.heading, trip_waypoints.heading);
            END IF;
        END;
    END IF;

    IF _outside_temp IS NOT NULL THEN
        DECLARE
            _active_trip uuid;
        BEGIN
            SELECT current_trip_id
            INTO _active_trip
            FROM public.vehicle_status
            WHERE vin = _vin;

            IF _active_trip IS NOT NULL THEN
                UPDATE public.trips
                SET
                    min_outside_temp = LEAST(COALESCE(min_outside_temp, _outside_temp), _outside_temp),
                    max_outside_temp = GREATEST(COALESCE(max_outside_temp, _outside_temp), _outside_temp),
                    avg_outside_temp = (
                        LEAST(COALESCE(min_outside_temp, _outside_temp), _outside_temp) +
                        GREATEST(COALESCE(max_outside_temp, _outside_temp), _outside_temp)
                    ) / 2.0
                WHERE id = _active_trip;
            END IF;
        END;
    END IF;

    _effective_charge_state := COALESCE(_charge_state, _prev_charge_state);
    _is_charge_active := COALESCE(_effective_charge_state, '') IN ('Charging', 'Starting');

    IF _fast_charger_present OR _charge_power > 24 THEN
        IF _fast_charger_type = 'FastChargerSupercharger' THEN
            _charging_type := 'supercharger';
        ELSIF _fast_charger_type IS NOT NULL AND _fast_charger_type <> 'FastChargerUnknown' THEN
            _charging_type := '3rd_party_fast';
        ELSE
            _charging_type := 'supercharger';
        END IF;
    ELSIF _located_at_home OR (
        _home_lat IS NOT NULL
        AND _home_lon IS NOT NULL
        AND _lat IS NOT NULL
        AND _lon IS NOT NULL
        AND ABS(_lat - _home_lat) < 0.001
        AND ABS(_lon - _home_lon) < 0.001
    ) THEN
        _charging_type := 'home';
    ELSIF _charge_power > 0 THEN
        _charging_type := 'destination';
    END IF;

    IF _is_charge_active AND _session_id IS NULL AND _vehicle_uuid IS NOT NULL THEN
        INSERT INTO public.charging_sessions (
            vehicle_id,
            start_time,
            start_battery_pct,
            energy_added_kwh,
            charge_rate_kw,
            latitude,
            longitude,
            charger_type,
            is_complete
        )
        VALUES (
            _vehicle_uuid,
            _event_time,
            _batt,
            _charge_energy_added,
            NULLIF(_charge_power, 0),
            _lat,
            _lon,
            _charging_type,
            false
        )
        RETURNING id INTO _session_id;

        UPDATE public.vehicle_status
        SET current_charging_session_id = _session_id
        WHERE vin = _vin;
    ELSIF _session_id IS NOT NULL AND _is_charge_active THEN
        UPDATE public.charging_sessions
        SET
            latitude = COALESCE(public.charging_sessions.latitude, _lat),
            longitude = COALESCE(public.charging_sessions.longitude, _lon),
            energy_added_kwh = GREATEST(COALESCE(public.charging_sessions.energy_added_kwh, 0), COALESCE(_charge_energy_added, 0)),
            charge_rate_kw = GREATEST(COALESCE(public.charging_sessions.charge_rate_kw, 0), _charge_power),
            charger_type = CASE
                WHEN public.charging_sessions.charger_type IS NULL OR public.charging_sessions.charger_type = 'other'
                    THEN _charging_type
                ELSE public.charging_sessions.charger_type
            END
        WHERE id = _session_id;
    ELSIF _session_id IS NOT NULL AND _charge_state IS NOT NULL AND NOT _is_charge_active THEN
        UPDATE public.charging_sessions
        SET
            end_time = _event_time,
            end_battery_pct = _batt,
            energy_added_kwh = GREATEST(COALESCE(public.charging_sessions.energy_added_kwh, 0), COALESCE(_charge_energy_added, 0)),
            charge_rate_kw = GREATEST(COALESCE(public.charging_sessions.charge_rate_kw, 0), _charge_power),
            latitude = COALESCE(public.charging_sessions.latitude, _lat),
            longitude = COALESCE(public.charging_sessions.longitude, _lon),
            charger_type = CASE
                WHEN public.charging_sessions.charger_type IS NULL OR public.charging_sessions.charger_type = 'other'
                    THEN _charging_type
                ELSE public.charging_sessions.charger_type
            END,
            is_complete = true
        WHERE id = _session_id;

        UPDATE public.vehicle_status
        SET current_charging_session_id = NULL
        WHERE vin = _vin;
    END IF;

    RETURN NEW;
END;
$$;
