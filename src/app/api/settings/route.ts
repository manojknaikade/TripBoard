import { createAdminClient } from '@/lib/supabase/admin'
import { getAppSettingsSnapshot } from '@/lib/settings/appSettings';
import { getTeslaSession } from '@/lib/tesla/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
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
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json()
        const { pollingConfig, region, units, currency, dateFormat, notifications, dataSource, mapStyle } = body

        const supabase = createAdminClient();

        const { error } = await supabase
            .from('app_settings')
            .update({
                polling_driving: pollingConfig?.driving,
                polling_charging: pollingConfig?.charging,
                polling_parked: pollingConfig?.parked,
                polling_sleeping: pollingConfig?.sleeping,
                region,
                units,
                currency,
                date_format: dateFormat,
                notifications_enabled: notifications,
                data_source: dataSource,
                map_style: mapStyle,
                updated_at: new Date().toISOString(),
            })
            .eq('id', 'default')

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Settings save error:', err)
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
