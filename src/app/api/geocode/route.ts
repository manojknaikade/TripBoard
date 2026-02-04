import { NextRequest, NextResponse } from 'next/server';

// OpenStreetMap Nominatim API for reverse geocoding (free, no API key needed)
const NOMINATIM_API = 'https://nominatim.openstreetmap.org/reverse';

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
        // Call Nominatim API
        const response = await fetch(
            `${NOMINATIM_API}?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
                headers: {
                    'User-Agent': 'TripBoard/1.0', // Required by Nominatim
                },
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

        // Add country
        if (address.country) parts.push(address.country);

        const formattedAddress = parts.length > 0
            ? parts.join(', ')
            : data.display_name || `${lat}, ${lng}`;

        return NextResponse.json({
            success: true,
            address: formattedAddress,
            raw: data.address,
        });
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
