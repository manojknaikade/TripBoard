import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeslaSession } from '@/lib/tesla/auth-server';

export const dynamic = 'force-dynamic';

export async function GET(
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
        const supabase = createAdminClient();

        const { data: session, error } = await supabase
            .from('charging_sessions')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Fetch charging session error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, session });
    } catch (err) {
        console.error('API Error fetching session:', err);
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
