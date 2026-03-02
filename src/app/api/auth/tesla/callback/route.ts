import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TESLA_TOKEN_URL = 'https://auth.tesla.com/oauth2/v3/token';
const TESLA_CLIENT_ID = process.env.TESLA_CLIENT_ID!;
const TESLA_CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET!;
const REDIRECT_URI = process.env.NEXT_PUBLIC_TESLA_REDIRECT_URI!;

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for errors from Tesla
    if (error) {
        return NextResponse.redirect(
            new URL(`/auth/login?error=${encodeURIComponent(error)}`, request.url)
        );
    }

    // Verify state
    const storedState = request.cookies.get('tesla_oauth_state')?.value;
    const codeVerifier = request.cookies.get('tesla_code_verifier')?.value;

    if (!code || !state || !storedState || state !== storedState) {
        return NextResponse.redirect(
            new URL('/auth/login?error=Invalid OAuth state', request.url)
        );
    }

    if (!codeVerifier) {
        return NextResponse.redirect(
            new URL('/auth/login?error=Missing code verifier', request.url)
        );
    }

    try {
        // Exchange code for tokens
        const tokenResponse = await fetch(TESLA_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: TESLA_CLIENT_ID,
                client_secret: TESLA_CLIENT_SECRET,
                code,
                redirect_uri: REDIRECT_URI,
                code_verifier: codeVerifier,
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json().catch(() => ({}));
            console.error('Tesla token error:', errorData);
            return NextResponse.redirect(
                new URL(`/auth/login?error=${encodeURIComponent(errorData.error_description || 'Token exchange failed')}`, request.url)
            );
        }

        const tokens = await tokenResponse.json();

        // Get Supabase client and check if user is logged in
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            // User is logged in, store tokens in database
            // TODO: Encrypt tokens before storing
            console.log('Tesla tokens received for user:', user.id);

            // Fetch vehicles to get vehicle IDs
            const vehiclesResponse = await fetch('https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/vehicles', {
                headers: {
                    Authorization: `Bearer ${tokens.access_token}`,
                },
            });

            if (vehiclesResponse.ok) {
                const vehiclesData = await vehiclesResponse.json();
                console.log('Vehicles found:', vehiclesData.response?.length || 0);
            }
        }

        // Store tokens temporarily in session storage via URL hash
        // In production, store encrypted in database
        const response = NextResponse.redirect(
            new URL(`/dashboard?tesla_connected=true`, request.url)
        );

        // Clear OAuth cookies
        response.cookies.delete('tesla_oauth_state');
        response.cookies.delete('tesla_code_verifier');

        // Set token cookies (temporary - in production use encrypted DB storage)
        response.cookies.set('tesla_access_token', tokens.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60, // Extend session to 30 days in the browser
        });

        if (tokens.refresh_token) {
            response.cookies.set('tesla_refresh_token', tokens.refresh_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 30 * 24 * 60 * 60, // 30 days
            });
        }

        return response;
    } catch (err) {
        console.error('Tesla OAuth error:', err);
        return NextResponse.redirect(
            new URL('/auth/login?error=OAuth failed', request.url)
        );
    }
}
