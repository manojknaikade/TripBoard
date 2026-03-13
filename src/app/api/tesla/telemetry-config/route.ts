import { NextRequest, NextResponse } from 'next/server';
import { fetchTeslaApi, normalizeTeslaRegion } from '@/lib/tesla/api';
import { getTeslaSession } from '@/lib/tesla/auth-server';

// The CA cert (public key) from /opt/vehicle-proxy/config/public_key.pem
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

function getTelemetryProxyConfig() {
    const proxyUrl = process.env.TESLA_VEHICLE_COMMAND_PROXY_URL;
    const telemetryHostname = process.env.TESLA_TELEMETRY_HOSTNAME;
    const telemetryPortRaw = process.env.TESLA_TELEMETRY_PORT;

    if (!proxyUrl) {
        throw new Error('TESLA_VEHICLE_COMMAND_PROXY_URL is required');
    }

    if (!telemetryHostname) {
        throw new Error('TESLA_TELEMETRY_HOSTNAME is required');
    }

    if (!telemetryPortRaw) {
        throw new Error('TESLA_TELEMETRY_PORT is required');
    }

    const telemetryPort = parseInt(telemetryPortRaw, 10);

    if (!Number.isFinite(telemetryPort) || telemetryPort <= 0) {
        throw new Error('TESLA_TELEMETRY_PORT must be a valid positive integer');
    }

    let proxyHost: string;
    try {
        proxyHost = new URL(proxyUrl).hostname;
    } catch {
        throw new Error('TESLA_VEHICLE_COMMAND_PROXY_URL must be a valid URL');
    }

    return {
        proxyUrl,
        proxyHost,
        telemetryHostname,
        telemetryPort,
    };
}

