import { fetchTeslaApi, type TeslaRegion } from '@/lib/tesla/api';

export type TeslaVehicleSummary = {
    id: number;
    display_name: string;
    vin: string;
    state: string;
};

export function extractTeslaVehicleSummaries(data: unknown): TeslaVehicleSummary[] {
    return Array.isArray((data as { response?: unknown[] })?.response)
        ? ((data as { response: Array<{ id: number; display_name: string; vin: string; state: string }> }).response
            .map((vehicle) => ({
                id: vehicle.id,
                display_name: vehicle.display_name,
                vin: vehicle.vin,
                state: vehicle.state,
            })))
        : [];
}

export async function fetchTeslaVehicleSummaries(accessToken: string, region: TeslaRegion): Promise<TeslaVehicleSummary[]> {
    const response = await fetchTeslaApi(accessToken, region, '/api/1/vehicles');
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error((data as { error?: string })?.error || 'Failed to fetch vehicles');
    }

    return extractTeslaVehicleSummaries(data);
}
