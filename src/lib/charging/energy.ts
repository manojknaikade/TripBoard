export type ChargingEnergyLike = {
    energy_added_kwh?: number | null;
    energy_delivered_kwh?: number | null;
};

export function getEffectiveChargingEnergyKwh(session: ChargingEnergyLike): number | null {
    if (session.energy_delivered_kwh != null) {
        return session.energy_delivered_kwh;
    }

    if (session.energy_added_kwh != null) {
        return session.energy_added_kwh;
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
