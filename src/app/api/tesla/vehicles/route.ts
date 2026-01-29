import { NextRequest, NextResponse } from 'next/server';

// Tesla Fleet API regional endpoints
const REGIONAL_ENDPOINTS = {
    na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
    cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
};

export async function POST(request: NextRequest) {
    try {
        const { accessToken, region = 'na' } = await request.json();

        if (!accessToken) {
            return NextResponse.json(
                { error: 'Access token is required' },
                { status: 400 }
            );
        }

        const baseUrl = REGIONAL_ENDPOINTS[region as keyof typeof REGIONAL_ENDPOINTS] || REGIONAL_ENDPOINTS.na;

        const response = await fetch(`${baseUrl}/api/1/vehicles`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json(
                { error: errorData.error || 'Failed to fetch vehicles' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Tesla API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    // For authenticated users, get token from session
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json(
            { error: 'Authorization required' },
            { status: 401 }
        );
    }

    const accessToken = authHeader.substring(7);
    const region = request.nextUrl.searchParams.get('region') || 'na';
    const baseUrl = REGIONAL_ENDPOINTS[region as keyof typeof REGIONAL_ENDPOINTS] || REGIONAL_ENDPOINTS.na;

    try {
        const response = await fetch(`${baseUrl}/api/1/vehicles`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: 'Failed to fetch vehicles' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Tesla API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
