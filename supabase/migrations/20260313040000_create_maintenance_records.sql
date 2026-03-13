CREATE TABLE IF NOT EXISTS public.maintenance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_key TEXT UNIQUE,
  service_type TEXT NOT NULL CHECK (
    service_type IN (
      'tyre_season',
      'tyre_rotation',
      'wheel_alignment',
      'cabin_air_filter',
      'hepa_filter',
      'brake_fluid_check',
      'brake_service',
      'wiper_blades',
      'ac_desiccant_bag',
      'twelve_volt_battery',
      'other'
    )
  ),
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  odometer_km INTEGER CHECK (odometer_km IS NULL OR odometer_km >= 0),
  season TEXT CHECK (season IS NULL OR season IN ('summer', 'winter', 'all_season')),
  rotation_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (
    rotation_status IN ('rotated', 'not_rotated', 'unknown', 'not_applicable')
  ),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_records_start_date
  ON public.maintenance_records(start_date DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_records_service_type
  ON public.maintenance_records(service_type, start_date DESC);

ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage maintenance records" ON public.maintenance_records;
CREATE POLICY "Service role can manage maintenance records" ON public.maintenance_records
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

DROP TRIGGER IF EXISTS update_maintenance_records_updated_at ON public.maintenance_records;
CREATE TRIGGER update_maintenance_records_updated_at
  BEFORE UPDATE ON public.maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.maintenance_records (
  source_key,
  service_type,
  title,
  start_date,
  end_date,
  odometer_km,
  season,
  rotation_status,
  notes
)
VALUES
  (
    'initial-tyre-summer-2024',
    'tyre_season',
    'Summer tyres installed',
    DATE '2024-05-01',
    DATE '2024-10-10',
    6881,
    'summer',
    'unknown',
    'Odometer reading logged at changeover. Start month provided as May 2024; assumed 2024-05-01.'
  ),
  (
    'initial-tyre-winter-2024',
    'tyre_season',
    'Winter tyres installed',
    DATE '2024-10-10',
    DATE '2025-04-16',
    15841,
    'winter',
    'unknown',
    'Odometer reading logged at changeover.'
  ),
  (
    'initial-tyre-summer-2025',
    'tyre_season',
    'Summer tyres installed',
    DATE '2025-04-16',
    DATE '2025-10-30',
    27848,
    'summer',
    'unknown',
    'Odometer reading logged at changeover. Original note: "Summer without rotation?"'
  ),
  (
    'initial-tyre-winter-2025',
    'tyre_season',
    'Winter tyres installed',
    DATE '2025-10-30',
    NULL,
    NULL,
    'winter',
    'not_applicable',
    'Current open winter season. No odometer value was provided in the source log.'
  )
ON CONFLICT (source_key) DO NOTHING;
