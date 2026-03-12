import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeTeslaRegion, type TeslaRegion } from '@/lib/tesla/api';

const TESLA_TOKEN_URL = 'https://auth.tesla.com/oauth2/v3/token';
const TESLA_CLIENT_ID = process.env.TESLA_CLIENT_ID!;
const TESLA_CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET!;
const TESLA_SESSION_COOKIE = 'tesla_session';
const TESLA_SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

type TeslaSessionInput = {
    accessToken: string;
    refreshToken?: string;
    region: TeslaRegion;
};

type TeslaSessionRow = {
    session_token_hash: string;
    access_token_encrypted: string;
    refresh_token_encrypted: string | null;
    token_expires_at: string | null;
    region: string;
};

export type TeslaSession = TeslaSessionInput & {
    sessionToken: string;
    tokenExpiresAt: string | null;
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

function getTeslaSessionCookieOptions(request: NextRequest) {
    const isLocalhost = request.nextUrl.hostname === 'localhost';

    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax' as const,
        maxAge: TESLA_SESSION_MAX_AGE,
    };
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

async function saveTeslaSession(sessionToken: string, session: TeslaSessionInput) {
    const supabase = createAdminClient();
    const tokenExpiresAt = getTokenExpiry(session.accessToken);

    const { error } = await supabase
        .from('tesla_sessions')
        .upsert(
            {
                session_token_hash: hashSessionToken(sessionToken),
                access_token_encrypted: encryptValue(session.accessToken),
                refresh_token_encrypted: session.refreshToken
                    ? encryptValue(session.refreshToken)
                    : null,
                token_expires_at: tokenExpiresAt,
                region: session.region,
                updated_at: new Date().toISOString(),
                last_used_at: new Date().toISOString(),
            },
            { onConflict: 'session_token_hash' }
        );

    if (error) {
        throw new Error(`Failed to persist Tesla session: ${error.message}`);
    }

    return tokenExpiresAt;
}

async function getTeslaSessionRow(sessionToken: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('tesla_sessions')
        .select('session_token_hash, access_token_encrypted, refresh_token_encrypted, token_expires_at, region')
        .eq('session_token_hash', hashSessionToken(sessionToken))
        .maybeSingle<TeslaSessionRow>();

    if (error) {
        throw new Error(`Failed to load Tesla session: ${error.message}`);
    }

    return data;
}

async function deleteTeslaSessionRecord(sessionToken: string) {
    const supabase = createAdminClient();
    const { error } = await supabase
        .from('tesla_sessions')
        .delete()
        .eq('session_token_hash', hashSessionToken(sessionToken));

    if (error) {
        throw new Error(`Failed to delete Tesla session: ${error.message}`);
    }
}

async function refreshStoredTeslaSession(sessionToken: string, session: TeslaSession) {
    if (!session.refreshToken) {
        return null;
    }

    const data = await refreshTeslaTokenRaw(session.refreshToken);
    if (!data?.access_token) {
        return null;
    }

    const refreshedSession: TeslaSessionInput = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || session.refreshToken,
        region: session.region,
    };

    const tokenExpiresAt = await saveTeslaSession(sessionToken, refreshedSession);

    return {
        sessionToken,
        ...refreshedSession,
        tokenExpiresAt,
    };
}

export async function setTeslaSession(
    request: NextRequest,
    response: NextResponse,
    session: TeslaSessionInput
) {
    const sessionToken =
        request.cookies.get(TESLA_SESSION_COOKIE)?.value ||
        crypto.randomBytes(32).toString('base64url');

    await saveTeslaSession(sessionToken, session);

    response.cookies.set(
        TESLA_SESSION_COOKIE,
        sessionToken,
        getTeslaSessionCookieOptions(request)
    );

    response.cookies.delete('tesla_access_token');
    response.cookies.delete('tesla_refresh_token');
}

export async function getTeslaSession(request: NextRequest): Promise<TeslaSession | null> {
    const sessionToken = request.cookies.get(TESLA_SESSION_COOKIE)?.value;

    if (!sessionToken) {
        return null;
    }

    const row = await getTeslaSessionRow(sessionToken);
    if (!row) {
        return null;
    }

    try {
        const session: TeslaSession = {
            sessionToken,
            accessToken: decryptValue(row.access_token_encrypted),
            refreshToken: row.refresh_token_encrypted
                ? decryptValue(row.refresh_token_encrypted)
                : undefined,
            region: normalizeTeslaRegion(row.region) ?? 'eu',
            tokenExpiresAt: row.token_expires_at,
        };

        if (!session.tokenExpiresAt) {
            session.tokenExpiresAt = getTokenExpiry(session.accessToken);
            await saveTeslaSession(sessionToken, session);
        }

        if (session.tokenExpiresAt) {
            const msUntilExpiry = new Date(session.tokenExpiresAt).getTime() - Date.now();

            if (msUntilExpiry < TOKEN_REFRESH_WINDOW_MS) {
                const refreshedSession = await refreshStoredTeslaSession(sessionToken, session);
                if (refreshedSession) {
                    return refreshedSession;
                }

                if (msUntilExpiry <= 0) {
                    await deleteTeslaSessionRecord(sessionToken);
                    return null;
                }
            }
        }

        return session;
    } catch (error) {
        console.error('Failed to decrypt Tesla session:', error);
        await deleteTeslaSessionRecord(sessionToken);
        return null;
    }
}

export async function clearTeslaSession(request: NextRequest, response: NextResponse) {
    const sessionToken = request.cookies.get(TESLA_SESSION_COOKIE)?.value;

    if (sessionToken) {
        try {
            await deleteTeslaSessionRecord(sessionToken);
        } catch (error) {
            console.error('Failed to delete Tesla session during sign-out:', error);
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
