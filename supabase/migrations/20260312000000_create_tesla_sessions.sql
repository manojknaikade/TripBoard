CREATE TABLE IF NOT EXISTS public.tesla_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_token_hash TEXT NOT NULL UNIQUE,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    region TEXT NOT NULL DEFAULT 'eu' CHECK (region IN ('na', 'eu', 'cn')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tesla_sessions ENABLE ROW LEVEL SECURITY;
