const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const TESLA_TOKEN_URL = 'https://auth.tesla.com/oauth2/v3/token';
const REGIONAL_ENDPOINTS = {
    na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
    cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
};

const TESLA_CHARGING_HISTORY_SYNCED_MARKER = 'sync:synced';
const TESLA_CHARGING_HISTORY_UNAVAILABLE_MARKER = 'sync:unavailable';
const TESLA_CHARGING_HISTORY_FAILED_MARKER = 'sync:failed';

const MINIMUM_DELIVERED_ENERGY_KWH = 0.1;
const MAX_TIME_DELTA_MS = 6 * 60 * 60 * 1000;
const TESLA_CHARGING_HISTORY_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

function normalizeTeslaRegion(region) {
    return region && REGIONAL_ENDPOINTS[region] ? region : 'eu';
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

function getTokenExpiry(accessToken) {
    try {
        const payload = JSON.parse(
            Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'),
        );

        return typeof payload.exp === 'number'
            ? new Date(payload.exp * 1000).toISOString()
            : null;
    } catch {
        return null;
    }
}

async function refreshTeslaTokenRaw(refreshToken) {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: getRequiredEnv('TESLA_CLIENT_ID'),
        client_secret: getRequiredEnv('TESLA_CLIENT_SECRET'),
        refresh_token: refreshToken,
    });

    const response = await fetch(TESLA_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Tesla token refresh failed: ${response.status} ${errorBody.slice(0, 200)}`);
    }

    return response.json();
}

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getNormalizedEntries(obj) {
    return Object.entries(obj).map(([key, value]) => [normalizeKey(key), value]);
}

function readString(obj, keys) {
    const keySet = new Set(keys.map(normalizeKey));
    for (const [key, value] of getNormalizedEntries(obj)) {
        if (!keySet.has(key) || typeof value !== 'string') {
            continue;
        }

        const trimmed = value.trim();
        if (trimmed) {
            return trimmed;
        }
    }

    return null;
}

function readNumber(obj, keys) {
    const keySet = new Set(keys.map(normalizeKey));
    for (const [key, value] of getNormalizedEntries(obj)) {
        if (!keySet.has(key)) {
            continue;
        }

        const parsed =
            typeof value === 'number'
                ? value
                : typeof value === 'string'
                    ? parseFloat(value)
                    : NaN;

        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
}

function readDate(obj, keys) {
    const keySet = new Set(keys.map(normalizeKey));
    for (const [key, value] of getNormalizedEntries(obj)) {
        if (!keySet.has(key)) {
            continue;
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            const ms = value > 10000000000 ? value : value * 1000;
            return new Date(ms).toISOString();
        }

        if (typeof value !== 'string') {
            continue;
        }

        const timestamp = Date.parse(value);
        if (Number.isFinite(timestamp)) {
            return new Date(timestamp).toISOString();
        }
    }

    return null;
}

function collectCandidateObjects(node, acc = []) {
    if (Array.isArray(node)) {
        for (const item of node) {
            collectCandidateObjects(item, acc);
        }
        return acc;
    }

    if (!isRecord(node)) {
        return acc;
    }

    const hasInterestingKey = Object.keys(node).some((key) => {
        const normalized = normalizeKey(key);
        return (
            normalized.includes('charge') ||
            normalized.includes('energy') ||
            normalized.includes('invoice') ||
            normalized.includes('history') ||
            normalized.includes('session') ||
            normalized.includes('cost') ||
            normalized.includes('time') ||
            normalized.includes('date')
        );
    });

    if (hasInterestingKey) {
        acc.push(node);
    }

    for (const value of Object.values(node)) {
        collectCandidateObjects(value, acc);
    }

    return acc;
}

function normalizeHistoryRecord(record) {
    const feeEntries = Array.isArray(record.fees)
        ? record.fees.filter((fee) => isRecord(fee))
        : [];
    const chargingFee =
        feeEntries.find((fee) => readString(fee, ['fee_type'])?.toLowerCase() === 'charging') ||
        null;
    const totalSessionCost =
        feeEntries.length > 0
            ? feeEntries.reduce((sum, fee) => {
                return sum + (readNumber(fee, ['total_due', 'total_base', 'net_due']) || 0);
            }, 0)
            : null;
    const chargingEnergyDeliveredKwh =
        chargingFee != null
            ? readNumber(chargingFee, ['usage_base', 'usage_total', 'usage', 'energy_delivered_kwh'])
            : null;
    const chargingRatePerKwh =
        chargingFee != null
            ? readNumber(chargingFee, ['rate_base', 'price_per_kwh', 'cost_per_kwh', 'unit_price', 'rate_per_kwh'])
            : null;

    const energyDeliveredKwh = readNumber(record, [
        'energy_delivered_kwh',
        'energy_delivered',
        'billed_energy_kwh',
        'session_energy_kwh',
        'total_energy_kwh',
        'kwh_charged',
        'energy_kwh',
        'energy',
        'charge_energy',
    ]) || chargingEnergyDeliveredKwh;

    const startTime = readDate(record, [
        'start_time',
        'session_start_time',
        'charge_start_time',
        'start_date',
        'charge_start_date_time',
        'session_start_at',
        'started_at',
    ]);

    const endTime = readDate(record, [
        'end_time',
        'session_end_time',
        'charge_stop_time',
        'charge_stop_date_time',
        'stop_date',
        'charge_end_date_time',
        'session_end_at',
        'ended_at',
        'unlatch_date_time',
    ]);

    if (!startTime && !endTime && energyDeliveredKwh == null) {
        return null;
    }

    return {
        eventId: readString(record, ['id', 'event_id', 'invoice_id', 'session_id', 'charge_id']),
        startTime,
        endTime,
        siteName: readString(record, [
            'site_name',
            'site',
            'site_location_name',
            'location_name',
            'location',
            'supercharger_name',
        ]),
        energyDeliveredKwh,
        totalCost:
            readNumber(record, ['cost', 'total_cost', 'amount', 'session_cost', 'total_due']) ||
            totalSessionCost,
        pricePerKwh:
            readNumber(record, ['price_per_kwh', 'cost_per_kwh', 'unit_price', 'rate_per_kwh']) ||
            chargingRatePerKwh,
    };
}

function scoreRecord(session, record) {
    const sessionStart = Date.parse(session.start_time);
    if (!Number.isFinite(sessionStart)) {
        return Number.NEGATIVE_INFINITY;
    }

    let score = 0;
    let minDelta = Number.POSITIVE_INFINITY;

    for (const timestamp of [record.startTime, record.endTime]) {
        if (!timestamp) {
            continue;
        }

        const delta = Math.abs(Date.parse(timestamp) - sessionStart);
        minDelta = Math.min(minDelta, delta);
    }

    if (!Number.isFinite(minDelta) || minDelta > MAX_TIME_DELTA_MS) {
        return Number.NEGATIVE_INFINITY;
    }

    score -= minDelta / (60 * 1000);

    if (record.energyDeliveredKwh != null && record.energyDeliveredKwh >= MINIMUM_DELIVERED_ENERGY_KWH) {
        score += 100;
    }

    if (record.siteName && session.location_name) {
        const left = record.siteName.toLowerCase();
        const right = session.location_name.toLowerCase();
        if (left.includes(right) || right.includes(left)) {
            score += 25;
        }
    }

    return score;
}

function selectBestHistoryRecord(session, records) {
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const record of records) {
        const score = scoreRecord(session, record);
        if (score > bestScore) {
            bestScore = score;
            best = record;
        }
    }

    return bestScore === Number.NEGATIVE_INFINITY ? null : best;
}

function shouldReplaceNumber(current, next, epsilon = 0.01) {
    if (next == null) {
        return false;
    }

    if (current == null) {
        return true;
    }

    return Math.abs(current - next) > epsilon;
}

function isSupercharger(session) {
    return typeof session.charger_type === 'string' && session.charger_type.toLowerCase().includes('supercharger');
}

function getStoredTeslaChargeEventId(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || normalized.toLowerCase().startsWith('sync:')) {
        return null;
    }
    return normalized;
}

function getTeslaChargingSyncStatus(session) {
    if (!isSupercharger(session) || session.is_complete !== true) {
        return null;
    }

    const marker = (session.tesla_charge_event_id || '').trim().toLowerCase();
    if (!marker) {
        return 'pending';
    }
    if (marker === TESLA_CHARGING_HISTORY_UNAVAILABLE_MARKER) {
        return 'unavailable';
    }
    if (marker === TESLA_CHARGING_HISTORY_FAILED_MARKER) {
        return 'failed';
    }
    if (marker === TESLA_CHARGING_HISTORY_SYNCED_MARKER || getStoredTeslaChargeEventId(marker)) {
        return 'synced';
    }
    return 'pending';
}

function hasStoredTeslaChargingHistoryData(session) {
    return (
        isSupercharger(session) &&
        session.energy_delivered_kwh != null &&
        session.cost_estimate != null &&
        session.charger_price_per_kwh != null
    );
}

function buildTeslaChargingHistorySuccessUpdate(session, update) {
    const sessionUpdate = {};

    if (update && update.energyDeliveredKwh != null) {
        sessionUpdate.energy_delivered_kwh = update.energyDeliveredKwh;
    }
    if (update && update.chargerPricePerKwh != null) {
        sessionUpdate.charger_price_per_kwh = update.chargerPricePerKwh;
    }
    if (update && update.costEstimate != null) {
        sessionUpdate.cost_estimate = update.costEstimate;
    }

    const resolvedEventId =
        (update && update.teslaChargeEventId) ||
        getStoredTeslaChargeEventId(session.tesla_charge_event_id) ||
        (hasStoredTeslaChargingHistoryData({
            ...session,
            energy_delivered_kwh: update && update.energyDeliveredKwh != null ? update.energyDeliveredKwh : session.energy_delivered_kwh,
            charger_price_per_kwh: update && update.chargerPricePerKwh != null ? update.chargerPricePerKwh : session.charger_price_per_kwh,
            cost_estimate: update && update.costEstimate != null ? update.costEstimate : session.cost_estimate,
        })
            ? TESLA_CHARGING_HISTORY_SYNCED_MARKER
            : null);

    sessionUpdate.tesla_charge_event_id = resolvedEventId || TESLA_CHARGING_HISTORY_UNAVAILABLE_MARKER;
    return sessionUpdate;
}

function buildTeslaChargingHistoryUnavailableUpdate() {
    return {
        tesla_charge_event_id: TESLA_CHARGING_HISTORY_UNAVAILABLE_MARKER,
    };
}

function buildTeslaChargingHistoryFailedUpdate() {
    return {
        tesla_charge_event_id: TESLA_CHARGING_HISTORY_FAILED_MARKER,
    };
}

function shouldRetryTeslaChargingHistoryLookup(session) {
    if (!isSupercharger(session) || session.is_complete !== true) {
        return false;
    }

    const referenceTime = session.end_time || session.start_time;
    if (!referenceTime) {
        return false;
    }

    const completedAtMs = Date.parse(referenceTime);
    if (!Number.isFinite(completedAtMs)) {
        return false;
    }

    return Date.now() - completedAtMs < TESLA_CHARGING_HISTORY_RETRY_WINDOW_MS;
}

async function persistTeslaSessionRecord(supabase, row, session) {
    const tokenExpiresAt = getTokenExpiry(session.accessToken);
    const payload = {
        session_token_hash: row.session_token_hash,
        access_token_encrypted: encryptValue(session.accessToken),
        refresh_token_encrypted: session.refreshToken ? encryptValue(session.refreshToken) : null,
        token_expires_at: tokenExpiresAt,
        region: session.region,
        updated_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
    };

    if (row.user_id !== undefined) {
        payload.user_id = row.user_id;
    }

    const { error } = await supabase
        .from('tesla_sessions')
        .upsert(payload, { onConflict: 'user_id' });

    if (error) {
        throw new Error(`Failed to persist Tesla session: ${error.message}`);
    }

    return tokenExpiresAt;
}

async function getStoredTeslaSessionForUser(supabase, userId, preferredRegion) {
    if (!userId) {
        return null;
    }

    const normalizedPreferredRegion = normalizeTeslaRegion(preferredRegion);

    const runQuery = async (region) => {
        let query = supabase
            .from('tesla_sessions')
            .select('id,user_id,session_token_hash,access_token_encrypted,refresh_token_encrypted,token_expires_at,region')
            .eq('user_id', userId);

        if (region) {
            query = query.eq('region', region);
        }

        const { data, error } = await query.maybeSingle();
        if (error) {
            throw new Error(`Failed to load Tesla session: ${error.message}`);
        }
        return data;
    };

    let row = await runQuery(normalizedPreferredRegion);
    if (!row) {
        row = await runQuery(null);
    }
    if (!row) {
        return null;
    }

    const accessToken = decryptValue(row.access_token_encrypted);
    const refreshToken = row.refresh_token_encrypted
        ? decryptValue(row.refresh_token_encrypted)
        : null;

    return {
        row,
        accessToken: accessToken.value,
        refreshToken: refreshToken ? refreshToken.value : undefined,
        region: normalizeTeslaRegion(row.region),
        tokenExpiresAt: row.token_expires_at,
        needsReencryption: accessToken.needsMigration || Boolean(refreshToken?.needsMigration),
    };
}

async function ensureFreshStoredTeslaSession(supabase, storedSession) {
    if (!storedSession.tokenExpiresAt || storedSession.needsReencryption) {
        const tokenExpiresAt = await persistTeslaSessionRecord(supabase, storedSession.row, {
            accessToken: storedSession.accessToken,
            refreshToken: storedSession.refreshToken,
            region: storedSession.region,
        });

        return {
            ...storedSession,
            tokenExpiresAt,
            needsReencryption: false,
        };
    }

    const msUntilExpiry = new Date(storedSession.tokenExpiresAt).getTime() - Date.now();
    if (msUntilExpiry >= 5 * 60 * 1000) {
        return storedSession;
    }

    if (!storedSession.refreshToken) {
        return msUntilExpiry > 0 ? storedSession : null;
    }

    const refreshed = await refreshTeslaTokenRaw(storedSession.refreshToken);
    if (!refreshed || !refreshed.access_token) {
        return msUntilExpiry > 0 ? storedSession : null;
    }

    const session = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || storedSession.refreshToken,
        region: storedSession.region,
    };
    const tokenExpiresAt = await persistTeslaSessionRecord(supabase, storedSession.row, session);

    return {
        ...storedSession,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenExpiresAt,
        needsReencryption: false,
    };
}

async function fetchTeslaChargeHistoryRecords(accessToken, region) {
    const response = await fetch(`${REGIONAL_ENDPOINTS[region]}/api/1/dx/charging/history`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Tesla charging history failed: ${response.status} ${errorBody.slice(0, 200)}`);
    }

    const payload = await response.json().catch(() => null);
    return collectCandidateObjects(payload)
        .map((record) => normalizeHistoryRecord(record))
        .filter(Boolean);
}

