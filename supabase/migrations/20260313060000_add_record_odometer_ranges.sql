ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS start_odometer_km INTEGER CHECK (start_odometer_km IS NULL OR start_odometer_km >= 0),
  ADD COLUMN IF NOT EXISTS end_odometer_km INTEGER CHECK (end_odometer_km IS NULL OR end_odometer_km >= 0);

UPDATE public.maintenance_records
SET
  start_odometer_km = 0,
  end_odometer_km = 6881,
  odometer_km = 6881
WHERE source_key = 'initial-tyre-summer-2024';

UPDATE public.maintenance_records
SET
  start_odometer_km = 6881,
  end_odometer_km = 15841,
  odometer_km = 15841
WHERE source_key = 'initial-tyre-winter-2024';

UPDATE public.maintenance_records
SET
  start_odometer_km = 15841,
  end_odometer_km = 27848,
  odometer_km = 27848
WHERE source_key = 'initial-tyre-summer-2025';

UPDATE public.maintenance_records
SET
  start_odometer_km = 27848,
  end_odometer_km = NULL,
  odometer_km = NULL
WHERE source_key = 'initial-tyre-winter-2025';
