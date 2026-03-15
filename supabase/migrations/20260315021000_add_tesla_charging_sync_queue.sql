ALTER TABLE public.tesla_sessions
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tesla_sessions_user_id_last_used_at
    ON public.tesla_sessions (user_id, last_used_at DESC)
    WHERE user_id IS NOT NULL;

DO $$
DECLARE
    _only_user_id uuid;
    _user_count integer := 0;
BEGIN
    SELECT COUNT(DISTINCT user_id)
    INTO _user_count
    FROM public.vehicles
    WHERE user_id IS NOT NULL;

    IF _user_count = 1 THEN
        SELECT user_id
        INTO _only_user_id
        FROM public.vehicles
        WHERE user_id IS NOT NULL
        LIMIT 1;

        UPDATE public.tesla_sessions
        SET user_id = _only_user_id
        WHERE user_id IS NULL;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.charging_session_tesla_sync_jobs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    charging_session_id uuid NOT NULL UNIQUE REFERENCES public.charging_sessions(id) ON DELETE CASCADE,
    vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'unavailable', 'failed')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    queued_at timestamptz NOT NULL DEFAULT now(),
    processing_started_at timestamptz,
    processed_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_charging_session_tesla_sync_jobs_status_queued_at
    ON public.charging_session_tesla_sync_jobs (status, queued_at);

ALTER TABLE public.charging_session_tesla_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage charging sync jobs" ON public.charging_session_tesla_sync_jobs;
CREATE POLICY "Service role can manage charging sync jobs"
    ON public.charging_session_tesla_sync_jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP TRIGGER IF EXISTS update_charging_session_tesla_sync_jobs_updated_at ON public.charging_session_tesla_sync_jobs;
CREATE TRIGGER update_charging_session_tesla_sync_jobs_updated_at
    BEFORE UPDATE ON public.charging_session_tesla_sync_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enqueue_supercharger_tesla_sync_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.is_complete = true
       AND COALESCE(NEW.charger_type, '') ILIKE '%supercharger%'
       AND NEW.tesla_charge_event_id IS NULL THEN
        INSERT INTO public.charging_session_tesla_sync_jobs (
            charging_session_id,
            vehicle_id
        )
        VALUES (
            NEW.id,
            NEW.vehicle_id
        )
        ON CONFLICT (charging_session_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_supercharger_tesla_sync_job ON public.charging_sessions;
CREATE TRIGGER enqueue_supercharger_tesla_sync_job
    AFTER INSERT OR UPDATE OF is_complete, charger_type, tesla_charge_event_id
    ON public.charging_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.enqueue_supercharger_tesla_sync_job();

CREATE OR REPLACE FUNCTION public.claim_pending_tesla_charging_sync_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.charging_session_tesla_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH candidates AS (
        SELECT job.id
        FROM public.charging_session_tesla_sync_jobs job
        WHERE job.status = 'pending'
           OR (
               job.status = 'processing'
               AND job.processing_started_at <= now() - interval '15 minutes'
           )
        ORDER BY job.queued_at ASC
        LIMIT GREATEST(COALESCE(p_limit, 10), 1)
        FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.charging_session_tesla_sync_jobs job
        SET
            status = 'processing',
            attempt_count = job.attempt_count + 1,
            processing_started_at = now()
        FROM candidates
        WHERE job.id = candidates.id
        RETURNING job.*
    )
    SELECT *
    FROM claimed;
END;
$$;

COMMENT ON FUNCTION public.claim_pending_tesla_charging_sync_jobs(integer) IS
'Claims pending Supercharger Tesla sync jobs for out-of-band processing.';

INSERT INTO public.charging_session_tesla_sync_jobs (
    charging_session_id,
    vehicle_id
)
SELECT
    session.id,
    session.vehicle_id
FROM public.charging_sessions session
WHERE session.is_complete = true
  AND COALESCE(session.charger_type, '') ILIKE '%supercharger%'
  AND session.tesla_charge_event_id IS NULL
ON CONFLICT (charging_session_id) DO NOTHING;