async function buildTeslaDeliveredEnergyUpdate(accessToken, region, session) {
    const records = await fetchTeslaChargeHistoryRecords(accessToken, region);
    const bestMatch = selectBestHistoryRecord(session, records);

    if (!bestMatch) {
        return null;
    }

    const nextEnergyDelivered =
        bestMatch.energyDeliveredKwh != null && bestMatch.energyDeliveredKwh >= MINIMUM_DELIVERED_ENERGY_KWH
            ? bestMatch.energyDeliveredKwh
            : null;
    const shouldUpdateEnergy =
        nextEnergyDelivered != null &&
        (session.energy_delivered_kwh == null || session.energy_delivered_kwh + 0.01 < nextEnergyDelivered);
    const shouldUpdateCost = shouldReplaceNumber(session.cost_estimate, bestMatch.totalCost);
    const shouldUpdatePrice = shouldReplaceNumber(session.charger_price_per_kwh, bestMatch.pricePerKwh, 0.0001);
    const shouldUpdateEventId =
        typeof bestMatch.eventId === 'string' &&
        bestMatch.eventId.trim() &&
        session.tesla_charge_event_id !== bestMatch.eventId;

    if (!shouldUpdateEnergy && !shouldUpdateCost && !shouldUpdatePrice && !shouldUpdateEventId) {
        return null;
    }

    return {
        energyDeliveredKwh: shouldUpdateEnergy ? nextEnergyDelivered : null,
        teslaChargeEventId: shouldUpdateEventId ? bestMatch.eventId : null,
        costEstimate: shouldUpdateCost ? bestMatch.totalCost : null,
        chargerPricePerKwh: shouldUpdatePrice ? bestMatch.pricePerKwh : null,
    };
}

