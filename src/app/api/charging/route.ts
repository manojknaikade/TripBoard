import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeslaSession } from '@/lib/tesla/auth-server';
import { buildTeslaDeliveredEnergyUpdate } from '@/lib/charging/teslaHistory';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const teslaSession = await getTeslaSession(request);

    if (!teslaSession) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const vehicleId = searchParams.get('vehicleId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const supabase = createAdminClient();

    let query = supabase
        .from('charging_sessions')
        .select('*')
        .order('start_time', { ascending: false });

    if (from) {
        query = query.gte('start_time', from);
    }
    if (to) {
        query = query.lte('start_time', to);
    }
    if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
    }

    // Only apply pagination if no date range is provided
    if (!from && !to) {
        query = query.range(offset, offset + limit - 1);
    }

    const { data: sessions, error, count } = await query;

    if (error) {
        console.error('Charging fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = sessions || [];
    const syncCandidate = items.find((item) =>
        item.is_complete === true &&
        typeof item.charger_type === 'string' &&
        item.charger_type.toLowerCase().includes('supercharger') &&
        item.energy_delivered_kwh == null
    );

    if (syncCandidate) {
        try {
            const update = await buildTeslaDeliveredEnergyUpdate({
                accessToken: teslaSession.accessToken,
                region: teslaSession.region,
                session: syncCandidate,
            });

            if (update) {
                const { data: updatedSession } = await supabase
                    .from('charging_sessions')
                    .update({
                        energy_delivered_kwh: update.energyDeliveredKwh,
                        tesla_charge_event_id: update.teslaChargeEventId,
                        charger_price_per_kwh: update.chargerPricePerKwh,
                        cost_estimate: syncCandidate.cost_estimate ?? update.costUserEntered,
                    })
                    .eq('id', syncCandidate.id)
                    .select('*')
                    .maybeSingle();

                if (updatedSession) {
                    const index = items.findIndex((item) => item.id === updatedSession.id);
                    if (index >= 0) {
                        items[index] = updatedSession;
                    }
                }
            }
        } catch (syncError) {
            console.warn('Charging list Tesla sync failed:', syncError);
        }
    }

    return NextResponse.json({
        success: true,
        sessions: items,
        total: count,
        limit,
        offset,
    });
}
