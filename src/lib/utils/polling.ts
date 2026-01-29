/**
 * Smart Polling Configuration
 * Implements efficient polling based on vehicle state to minimize battery drain
 * and API costs while keeping data fresh.
 */

export interface PollingConfig {
    driving: number;    // seconds - vehicle is actively driving
    charging: number;   // seconds - vehicle is charging
    parked: number;     // seconds - vehicle is parked but awake
    sleeping: number;   // seconds - vehicle is in sleep mode (never poll)
}

export const DEFAULT_POLLING_CONFIG: PollingConfig = {
    driving: 30,      // 30 seconds while driving for real-time tracking
    charging: 300,    // 5 minutes while charging
    parked: 1800,     // 30 minutes while parked
    sleeping: 3600,   // 1 hour minimum - but we never actually poll sleeping vehicles
};

export type VehicleState = 'driving' | 'charging' | 'parked' | 'sleeping' | 'unknown';

/**
 * Determine vehicle state from API response
 */
export function determineVehicleState(data: {
    state?: string;
    drive_state?: { shift_state: string | null; speed: number | null };
    charge_state?: { charging_state: string };
}): VehicleState {
    // Vehicle is asleep
    if (data.state === 'asleep' || data.state === 'offline') {
        return 'sleeping';
    }

    // Vehicle is driving
    if (
        data.drive_state?.shift_state === 'D' ||
        data.drive_state?.shift_state === 'R' ||
        (data.drive_state?.speed && data.drive_state.speed > 0)
    ) {
        return 'driving';
    }

    // Vehicle is charging
    if (
        data.charge_state?.charging_state === 'Charging' ||
        data.charge_state?.charging_state === 'Starting'
    ) {
        return 'charging';
    }

    // Vehicle is parked but awake
    if (data.state === 'online') {
        return 'parked';
    }

    return 'unknown';
}

/**
 * Get the appropriate polling interval based on vehicle state
 */
export function getPollingInterval(
    state: VehicleState,
    config: PollingConfig = DEFAULT_POLLING_CONFIG
): number {
    switch (state) {
        case 'driving':
            return config.driving * 1000;
        case 'charging':
            return config.charging * 1000;
        case 'parked':
            return config.parked * 1000;
        case 'sleeping':
            // Return a large interval - but the caller should skip polling entirely
            return config.sleeping * 1000;
        default:
            return config.parked * 1000;
    }
}

/**
 * Check if polling should be skipped for the current state
 * We never poll sleeping vehicles to avoid waking them
 */
export function shouldSkipPolling(state: VehicleState): boolean {
    return state === 'sleeping';
}

/**
 * Get human-readable description of polling interval
 */
export function formatPollingInterval(seconds: number): string {
    if (seconds >= 3600) {
        return `${seconds / 3600}h`;
    }
    if (seconds >= 60) {
        return `${seconds / 60}m`;
    }
    return `${seconds}s`;
}

/**
 * Calculate estimated API cost based on polling config
 * Based on Tesla's Fleet API pricing (~$0.001 per request)
 */
export function estimateMonthlyCost(
    config: PollingConfig,
    hoursPerState: {
        driving: number;
        charging: number;
        parked: number;
    }
): number {
    const costPerRequest = 0.001; // $0.001 per API call

    const drivingCalls = (hoursPerState.driving * 3600) / config.driving;
    const chargingCalls = (hoursPerState.charging * 3600) / config.charging;
    const parkedCalls = (hoursPerState.parked * 3600) / config.parked;

    return (drivingCalls + chargingCalls + parkedCalls) * costPerRequest;
}
