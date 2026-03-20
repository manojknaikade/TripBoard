import { fetchCachedJson } from '@/lib/client/fetchCache';

const LIVE_VEHICLE_CACHE_TTL_MS = 4_000;
const LIVE_VEHICLE_FETCH_TIMEOUT_MS = 20_000;

export async function fetchSharedLiveVehicleJson<T>(cacheKey: string, endpoint: string): Promise<T> {
    return fetchCachedJson<T>(
        cacheKey,
        async () => {
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => {
                controller.abort();
            }, LIVE_VEHICLE_FETCH_TIMEOUT_MS);

            try {
                const response = await fetch(endpoint, {
                    cache: 'no-store',
                    signal: controller.signal,
                });

                return response.json();
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    throw new Error('Vehicle data request timed out');
                }

                throw error;
            } finally {
                window.clearTimeout(timeoutId);
            }
        },
        LIVE_VEHICLE_CACHE_TTL_MS
    );
}
