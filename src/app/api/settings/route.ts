import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: settings, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (error && error.code === 'PGRST116') {
        // Return defaults if no settings exist yet
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
        }
    })
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json()
        const { pollingConfig, region, units, currency, dateFormat, notifications, dataSource } = body

        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
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
                onConflict: 'user_id'
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
