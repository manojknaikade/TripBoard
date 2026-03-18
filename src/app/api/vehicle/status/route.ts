import { createClient } from '@/lib/supabase/server'
import { getTeslaSession } from '@/lib/tesla/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request)
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = await createClient()
    const requestedFields = request.nextUrl.searchParams.get('fields')
    const selectClause = requestedFields === 'odometer'
        ? 'odometer'
        : requestedFields === 'map'
            ? 'lat, lon, speed, battery_level'
            : '*'

    const { data: rows, error } = await supabase
        .from('vehicle_status')
        .select(selectClause)
        .order('updated_at', { ascending: false })
        .limit(1)

    const data = rows?.[0];

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
        return NextResponse.json({ status: "waiting_for_telemetry" })
    }

    return NextResponse.json(data)
}
