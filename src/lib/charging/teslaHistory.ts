import { fetchTeslaApi, type TeslaRegion } from '@/lib/tesla/api';
import {
    getStoredTeslaChargeEventId,
    getTeslaChargingSyncStatus,
    isSuperchargerChargingSession,
    TESLA_CHARGING_HISTORY_FAILED_MARKER,
    TESLA_CHARGING_HISTORY_SYNCED_MARKER,
    TESLA_CHARGING_HISTORY_UNAVAILABLE_MARKER,
} from '@/lib/charging/teslaSync';

type ChargingSessionForMatch = {
    id: string;
    start_time: string;
    end_time: string | null;
    charger_type: string | null;
    location_name: string | null;
    energy_added_kwh: number | null;
    energy_delivered_kwh?: number | null;
    cost_estimate?: number | null;
    charger_price_per_kwh?: number | null;
    tesla_charge_event_id?: string | null;
    is_complete?: boolean | null;
};

type TeslaChargeHistoryRecord = {
    eventId: string | null;
    startTime: string | null;
    endTime: string | null;
    siteName: string | null;
    energyDeliveredKwh: number | null;
    totalCost: number | null;
    pricePerKwh: number | null;
};

type SyncResult = {
    energyDeliveredKwh: number | null;
    teslaChargeEventId: string | null;
    costEstimate: number | null;
    chargerPricePerKwh: number | null;
};

const MINIMUM_DELIVERED_ENERGY_KWH = 0.1;
const MAX_TIME_DELTA_MS = 6 * 60 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;
const HISTORY_FAILURE_TTL_MS = 5 * 60 * 1000;

type TeslaChargeHistoryCacheEntry = {
    fetchedAt: number;
    records: TeslaChargeHistoryRecord[];
};

type TeslaChargeHistoryFailureEntry = {
    failedAt: number;
    message: string;
};

const teslaChargeHistoryCache = new Map<string, TeslaChargeHistoryCacheEntry>();
const teslaChargeHistoryFailureCache = new Map<string, TeslaChargeHistoryFailureEntry>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getNormalizedEntries(obj: Record<string, unknown>) {
    return Object.entries(obj).map(([key, value]) => [normalizeKey(key), value] as const);
}

