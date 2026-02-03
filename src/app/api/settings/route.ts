import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user settings
    const { data: settings, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single()

    // If no settings exist, return defaults
    if (error && error.code === 'PGRST116') {
        return NextResponse.json({
            success: true,
            settings: null // Client will use defaults
        })
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
            notifications: settings.notifications_enabled,
            dataSource: settings.data_source,
        }
    })
}

export async function POST(request: NextRequest) {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { pollingConfig, region, units, notifications, dataSource } = body

        // Upsert user settings
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
                notifications_enabled: notifications,
                data_source: dataSource,
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
