import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createClient()

    // Get home location from vehicle_status
    const { data, error } = await supabase
        .from('vehicle_status')
        .select('home_latitude, home_longitude, home_address')
        .ilike('vin', 'vehicle_device.%')
        .limit(1)
        .single()

    if (error && error.code !== 'PGRST116') {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
        success: true,
        homeLocation: {
            latitude: data?.home_latitude || null,
            longitude: data?.home_longitude || null,
            address: data?.home_address || '',
        }
    })
}

export async function POST(request: NextRequest) {
    const supabase = await createClient()

    try {
        const { latitude, longitude, address } = await request.json()

        if (latitude === null || longitude === null) {
            return NextResponse.json({ error: 'Latitude and longitude required' }, { status: 400 })
        }

        // Update home location in vehicle_status
        const { error } = await supabase
            .from('vehicle_status')
            .update({
                home_latitude: latitude,
                home_longitude: longitude,
                home_address: address
            })
            .ilike('vin', 'vehicle_device.%')

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
