import { NextRequest, NextResponse } from 'next/server';
import { fetchTeslaApi, normalizeTeslaRegion } from '@/lib/tesla/api';
import { getTeslaSession } from '@/lib/tesla/auth-server';

export async function POST(request: NextRequest) {
    const session = await getTeslaSession(request);
    const region = normalizeTeslaRegion(request.nextUrl.searchParams.get('region')) || session?.region || 'eu';

    if (!session) {
        return NextResponse.json(
            { error: 'Not authenticated with Tesla' },
            { status: 401 }
        );
    }

    // Get vehicle ID from request body
    let vehicleId: string | null = null;
    try {
        const body = await request.json();
        vehicleId = body.vehicleId;
    } catch {
        return NextResponse.json(
            { error: 'Vehicle ID is required in request body' },
            { status: 400 }
        );
    }

    if (!vehicleId) {
        return NextResponse.json(
            { error: 'Vehicle ID is required' },
            { status: 400 }
        );
    }
    try {
        // Call wake_up endpoint
        const response = await fetchTeslaApi(
            session.accessToken,
            region,
            `/api/1/vehicles/${vehicleId}/wake_up`,
            { method: 'POST' }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return NextResponse.json({
                success: false,
                error: error.error || `Wake failed: ${response.status}`,
            }, { status: response.status });
        }

        const data = await response.json();

        return NextResponse.json({
            success: true,
            message: 'Wake command sent',
            state: data.response?.state,
        });
    } catch (err) {
        console.error('Wake error:', err);
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Wake failed',
        }, { status: 500 });
    }
}
