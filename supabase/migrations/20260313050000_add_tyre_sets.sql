CREATE TABLE IF NOT EXISTS public.tyre_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_key TEXT UNIQUE,
  name TEXT NOT NULL,
  season TEXT NOT NULL CHECK (season IN ('summer', 'winter', 'all_season')),
  purchase_date DATE,
  purchase_odometer_km INTEGER CHECK (purchase_odometer_km IS NULL OR purchase_odometer_km >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS tyre_set_id UUID REFERENCES public.tyre_sets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tyre_sets_status
  ON public.tyre_sets(status, season, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_records_tyre_set_id
  ON public.maintenance_records(tyre_set_id, start_date DESC);

ALTER TABLE public.tyre_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage tyre sets" ON public.tyre_sets;
CREATE POLICY "Service role can manage tyre sets" ON public.tyre_sets
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_tyre_sets_updated_at ON public.tyre_sets;
CREATE TRIGGER update_tyre_sets_updated_at
  BEFORE UPDATE ON public.tyre_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tyre_sets (
  source_key,
  name,
  season,
  purchase_date,
  purchase_odometer_km,
  status,
  notes
)
VALUES
  (
    'initial-tyre-set-summer',
    'Summer set',
    'summer',
    NULL,
    NULL,
    'active',
    'Inferred from existing seasonal tyre history.'
  ),
  (
    'initial-tyre-set-winter',
    'Winter set',
    'winter',
    NULL,
    NULL,
    'active',
    'Inferred from existing seasonal tyre history.'
  )
ON CONFLICT (source_key) DO NOTHING;

UPDATE public.maintenance_records
SET tyre_set_id = (SELECT id FROM public.tyre_sets WHERE source_key = 'initial-tyre-set-summer')
WHERE source_key IN ('initial-tyre-summer-2024', 'initial-tyre-summer-2025')
  AND tyre_set_id IS NULL;

UPDATE public.maintenance_records
SET tyre_set_id = (SELECT id FROM public.tyre_sets WHERE source_key = 'initial-tyre-set-winter')
WHERE source_key IN ('initial-tyre-winter-2024', 'initial-tyre-winter-2025')
  AND tyre_set_id IS NULL;
