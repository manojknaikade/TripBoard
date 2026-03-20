const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    if (!url || !key) {
        throw new Error('Supabase URL and service role key are required');
    }

    return createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

function normalizeEncryptionKey(rawKey) {
    const decodedKey = Buffer.from(rawKey, 'base64');

    if (decodedKey.length === 32) {
        return decodedKey;
    }

    if (Buffer.byteLength(rawKey) === 32) {
        return Buffer.from(rawKey);
    }

    return crypto.createHash('sha256').update(rawKey).digest();
}

function getConfiguredEncryptionKeys() {
    const configuredKeys = [
        getRequiredEnv('TOKEN_ENCRYPTION_KEY'),
        ...String(process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    ];

    const keys = [];
    const seen = new Set();

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

function encryptValue(value) {
    const { active } = getConfiguredEncryptionKeys();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', active.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [active.fingerprint, iv, authTag, encrypted]
        .map((part) => part.toString('base64url'))
        .join('.');
}

function decryptWithKey({ encrypted, iv, authTag, key }) {
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

function decryptValue(payload) {
    const { active, all } = getConfiguredEncryptionKeys();
    const parts = String(payload || '').split('.');

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
                // Try the next configured key.
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
                // Try the next configured key.
            }
        }

        throw new Error('Unable to decrypt payload with configured encryption keys');
    }

    throw new Error('Invalid encrypted payload');
}

function parseArgs(argv) {
    const options = {
        dryRun: false,
        userId: null,
        limit: null,
        batchSize: 100,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === '--dry-run') {
            options.dryRun = true;
            continue;
        }

        if (arg === '--user-id') {
            options.userId = argv[index + 1] || null;
            index += 1;
            continue;
        }

        if (arg === '--limit') {
            const value = Number.parseInt(argv[index + 1] || '', 10);
            if (Number.isFinite(value) && value > 0) {
                options.limit = value;
            }
            index += 1;
            continue;
        }

        if (arg === '--batch-size') {
            const value = Number.parseInt(argv[index + 1] || '', 10);
            if (Number.isFinite(value) && value > 0) {
                options.batchSize = Math.min(value, 500);
            }
            index += 1;
        }
    }

    return options;
}

async function loadTeslaSessionsBatch(supabase, params) {
    let query = supabase
        .from('tesla_sessions')
        .select('id,user_id,session_token_hash,access_token_encrypted,refresh_token_encrypted')
        .order('created_at', { ascending: true })
        .range(params.offset, params.offset + params.batchSize - 1);

    if (params.userId) {
        query = query.eq('user_id', params.userId);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Failed to load Tesla sessions: ${error.message}`);
    }

    return data || [];
}

async function updateTeslaSessionRow(supabase, row, decrypted) {
    const { error } = await supabase
        .from('tesla_sessions')
        .update({
            access_token_encrypted: encryptValue(decrypted.accessToken),
            refresh_token_encrypted: decrypted.refreshToken
                ? encryptValue(decrypted.refreshToken)
                : null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

    if (error) {
        throw new Error(`Failed to update Tesla session ${row.id}: ${error.message}`);
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const { active } = getConfiguredEncryptionKeys();
    const supabase = getSupabase();
    const summary = {
        inspected: 0,
        migrated: 0,
        alreadyCurrent: 0,
        failures: 0,
    };

    console.log(
        `Starting Tesla session re-encryption with active key fingerprint ${active.fingerprint}${options.dryRun ? ' (dry run)' : ''}.`
    );

    let offset = 0;
    let remaining = options.limit;

    while (remaining === null || remaining > 0) {
        const batchSize = remaining === null
            ? options.batchSize
            : Math.min(options.batchSize, remaining);

        const rows = await loadTeslaSessionsBatch(supabase, {
            offset,
            batchSize,
            userId: options.userId,
        });

        if (rows.length === 0) {
            break;
        }

        for (const row of rows) {
            summary.inspected += 1;

            try {
                const accessToken = decryptValue(row.access_token_encrypted);
                const refreshToken = row.refresh_token_encrypted
                    ? decryptValue(row.refresh_token_encrypted)
                    : null;
                const needsMigration = accessToken.needsMigration || Boolean(refreshToken?.needsMigration);

                if (!needsMigration) {
                    summary.alreadyCurrent += 1;
                    continue;
                }

                if (!options.dryRun) {
                    await updateTeslaSessionRow(supabase, row, {
                        accessToken: accessToken.value,
                        refreshToken: refreshToken ? refreshToken.value : null,
                    });
                }

                summary.migrated += 1;
            } catch (error) {
                summary.failures += 1;
                console.error(
                    `Failed to re-encrypt Tesla session ${row.id} for user ${row.user_id}:`,
                    error instanceof Error ? error.message : error,
                );
            }
        }

        offset += rows.length;

        if (remaining !== null) {
            remaining -= rows.length;
        }

        if (options.userId) {
            break;
        }
    }

    console.log('Re-encryption summary:', summary);

    if (summary.failures > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
