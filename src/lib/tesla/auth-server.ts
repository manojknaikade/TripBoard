import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser, getAuthenticatedUserId } from '@/lib/supabase/auth';
import { normalizeTeslaRegion, type TeslaRegion } from '@/lib/tesla/api';

const TESLA_TOKEN_URL = 'https://auth.tesla.com/oauth2/v3/token';
const TESLA_CLIENT_ID = process.env.TESLA_CLIENT_ID!;
const TESLA_CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET!;
const TESLA_SESSION_COOKIE = 'tesla_session';
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const TESLA_SESSION_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

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
    last_used_at: string;
};

export type TeslaSession = TeslaSessionInput & {
    tokenExpiresAt: string | null;
};

export type StoredTeslaSession = TeslaSessionInput & {
    id: string;
    sessionTokenHash: string;
    tokenExpiresAt: string | null;
    userId: string | null;
    needsReencryption?: boolean;
};

type EncryptionKey = {
    fingerprint: string;
    key: Buffer;
};

type DecryptedValue = {
    value: string;
    needsMigration: boolean;
};

function normalizeEncryptionKey(rawKey: string) {
    const decodedKey = Buffer.from(rawKey, 'base64');
    if (decodedKey.length === 32) {
        return decodedKey;
    }

    if (Buffer.byteLength(rawKey) === 32) {
        return Buffer.from(rawKey);
    }

    return crypto.createHash('sha256').update(rawKey).digest();
}

function parseConfiguredEncryptionKeys() {
    const activeRawKey = process.env.TOKEN_ENCRYPTION_KEY;

    if (!activeRawKey) {
        throw new Error('TOKEN_ENCRYPTION_KEY is required for Tesla session storage');
    }

    const configuredKeys = [
        activeRawKey,
        ...(process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    ];

    const keys: EncryptionKey[] = [];
    const seen = new Set<string>();

    for (const rawKey of configuredKeys) {
        const key = normalizeEncryptionKey(rawKey);
        const fingerprint = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);

        if (seen.has(fingerprint)) {
            continue;
        }

        seen.add(fingerprint);
        keys.push({ fingerprint, key });
    }

    return {
        active: keys[0],
        all: keys,
    };
}

function encryptValue(value: string) {
    const { active } = parseConfiguredEncryptionKeys();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', active.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [active.fingerprint, iv, authTag, encrypted]
        .map((part) => part.toString('base64url'))
        .join('.');
}

function decryptWithKey(params: {
    encrypted: string;
    iv: string;
    authTag: string;
    key: Buffer;
}) {
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        params.key,
        Buffer.from(params.iv, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(params.authTag, 'base64url'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(params.encrypted, 'base64url')),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

function decryptValue(payload: string): DecryptedValue {
    const { active, all } = parseConfiguredEncryptionKeys();
    const parts = payload.split('.');

    if (parts.length === 4) {
        const [fingerprint, iv, authTag, encrypted] = parts;

        if (!fingerprint || !iv || !authTag || !encrypted) {
            throw new Error('Invalid encrypted payload');
        }

        const preferredOrder = [
            ...all.filter((candidate) => candidate.fingerprint === fingerprint),
            ...all.filter((candidate) => candidate.fingerprint !== fingerprint),
        ];

        for (const candidate of preferredOrder) {
            try {
                return {
                    value: decryptWithKey({
                        encrypted,
                        iv,
                        authTag,
                        key: candidate.key,
                    }),
                    needsMigration: candidate.fingerprint !== active.fingerprint,
                };
            } catch {
                // Try the next key candidate.
            }
        }

        throw new Error('Unable to decrypt payload with configured encryption keys');
    }

    if (parts.length === 3) {
        const [iv, authTag, encrypted] = parts;

        if (!iv || !authTag || !encrypted) {
            throw new Error('Invalid encrypted payload');
        }

        for (const candidate of all) {
            try {
                return {
                    value: decryptWithKey({
                        encrypted,
                        iv,
                        authTag,
                        key: candidate.key,
                    }),
                    needsMigration: true,
                };
            } catch {
                // Try the next key candidate.
            }
        }

        throw new Error('Unable to decrypt payload with configured encryption keys');
    }

    throw new Error('Invalid encrypted payload');
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

function shouldTouchTeslaSession(lastUsedAt: string | null) {
    if (!lastUsedAt) {
        return true;
    }

    const elapsedMs = Date.now() - new Date(lastUsedAt).getTime();

    return !Number.isFinite(elapsedMs) || elapsedMs >= TESLA_SESSION_TOUCH_INTERVAL_MS;
}

function toStoredTeslaSession(row: TeslaSessionRow): StoredTeslaSession {
    const accessToken = decryptValue(row.access_token_encrypted);
    const refreshToken = row.refresh_token_encrypted
        ? decryptValue(row.refresh_token_encrypted)
        : null;

    return {
        id: row.id,
        userId: row.user_id,
        sessionTokenHash: row.session_token_hash,
        accessToken: accessToken.value,
        refreshToken: refreshToken?.value,
        region: normalizeTeslaRegion(row.region) ?? 'eu',
        tokenExpiresAt: row.token_expires_at,
        needsReencryption: accessToken.needsMigration || Boolean(refreshToken?.needsMigration),
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
        .select('id, user_id, session_token_hash, access_token_encrypted, refresh_token_encrypted, token_expires_at, region, last_used_at')
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
    const userId = await getAuthenticatedUserId();
    if (!userId) {
        return null;
    }

    return getTeslaSessionForUserId(userId);
}

async function getTeslaSessionForUserId(userId: string): Promise<TeslaSession | null> {
    const row = await getTeslaSessionRowForUser(userId);
    if (!row) {
        return null;
    }

    try {
        const accessToken = decryptValue(row.access_token_encrypted);
        const refreshToken = row.refresh_token_encrypted
            ? decryptValue(row.refresh_token_encrypted)
            : null;
        const session: TeslaSession = {
            accessToken: accessToken.value,
            refreshToken: refreshToken?.value,
            region: normalizeTeslaRegion(row.region) ?? 'eu',
            tokenExpiresAt: row.token_expires_at,
        };
        const needsReencryption = accessToken.needsMigration || Boolean(refreshToken?.needsMigration);

        if (!session.tokenExpiresAt || needsReencryption) {
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

        if (shouldTouchTeslaSession(row.last_used_at)) {
            try {
                await touchTeslaSessionRecord(row.session_token_hash);
            } catch (touchError) {
                console.warn('Failed to update Tesla session last_used_at:', touchError);
            }
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

    if (!session.tokenExpiresAt || session.needsReencryption) {
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
            needsReencryption: false,
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
        needsReencryption: false,
    };
}
