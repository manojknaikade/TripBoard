import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { normalizeTeslaRegion, type TeslaRegion } from '@/lib/tesla/api';

const TESLA_TOKEN_URL = 'https://auth.tesla.com/oauth2/v3/token';
const TESLA_CLIENT_ID = process.env.TESLA_CLIENT_ID!;
const TESLA_CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET!;
const TESLA_SESSION_COOKIE = 'tesla_session';
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

type TeslaSessionInput = {
    accessToken: string;
    refreshToken?: string;
    region: TeslaRegion;
};

type TeslaSessionRow = {
    id: string;
    user_id: string | null;
    session_token_hash: string;
    access_token_encrypted: string;
    refresh_token_encrypted: string | null;
    token_expires_at: string | null;
    region: string;
};

export type TeslaSession = TeslaSessionInput & {
    tokenExpiresAt: string | null;
};

export type StoredTeslaSession = TeslaSessionInput & {
    id: string;
    sessionTokenHash: string;
    tokenExpiresAt: string | null;
    userId: string | null;
};

function getEncryptionKey() {
    const rawKey = process.env.TOKEN_ENCRYPTION_KEY;

    if (!rawKey) {
        throw new Error('TOKEN_ENCRYPTION_KEY is required for Tesla session storage');
    }

    const decodedKey = Buffer.from(rawKey, 'base64');
    if (decodedKey.length === 32) {
        return decodedKey;
    }

    if (Buffer.byteLength(rawKey) === 32) {
        return Buffer.from(rawKey);
    }

    return crypto.createHash('sha256').update(rawKey).digest();
}

