import { NextRequest, NextResponse } from 'next/server';
import { fetchTeslaApi, normalizeTeslaRegion } from '@/lib/tesla/api';
import { getTeslaSession } from '@/lib/tesla/auth-server';

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);
    const vehicleId = request.nextUrl.searchParams.get('vehicleId');
    const region = normalizeTeslaRegion(request.nextUrl.searchParams.get('region')) || session?.region || 'eu';

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated with Tesla' }, { status: 401 });
    }

    if (!vehicleId) {
        return NextResponse.json({ error: 'Vehicle ID required' }, { status: 400 });
    }
    try {
        const response = await fetchTeslaApi(
            session.accessToken,
            region,
            `/api/1/vehicles/${vehicleId}/fleet_status`
        );

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            console.error('Tesla API returned non-JSON:', responseText);
            return NextResponse.json({
                success: false,
                error: `Tesla API returned invalid JSON (Status ${response.status})`,
                details: responseText.slice(0, 200) // First 200 chars
            }, { status: response.status === 200 ? 500 : response.status });
        }

        if (!response.ok) {
            return NextResponse.json({
                success: false,
                error: data.error || `Failed to get fleet status: ${response.status}`,
                details: data
            }, { status: response.status });
        }

        return NextResponse.json({
            success: true,
            status: data.response
        });

    } catch (err) {
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error'
        }, { status: 500 });
    }
}
