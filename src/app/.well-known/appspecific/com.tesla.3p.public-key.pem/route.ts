import { NextResponse } from 'next/server';

function readTeslaPublicKeyPem() {
    const value = process.env.TESLA_PUBLIC_KEY_PEM?.trim();

    if (!value) {
        return null;
    }

    return value.replace(/\\n/g, '\n');
}

export async function GET() {
    const publicKeyPem = readTeslaPublicKeyPem();

    if (!publicKeyPem) {
        return NextResponse.json(
            {
                error: 'TESLA_PUBLIC_KEY_PEM is not configured',
            },
            { status: 404 }
        );
    }

    return new NextResponse(publicKeyPem, {
        status: 200,
        headers: {
            'Content-Type': 'application/x-pem-file',
            'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
        },
    });
}