function encryptValue(value: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv, authTag, encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptValue(payload: string) {
    const [iv, authTag, encrypted] = payload.split('.');

    if (!iv || !authTag || !encrypted) {
        throw new Error('Invalid encrypted payload');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        getEncryptionKey(),
        Buffer.from(iv, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

function hashSessionToken(sessionToken: string) {
    return crypto.createHash('sha256').update(sessionToken).digest('hex');
}

function getTokenExpiry(accessToken: string) {
    try {
        const payload = JSON.parse(
            Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8')
        );

        return typeof payload.exp === 'number'
            ? new Date(payload.exp * 1000).toISOString()
            : null;
    } catch {
        return null;
    }
}

function toStoredTeslaSession(row: TeslaSessionRow): StoredTeslaSession {
    return {
        id: row.id,
        userId: row.user_id,
        sessionTokenHash: row.session_token_hash,
        accessToken: decryptValue(row.access_token_encrypted),
        refreshToken: row.refresh_token_encrypted
            ? decryptValue(row.refresh_token_encrypted)
            : undefined,
        region: normalizeTeslaRegion(row.region) ?? 'eu',
        tokenExpiresAt: row.token_expires_at,
    };
}

async function persistTeslaSessionRecord(params: {
    session: TeslaSessionInput;
    userId: string;
    sessionTokenHash?: string | null;
}) {
    const supabase = createAdminClient();
    const tokenExpiresAt = getTokenExpiry(params.session.accessToken);
    const payload: Record<string, string | null> = {
        session_token_hash: params.sessionTokenHash ?? hashSessionToken(crypto.randomUUID()),
        access_token_encrypted: encryptValue(params.session.accessToken),
        refresh_token_encrypted: params.session.refreshToken
            ? encryptValue(params.session.refreshToken)
            : null,
        token_expires_at: tokenExpiresAt,
        region: params.session.region,
        user_id: params.userId,
        updated_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from('tesla_sessions')
        .upsert(
            payload,
            { onConflict: 'user_id' }
        );

    if (error) {
        throw new Error(`Failed to persist Tesla session: ${error.message}`);
    }

    return tokenExpiresAt;
}

async function getTeslaSessionRowForUser(userId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('tesla_sessions')
        .select('id, user_id, session_token_hash, access_token_encrypted, refresh_token_encrypted, token_expires_at, region')
        .eq('user_id', userId)
        .maybeSingle<TeslaSessionRow>();

    if (error) {
        throw new Error(`Failed to load Tesla session: ${error.message}`);
    }

    return data;
}

async function touchTeslaSessionRecord(sessionTokenHash: string) {
    const supabase = createAdminClient();

    const { error } = await supabase
        .from('tesla_sessions')
        .update({
            last_used_at: new Date().toISOString(),
        })
        .eq('session_token_hash', sessionTokenHash);

    if (error) {
        throw new Error(`Failed to touch Tesla session: ${error.message}`);
    }
}

async function deleteTeslaSessionRecordByToken(sessionToken: string) {
    const supabase = createAdminClient();
    const { error } = await supabase
        .from('tesla_sessions')
        .delete()
        .eq('session_token_hash', hashSessionToken(sessionToken));

    if (error) {
        throw new Error(`Failed to delete Tesla session: ${error.message}`);
    }
}

async function deleteTeslaSessionRecordByUser(userId: string) {
    const supabase = createAdminClient();
    const { error } = await supabase
        .from('tesla_sessions')
        .delete()
        .eq('user_id', userId);

    if (error) {
        throw new Error(`Failed to delete Tesla session: ${error.message}`);
    }
}

async function refreshStoredTeslaSession(session: TeslaSession, row: TeslaSessionRow) {
    const refreshedStoredSession = await ensureFreshStoredTeslaSession({
        ...toStoredTeslaSession(row),
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        region: session.region,
        tokenExpiresAt: session.tokenExpiresAt,
    });

    if (!refreshedStoredSession) {
        return null;
    }

    return {
        accessToken: refreshedStoredSession.accessToken,
        refreshToken: refreshedStoredSession.refreshToken,
        region: refreshedStoredSession.region,
        tokenExpiresAt: refreshedStoredSession.tokenExpiresAt,
    };
}

export async function setTeslaSession(
    request: NextRequest,
    response: NextResponse,
    session: TeslaSessionInput,
    options?: {
        userId?: string;
    }
) {
    void request;

    if (!options?.userId) {
        throw new Error('Supabase authentication is required before connecting Tesla');
    }

    await persistTeslaSessionRecord({
        session,
        userId: options.userId,
    });

    response.cookies.delete(TESLA_SESSION_COOKIE);
    response.cookies.delete('tesla_access_token');
    response.cookies.delete('tesla_refresh_token');
}

async function getTeslaSessionForAuthenticatedUser(): Promise<TeslaSession | null> {
    const user = await getAuthenticatedUser();
    if (!user) {
        return null;
    }

    return getTeslaSessionForUserId(user.id);
}

async function getTeslaSessionForUserId(userId: string): Promise<TeslaSession | null> {
    const row = await getTeslaSessionRowForUser(userId);
    if (!row) {
        return null;
    }

    try {
        const session: TeslaSession = {
            accessToken: decryptValue(row.access_token_encrypted),
            refreshToken: row.refresh_token_encrypted
                ? decryptValue(row.refresh_token_encrypted)
                : undefined,
            region: normalizeTeslaRegion(row.region) ?? 'eu',
            tokenExpiresAt: row.token_expires_at,
        };

        if (!session.tokenExpiresAt) {
            session.tokenExpiresAt = getTokenExpiry(session.accessToken);
            await persistTeslaSessionRecord({
                session,
                sessionTokenHash: row.session_token_hash,
                userId,
            });
        }

        if (session.tokenExpiresAt) {
            const msUntilExpiry = new Date(session.tokenExpiresAt).getTime() - Date.now();

            if (msUntilExpiry < TOKEN_REFRESH_WINDOW_MS) {
                const refreshedSession = await refreshStoredTeslaSession(session, row);
                if (refreshedSession) {
                    return refreshedSession;
                }

                if (msUntilExpiry <= 0) {
                    await deleteTeslaSessionRecordByUser(userId);
                    return null;
                }
            }
        }

        try {
            await touchTeslaSessionRecord(row.session_token_hash);
        } catch (touchError) {
            console.warn('Failed to update Tesla session last_used_at:', touchError);
        }
        return session;
    } catch (error) {
        console.error('Failed to decrypt Tesla session:', error);
        await deleteTeslaSessionRecordByUser(userId);
        return null;
    }
}

export async function getTeslaSession(_request: NextRequest): Promise<TeslaSession | null> {
    void _request;
    return getTeslaSessionForAuthenticatedUser();
}

export async function getTeslaSessionFromServerCookies(): Promise<TeslaSession | null> {
    return getTeslaSessionForAuthenticatedUser();
}

export async function clearTeslaSession(request: NextRequest, response: NextResponse) {
    const user = await getAuthenticatedUser().catch(() => null);
    const sessionToken = request.cookies.get(TESLA_SESSION_COOKIE)?.value;

    if (user?.id) {
        try {
            await deleteTeslaSessionRecordByUser(user.id);
        } catch (error) {
            console.error('Failed to delete Tesla session during sign-out:', error);
        }
    } else if (sessionToken) {
        try {
            await deleteTeslaSessionRecordByToken(sessionToken);
        } catch (error) {
            console.error('Failed to delete legacy Tesla session during sign-out:', error);
        }
    }

    response.cookies.delete(TESLA_SESSION_COOKIE);
    response.cookies.delete('tesla_access_token');
    response.cookies.delete('tesla_refresh_token');
    response.cookies.delete('tesla_token_expires_at');
    response.cookies.delete('user_id');
}

export async function refreshTeslaTokenRaw(refreshToken: string) {
    if (!TESLA_CLIENT_ID) {
        throw new Error('TESLA_CLIENT_ID is not configured');
    }

    try {
        const response = await fetch(TESLA_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: TESLA_CLIENT_ID,
                client_secret: TESLA_CLIENT_SECRET,
                refresh_token: refreshToken,
            }),
        });

        if (!response.ok) {
            console.error('Tesla Auth: Refresh failed', await response.text());
            return null;
        }

        return await response.json();
    } catch (e) {
        console.error('Tesla Auth: Refresh error', e);
        return null;
    }
}

async function getLatestTeslaSessionRow(params: {
    userId: string;
    preferredRegion?: string | null;
}) {
    const supabase = createAdminClient();
    const preferredRegion = normalizeTeslaRegion(params.preferredRegion);

    const runQuery = async (region?: TeslaRegion | null) => {
        let query = supabase
            .from('tesla_sessions')
            .select('id, user_id, session_token_hash, access_token_encrypted, refresh_token_encrypted, token_expires_at, region')
            .order('last_used_at', { ascending: false })
            .eq('user_id', params.userId)
            .limit(1);

        if (region) {
            query = query.eq('region', region);
        }

        const { data, error } = await query.maybeSingle<TeslaSessionRow>();

        if (error) {
            throw new Error(`Failed to load Tesla session: ${error.message}`);
        }

        return data;
    };

    const exactUserMatch = await runQuery(preferredRegion);
    if (exactUserMatch) {
        return exactUserMatch;
    }

    return runQuery(null);
}

export async function getStoredTeslaSessionForUser(
    userId?: string | null,
    preferredRegion?: string | null,
): Promise<StoredTeslaSession | null> {
    if (!userId) {
        return null;
    }

    const row = await getLatestTeslaSessionRow({
        userId,
        preferredRegion,
    });

    if (!row) {
        return null;
    }

    return toStoredTeslaSession(row);
}

export async function ensureFreshStoredTeslaSession(
    session: StoredTeslaSession,
): Promise<StoredTeslaSession | null> {
    if (!session.userId) {
        return null;
    }

    if (!session.tokenExpiresAt) {
        const tokenExpiresAt = getTokenExpiry(session.accessToken);

        await persistTeslaSessionRecord({
            session: {
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                region: session.region,
            },
            sessionTokenHash: session.sessionTokenHash,
            userId: session.userId,
        });

        return {
            ...session,
            tokenExpiresAt,
        };
    }

    const msUntilExpiry = new Date(session.tokenExpiresAt).getTime() - Date.now();
    if (msUntilExpiry >= TOKEN_REFRESH_WINDOW_MS) {
        return session;
    }

    if (!session.refreshToken) {
        return msUntilExpiry > 0 ? session : null;
    }

    const data = await refreshTeslaTokenRaw(session.refreshToken);
    if (!data?.access_token) {
        return msUntilExpiry > 0 ? session : null;
    }

    const refreshedSession: TeslaSessionInput = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || session.refreshToken,
        region: session.region,
    };

    const tokenExpiresAt = await persistTeslaSessionRecord({
        session: refreshedSession,
        sessionTokenHash: session.sessionTokenHash,
        userId: session.userId,
    });

    return {
        ...session,
        ...refreshedSession,
        tokenExpiresAt,
    };
}
