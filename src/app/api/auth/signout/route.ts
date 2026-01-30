import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    const response = NextResponse.json({ success: true, message: 'Signed out' });

    // Clear all Tesla-related cookies
    response.cookies.delete('tesla_access_token');
    response.cookies.delete('tesla_refresh_token');
    response.cookies.delete('tesla_token_expires_at');
    response.cookies.delete('user_id');

    return response;
}

export async function GET(request: NextRequest) {
    // Also support GET for easy browser redirect
    const response = NextResponse.redirect(new URL('/', request.url));

    response.cookies.delete('tesla_access_token');
    response.cookies.delete('tesla_refresh_token');
    response.cookies.delete('tesla_token_expires_at');
    response.cookies.delete('user_id');

    return response;
}
