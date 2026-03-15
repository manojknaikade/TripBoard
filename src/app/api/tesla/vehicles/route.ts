import { NextRequest, NextResponse } from 'next/server';
import {
    discoverTeslaVehicles,
    fetchTeslaApi,
    normalizeTeslaRegion,
    type TeslaRegion,
} from '@/lib/tesla/api';
import { getTeslaSession, setTeslaSession } from '@/lib/tesla/auth-server';
import { createClient } from '@/lib/supabase/server';

type VehicleSummary = {
    id: number;
    display_name: string;
    vin: string;
    state: string;
};

type VehicleListCacheEntry = {
    expiresAt: number;
    payload: {
        success: true;
        vehicles: VehicleSummary[];
        count: number;
    };
};

const VEHICLE_LIST_CACHE_TTL_MS = 60_000;
const vehicleListCache = new Map<string, VehicleListCacheEntry>();

async function fetchVehicles(accessToken: string, region: TeslaRegion) {
    const response = await fetchTeslaApi(accessToken, region, '/api/1/vehicles');
    const data = await response.json().catch(() => ({}));
    return { response, data };
}

function normalizeVehicleListPayload(data: unknown) {
    const vehicles = Array.isArray((data as { response?: unknown[] })?.response)
        ? ((data as { response: Array<{ id: number; display_name: string; vin: string; state: string }> }).response
            .map((vehicle) => ({
                id: vehicle.id,
                display_name: vehicle.display_name,
                vin: vehicle.vin,
                state: vehicle.state,
            })))
        : [];

    return {
        success: true as const,
        vehicles,
        count: vehicles.length,
    };
}

function getVehicleListCacheKey(accessToken: string, region: TeslaRegion) {
    return `${region}:${accessToken.slice(-24)}`;
}

function readVehicleListCache(cacheKey: string) {
    const cachedEntry = vehicleListCache.get(cacheKey);

    if (!cachedEntry) {
        return null;
    }

    if (cachedEntry.expiresAt <= Date.now()) {
        vehicleListCache.delete(cacheKey);
        return null;
    }

    return cachedEntry.payload;
}

function writeVehicleListCache(cacheKey: string, payload: VehicleListCacheEntry['payload']) {
    vehicleListCache.set(cacheKey, {
        expiresAt: Date.now() + VEHICLE_LIST_CACHE_TTL_MS,
        payload,
    });
}

export async function POST(request: NextRequest) {
    try {
        const { accessToken, refreshToken, region } = await request.json();

        if (!accessToken) {
            return NextResponse.json(
                { error: 'Access token is required' },
                { status: 400 }
            );
        }

        const discovery = await discoverTeslaVehicles(accessToken, region);
        if (!discovery.ok) {
            return NextResponse.json(
                { error: (discovery.error as { error?: string })?.error || 'Failed to fetch vehicles' },
                { status: discovery.status }
            );
        }

        const appResponse = NextResponse.json(discovery.data);
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        await setTeslaSession(request, appResponse, {
            accessToken,
            refreshToken,
            region: discovery.region,
        }, {
            userId: user?.id ?? null,
        });

        return appResponse;
    } catch (error) {
        console.error('Tesla API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    const requestedRegion = normalizeTeslaRegion(request.nextUrl.searchParams.get('region'));
    const wantsSummary = request.nextUrl.searchParams.get('summary') === '1';

    try {
        if (authHeader?.startsWith('Bearer ')) {
            const accessToken = authHeader.substring(7);
            const region = requestedRegion ?? 'eu';
            const cacheKey = getVehicleListCacheKey(accessToken, region);

            if (wantsSummary) {
                const cachedPayload = readVehicleListCache(cacheKey);
                if (cachedPayload) {
                    return NextResponse.json(cachedPayload);
                }
            }

            const { response, data } = await fetchVehicles(accessToken, region);

            if (!response.ok) {
                return NextResponse.json(
                    { error: (data as { error?: string })?.error || 'Failed to fetch vehicles' },
                    { status: response.status }
                );
            }

            if (wantsSummary) {
                const payload = normalizeVehicleListPayload(data);
                writeVehicleListCache(cacheKey, payload);
                return NextResponse.json(payload);
            }

            return NextResponse.json(data);
        }

        const session = await getTeslaSession(request);
        if (!session) {
            return NextResponse.json(
                { error: 'Authorization required' },
                { status: 401 }
            );
        }

        const region = requestedRegion ?? session.region;
        const cacheKey = getVehicleListCacheKey(session.accessToken, region);

        if (wantsSummary) {
            const cachedPayload = readVehicleListCache(cacheKey);
            if (cachedPayload) {
                return NextResponse.json(cachedPayload);
            }
        }

        const { response, data } = await fetchVehicles(session.accessToken, region);

        if (!response.ok) {
            return NextResponse.json(
                { error: (data as { error?: string })?.error || 'Failed to fetch vehicles' },
                { status: response.status }
            );
        }

        if (wantsSummary) {
            const payload = normalizeVehicleListPayload(data);
            writeVehicleListCache(cacheKey, payload);
            return NextResponse.json(payload);
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Tesla API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
