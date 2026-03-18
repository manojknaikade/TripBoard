import { createClient } from '@/lib/supabase/server'
import { getTeslaSession } from '@/lib/tesla/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request)
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = await createClient()

    // Order by most recent trip first
    const { data, error } = await supabase
        .from('trips')
        .select('*')
        .order('start_time', { ascending: false })
        .limit(50)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
}
