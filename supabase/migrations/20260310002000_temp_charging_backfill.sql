-- Temporary table to hold our simulated charging sessions
DROP TABLE IF EXISTS temp_charging_sessions;
CREATE TABLE temp_charging_sessions (LIKE charging_sessions INCLUDING ALL);

DO $$
DECLARE
    v_veh RECORD;
    r RECORD;
    item JSONB;
    
    v_charge_state TEXT;
    v_battery_level NUMERIC;
    v_energy_added NUMERIC;
    v_power NUMERIC;
    v_latitude NUMERIC;
    v_longitude NUMERIC;
    
    -- State per vehicle
    s_is_charging BOOLEAN;
    s_start_time TIMESTAMPTZ;
    s_start_battery INTEGER;
    s_max_energy NUMERIC;
    s_max_power NUMERIC;
    s_latitude NUMERIC;
    s_longitude NUMERIC;
BEGIN
    FOR v_veh IN SELECT id, vin FROM vehicles LOOP
        -- Reset state for each vehicle
        s_is_charging := false;
        s_max_energy := 0;
        s_max_power := 0;
        
        FOR r IN 
            SELECT * FROM telemetry_raw 
            WHERE REPLACE(vin, 'vehicle_device.', '') = v_veh.vin 
            ORDER BY created_at ASC 
        LOOP
            v_charge_state := NULL;
            v_battery_level := NULL;
            v_energy_added := NULL;
            v_power := NULL;
            v_latitude := NULL;
            v_longitude := NULL;
            
            -- If payload doesn't have data array, skip
            IF jsonb_typeof(r.payload->'data') != 'array' THEN 
                CONTINUE; 
            END IF;

            -- Parse JSON array
            FOR item IN SELECT * FROM jsonb_array_elements(r.payload->'data') LOOP
                IF item->>'key' = 'DetailedChargeState' THEN
                    v_charge_state := item->'value'->>'detailedChargeStateValue';
                ELSIF item->>'key' = 'BatteryLevel' THEN
                    v_battery_level := (item->'value'->>'doubleValue')::NUMERIC;
                ELSIF item->>'key' = 'DCChargingEnergyIn' THEN
                    v_energy_added := (item->'value'->>'doubleValue')::NUMERIC;
                ELSIF item->>'key' = 'DCChargingPower' THEN
                    v_power := (item->'value'->>'doubleValue')::NUMERIC;
                ELSIF item->>'key' = 'ACChargingEnergyIn' THEN
                    IF v_energy_added IS NULL OR v_energy_added = 0 THEN
                        v_energy_added := (item->'value'->>'doubleValue')::NUMERIC;
                    END IF;
                ELSIF item->>'key' = 'ACChargingPower' THEN
                    IF v_power IS NULL OR v_power = 0 THEN
                        v_power := (item->'value'->>'doubleValue')::NUMERIC;
                    END IF;
                ELSIF item->>'key' = 'Location' THEN
                    v_latitude := (item->'value'->'locationValue'->>'latitude')::NUMERIC;
                    v_longitude := (item->'value'->'locationValue'->>'longitude')::NUMERIC;
                END IF;
            END LOOP;

            -- State Machine Logic
            IF NOT s_is_charging THEN
                IF v_charge_state IN ('DetailedChargeStateCharging', 'DetailedChargeStateStarting') THEN
                    s_is_charging := true;
                    s_start_time := r.created_at;
                    s_start_battery := ROUND(v_battery_level);
                    s_max_energy := COALESCE(v_energy_added, 0);
                    s_max_power := COALESCE(v_power, 0);
                    s_latitude := v_latitude;
                    s_longitude := v_longitude;
                END IF;
            ELSE
                -- Currently Charging
                s_max_energy := GREATEST(s_max_energy, COALESCE(v_energy_added, 0));
                s_max_power := GREATEST(s_max_power, COALESCE(v_power, 0));
                -- Keep latest location if missing from start
                IF s_latitude IS NULL AND v_latitude IS NOT NULL THEN
                    s_latitude := v_latitude;
                    s_longitude := v_longitude;
                END IF;

                -- Detect charging end
                IF v_charge_state IN ('DetailedChargeStateComplete', 'DetailedChargeStateDisconnected', 'DetailedChargeStateStopped') THEN
                    s_is_charging := false;
                    
                    INSERT INTO temp_charging_sessions (
                        vehicle_id, start_time, end_time, start_battery_pct, end_battery_pct,
                        energy_added_kwh, charge_rate_kw, latitude, longitude, is_complete, created_at
                    ) VALUES (
                        v_veh.id, s_start_time, r.created_at, s_start_battery, ROUND(v_battery_level),
                        s_max_energy, s_max_power, s_latitude, s_longitude, true, r.created_at
                    );
                END IF;
            END IF;
        END LOOP;
        
        -- Insert incomplete session if still charging at the end of logs
        IF s_is_charging THEN
            INSERT INTO temp_charging_sessions (
                vehicle_id, start_time, start_battery_pct,
                energy_added_kwh, charge_rate_kw, latitude, longitude, is_complete, created_at
            ) VALUES (
                v_veh.id, s_start_time, s_start_battery,
                s_max_energy, s_max_power, s_latitude, s_longitude, false, s_start_time
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
