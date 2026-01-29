import { NextRequest, NextResponse } from 'next/server';

const REGIONAL_ENDPOINTS = {
    na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
    cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
};

export async function POST(request: NextRequest) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;
    const region = request.nextUrl.searchParams.get('region') || 'eu';

    if (!accessToken) {
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

    const baseUrl = REGIONAL_ENDPOINTS[region as keyof typeof REGIONAL_ENDPOINTS] || REGIONAL_ENDPOINTS.eu;

    try {
        // Call wake_up endpoint
        const response = await fetch(
            `${baseUrl}/api/1/vehicles/${vehicleId}/wake_up`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
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
