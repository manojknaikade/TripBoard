import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const vehicleId = searchParams.get('vehicleId');

    const supabase = createAdminClient();

    let query = supabase
        .from('charging_sessions')
        .select('*')
        .order('start_time', { ascending: false })
        .range(offset, offset + limit - 1);

    if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
    }

    const { data: sessions, error, count } = await query;

    if (error) {
        console.error('Charging fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        sessions: sessions || [],
        total: count,
        limit,
        offset,
    });
}
