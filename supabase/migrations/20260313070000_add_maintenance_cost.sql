ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC CHECK (cost_amount IS NULL OR cost_amount >= 0),
  ADD COLUMN IF NOT EXISTS cost_currency TEXT;
