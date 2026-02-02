
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
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
