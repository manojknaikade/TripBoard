-- ============================================================
-- Migration: Add temperature tracking to trips
-- 1. Add min/max/avg_outside_temp columns to trips
-- 2. Modify process_telemetry to track temperature during trips
-- ============================================================

-- Step 1: Add columns
ALTER TABLE public.trips 
ADD COLUMN IF NOT EXISTS min_outside_temp numeric,
ADD COLUMN IF NOT EXISTS max_outside_temp numeric,
ADD COLUMN IF NOT EXISTS avg_outside_temp numeric;

-- Step 2: Replace the process_telemetry function with temperature tracking
CREATE OR REPLACE FUNCTION public.process_telemetry()
RETURNS TRIGGER AS $$
DECLARE
    _data jsonb; _key text; _val jsonb; _value_obj jsonb; _vin text;
    _gear text := NULL; _sentry_state text;
    _charge_state text := NULL; _prev_charge_state text;
    _dc_power numeric := NULL; _ac_power numeric := NULL;
    _session_id uuid; _lat numeric; _lon numeric; _batt numeric;
    _home_lat numeric; _home_lon numeric;
    _outside_temp numeric := NULL;
BEGIN
    _vin := NEW.vin;
    _data := NEW.payload->'data';
    IF _data IS NULL THEN RETURN NEW; END IF;
    INSERT INTO vehicle_status (vin, updated_at) VALUES (_vin, NOW())
    ON CONFLICT (vin) DO UPDATE SET updated_at = NOW();
    -- Get previous charge state
    SELECT charge_state, current_charging_session_id, lat, lon, battery_level, home_latitude, home_longitude 
    INTO _prev_charge_state, _session_id, _lat, _lon, _batt, _home_lat, _home_lon
    FROM vehicle_status WHERE vin = _vin;
    FOR _val IN SELECT * FROM jsonb_array_elements(_data)
    LOOP
        _key := _val->>'key';
        _value_obj := _val->'value';
        
        CASE _key
            WHEN 'BatteryLevel' THEN 
                UPDATE vehicle_status SET battery_level = (_value_obj->>'doubleValue')::numeric WHERE vin = _vin;
                _batt := (_value_obj->>'doubleValue')::numeric;
            WHEN 'Odometer' THEN UPDATE vehicle_status SET odometer = (_value_obj->>'doubleValue')::numeric WHERE vin = _vin;
            WHEN 'VehicleSpeed' THEN UPDATE vehicle_status SET speed = (_value_obj->>'doubleValue')::numeric WHERE vin = _vin;
            WHEN 'InsideTemp' THEN UPDATE vehicle_status SET inside_temp = (_value_obj->>'doubleValue')::numeric WHERE vin = _vin;
            WHEN 'OutsideTemp' THEN 
                _outside_temp := (_value_obj->>'doubleValue')::numeric;
                UPDATE vehicle_status SET outside_temp = _outside_temp WHERE vin = _vin;
            WHEN 'ACChargingPower' THEN 
                _ac_power := (_value_obj->>'doubleValue')::numeric;
                UPDATE vehicle_status SET charger_power = _ac_power WHERE vin = _vin;
            WHEN 'DCChargingPower' THEN 
                _dc_power := (_value_obj->>'doubleValue')::numeric;
                UPDATE vehicle_status SET charger_power = _dc_power WHERE vin = _vin;
            WHEN 'EstBatteryRange' THEN UPDATE vehicle_status SET est_battery_range = (_value_obj->>'doubleValue')::numeric WHERE vin = _vin;
            WHEN 'RatedRange' THEN UPDATE vehicle_status SET rated_range = (_value_obj->>'doubleValue')::numeric WHERE vin = _vin;
            WHEN 'TpmsPressureFl' THEN UPDATE vehicle_status SET tpms_fl = (_value_obj->>'doubleValue')::numeric WHERE vin = _vin;
            WHEN 'TpmsPressureFr' THEN UPDATE vehicle_status SET tpms_fr = (_value_obj->>'doubleValue')::numeric WHERE vin = _vin;
            WHEN 'TpmsPressureRl' THEN UPDATE vehicle_status SET tpms_rl = (_value_obj->>'doubleValue')::numeric WHERE vin = _vin;
            WHEN 'TpmsPressureRr' THEN UPDATE vehicle_status SET tpms_rr = (_value_obj->>'doubleValue')::numeric WHERE vin = _vin;
            WHEN 'Locked' THEN UPDATE vehicle_status SET is_locked = (_value_obj->>'booleanValue')::boolean WHERE vin = _vin;
            WHEN 'SentryMode' THEN
                _sentry_state := _value_obj->>'sentryModeStateValue';
                UPDATE vehicle_status SET sentry_mode = (_sentry_state != 'SentryModeStateOff') WHERE vin = _vin;
            WHEN 'ChargeState' THEN 
                _charge_state := _value_obj->>'stringValue';
                UPDATE vehicle_status SET charge_state = _charge_state WHERE vin = _vin;
            WHEN 'Version' THEN UPDATE vehicle_status SET car_version = _value_obj->>'stringValue' WHERE vin = _vin;
            WHEN 'Location' THEN
                _lat := (_value_obj->'locationValue'->>'latitude')::numeric;
                _lon := (_value_obj->'locationValue'->>'longitude')::numeric;
                UPDATE vehicle_status SET lat = _lat, lon = _lon WHERE vin = _vin;
            WHEN 'Gear' THEN
                _gear := _value_obj->>'shiftStateValue';
                IF _gear IS NOT NULL AND _value_obj->>'invalid' IS NULL THEN
                    _gear := REPLACE(REPLACE(REPLACE(REPLACE(_gear, 'ShiftStateD', 'D'), 'ShiftStateR', 'R'), 'ShiftStateP', 'P'), 'ShiftStateN', 'N');
                    UPDATE vehicle_status SET shift_state = _gear WHERE vin = _vin;
                END IF;
            WHEN 'DoorState' THEN
                UPDATE vehicle_status SET 
                    door_df = COALESCE((_value_obj->'doorValue'->>'DriverFront')::boolean, false),
                    door_dr = COALESCE((_value_obj->'doorValue'->>'DriverRear')::boolean, false),
                    door_pf = COALESCE((_value_obj->'doorValue'->>'PassengerFront')::boolean, false),
                    door_pr = COALESCE((_value_obj->'doorValue'->>'PassengerRear')::boolean, false),
                    trunk_ft = COALESCE((_value_obj->'doorValue'->>'TrunkFront')::boolean, false),
                    trunk_rt = COALESCE((_value_obj->'doorValue'->>'TrunkRear')::boolean, false)
                WHERE vin = _vin;
            WHEN 'FdWindow' THEN UPDATE vehicle_status SET window_fd = _value_obj->>'windowStateValue' WHERE vin = _vin;
            WHEN 'FpWindow' THEN UPDATE vehicle_status SET window_fp = _value_obj->>'windowStateValue' WHERE vin = _vin;
            WHEN 'RdWindow' THEN UPDATE vehicle_status SET window_rd = _value_obj->>'windowStateValue' WHERE vin = _vin;
            WHEN 'RpWindow' THEN UPDATE vehicle_status SET window_rp = _value_obj->>'windowStateValue' WHERE vin = _vin;
            ELSE NULL;
        END CASE;
    END LOOP;

    -- If we didn't get OutsideTemp in this payload, read current value from vehicle_status
    IF _outside_temp IS NULL THEN
        SELECT outside_temp INTO _outside_temp FROM vehicle_status WHERE vin = _vin;
    END IF;

    -- Trip detection (gear-based)
    IF _gear IS NOT NULL THEN
        DECLARE _trip uuid; _odo numeric;
        BEGIN
            SELECT current_trip_id, odometer INTO _trip, _odo FROM vehicle_status WHERE vin = _vin;
            IF (_gear IN ('D', 'R')) AND _trip IS NULL THEN
                -- START TRIP: capture initial temperature
                INSERT INTO trips (vin, vehicle_id, start_time, start_odometer, start_latitude, start_longitude, start_battery_pct,
                                   min_outside_temp, max_outside_temp, avg_outside_temp)
                VALUES (_vin, _vin, NOW(), _odo, _lat, _lon, _batt,
                        _outside_temp, _outside_temp, _outside_temp) 
                RETURNING id INTO _trip;
                UPDATE vehicle_status SET current_trip_id = _trip WHERE vin = _vin;
            END IF;
            IF _gear = 'P' AND _trip IS NOT NULL THEN
                UPDATE trips SET end_time = NOW(), end_odometer = _odo, end_latitude = _lat, end_longitude = _lon, end_battery_pct = _batt, is_complete = true WHERE id = _trip;
                UPDATE vehicle_status SET current_trip_id = NULL WHERE vin = _vin;
            END IF;
        END;
    END IF;

    -- Update temperature stats for active trip (every telemetry event)
    IF _outside_temp IS NOT NULL THEN
        DECLARE _active_trip uuid;
        BEGIN
            SELECT current_trip_id INTO _active_trip FROM vehicle_status WHERE vin = _vin;
            IF _active_trip IS NOT NULL THEN
                UPDATE trips SET
                    min_outside_temp = LEAST(COALESCE(min_outside_temp, _outside_temp), _outside_temp),
                    max_outside_temp = GREATEST(COALESCE(max_outside_temp, _outside_temp), _outside_temp),
                    avg_outside_temp = (LEAST(COALESCE(min_outside_temp, _outside_temp), _outside_temp) 
                                      + GREATEST(COALESCE(max_outside_temp, _outside_temp), _outside_temp)) / 2.0
                WHERE id = _active_trip;
            END IF;
        END;
    END IF;

    -- Charging session detection
    IF _charge_state IS NOT NULL AND _charge_state != _prev_charge_state THEN
        DECLARE _charging_type text := 'other';
        BEGIN
            IF _dc_power IS NOT NULL AND _dc_power > 0 THEN
                _charging_type := 'supercharger';
            ELSIF _home_lat IS NOT NULL AND _home_lon IS NOT NULL 
                  AND ABS(_lat - _home_lat) < 0.001 AND ABS(_lon - _home_lon) < 0.001 THEN
                _charging_type := 'home';
            ELSIF _ac_power IS NOT NULL AND _ac_power > 0 THEN
                _charging_type := 'destination';
            END IF;
            
            -- Charging started
            IF _charge_state IN ('Charging', 'Starting') AND _session_id IS NULL THEN
                INSERT INTO charging_sessions (vin, start_time, start_battery_pct, latitude, longitude, charging_type, max_power_kw)
                VALUES (_vin, NOW(), _batt, _lat, _lon, _charging_type, COALESCE(_dc_power, _ac_power, 0))
                RETURNING id INTO _session_id;
                UPDATE vehicle_status SET current_charging_session_id = _session_id WHERE vin = _vin;
            END IF;
            
            -- Charging ended
            IF _charge_state IN ('Complete', 'Disconnected', 'Stopped') AND _session_id IS NOT NULL THEN
                UPDATE charging_sessions SET 
                    end_time = NOW(), 
                    end_battery_pct = _batt,
                    energy_added_kwh = (_batt - start_battery_pct) * 0.75,
                    is_complete = true
                WHERE id = _session_id;
                UPDATE vehicle_status SET current_charging_session_id = NULL WHERE vin = _vin;
            END IF;
            
            -- Update max power during charging
            IF _session_id IS NOT NULL AND (COALESCE(_dc_power, _ac_power, 0) > 0) THEN
                UPDATE charging_sessions 
                SET max_power_kw = GREATEST(max_power_kw, COALESCE(_dc_power, _ac_power, 0))
                WHERE id = _session_id;
            END IF;
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
