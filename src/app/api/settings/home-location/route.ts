import { createAdminClient } from '@/lib/supabase/admin'
import { getHomeLocationSnapshot } from '@/lib/settings/appSettings';
import { getTeslaSession } from '@/lib/tesla/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request)
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    try {
        const homeLocation = await getHomeLocationSnapshot();
        return NextResponse.json({
            success: true,
            homeLocation,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to load home location' },
            { status: 500 }
        );
    }
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