function readString(obj: Record<string, unknown>, keys: string[]): string | null {
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

function readNumber(obj: Record<string, unknown>, keys: string[]): number | null {
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

function readDate(obj: Record<string, unknown>, keys: string[]): string | null {
    const keySet = new Set(keys.map(normalizeKey));
    for (const [key, value] of getNormalizedEntries(obj)) {
        if (!keySet.has(key)) {
            continue;
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            const ms = value > 10_000_000_000 ? value : value * 1000;
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

function collectCandidateObjects(node: unknown, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
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

function normalizeHistoryRecord(record: Record<string, unknown>): TeslaChargeHistoryRecord | null {
    const feeEntries = Array.isArray(record.fees)
        ? record.fees.filter((fee): fee is Record<string, unknown> => isRecord(fee))
        : [];
    const chargingFee =
        feeEntries.find((fee) => readString(fee, ['fee_type'])?.toLowerCase() === 'charging') ??
        null;
    const totalSessionCost =
        feeEntries.length > 0
            ? feeEntries.reduce((sum, fee) => sum + (readNumber(fee, ['total_due', 'total_base', 'net_due']) ?? 0), 0)
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
    ]) ?? chargingEnergyDeliveredKwh;
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
            readNumber(record, ['cost', 'total_cost', 'amount', 'session_cost', 'total_due']) ??
            totalSessionCost,
        pricePerKwh:
            readNumber(record, ['price_per_kwh', 'cost_per_kwh', 'unit_price', 'rate_per_kwh']) ??
            chargingRatePerKwh,
    };
}

function scoreRecord(session: ChargingSessionForMatch, record: TeslaChargeHistoryRecord): number {
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

function selectBestHistoryRecord(
    session: ChargingSessionForMatch,
    records: TeslaChargeHistoryRecord[],
): TeslaChargeHistoryRecord | null {
    let best: TeslaChargeHistoryRecord | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const record of records) {
        const score = scoreRecord(session, record);
        if (score > bestScore) {
            bestScore = score;
            best = record;
        }
    }

    if (bestScore === Number.NEGATIVE_INFINITY) {
        return null;
    }

    return best;
}

function getHistoryCacheKey(accessToken: string, region: TeslaRegion) {
    return `${region}:${accessToken.slice(-24)}`;
}

function shouldReplaceNumber(current: number | null | undefined, next: number | null, epsilon = 0.01) {
    if (next == null) {
        return false;
    }

    if (current == null) {
        return true;
    }

    return Math.abs(current - next) > epsilon;
}

export function needsTeslaChargingHistorySync(session: ChargingSessionForMatch) {
    return getTeslaChargingSyncStatus(session) === 'pending';
}

export async function fetchBestTeslaChargeHistoryMatch(params: {
    accessToken: string;
    region: TeslaRegion;
    session: ChargingSessionForMatch;
}) {
    const normalizedRecords = await fetchTeslaChargeHistoryRecords({
        accessToken: params.accessToken,
        region: params.region,
    });

    return selectBestHistoryRecord(params.session, normalizedRecords);
}

export async function fetchTeslaChargeHistoryRecords(params: {
    accessToken: string;
    region: TeslaRegion;
}) {
    const cacheKey = getHistoryCacheKey(params.accessToken, params.region);
    const now = Date.now();
    const cached = teslaChargeHistoryCache.get(cacheKey);

    if (cached && now - cached.fetchedAt < HISTORY_CACHE_TTL_MS) {
        return cached.records;
    }

    const recentFailure = teslaChargeHistoryFailureCache.get(cacheKey);
    if (recentFailure && now - recentFailure.failedAt < HISTORY_FAILURE_TTL_MS) {
        throw new Error(`Tesla charging history fetch recently failed: ${recentFailure.message}`);
    }

    const response = await fetchTeslaApi(
        params.accessToken,
        params.region,
        '/api/1/dx/charging/history'
    );

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const message = `Tesla charging history failed: ${response.status} ${errorBody.slice(0, 200)}`;
        teslaChargeHistoryFailureCache.set(cacheKey, {
            failedAt: now,
            message,
        });
        throw new Error(message);
    }

    const payload = await response.json().catch(() => null);
    const rawRecords = collectCandidateObjects(payload);
    const normalizedRecords = rawRecords
        .map((record) => normalizeHistoryRecord(record))
        .filter((record): record is TeslaChargeHistoryRecord => Boolean(record));

    teslaChargeHistoryCache.set(cacheKey, {
        fetchedAt: now,
        records: normalizedRecords,
    });
    teslaChargeHistoryFailureCache.delete(cacheKey);

    return normalizedRecords;
}

export async function buildTeslaDeliveredEnergyUpdate(params: {
    accessToken: string;
    region: TeslaRegion;
    session: ChargingSessionForMatch;
}): Promise<SyncResult | null> {
    const bestMatch = await fetchBestTeslaChargeHistoryMatch(params);
    if (!bestMatch) {
        return null;
    }

    const nextEnergyDelivered =
        bestMatch.energyDeliveredKwh != null && bestMatch.energyDeliveredKwh >= MINIMUM_DELIVERED_ENERGY_KWH
            ? bestMatch.energyDeliveredKwh
            : null;
    const shouldUpdateEnergy =
        nextEnergyDelivered != null &&
        (params.session.energy_delivered_kwh == null || params.session.energy_delivered_kwh + 0.01 < nextEnergyDelivered);
    const shouldUpdateCost = shouldReplaceNumber(params.session.cost_estimate, bestMatch.totalCost);
    const shouldUpdatePrice = shouldReplaceNumber(params.session.charger_price_per_kwh, bestMatch.pricePerKwh, 0.0001);
    const shouldUpdateEventId =
        typeof bestMatch.eventId === 'string' &&
        bestMatch.eventId.trim().length > 0 &&
        params.session.tesla_charge_event_id !== bestMatch.eventId;

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

export function hasStoredTeslaChargingHistoryData(session: ChargingSessionForMatch) {
    return (
        isSuperchargerChargingSession(session) &&
        session.energy_delivered_kwh != null &&
        session.cost_estimate != null &&
        session.charger_price_per_kwh != null
    );
}

export function buildTeslaChargingHistorySuccessUpdate(
    session: ChargingSessionForMatch,
    update: SyncResult | null,
) {
    const sessionUpdate: Record<string, number | string | null> = {};

    if (update?.energyDeliveredKwh != null) {
        sessionUpdate.energy_delivered_kwh = update.energyDeliveredKwh;
    }
    if (update?.chargerPricePerKwh != null) {
        sessionUpdate.charger_price_per_kwh = update.chargerPricePerKwh;
    }
    if (update?.costEstimate != null) {
        sessionUpdate.cost_estimate = update.costEstimate;
    }

    const resolvedEventId =
        update?.teslaChargeEventId ??
        getStoredTeslaChargeEventId(session.tesla_charge_event_id) ??
        (hasStoredTeslaChargingHistoryData({
            ...session,
            energy_delivered_kwh: update?.energyDeliveredKwh ?? session.energy_delivered_kwh,
            charger_price_per_kwh: update?.chargerPricePerKwh ?? session.charger_price_per_kwh,
            cost_estimate: update?.costEstimate ?? session.cost_estimate,
        })
            ? TESLA_CHARGING_HISTORY_SYNCED_MARKER
            : null);

    if (resolvedEventId != null) {
        sessionUpdate.tesla_charge_event_id = resolvedEventId;
        return sessionUpdate;
    }

    sessionUpdate.tesla_charge_event_id = TESLA_CHARGING_HISTORY_UNAVAILABLE_MARKER;
    return sessionUpdate;
}

export function buildTeslaChargingHistoryUnavailableUpdate() {
    return {
        tesla_charge_event_id: TESLA_CHARGING_HISTORY_UNAVAILABLE_MARKER,
    } satisfies Record<string, string>;
}

export function buildTeslaChargingHistoryFailedUpdate() {
    return {
        tesla_charge_event_id: TESLA_CHARGING_HISTORY_FAILED_MARKER,
    } satisfies Record<string, string>;
}
