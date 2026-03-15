import { createAdminClient } from '@/lib/supabase/admin'
import { getTeslaSession } from '@/lib/tesla/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: settings, error } = await supabase
        .from('app_settings')
        .select('polling_driving, polling_charging, polling_parked, polling_sleeping, region, units, currency, date_format, notifications_enabled, data_source, map_style')
        .eq('id', 'default')
        .single();

    if (error && error.code === 'PGRST116') {
        return NextResponse.json({
            success: true,
            settings: {
                pollingConfig: {
                    driving: 30,
                    charging: 300,
                    parked: 1800,
                    sleeping: 3600,
                },
                region: 'eu',
                units: 'imperial',
                currency: 'CHF',
                dateFormat: 'DD/MM',
                notifications: true,
                dataSource: 'polling',
                mapStyle: 'streets',
            }
        });
    }

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        settings: {
            pollingConfig: {
                driving: settings.polling_driving,
                charging: settings.polling_charging,
                parked: settings.polling_parked,
                sleeping: settings.polling_sleeping,
            },
            region: settings.region,
            units: settings.units,
            currency: settings.currency || 'CHF',
            dateFormat: settings.date_format || 'DD/MM',
            notifications: settings.notifications_enabled,
            dataSource: settings.data_source,
            mapStyle: settings.map_style || 'streets',
        }
    })
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
