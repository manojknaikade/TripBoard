ALTER TABLE public.vehicle_status
ADD COLUMN IF NOT EXISTS state text;

CREATE OR REPLACE FUNCTION public.sync_vehicle_state_from_telemetry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    _charge_state text;
    _shift_state text;
    _speed numeric;
    _state text;
BEGIN
    SELECT charge_state, shift_state, speed
    INTO _charge_state, _shift_state, _speed
    FROM public.vehicle_status
    WHERE vin = NEW.vin;

    _state := CASE
        WHEN _shift_state IN ('D', 'R') OR COALESCE(_speed, 0) > 0 THEN 'driving'
        WHEN _charge_state IN ('Charging', 'Starting') THEN 'charging'
        ELSE 'parked'
    END;

    UPDATE public.vehicle_status
    SET state = _state
    WHERE vin = NEW.vin;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_vehicle_state_from_telemetry() OWNER TO postgres;

DROP TRIGGER IF EXISTS trigger_sync_vehicle_state_from_telemetry ON public.telemetry_raw;

CREATE TRIGGER trigger_sync_vehicle_state_from_telemetry
AFTER INSERT ON public.telemetry_raw
FOR EACH ROW
EXECUTE FUNCTION public.sync_vehicle_state_from_telemetry();

UPDATE public.vehicle_status
SET state = CASE
    WHEN shift_state IN ('D', 'R') OR COALESCE(speed, 0) > 0 THEN 'driving'
    WHEN charge_state IN ('Charging', 'Starting') THEN 'charging'
    ELSE 'parked'
END;
