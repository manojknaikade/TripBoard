import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { getAppSettingsSnapshot } from '@/lib/settings/appSettings';
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser().catch(() => null);
    void request;

    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const settings = await getAppSettingsSnapshot();
        return NextResponse.json({
            success: true,
            settings,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to load settings' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser().catch(() => null);

    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json()
        const { pollingConfig, minimumTripDistanceMiles, region, units, currency, dateFormat, notifications, dataSource, mapStyle } = body
        const normalizedMinimumTripDistanceMiles = Number.isFinite(Number(minimumTripDistanceMiles))
            ? Math.max(0, Number(minimumTripDistanceMiles))
            : 0.3;

        const supabase = await createClient();

        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
                polling_driving: pollingConfig?.driving,
                polling_charging: pollingConfig?.charging,
                polling_parked: pollingConfig?.parked,
                polling_sleeping: pollingConfig?.sleeping,
                minimum_trip_distance_miles: normalizedMinimumTripDistanceMiles,
                region,
                units,
                currency,
                date_format: dateFormat,
                notifications_enabled: notifications,
                data_source: dataSource,
                map_style: mapStyle,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Settings save error:', err)
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
