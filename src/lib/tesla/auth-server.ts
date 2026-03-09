import { NextRequest, NextResponse } from 'next/server';

const TESLA_TOKEN_URL = 'https://auth.tesla.com/oauth2/v3/token';
const TESLA_CLIENT_ID = process.env.TESLA_CLIENT_ID!;
const TESLA_CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET!;

export async function refreshTeslaTokenRaw(refreshToken: string) {
    if (!TESLA_CLIENT_ID) {
        throw new Error('TESLA_CLIENT_ID is not configured');
    }

    try {
        const response = await fetch(TESLA_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: TESLA_CLIENT_ID,
                client_secret: TESLA_CLIENT_SECRET,
                refresh_token: refreshToken,
            }),
        });

        if (!response.ok) {
            console.error('Tesla Auth: Refresh failed', await response.text());
            return null;
        }

        return await response.json();
    } catch (e) {
        console.error('Tesla Auth: Refresh error', e);
        return null;
    }
}

export async function handleTeslaTokenRefresh(request: NextRequest, response: NextResponse) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;
    const refreshToken = request.cookies.get('tesla_refresh_token')?.value;

    if (!accessToken || !refreshToken) return response;

    try {
        // Simple JWT decode to check expiry
        const payloadBase64 = accessToken.split('.')[1];
        if (!payloadBase64) return response;

        const payloadJson = Buffer.from(payloadBase64, 'base64').toString();
        const payload = JSON.parse(payloadJson);
        const expiry = (payload.exp || 0) * 1000;
        const now = Date.now();

        // Refresh if expires in less than 30 minutes
        if (expiry - now < 30 * 60 * 1000) {
            console.log('Tesla token expiring soon, refreshing in middleware...');
            const data = await refreshTeslaTokenRaw(refreshToken);

            if (data?.access_token) {
                const isLocalhost = request.nextUrl.hostname === 'localhost';
                const isSecure = process.env.NODE_ENV === 'production' && !isLocalhost;

                const cookieOptions = {
                    httpOnly: true,
                    secure: isSecure,
                    sameSite: 'lax' as const,
                    maxAge: 30 * 24 * 60 * 60, // 30 days
                };

                response.cookies.set('tesla_access_token', data.access_token, cookieOptions);
                if (data.refresh_token) {
                    response.cookies.set('tesla_refresh_token', data.refresh_token, cookieOptions);
                }
            }
        }
    } catch (e) {
        console.error('Tesla token refresh check failed:', e);
    }

    return response;
}

/**
 * For use in Server Components / Route Handlers
 */
export async function getValidTeslaToken() {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('tesla_access_token')?.value;
    const refreshToken = cookieStore.get('tesla_refresh_token')?.value;

    if (!accessToken) return null;

    // Basic check: is the token expired?
    // Tesla tokens are JWTs. We can check the 'exp' claim.
    try {
        const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
        const expiry = (payload.exp || 0) * 1000; // to ms
        const now = Date.now();

        // If it expires in less than 5 minutes, refresh it
        if (expiry - now < 5 * 60 * 1000) {
            if (refreshToken) {
                const data = await refreshTeslaTokenRaw(refreshToken);
                return data?.access_token || accessToken;
            }
        }
    } catch (e) {
        console.error('Failed to parse Tesla token:', e);
    }

    return accessToken;
}
