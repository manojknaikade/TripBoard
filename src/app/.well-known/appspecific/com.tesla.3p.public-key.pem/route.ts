import { NextResponse } from 'next/server';

// Tesla Fleet API requires this public key at a well-known path for partner registration
// This is an EC P-256 public key

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEzKM6gW/zk05MclkZVlrS8yj+NIfU
rgm5yi50vRwo3nAS63se5/ybImCCJ/oU5B2Et77uy6/fHRrSQhRL+hYK1g==
-----END PUBLIC KEY-----`;

export async function GET() {
    return new NextResponse(PUBLIC_KEY, {
        status: 200,
        headers: {
            'Content-Type': 'application/x-pem-file',
        },
    });
}
