import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeslaSession } from '@/lib/tesla/auth-server';
import { canUseManualChargingCost } from '@/lib/charging/energy';

export const dynamic = 'force-dynamic';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const { cost, currency } = body;

        const supabase = createAdminClient();

        const { data: existingSession, error: fetchError } = await supabase
            .from('charging_sessions')
            .select('id, charger_type, cost_estimate, cost_user_entered, is_complete, tesla_charge_event_id')
            .eq('id', id)
            .maybeSingle();

        if (fetchError) {
            console.error('Charging session lookup error:', fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!existingSession) {
            return NextResponse.json({ error: 'Charging session not found' }, { status: 404 });
        }

        if (!canUseManualChargingCost(existingSession)) {
            return NextResponse.json(
                { error: 'Manual cost is disabled when Tesla billing data is available.' },
                { status: 409 }
            );
        }

        const { data: updatedSession, error } = await supabase
            .from('charging_sessions')
            .update({
                cost_user_entered: cost,
                currency: currency || 'CHF'
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Charging cost update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, session: updatedSession });
    } catch (err) {
        console.error('API Error in cost update:', err);
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
