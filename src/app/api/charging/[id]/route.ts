import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeslaSession } from '@/lib/tesla/auth-server';
import { buildTeslaDeliveredEnergyUpdate } from '@/lib/charging/teslaHistory';

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
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('Fetch charging session error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!chargingSession) {
            return NextResponse.json({ error: 'Charging session not found' }, { status: 404 });
        }

        const isSupercharger =
            typeof chargingSession.charger_type === 'string' &&
            chargingSession.charger_type.toLowerCase().includes('supercharger');
        const shouldSyncDeliveredEnergy =
            isSupercharger &&
            chargingSession.is_complete === true &&
            chargingSession.energy_delivered_kwh == null;

        if (shouldSyncDeliveredEnergy) {
            try {
                const update = await buildTeslaDeliveredEnergyUpdate({
                    accessToken: teslaSession.accessToken,
                    region: teslaSession.region,
                    session: chargingSession,
                });

                if (update) {
                    const { data: updatedSession, error: updateError } = await supabase
                        .from('charging_sessions')
                        .update({
                            energy_delivered_kwh: update.energyDeliveredKwh,
                            tesla_charge_event_id: update.teslaChargeEventId,
                            charger_price_per_kwh: update.chargerPricePerKwh,
                            cost_estimate: chargingSession.cost_estimate ?? update.costUserEntered,
                        })
                        .eq('id', id)
                        .select('*')
                        .maybeSingle();

                    if (!updateError && updatedSession) {
                        return NextResponse.json({ success: true, session: updatedSession });
                    }
                }
            } catch (syncError) {
                console.warn('Tesla charging history sync failed:', syncError);
            }
        }

        return NextResponse.json({ success: true, session: chargingSession });
    } catch (err) {
        console.error('API Error fetching session:', err);
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
