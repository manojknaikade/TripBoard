import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeslaSession } from '@/lib/tesla/auth-server';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const teslaSession = await getTeslaSession(request);

    if (!teslaSession) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    try {
        const supabase = createAdminClient();

        const { data: chargingSession, error } = await supabase
            .from('charging_sessions')
            .select('id, vehicle_id, start_time, end_time, start_battery_pct, end_battery_pct, energy_added_kwh, energy_delivered_kwh, charger_price_per_kwh, charge_rate_kw, latitude, longitude, location_name, charger_type, cost_estimate, cost_user_entered, currency, tesla_charge_event_id, is_complete')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('Fetch charging session error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!chargingSession) {
            return NextResponse.json({ error: 'Charging session not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, session: chargingSession });
    } catch (err) {
        console.error('API Error fetching session:', err);
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
