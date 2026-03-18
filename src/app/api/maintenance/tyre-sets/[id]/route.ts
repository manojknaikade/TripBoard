import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTeslaSession } from '@/lib/tesla/auth-server';

export const dynamic = 'force-dynamic';

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await context.params;

    if (!id) {
        return NextResponse.json({ error: 'Tyre set id is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
        .from('tyre_sets')
        .delete()
        .eq('id', id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
