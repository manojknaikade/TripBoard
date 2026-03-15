import { NextRequest, NextResponse } from 'next/server';
import { discoverTeslaVehicles } from '@/lib/tesla/api';
import { setTeslaSession } from '@/lib/tesla/auth-server';
import { createClient } from '@/lib/supabase/server';

const TESLA_TOKEN_URL = 'https://auth.tesla.com/oauth2/v3/token';
const TESLA_CLIENT_ID = process.env.TESLA_CLIENT_ID!;
const TESLA_CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET!;
const REDIRECT_URI = process.env.NEXT_PUBLIC_TESLA_REDIRECT_URI!;

function getOauthFailureMessage(error: unknown) {
    if (!(error instanceof Error)) {
        return 'OAuth failed';
    }

    if (error.message.includes('TOKEN_ENCRYPTION_KEY')) {
        return 'Server misconfigured: TOKEN_ENCRYPTION_KEY is missing';
    }

    if (error.message.includes('tesla_sessions')) {
        return 'Server misconfigured: tesla_sessions table is missing';
    }

    return 'OAuth failed';
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.redirect(
            new URL(`/auth/login?error=${encodeURIComponent(error)}`, request.url)
        );
    }

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
                new URL(
                    `/auth/login?error=${encodeURIComponent(errorData.error_description || 'Token exchange failed')}`,
                    request.url
                )
            );
        }

        const tokens = await tokenResponse.json();
        const discovery = await discoverTeslaVehicles(tokens.access_token);

        if (!discovery.ok) {
            console.error('Tesla vehicle discovery failed after OAuth callback:', discovery.error);
            return NextResponse.redirect(
                new URL('/auth/login?error=Tesla account validation failed', request.url)
            );
        }

        const response = NextResponse.redirect(
            new URL('/dashboard?tesla_connected=true', request.url)
        );

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        response.cookies.delete('tesla_oauth_state');
        response.cookies.delete('tesla_code_verifier');

        await setTeslaSession(request, response, {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            region: discovery.region,
        }, {
            userId: user?.id ?? null,
        });

        return response;
    } catch (err) {
        console.error('Tesla OAuth error:', err);
        return NextResponse.redirect(
            new URL(
                `/auth/login?error=${encodeURIComponent(getOauthFailureMessage(err))}`,
                request.url
            )
        );
    }
}
