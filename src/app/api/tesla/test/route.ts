import { NextRequest, NextResponse } from 'next/server';
import { fetchTeslaApi, normalizeTeslaRegion } from '@/lib/tesla/api';
import { getTeslaSession } from '@/lib/tesla/auth-server';

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json(
            { error: 'Not authenticated with Tesla. Please connect your Tesla account first.' },
            { status: 401 }
        );
    }

    try {
        const region = normalizeTeslaRegion(request.nextUrl.searchParams.get('region')) || session.region;
        const response = await fetchTeslaApi(session.accessToken, region, '/api/1/vehicles');

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return NextResponse.json({
                success: false,
                error: error.error || `API returned ${response.status}`,
                status: response.status,
            });
        }

        const data = await response.json();

        return NextResponse.json({
            success: true,
            message: 'Tesla API connection successful!',
            vehicles: data.response?.map((v: { id: number; display_name: string; vin: string; state: string }) => ({
                id: v.id,
                display_name: v.display_name,
                vin: v.vin,
                state: v.state,
            })) || [],
            count: data.response?.length || 0,
        });
    } catch (err) {
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        }, { status: 500 });
    }
}
