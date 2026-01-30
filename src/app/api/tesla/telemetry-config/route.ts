import { NextRequest, NextResponse } from 'next/server';

const REGIONAL_ENDPOINTS = {
    na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
    cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
};
const PROXY_URL = 'https://tripboard.manojnaikade.com:4443';

// POST - Configure telemetry for one or more vehicles
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

    // Accept either VIN or vehicleId (we'll get VIN from vehicle data)
    const { vin, vehicleId } = body;

    // If vehicleId provided, we need to first get the VIN
    let targetVin = vin;
    if (!targetVin && vehicleId) {
        // Fetch vehicle data to get VIN
        const baseUrl = REGIONAL_ENDPOINTS[region as keyof typeof REGIONAL_ENDPOINTS] || REGIONAL_ENDPOINTS.eu;
        try {
            const vehicleRes = await fetch(`${baseUrl}/api/1/vehicles/${vehicleId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const vehicleData = await vehicleRes.json();
            targetVin = vehicleData.response?.vin;
        } catch (err) {
            console.error('Failed to fetch vehicle VIN:', err);
        }
    }

    if (!targetVin) {
        return NextResponse.json(
            { error: 'VIN is required. Provide vin directly or vehicleId to fetch VIN.' },
            { status: 400 }
        );
    }

    const baseUrl = REGIONAL_ENDPOINTS[region as keyof typeof REGIONAL_ENDPOINTS] || REGIONAL_ENDPOINTS.eu;

    // Telemetry configuration per Tesla docs
    const telemetryConfig = {
        vins: [targetVin],
        config: {
            hostname: 'tripboard.manojnaikade.com',
            port: 443,
            ca: null, // Use system CAs (Let's Encrypt)
            fields: {
                // Location tracking
                Location: { interval_seconds: 10 },
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
                Locked: { interval_seconds: 60 },
                SentryMode: { interval_seconds: 60 },
            },
            alert_types: ['service'],
            exp: Math.floor(Date.now() / 1000) + 86400 * 365, // 1 year
        },
    };

    try {
        // Use Vehicle Command Proxy for signing
        const response = await fetch(
            `${PROXY_URL}/api/1/vehicles/fleet_telemetry_config`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(telemetryConfig),
            }
        );

        const responseText = await response.text();

        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            console.error('Tesla API returned non-JSON:', responseText.slice(0, 500));
            return NextResponse.json({
                success: false,
                error: `Tesla API error (${response.status}): returned HTML instead of JSON`,
                hint: response.status === 401 ? 'Access token may be expired - try signing out and back in' :
                    response.status === 403 ? 'Access denied - check OAuth scopes' :
                        response.status === 404 ? 'Endpoint not found - check API version' :
                            'Check Tesla API status',
                status: response.status,
            }, { status: response.status });
        }

        // Check for skipped vehicles (common with missing virtual key)
        if (data.response?.skipped_vehicles && Object.keys(data.response.skipped_vehicles).length > 0) {
            return NextResponse.json({
                success: false,
                error: 'Vehicle was skipped - virtual key may not be paired',
                skipped: data.response.skipped_vehicles,
                hint: 'You need to pair the virtual key with your car. Go to car touchscreen > Controls > Locks > Keys > Add Key',
                details: data,
            });
        }

        if (!response.ok) {
            return NextResponse.json({
                success: false,
                error: data.error || data.error_description || `Failed to configure telemetry: ${response.status}`,
                details: data,
            }, { status: response.status });
        }

        return NextResponse.json({
            success: true,
            message: 'Telemetry configuration sent to vehicle',
            vin: targetVin,
            config: telemetryConfig.config,
            response: data,
            version: '2024.1.30.2', // Update check
        });
    } catch (err) {
        console.error('Telemetry config error:', err);
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to configure telemetry',
        }, { status: 500 });
    }
}

// GET - Check current telemetry config for a vehicle
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

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            return NextResponse.json({
                success: false,
                error: `Tesla API error (${response.status})`,
            }, { status: response.status });
        }

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

// DELETE - Remove telemetry config
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

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            return NextResponse.json({
                success: false,
                error: `Tesla API error (${response.status})`,
            }, { status: response.status });
        }

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
