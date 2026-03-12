import { createAdminClient } from '@/lib/supabase/admin'
import { getTeslaSession } from '@/lib/tesla/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request)
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('app_settings')
        .select('home_latitude, home_longitude, home_address')
        .eq('id', 'default')
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
    const session = await getTeslaSession(request)
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = createAdminClient()

    try {
        const { latitude, longitude, address } = await request.json()

        if (latitude === null || longitude === null) {
            return NextResponse.json({ error: 'Latitude and longitude required' }, { status: 400 })
        }

        const { error } = await supabase
            .from('app_settings')
            .update({
                home_latitude: latitude,
                home_longitude: longitude,
                home_address: address,
                updated_at: new Date().toISOString(),
            })
            .eq('id', 'default')

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