async function updateJobState(supabase, jobId, values) {
    const { error } = await supabase
        .from('charging_session_tesla_sync_jobs')
        .update(values)
        .eq('id', jobId);

    if (error) {
        throw new Error(`Failed to update sync job: ${error.message}`);
    }
}

async function updateChargingSession(supabase, sessionId, values) {
    const { data, error } = await supabase
        .from('charging_sessions')
        .update(values)
        .eq('id', sessionId)
        .select('id,vehicle_id,start_time,end_time,charger_type,location_name,energy_added_kwh,energy_delivered_kwh,cost_estimate,charger_price_per_kwh,tesla_charge_event_id,is_complete')
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to update charging session: ${error.message}`);
    }

    return data;
}

async function processJob(supabase, job) {
    const { data: session, error: sessionError } = await supabase
        .from('charging_sessions')
        .select('id,vehicle_id,start_time,end_time,charger_type,location_name,energy_added_kwh,energy_delivered_kwh,cost_estimate,charger_price_per_kwh,tesla_charge_event_id,is_complete')
        .eq('id', job.charging_session_id)
        .maybeSingle();

    if (sessionError) {
        throw new Error(`Failed to load charging session: ${sessionError.message}`);
    }

    if (!session) {
        await updateJobState(supabase, job.id, {
            status: 'failed',
            processing_started_at: null,
            processed_at: new Date().toISOString(),
            last_error: 'Charging session not found',
        });
        return 'failed';
    }

    const syncStatus = getTeslaChargingSyncStatus(session);
    if (syncStatus !== 'pending') {
        const status = syncStatus === 'synced' ? 'completed' : syncStatus === 'unavailable' ? 'unavailable' : 'failed';
        await updateJobState(supabase, job.id, {
            status,
            processing_started_at: null,
            processed_at: new Date().toISOString(),
            last_error: null,
        });
        return status;
    }

    const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('id,user_id,region')
        .eq('id', session.vehicle_id)
        .maybeSingle();

    if (vehicleError) {
        throw new Error(`Failed to load vehicle: ${vehicleError.message}`);
    }

    if (!vehicle) {
        await updateChargingSession(supabase, session.id, buildTeslaChargingHistoryFailedUpdate());
        await updateJobState(supabase, job.id, {
            status: 'failed',
            processing_started_at: null,
            processed_at: new Date().toISOString(),
            last_error: 'Vehicle not found',
        });
        return 'failed';
    }

    const storedTeslaSession = await getStoredTeslaSessionForUser(
        supabase,
        vehicle.user_id,
        vehicle.region,
    );
    if (!storedTeslaSession) {
        await updateChargingSession(supabase, session.id, buildTeslaChargingHistoryFailedUpdate());
        await updateJobState(supabase, job.id, {
            status: 'failed',
            processing_started_at: null,
            processed_at: new Date().toISOString(),
            last_error: 'No stored Tesla session available',
        });
        return 'failed';
    }

    const freshTeslaSession = await ensureFreshStoredTeslaSession(supabase, storedTeslaSession);
    if (!freshTeslaSession) {
        await updateChargingSession(supabase, session.id, buildTeslaChargingHistoryFailedUpdate());
        await updateJobState(supabase, job.id, {
            status: 'failed',
            processing_started_at: null,
            processed_at: new Date().toISOString(),
            last_error: 'Stored Tesla session is expired',
        });
        return 'failed';
    }

    const update = await buildTeslaDeliveredEnergyUpdate(
        freshTeslaSession.accessToken,
        freshTeslaSession.region,
        session,
    );

    if (!update && !hasStoredTeslaChargingHistoryData(session) && shouldRetryTeslaChargingHistoryLookup(session)) {
        await updateJobState(supabase, job.id, {
            status: 'processing',
            processing_started_at: new Date().toISOString(),
            processed_at: null,
            last_error: 'Waiting for Tesla charging history',
        });

        return 'deferred';
    }

    const sessionUpdate =
        update || hasStoredTeslaChargingHistoryData(session)
            ? buildTeslaChargingHistorySuccessUpdate(session, update)
            : buildTeslaChargingHistoryUnavailableUpdate();

    const updatedSession = await updateChargingSession(supabase, session.id, sessionUpdate);
    const finalSyncStatus = updatedSession ? getTeslaChargingSyncStatus(updatedSession) : 'failed';
    const jobStatus =
        finalSyncStatus === 'synced' ? 'completed' :
        finalSyncStatus === 'unavailable' ? 'unavailable' :
        'failed';

    await updateJobState(supabase, job.id, {
        status: jobStatus,
        processing_started_at: null,
        processed_at: new Date().toISOString(),
        last_error: null,
    });

    return jobStatus;
}

async function main() {
    const supabase = getSupabase();
    const limit = Math.max(1, Math.min(parseInt(process.env.CHARGING_SYNC_LIMIT || '10', 10) || 10, 50));

    const { data, error } = await supabase.rpc('claim_pending_tesla_charging_sync_jobs', {
        p_limit: limit,
    });

    if (error) {
        throw new Error(`Failed to claim sync jobs: ${error.message}`);
    }

    const jobs = Array.isArray(data) ? data : [];
    const summary = {
        claimed: jobs.length,
        synced: 0,
        unavailable: 0,
        failed: 0,
    };

    for (const job of jobs) {
        try {
            const result = await processJob(supabase, job);
            if (result === 'completed') {
                summary.synced += 1;
            } else if (result === 'unavailable') {
                summary.unavailable += 1;
            } else if (result === 'deferred') {
                continue;
            } else {
                summary.failed += 1;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown sync error';
            console.warn(`Charging sync job ${job.id} failed: ${message}`);

            try {
                await updateChargingSession(supabase, job.charging_session_id, buildTeslaChargingHistoryFailedUpdate());
            } catch (sessionError) {
                console.warn(`Failed to mark charging session ${job.charging_session_id} as failed: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`);
            }

            await updateJobState(supabase, job.id, {
                status: 'failed',
                processing_started_at: null,
                processed_at: new Date().toISOString(),
                last_error: message,
            });
            summary.failed += 1;
        }
    }

    console.log(JSON.stringify({
        success: true,
        ...summary,
        processedAt: new Date().toISOString(),
    }));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
