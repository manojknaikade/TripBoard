import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json(
            { error: 'Not authenticated with Tesla. Please connect your Tesla account first.' },
            { status: 401 }
        );
    }

    try {
        // Test the connection by fetching vehicles
        const response = await fetch('https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/vehicles', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

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
