import { NextRequest, NextResponse } from 'next/server';

/**
 * Register this app with Tesla Fleet API for a specific region
 * Uses Partner Token (client credentials flow)
 * 
 * POST /api/tesla/register?region=eu
 * Body: { "domain": "yourdomain.com" }
 */

const REGIONAL_ENDPOINTS = {
    na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
    cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
};

const TESLA_CLIENT_ID = process.env.TESLA_CLIENT_ID!;
const TESLA_CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET!;

async function getPartnerToken(audience: string): Promise<string> {
    const response = await fetch('https://auth.tesla.com/oauth2/v3/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: TESLA_CLIENT_ID,
            client_secret: TESLA_CLIENT_SECRET,
            scope: 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds',
            audience: audience,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error_description || `Failed to get partner token: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
}

export async function POST(request: NextRequest) {
    const region = request.nextUrl.searchParams.get('region') || 'eu';

    if (!TESLA_CLIENT_ID || !TESLA_CLIENT_SECRET) {
        return NextResponse.json(
            { error: 'Tesla Client ID and Secret must be configured in .env.local' },
            { status: 500 }
        );
    }

    const baseUrl = REGIONAL_ENDPOINTS[region as keyof typeof REGIONAL_ENDPOINTS];
    if (!baseUrl) {
        return NextResponse.json(
            { error: 'Invalid region. Use: na, eu, or cn' },
            { status: 400 }
        );
    }

    // Get domain from request body
    let domain = '';
    try {
        const body = await request.json();
        if (body.domain) {
            domain = body.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
        }
    } catch {
        // No body provided
    }

    if (!domain) {
        return NextResponse.json(
            { error: 'Domain is required. Send { "domain": "yourdomain.com" } in request body.' },
            { status: 400 }
        );
    }

    try {
        console.log('Getting partner token...');
        const partnerToken = await getPartnerToken(baseUrl);
        console.log('Partner token obtained');

        console.log(`Registering domain: ${domain}`);
        const response = await fetch(`${baseUrl}/api/1/partner_accounts`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${partnerToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ domain }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Registration failed:', data);
            return NextResponse.json({
                success: false,
                error: data.error || `Registration failed: ${response.status}`,
                details: data,
            }, { status: response.status });
        }

        return NextResponse.json({
            success: true,
            message: `Successfully registered "${domain}" with Tesla Fleet API in ${region.toUpperCase()} region!`,
            data,
        });
    } catch (err) {
        console.error('Registration error:', err);
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Registration failed',
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'Tesla Fleet API Partner Registration',
        usage: 'POST /api/tesla/register?region=eu with body { "domain": "yourdomain.com" }',
        regions: ['na', 'eu', 'cn'],
    });
}
