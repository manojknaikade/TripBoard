
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = createClient()

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
