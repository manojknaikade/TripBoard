import {
    getTeslaChargingSyncStatus,
    isSuperchargerChargingSession,
    type TeslaChargingSyncLike,
} from '@/lib/charging/teslaSync';

export type ChargingEnergyLike = {
    energy_added_kwh?: number | null;
    energy_delivered_kwh?: number | null;
};

export type ChargingCostLike = ChargingEnergyLike & TeslaChargingSyncLike & {
    cost_estimate?: number | null;
    cost_user_entered?: number | null;
    charger_price_per_kwh?: number | null;
};

export function hasTeslaDirectCost(session: ChargingCostLike): boolean {
    return isSuperchargerChargingSession(session) && session.cost_estimate != null;
}

export function canUseManualChargingCost(session: ChargingCostLike): boolean {
    if (!isSuperchargerChargingSession(session)) {
        return true;
    }

    const syncStatus = getTeslaChargingSyncStatus(session);
    return syncStatus === 'unavailable' || syncStatus === 'failed';
}

export function getChargingBatteryEnergyKwh(session: ChargingEnergyLike): number | null {
    return session.energy_added_kwh ?? null;
}

export function getChargingDeliveredEnergyKwh(session: ChargingEnergyLike): number | null {
    return session.energy_delivered_kwh ?? null;
}

export function getChargingLossKwh(session: ChargingEnergyLike): number | null {
    const delivered = getChargingDeliveredEnergyKwh(session);
    const battery = getChargingBatteryEnergyKwh(session);

    if (delivered == null || battery == null) {
        return null;
    }

    return delivered > battery + 0.05 ? delivered - battery : 0;
}

export function getEffectiveChargingEnergyKwh(session: ChargingEnergyLike): number | null {
    if (getChargingDeliveredEnergyKwh(session) != null) {
        return getChargingDeliveredEnergyKwh(session);
    }

    if (getChargingBatteryEnergyKwh(session) != null) {
        return getChargingBatteryEnergyKwh(session);
    }

    return null;
}

export function getChargingDisplayCost(session: ChargingCostLike): number | null {
    if (hasTeslaDirectCost(session)) {
        return session.cost_estimate ?? null;
    }

    if (isSuperchargerChargingSession(session)) {
        return canUseManualChargingCost(session) ? (session.cost_user_entered ?? null) : null;
    }

    return session.cost_user_entered ?? session.cost_estimate ?? null;
}

export function getChargingUnitCost(session: ChargingCostLike): number | null {
    if (session.charger_price_per_kwh != null) {
        return session.charger_price_per_kwh;
    }

    const displayCost = getChargingDisplayCost(session);
    const energyKwh = getEffectiveChargingEnergyKwh(session);

    if (displayCost == null || energyKwh == null || energyKwh <= 0) {
        return null;
    }

    return displayCost / energyKwh;
}

export function getChargingLossCost(session: ChargingCostLike): number | null {
    const lossKwh = getChargingLossKwh(session);
    const unitCost = getChargingUnitCost(session);

    if (lossKwh == null || unitCost == null || lossKwh <= 0) {
        return null;
    }

    return lossKwh * unitCost;
}

export function getChargingCostSource(session: ChargingCostLike): 'manual' | 'tesla' | null {
    if (hasTeslaDirectCost(session)) {
        return 'tesla';
    }

    if (session.cost_user_entered != null && canUseManualChargingCost(session)) {
        return 'manual';
    }

    if (session.cost_estimate != null) {
        return 'tesla';
    }

    return null;
}

export function hasDeliveredEnergyGap(session: ChargingEnergyLike): boolean {
    return (
        session.energy_delivered_kwh != null &&
        session.energy_added_kwh != null &&
        session.energy_delivered_kwh > session.energy_added_kwh + 0.05
    );
}
