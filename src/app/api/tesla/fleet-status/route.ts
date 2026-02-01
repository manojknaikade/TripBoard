import { NextRequest, NextResponse } from 'next/server';

const REGIONAL_ENDPOINTS = {
    na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
    cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
};

export async function GET(request: NextRequest) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;
    const vehicleId = request.nextUrl.searchParams.get('vehicleId');
    const region = request.nextUrl.searchParams.get('region') || 'eu';

    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated with Tesla' }, { status: 401 });
    }

    if (!vehicleId) {
        return NextResponse.json({ error: 'Vehicle ID required' }, { status: 400 });
    }

    const baseUrl = REGIONAL_ENDPOINTS[region as keyof typeof REGIONAL_ENDPOINTS] || REGIONAL_ENDPOINTS.eu;

    try {
        const response = await fetch(
            `${baseUrl}/api/1/vehicles/${vehicleId}/fleet_status`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
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
