'use client';

import { fetchCachedJson, readCachedJson } from '@/lib/client/fetchCache';

export type ReverseGeocodeResult = {
    success?: boolean;
    address?: string;
    raw?: Record<string, string | undefined>;
    fallback?: string;
};

const REVERSE_GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeCoordinate(value: number | string): string {
    const parsed = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(parsed)) {
        return String(value);
    }

    return parsed.toFixed(5);
}

function buildReverseGeocodeCacheKey(lat: number | string, lng: number | string): string {
    return `geocode:reverse:${normalizeCoordinate(lat)}:${normalizeCoordinate(lng)}`;
}

export function formatCoordinateFallback(lat: number, lng: number): string {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function readCachedReverseGeocode(lat: number, lng: number): ReverseGeocodeResult | null {
    return readCachedJson<ReverseGeocodeResult>(buildReverseGeocodeCacheKey(lat, lng));
}

export async function fetchReverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
    return fetchCachedJson(
        buildReverseGeocodeCacheKey(lat, lng),
        async () => {
            const response = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);

            if (!response.ok) {
                throw new Error('Reverse geocode request failed');
            }

            return response.json();
        },
        REVERSE_GEOCODE_CACHE_TTL_MS
    );
}
