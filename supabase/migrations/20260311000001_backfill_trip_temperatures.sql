-- ============================================================
-- Improved Backfill: Populate temperature data for all existing trips
-- Uses a ±30 min window around each trip to find OutsideTemp readings
-- because Tesla sends OutsideTemp infrequently (~1 per 3-5 min)
-- ============================================================

DO $$
DECLARE
    _trip RECORD;
    _min_temp numeric;
    _max_temp numeric;
    _avg_temp numeric;
    _count integer;
    _nearest_temp numeric;
BEGIN
    RAISE NOTICE 'Starting improved trip temperature backfill...';

    FOR _trip IN 
        SELECT id, vin, start_time, end_time 
        FROM trips 
        WHERE is_complete = true 
          AND avg_outside_temp IS NULL
          AND end_time IS NOT NULL
        ORDER BY start_time ASC
    LOOP
        -- First try: Find OutsideTemp values within an expanded window 
        -- (30 min before trip start to 30 min after trip end)
        SELECT 
            MIN(temp_val), MAX(temp_val), AVG(temp_val), COUNT(*)
        INTO _min_temp, _max_temp, _avg_temp, _count
        FROM (
            SELECT 
                (item->'value'->>'doubleValue')::numeric AS temp_val
            FROM 
                telemetry_raw tr,
                jsonb_array_elements(tr.payload->'data') AS item
            WHERE 
                tr.vin = _trip.vin
                AND tr.created_at >= (_trip.start_time - INTERVAL '30 minutes')
                AND tr.created_at <= (_trip.end_time + INTERVAL '30 minutes')
                AND item->>'key' = 'OutsideTemp'
                AND (item->'value'->>'doubleValue') IS NOT NULL
        ) temps;

        IF _count > 0 THEN
            UPDATE trips 
            SET min_outside_temp = _min_temp,
                max_outside_temp = _max_temp,
                avg_outside_temp = ROUND(_avg_temp::numeric, 1)
            WHERE id = _trip.id;

            RAISE NOTICE 'Trip % (% to %): min=%, max=%, avg=% (% readings, expanded window)',
                _trip.id, _trip.start_time, _trip.end_time, 
                _min_temp, _max_temp, ROUND(_avg_temp::numeric, 1), _count;
        ELSE
            -- Fallback: Find the single nearest OutsideTemp reading to the trip midpoint
            SELECT (item->'value'->>'doubleValue')::numeric
            INTO _nearest_temp
            FROM 
                telemetry_raw tr,
                jsonb_array_elements(tr.payload->'data') AS item
            WHERE 
                tr.vin = _trip.vin
                AND item->>'key' = 'OutsideTemp'
                AND (item->'value'->>'doubleValue') IS NOT NULL
            ORDER BY ABS(EXTRACT(EPOCH FROM (tr.created_at - (_trip.start_time + (_trip.end_time - _trip.start_time) / 2))))
            LIMIT 1;

            IF _nearest_temp IS NOT NULL THEN
                UPDATE trips 
                SET min_outside_temp = _nearest_temp,
                    max_outside_temp = _nearest_temp,
                    avg_outside_temp = _nearest_temp
                WHERE id = _trip.id;

                RAISE NOTICE 'Trip % (% to %): used nearest reading: %°C',
                    _trip.id, _trip.start_time, _trip.end_time, _nearest_temp;
            ELSE
                RAISE NOTICE 'Trip % (% to %): no temperature data found even with expanded search',
                    _trip.id, _trip.start_time, _trip.end_time;
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE 'Backfill complete!';
END;
$$ LANGUAGE plpgsql;
