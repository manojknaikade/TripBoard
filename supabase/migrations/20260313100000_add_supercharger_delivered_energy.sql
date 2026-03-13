ALTER TABLE public.charging_sessions
    ADD COLUMN IF NOT EXISTS energy_delivered_kwh double precision,
    ADD COLUMN IF NOT EXISTS charger_price_per_kwh double precision,
    ADD COLUMN IF NOT EXISTS tesla_charge_event_id text;

COMMENT ON COLUMN public.charging_sessions.energy_delivered_kwh IS
'Total energy delivered by the charger for the session when available from Tesla charging history/invoice data.';

COMMENT ON COLUMN public.charging_sessions.charger_price_per_kwh IS
'Per-kWh station rate reported by Tesla for the charging session when available.';

COMMENT ON COLUMN public.charging_sessions.tesla_charge_event_id IS
'Tesla charging history / invoice event identifier used to reconcile Supercharger session metadata.';
