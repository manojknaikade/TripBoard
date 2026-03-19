import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserId } from '@/lib/supabase/auth';
import { jsonWithMetrics, type RouteMetric } from '@/lib/server/responseMetrics';

export const dynamic = 'force-dynamic';

// GET - Fetch notifications
export async function GET(request: NextRequest) {
    const requestStartedAt = performance.now();
    const metrics: RouteMetric[] = [];

    const authStartedAt = performance.now();
    const userId = await getAuthenticatedUserId().catch(() => null);
    metrics.push({
        name: 'auth',
        durationMs: performance.now() - authStartedAt,
        description: 'Authenticated user lookup',
    });

    if (!userId) {
        metrics.push({
            name: 'total',
            durationMs: performance.now() - requestStartedAt,
            description: 'Total route time',
        });
        return jsonWithMetrics(
            { error: 'Not authenticated' },
            { status: 401 },
            {
                metrics,
                headers: {
                    'X-TripBoard-Notifications-Mode': 'auth-missing',
                },
            }
        );
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const countOnly = searchParams.get('count_only') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    const supabase = await createClient();

    const unreadCountStartedAt = performance.now();
    const unreadCountPromise = supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);

    if (countOnly) {
        const { count, error } = await unreadCountPromise;
        metrics.push({
            name: 'count_query',
            durationMs: performance.now() - unreadCountStartedAt,
            description: 'Unread notifications count query',
        });

        if (error) {
            metrics.push({
                name: 'total',
                durationMs: performance.now() - requestStartedAt,
                description: 'Total route time',
            });
            return jsonWithMetrics(
                { error: error.message },
                { status: 500 },
                {
                    metrics,
                    headers: {
                        'X-TripBoard-Notifications-Mode': 'count_only',
                    },
                }
            );
        }

        const responseBody = {
            success: true,
            notifications: [],
            unread_count: count || 0,
        };
        metrics.push({
            name: 'total',
            durationMs: performance.now() - requestStartedAt,
            description: 'Total route time',
        });
        return jsonWithMetrics(
            responseBody,
            undefined,
            {
                metrics,
                headers: {
                    'X-TripBoard-Notifications-Mode': 'count_only',
                },
            }
        );
    }

    let query = supabase
        .from('notifications')
        .select('id, type, title, message, data, is_read, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (unreadOnly) {
        query = query.eq('is_read', false);
    }

    const queriesStartedAt = performance.now();
    const [
        { data: notifications, error },
        { count },
    ] = await Promise.all([
        query,
        unreadCountPromise,
    ]);
    metrics.push({
        name: 'queries',
        durationMs: performance.now() - queriesStartedAt,
        description: 'Notification list + unread count queries',
    });

    if (error) {
        console.error('Notifications fetch error:', error);
        metrics.push({
            name: 'total',
            durationMs: performance.now() - requestStartedAt,
            description: 'Total route time',
        });
        return jsonWithMetrics(
            { error: error.message },
            { status: 500 },
            {
                metrics,
                headers: {
                    'X-TripBoard-Notifications-Mode': unreadOnly ? 'unread_only' : 'all',
                },
            }
        );
    }

    const responseBody = {
        success: true,
        notifications: notifications || [],
        unread_count: count || 0,
    };
    metrics.push({
        name: 'total',
        durationMs: performance.now() - requestStartedAt,
        description: 'Total route time',
    });
    return jsonWithMetrics(
        responseBody,
        undefined,
        {
            metrics,
            headers: {
                'X-TripBoard-Notifications-Mode': unreadOnly ? 'unread_only' : 'all',
            },
        }
    );
}

// PATCH - Mark notifications as read
export async function PATCH(request: NextRequest) {
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { ids, mark_all } = body;

        const supabase = await createClient();

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
