import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

export async function GET() {
    const supabase = createAdminClient()

    const { data: settings, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', 'default')
        .single()

    if (error && error.code === 'PGRST116') {
        return NextResponse.json({ success: true, settings: null })
    }

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
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
        }
    })
}

export async function POST(request: NextRequest) {
    const supabase = createAdminClient()

    try {
        const body = await request.json()
        const { pollingConfig, region, units, currency, dateFormat, notifications, dataSource } = body

        const { error } = await supabase
            .from('app_settings')
            .upsert({
                id: 'default',
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
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'id'
            })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Settings save error:', err)
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
