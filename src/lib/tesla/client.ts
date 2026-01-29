/**
 * Tesla Fleet API Client
 * Handles all communication with Tesla Fleet API including regional endpoints,
 * token refresh, and rate limiting.
 */

// Regional API endpoints
const REGIONAL_ENDPOINTS = {
    na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
    cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
} as const;

export type Region = keyof typeof REGIONAL_ENDPOINTS;

interface TeslaClientConfig {
    accessToken: string;
    refreshToken?: string;
    region?: Region;
    onTokenRefresh?: (tokens: { accessToken: string; refreshToken: string }) => void;
}

interface VehicleData {
    id: number;
    vehicle_id: number;
    vin: string;
    display_name: string;
    state: 'online' | 'asleep' | 'offline';
}

interface VehicleState {
    charge_state?: {
        battery_level: number;
        battery_range: number;
        charging_state: string;
        charge_limit_soc: number;
        charge_rate: number;
        charger_power: number;
        time_to_full_charge: number;
    };
    drive_state?: {
        latitude: number;
        longitude: number;
        heading: number;
        speed: number | null;
        shift_state: string | null;
    };
    climate_state?: {
        inside_temp: number;
        outside_temp: number;
        is_climate_on: boolean;
    };
    vehicle_state?: {
        odometer: number;
        locked: boolean;
        car_version: string;
    };
}

export class TeslaFleetClient {
    private accessToken: string;
    private refreshToken?: string;
    private baseUrl: string;
    private onTokenRefresh?: (tokens: { accessToken: string; refreshToken: string }) => void;

    constructor(config: TeslaClientConfig) {
        this.accessToken = config.accessToken;
        this.refreshToken = config.refreshToken;
        this.baseUrl = REGIONAL_ENDPOINTS[config.region || 'na'];
        this.onTokenRefresh = config.onTokenRefresh;
    }

    /**
     * Make an authenticated request to the Tesla API
     */
    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        // Handle token expiration
        if (response.status === 401 && this.refreshToken) {
            await this.refreshAccessToken();
            return this.request(endpoint, options);
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new TeslaAPIError(
                error.error || `API request failed: ${response.status}`,
                response.status
            );
        }

        return response.json();
    }

    /**
     * Refresh the access token using the refresh token
     */
    private async refreshAccessToken(): Promise<void> {
        if (!this.refreshToken) {
            throw new TeslaAPIError('No refresh token available', 401);
        }

        const response = await fetch('https://auth.tesla.com/oauth2/v3/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: process.env.TESLA_CLIENT_ID || '',
                refresh_token: this.refreshToken,
            }),
        });

        if (!response.ok) {
            throw new TeslaAPIError('Failed to refresh token', 401);
        }

        const data = await response.json();
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;

        if (this.onTokenRefresh) {
            this.onTokenRefresh({
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
            });
        }
    }

    /**
     * Get list of vehicles
     */
    async getVehicles(): Promise<VehicleData[]> {
        const response = await this.request<{ response: VehicleData[] }>('/api/1/vehicles');
        return response.response;
    }

    /**
     * Get detailed vehicle data
     * Note: This endpoint should NOT be polled regularly - use Fleet Telemetry instead
     */
    async getVehicleData(vehicleId: string | number): Promise<VehicleState> {
        const response = await this.request<{ response: VehicleState }>(
            `/api/1/vehicles/${vehicleId}/vehicle_data`
        );
        return response.response;
    }

    /**
     * Check if vehicle is awake without waking it
     */
    async isVehicleAwake(vehicleId: string | number): Promise<boolean> {
        try {
            const vehicles = await this.getVehicles();
            const vehicle = vehicles.find((v) => v.id.toString() === vehicleId.toString());
            return vehicle?.state === 'online';
        } catch {
            return false;
        }
    }

    /**
     * Wake up the vehicle
     */
    async wakeUp(vehicleId: string | number): Promise<void> {
        await this.request(`/api/1/vehicles/${vehicleId}/wake_up`, { method: 'POST' });
    }

    /**
     * Get nearby charging sites
     */
    async getNearbyChargingSites(vehicleId: string | number): Promise<unknown> {
        const response = await this.request<{ response: unknown }>(
            `/api/1/vehicles/${vehicleId}/nearby_charging_sites`
        );
        return response.response;
    }

    /**
     * Update the API region
     */
    setRegion(region: Region): void {
        this.baseUrl = REGIONAL_ENDPOINTS[region];
    }

    /**
     * Update access token
     */
    setAccessToken(token: string): void {
        this.accessToken = token;
    }
}

/**
 * Custom error class for Tesla API errors
 */
export class TeslaAPIError extends Error {
    constructor(
        message: string,
        public statusCode: number
    ) {
        super(message);
        this.name = 'TeslaAPIError';
    }
}

/**
 * Create a Tesla client instance
 */
export function createTeslaClient(config: TeslaClientConfig): TeslaFleetClient {
    return new TeslaFleetClient(config);
}
