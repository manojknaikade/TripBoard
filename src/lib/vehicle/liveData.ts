import { fetchCachedJson } from '@/lib/client/fetchCache';

const LIVE_VEHICLE_CACHE_TTL_MS = 4_000;

export async function fetchSharedLiveVehicleJson<T>(cacheKey: string, endpoint: string): Promise<T> {
    return fetchCachedJson<T>(
        cacheKey,
        async () => {
            const response = await fetch(endpoint, {
                cache: 'no-store',
            });

            return response.json();
        },
        LIVE_VEHICLE_CACHE_TTL_MS
    );
}
