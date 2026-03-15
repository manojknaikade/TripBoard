import { NextRequest, NextResponse } from 'next/server';
import {
    discoverTeslaVehicles,
    fetchTeslaApi,
    normalizeTeslaRegion,
    type TeslaRegion,
} from '@/lib/tesla/api';
import { getTeslaSession, setTeslaSession } from '@/lib/tesla/auth-server';
import { createClient } from '@/lib/supabase/server';

async function fetchVehicles(accessToken: string, region: TeslaRegion) {
    const response = await fetchTeslaApi(accessToken, region, '/api/1/vehicles');
    const data = await response.json().catch(() => ({}));
    return { response, data };
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

    try {
        if (authHeader?.startsWith('Bearer ')) {
            const accessToken = authHeader.substring(7);
            const region = requestedRegion ?? 'eu';
            const { response, data } = await fetchVehicles(accessToken, region);

            if (!response.ok) {
                return NextResponse.json(
                    { error: (data as { error?: string })?.error || 'Failed to fetch vehicles' },
                    { status: response.status }
                );
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
        const { response, data } = await fetchVehicles(session.accessToken, region);

        if (!response.ok) {
            return NextResponse.json(
                { error: (data as { error?: string })?.error || 'Failed to fetch vehicles' },
                { status: response.status }
            );
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
