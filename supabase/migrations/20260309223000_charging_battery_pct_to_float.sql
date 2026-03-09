-- Migration: Change charging_sessions battery percentage columns from integer to double precision
-- This allows storing accurate float values from Tesla telemetry instead of rounding to integers.

ALTER TABLE public.charging_sessions
    ALTER COLUMN start_battery_pct TYPE double precision,
    ALTER COLUMN end_battery_pct TYPE double precision;
