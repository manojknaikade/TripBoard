-- Add charging cost and currency columns to charging_sessions
ALTER TABLE public.charging_sessions
ADD COLUMN IF NOT EXISTS cost_user_entered double precision;

ALTER TABLE public.charging_sessions
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'CHF';

-- Add default currency to user settings
ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'CHF';
