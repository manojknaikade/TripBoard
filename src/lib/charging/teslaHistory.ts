import { fetchTeslaApi, type TeslaRegion } from '@/lib/tesla/api';

type ChargingSessionForMatch = {
    id: string;
    start_time: string;
    end_time: string | null;
    charger_type: string | null;
    location_name: string | null;
    energy_added_kwh: number | null;
    energy_delivered_kwh?: number | null;
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
    energyDeliveredKwh: number;
    teslaChargeEventId: string | null;
    costUserEntered: number | null;
    chargerPricePerKwh: number | null;
};

const MINIMUM_DELIVERED_ENERGY_KWH = 0.1;
const MAX_TIME_DELTA_MS = 6 * 60 * 60 * 1000;

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
    ]);
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
        'stop_date',
        'charge_end_date_time',
        'session_end_at',
        'ended_at',
    ]);

    if (!startTime && !endTime && energyDeliveredKwh == null) {
        return null;
    }

    return {
        eventId: readString(record, ['id', 'event_id', 'invoice_id', 'session_id', 'charge_id']),
        startTime,
        endTime,
        siteName: readString(record, ['site_name', 'site', 'location_name', 'location', 'supercharger_name']),
        energyDeliveredKwh,
        totalCost: readNumber(record, ['cost', 'total_cost', 'amount', 'session_cost']),
        pricePerKwh: readNumber(record, ['price_per_kwh', 'cost_per_kwh', 'unit_price', 'rate_per_kwh']),
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

export async function fetchBestTeslaChargeHistoryMatch(params: {
    accessToken: string;
    region: TeslaRegion;
    session: ChargingSessionForMatch;
}) {
    const response = await fetchTeslaApi(
        params.accessToken,
        params.region,
        '/api/1/dx/charging/history'
    );

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Tesla charging history failed: ${response.status} ${errorBody.slice(0, 200)}`);
    }

    const payload = await response.json().catch(() => null);
    const rawRecords = collectCandidateObjects(payload);
    const normalizedRecords = rawRecords
        .map((record) => normalizeHistoryRecord(record))
        .filter((record): record is TeslaChargeHistoryRecord => Boolean(record));

    return selectBestHistoryRecord(params.session, normalizedRecords);
}

export async function buildTeslaDeliveredEnergyUpdate(params: {
    accessToken: string;
    region: TeslaRegion;
    session: ChargingSessionForMatch;
}): Promise<SyncResult | null> {
    const bestMatch = await fetchBestTeslaChargeHistoryMatch(params);
    if (!bestMatch?.energyDeliveredKwh || bestMatch.energyDeliveredKwh < MINIMUM_DELIVERED_ENERGY_KWH) {
        return null;
    }

    const currentDelivered = params.session.energy_delivered_kwh;
    if (currentDelivered != null && currentDelivered >= bestMatch.energyDeliveredKwh) {
        return null;
    }

    return {
        energyDeliveredKwh: bestMatch.energyDeliveredKwh,
        teslaChargeEventId: bestMatch.eventId,
        costUserEntered: bestMatch.totalCost,
        chargerPricePerKwh: bestMatch.pricePerKwh,
    };
}
