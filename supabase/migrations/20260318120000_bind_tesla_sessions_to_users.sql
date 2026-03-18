WITH ranked_sessions AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY last_used_at DESC, updated_at DESC, created_at DESC, id DESC
        ) AS row_number
    FROM public.tesla_sessions
    WHERE user_id IS NOT NULL
)
DELETE FROM public.tesla_sessions
WHERE id IN (
    SELECT id
    FROM ranked_sessions
    WHERE row_number > 1
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tesla_sessions_user_id_key'
          AND conrelid = 'public.tesla_sessions'::regclass
    ) THEN
        ALTER TABLE public.tesla_sessions
            ADD CONSTRAINT tesla_sessions_user_id_key UNIQUE (user_id);
    END IF;
END;
$$;
