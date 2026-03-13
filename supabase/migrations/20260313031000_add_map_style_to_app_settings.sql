ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS map_style text DEFAULT 'streets'
CHECK (map_style IN ('streets', 'dark'));
