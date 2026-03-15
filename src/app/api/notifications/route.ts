import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeslaSession } from '@/lib/tesla/auth-server';

export const dynamic = 'force-dynamic';

// GET - Fetch notifications
export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const countOnly = searchParams.get('count_only') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    const supabase = createAdminClient();

    const unreadCountPromise = supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);

    if (countOnly) {
        const { count } = await unreadCountPromise;
        return NextResponse.json({
            success: true,
            notifications: [],
            unread_count: count || 0,
        });
    }

    let query = supabase
        .from('notifications')
        .select('id, type, title, message, data, is_read, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (unreadOnly) {
        query = query.eq('is_read', false);
    }

    const [
        { data: notifications, error },
        { count },
    ] = await Promise.all([
        query,
        unreadCountPromise,
    ]);

    if (error) {
        console.error('Notifications fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        notifications: notifications || [],
        unread_count: count || 0,
    });
}

// PATCH - Mark notifications as read
export async function PATCH(request: NextRequest) {
    const session = await getTeslaSession(request);
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { ids, mark_all } = body;

        const supabase = createAdminClient();

        if (mark_all) {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('is_read', false);

            if (error) throw error;
        } else if (ids && Array.isArray(ids) && ids.length > 0) {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .in('id', ids);

            if (error) throw error;
        } else {
            return NextResponse.json({ error: 'Provide ids array or mark_all: true' }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
