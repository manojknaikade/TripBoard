import { NextRequest, NextResponse } from 'next/server';

// OpenStreetMap Nominatim API for reverse geocoding (free, no API key needed)
const NOMINATIM_API = 'https://nominatim.openstreetmap.org/reverse';
const GEOCODE_REVALIDATE_SECONDS = 60 * 60 * 24;

function normalizeCountryName(country: string | undefined): string | null {
    if (!country) return null;

    const normalized = country
        .split('/')
        .map((part) => part.trim())
        .find(Boolean);

    return normalized || null;
}

function normalizeCoordinate(value: string): string {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
        return value;
    }

    return parsed.toFixed(5);
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');

    if (!lat || !lng) {
        return NextResponse.json(
            { success: false, error: 'Missing lat or lng parameter' },
            { status: 400 }
        );
    }

    try {
        const normalizedLat = normalizeCoordinate(lat);
        const normalizedLng = normalizeCoordinate(lng);

        // Call Nominatim API
        const response = await fetch(
            `${NOMINATIM_API}?format=json&lat=${normalizedLat}&lon=${normalizedLng}&zoom=18&addressdetails=1`,
            {
                headers: {
                    'User-Agent': 'TripBoard/1.0', // Required by Nominatim
                },
                next: { revalidate: GEOCODE_REVALIDATE_SECONDS },
            }
        );

        if (!response.ok) {
            throw new Error(`Nominatim API error: ${response.status}`);
        }

        const data = await response.json();

        // Extract a nicely formatted address
        const address = data.address || {};
        const parts = [];

        // Add street info if available
        if (address.road) {
            if (address.house_number) {
                parts.push(`${address.road} ${address.house_number}`);
            } else {
                parts.push(address.road);
            }
        }

        // Add city/town
        const city = address.city || address.town || address.village || address.hamlet;
        if (city) parts.push(city);

        // Nominatim can return multilingual country names like
        // "Schweiz/Suisse/Svizzera/Svizra". Keep a single label.
        const country = normalizeCountryName(address.country);
        if (country) parts.push(country);

        const formattedAddress = parts.length > 0
            ? parts.join(', ')
            : data.display_name || `${lat}, ${lng}`;

        return NextResponse.json(
            {
                success: true,
                address: formattedAddress,
                raw: data.address,
            },
            {
                headers: {
                    'Cache-Control': `public, max-age=${GEOCODE_REVALIDATE_SECONDS}, stale-while-revalidate=${GEOCODE_REVALIDATE_SECONDS * 7}`,
                },
            }
        );
    } catch (error) {
        console.error('Geocoding error:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to geocode location',
                fallback: `${lat}, ${lng}`,
            },
            { status: 500 }
        );
    }
}
