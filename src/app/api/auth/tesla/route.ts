import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Tesla OAuth configuration
const TESLA_AUTH_URL = 'https://auth.tesla.com/oauth2/v3/authorize';
const TESLA_CLIENT_ID = process.env.TESLA_CLIENT_ID!;
const REDIRECT_URI = process.env.NEXT_PUBLIC_TESLA_REDIRECT_URI!;

// Required scopes for Fleet API
const SCOPES = [
    'openid',
    'offline_access',
    'user_data',
    'vehicle_device_data',
    'vehicle_location',
    'vehicle_cmds',
    'vehicle_charging_cmds',
].join(' ');

export async function GET(request: NextRequest) {
    // Generate state and code verifier for PKCE
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

    // Store state and code verifier in cookies for verification
    const authUrl = new URL(TESLA_AUTH_URL);
    authUrl.searchParams.set('client_id', TESLA_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    const response = NextResponse.redirect(authUrl.toString());

    // Set cookies for OAuth state verification
    response.cookies.set('tesla_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
    });

    response.cookies.set('tesla_code_verifier', codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
    });

    return response;
}
