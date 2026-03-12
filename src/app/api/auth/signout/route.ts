import { NextRequest, NextResponse } from 'next/server';
import { clearTeslaSession } from '@/lib/tesla/auth-server';

export async function POST(request: NextRequest) {
    const response = NextResponse.json({ success: true, message: 'Signed out' });
    await clearTeslaSession(request, response);
    return response;
}

export async function GET(request: NextRequest) {
    const response = NextResponse.redirect(new URL('/', request.url));
    await clearTeslaSession(request, response);
    return response;
}
