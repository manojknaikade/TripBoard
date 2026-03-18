import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { getHomeLocationSnapshot } from '@/lib/settings/appSettings';
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser().catch(() => null);
    void request;
    if (!user) {
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
    const user = await getAuthenticatedUser().catch(() => null);
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = await createClient()

    try {
        const { latitude, longitude, address } = await request.json()

        if (latitude === null || longitude === null) {
            return NextResponse.json({ error: 'Latitude and longitude required' }, { status: 400 })
        }

        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
                home_latitude: latitude,
                home_longitude: longitude,
                home_address: address,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
