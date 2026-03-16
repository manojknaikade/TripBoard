ALTER TABLE public.vehicle_status
ADD COLUMN IF NOT EXISTS charge_limit_soc integer;

CREATE OR REPLACE FUNCTION public.sync_vehicle_charge_limit_from_telemetry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    _entry jsonb;
    _value_obj jsonb;
    _charge_limit_soc integer;
BEGIN
    IF NEW.payload->'data' IS NULL THEN
        RETURN NEW;
    END IF;

    FOR _entry IN SELECT * FROM jsonb_array_elements(NEW.payload->'data')
    LOOP
        IF _entry->>'key' = 'ChargeLimitSoc' THEN
            _value_obj := _entry->'value';
            _charge_limit_soc := COALESCE(
                (_value_obj->>'intValue')::numeric,
                (_value_obj->>'doubleValue')::numeric,
                NULLIF(_value_obj->>'stringValue', '')::numeric
            )::integer;

            UPDATE public.vehicle_status
            SET charge_limit_soc = _charge_limit_soc
            WHERE vin = NEW.vin;

            EXIT;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_vehicle_charge_limit_from_telemetry() OWNER TO postgres;

DROP TRIGGER IF EXISTS trigger_sync_vehicle_charge_limit_from_telemetry ON public.telemetry_raw;

CREATE TRIGGER trigger_sync_vehicle_charge_limit_from_telemetry
AFTER INSERT ON public.telemetry_raw
FOR EACH ROW
EXECUTE FUNCTION public.sync_vehicle_charge_limit_from_telemetry();

WITH latest_charge_limits AS (
    SELECT DISTINCT ON (tr.vin)
        tr.vin,
        COALESCE(
            (item->'value'->>'intValue')::numeric,
            (item->'value'->>'doubleValue')::numeric,
            NULLIF(item->'value'->>'stringValue', '')::numeric
        )::integer AS charge_limit_soc
    FROM public.telemetry_raw tr
    CROSS JOIN LATERAL jsonb_array_elements(tr.payload->'data') AS item
    WHERE item->>'key' = 'ChargeLimitSoc'
    ORDER BY tr.vin, COALESCE(tr.timestamp, tr.created_at, NOW()) DESC, tr.id DESC
)
UPDATE public.vehicle_status vs
SET charge_limit_soc = latest_charge_limits.charge_limit_soc
FROM latest_charge_limits
WHERE vs.vin = latest_charge_limits.vin
  AND latest_charge_limits.charge_limit_soc IS NOT NULL;
