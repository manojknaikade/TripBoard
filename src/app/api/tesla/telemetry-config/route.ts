import { NextRequest, NextResponse } from 'next/server';

const REGIONAL_ENDPOINTS = {
    na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
    cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
};
const PROXY_URL = 'https://tripboard.manojnaikade.com:4443';

// Let's Encrypt ISRG Root X1
const CA_CERT = `-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----`;

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
            ca: CA_CERT,
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
            exp: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
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
                version: '2024.1.30.4', // Explicit CA check
            });
        }

        if (!response.ok) {
            return NextResponse.json({
                success: false,
                error: data.error || data.error_description || `Failed to configure telemetry: ${response.status}`,
                details: data,
                version: '2024.1.30.4', // Explicit CA check
            }, { status: response.status });
        }

        return NextResponse.json({
            success: true,
            message: 'Telemetry configuration sent to vehicle',
            vin: targetVin,
            config: telemetryConfig.config,
            response: data,
            version: '2024.1.30.4', // Explicit CA check
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
