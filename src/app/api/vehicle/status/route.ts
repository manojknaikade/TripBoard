import { createAdminClient } from '@/lib/supabase/admin'
import { getTeslaSession } from '@/lib/tesla/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request)
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('vehicle_status')
        .select('*')
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If no data yet (brand new car setup), return empty object or sensible default
    if (!data) {
        return NextResponse.json({ status: "waiting_for_telemetry" })
    }

    return NextResponse.json(data)
}
