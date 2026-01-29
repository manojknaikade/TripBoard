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

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }

    const { vehicleId } = body;
    if (!vehicleId) {
        return NextResponse.json(
            { error: 'Vehicle ID is required' },
            { status: 400 }
        );
    }

    const baseUrl = REGIONAL_ENDPOINTS[region as keyof typeof REGIONAL_ENDPOINTS] || REGIONAL_ENDPOINTS.eu;

    // Telemetry configuration
    const telemetryConfig = {
        config: {
            hostname: 'tripboard.manojnaikade.com',
            port: 443,
            ca: null, // Use system CAs
            fields: {
                // Location tracking
                Location: { interval_seconds: 10 },
                EstLat: { interval_seconds: 10 },
                EstLng: { interval_seconds: 10 },
                EstHeading: { interval_seconds: 10 },

                // Speed & driving
                VehicleSpeed: { interval_seconds: 5 },
                Odometer: { interval_seconds: 60 },

                // Battery & charging
                BatteryLevel: { interval_seconds: 30 },
                ChargeState: { interval_seconds: 30 },
                ACChargingPower: { interval_seconds: 30 },
                DCChargingPower: { interval_seconds: 30 },

                // Temperature
                InsideTemp: { interval_seconds: 60 },
                OutsideTemp: { interval_seconds: 60 },

                // State
                GearSelection: { interval_seconds: 5 },
                Locked: { interval_seconds: 60 },
                SentryMode: { interval_seconds: 60 },
            },
            alert_types: ['service'],
            exp: Math.floor(Date.now() / 1000) + 86400 * 365, // 1 year
        },
    };

    try {
        const response = await fetch(
            `${baseUrl}/api/1/vehicles/${vehicleId}/fleet_telemetry_config`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(telemetryConfig),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json({
                success: false,
                error: data.error || `Failed to configure telemetry: ${response.status}`,
                details: data,
            }, { status: response.status });
        }

        return NextResponse.json({
            success: true,
            message: 'Telemetry configuration sent to vehicle',
            config: telemetryConfig.config,
            response: data,
        });
    } catch (err) {
        console.error('Telemetry config error:', err);
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to configure telemetry',
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;
    const vehicleId = request.nextUrl.searchParams.get('id');
    const region = request.nextUrl.searchParams.get('region') || 'eu';

    if (!accessToken) {
        return NextResponse.json(
            { error: 'Not authenticated with Tesla' },
            { status: 401 }
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
        const response = await fetch(
            `${baseUrl}/api/1/vehicles/${vehicleId}/fleet_telemetry_config`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const data = await response.json();

        return NextResponse.json({
            success: response.ok,
            config: data,
        });
    } catch (err) {
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to get telemetry config',
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;
    const vehicleId = request.nextUrl.searchParams.get('id');
    const region = request.nextUrl.searchParams.get('region') || 'eu';

    if (!accessToken) {
        return NextResponse.json(
            { error: 'Not authenticated with Tesla' },
            { status: 401 }
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
        const response = await fetch(
            `${baseUrl}/api/1/vehicles/${vehicleId}/fleet_telemetry_config`,
            {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const data = await response.json();

        return NextResponse.json({
            success: response.ok,
            message: 'Telemetry configuration removed',
            response: data,
        });
    } catch (err) {
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to delete telemetry config',
        }, { status: 500 });
    }
}
