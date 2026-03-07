import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;

    if (!accessToken) {
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

        const { data: session, error } = await supabase
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

        return NextResponse.json({ success: true, session });
    } catch (err) {
        console.error('API Error in cost update:', err);
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
