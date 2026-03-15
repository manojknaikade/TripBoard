export const TESLA_CHARGING_HISTORY_SYNCED_MARKER = 'sync:synced';
export const TESLA_CHARGING_HISTORY_UNAVAILABLE_MARKER = 'sync:unavailable';
export const TESLA_CHARGING_HISTORY_FAILED_MARKER = 'sync:failed';

export type TeslaChargingSyncStatus = 'pending' | 'synced' | 'unavailable' | 'failed';

export type TeslaChargingSyncLike = {
    charger_type?: string | null;
    is_complete?: boolean | null;
    tesla_charge_event_id?: string | null;
};

export function isSuperchargerChargingSession(session: { charger_type?: string | null }): boolean {
    return typeof session.charger_type === 'string' && session.charger_type.toLowerCase().includes('supercharger');
}

export function isTeslaChargingHistoryMarker(value: string | null | undefined): boolean {
    const normalized = value?.trim().toLowerCase() ?? '';
    return normalized.startsWith('sync:');
}

export function getStoredTeslaChargeEventId(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? '';

    if (!normalized || isTeslaChargingHistoryMarker(normalized)) {
        return null;
    }

    return normalized;
}

export function getTeslaChargingSyncStatus(session: TeslaChargingSyncLike): TeslaChargingSyncStatus | null {
    if (!isSuperchargerChargingSession(session) || session.is_complete !== true) {
        return null;
    }

    const marker = session.tesla_charge_event_id?.trim().toLowerCase() ?? '';

    if (!marker) {
        return 'pending';
    }

    if (marker === TESLA_CHARGING_HISTORY_UNAVAILABLE_MARKER) {
        return 'unavailable';
    }

    if (marker === TESLA_CHARGING_HISTORY_FAILED_MARKER) {
        return 'failed';
    }

    if (marker === TESLA_CHARGING_HISTORY_SYNCED_MARKER || getStoredTeslaChargeEventId(marker) != null) {
        return 'synced';
    }

    return 'pending';
}

export function getTeslaChargingSyncMessage(session: TeslaChargingSyncLike): string | null {
    const status = getTeslaChargingSyncStatus(session);

    switch (status) {
        case 'pending':
            return 'Waiting for Tesla data';
        case 'synced':
            return 'Tesla charging history';
        case 'unavailable':
            return 'Tesla data unavailable';
        case 'failed':
            return 'Tesla sync failed';
        default:
            return null;
    }
}