export async function POST(request: NextRequest) {
    const session = await getTeslaSession(request);
    const region = normalizeTeslaRegion(request.nextUrl.searchParams.get('region')) || session?.region || 'eu';

    if (!session) {
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
        try {
            const vehicleRes = await fetchTeslaApi(
                session.accessToken,
                region,
                `/api/1/vehicles/${vehicleId}`
            );
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

    let proxyConfig: ReturnType<typeof getTelemetryProxyConfig>;
    try {
        proxyConfig = getTelemetryProxyConfig();
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Invalid telemetry proxy configuration' },
            { status: 500 }
        );
    }

    // Telemetry configuration per Tesla docs
    const telemetryConfig = {
        vins: [targetVin],
        config: {
            hostname: proxyConfig.telemetryHostname,
            port: proxyConfig.telemetryPort,
            ca: CA_CERT,
            fields: {
                Location: { interval_seconds: 10 },
                BatteryLevel: { interval_seconds: 30 },
                Odometer: { interval_seconds: 60 },
                VehicleSpeed: { interval_seconds: 5 },
                Gear: { interval_seconds: 2 },
                InsideTemp: { interval_seconds: 60 },
                OutsideTemp: { interval_seconds: 60 },
                DetailedChargeState: { interval_seconds: 30 },
                FastChargerPresent: { interval_seconds: 30 },
                FastChargerType: { interval_seconds: 30 },
                LocatedAtHome: { interval_seconds: 30 },
                DCChargingEnergyIn: { interval_seconds: 30 },
                ACChargingEnergyIn: { interval_seconds: 30 },
                ACChargingPower: { interval_seconds: 30 },
                DCChargingPower: { interval_seconds: 30 },
                DoorState: { interval_seconds: 30 },
                TpmsPressureFl: { interval_seconds: 300 },
                TpmsPressureFr: { interval_seconds: 300 },
                TpmsPressureRl: { interval_seconds: 300 },
                TpmsPressureRr: { interval_seconds: 300 },
                Version: { interval_seconds: 3600 },
                EstBatteryRange: { interval_seconds: 60 },
                RatedRange: { interval_seconds: 60 },
                FdWindow: { interval_seconds: 30 },
                FpWindow: { interval_seconds: 30 },
                RdWindow: { interval_seconds: 30 },
                RpWindow: { interval_seconds: 30 }
            },
            alert_types: ['service'],
            exp: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
        },
    };

    try {
        // Use Vehicle Command Proxy for signing
        const response = await fetch(
            `${proxyConfig.proxyUrl}/api/1/vehicles/fleet_telemetry_config`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${session.accessToken}`,
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
                    response.status === 403 ? 'Ensure your Vehicle Command Proxy is running and correctly configured' :
                        `Check the proxy server logs at ${proxyConfig.proxyHost}`,
                details: responseText.slice(0, 200)
            }, { status: response.status === 200 ? 500 : response.status });
        }

        if (!response.ok) {
            console.error('Tesla API error configuration:', data);
            return NextResponse.json({
                success: false,
                error: data.error || data.error_description || `Failed to configure telemetry: ${response.status}`,
                details: data
            }, { status: response.status });
        }

        return NextResponse.json({
            success: true,
            status: data.response || data
        });

    } catch (err) {
        console.error('Telemetry config API error:', err);
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error during telemetry configuration'
        }, { status: 500 });
    }
}

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

    let proxyConfig: ReturnType<typeof getTelemetryProxyConfig>;
    try {
        proxyConfig = getTelemetryProxyConfig();
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Invalid telemetry proxy configuration' },
            { status: 500 }
        );
    }

    try {
        // We first need the VIN 
        const vehicleRes = await fetchTeslaApi(
            session.accessToken,
            region,
            `/api/1/vehicles/${vehicleId}`
        );

        if (!vehicleRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch vehicle details' }, { status: vehicleRes.status });
        }

        const vehicleData = await vehicleRes.json();
        const vin = vehicleData.response?.vin;

        if (!vin) {
            return NextResponse.json({ error: 'Could not determine VIN' }, { status: 400 });
        }

        // Fetch telemetry config through proxy
        const response = await fetch(
            `${proxyConfig.proxyUrl}/api/1/vehicles/${vin}/fleet_telemetry_config`,
            {
                headers: {
                    Authorization: `Bearer ${session.accessToken}`,
                    'Content-Type': 'application/json',
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
                error: `Error parsing configuration: ${response.status}`,
                details: responseText.slice(0, 200)
            }, { status: 500 });
        }

        if (!response.ok) {
            return NextResponse.json({
                success: false,
                error: data.error || 'Failed to fetch config',
                details: data
            }, { status: response.status });
        }

        return NextResponse.json({
            success: true,
            config: data.response || data
        });

    } catch (err) {
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const session = await getTeslaSession(request);
    const vehicleId = request.nextUrl.searchParams.get('vehicleId');
    const region = normalizeTeslaRegion(request.nextUrl.searchParams.get('region')) || session?.region || 'eu';

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated with Tesla' }, { status: 401 });
    }

    if (!vehicleId) {
        return NextResponse.json({ error: 'Vehicle ID required' }, { status: 400 });
    }

    let proxyConfig: ReturnType<typeof getTelemetryProxyConfig>;
    try {
        proxyConfig = getTelemetryProxyConfig();
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Invalid telemetry proxy configuration' },
            { status: 500 }
        );
    }

    try {
        // We first need the VIN 
        const vehicleRes = await fetchTeslaApi(
            session.accessToken,
            region,
            `/api/1/vehicles/${vehicleId}`
        );

        const vehicleData = await vehicleRes.json();
        const vin = vehicleData.response?.vin;

        if (!vin) {
            return NextResponse.json({ error: 'Could not determine VIN' }, { status: 400 });
        }

        // Delete telemetry config through proxy
        const response = await fetch(
            `${proxyConfig.proxyUrl}/api/1/vehicles/${vin}/fleet_telemetry_config`,
            {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${session.accessToken}`,
                },
            }
        );

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            return NextResponse.json({
                success: false,
                error: data.error || 'Failed to delete config',
            }, { status: response.status });
        }

        return NextResponse.json({ success: true });

    } catch (err) {
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error'
        }, { status: 500 });
    }
}
