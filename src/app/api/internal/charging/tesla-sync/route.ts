import { NextRequest, NextResponse } from 'next/server';
import { processPendingTeslaChargingSyncJobs } from '@/lib/charging/teslaQueueProcessor';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest) {
    const configuredSecret = process.env.CHARGING_SYNC_SECRET || process.env.CRON_SECRET;

    if (!configuredSecret) {
        return process.env.NODE_ENV !== 'production';
    }

    const authorization = request.headers.get('authorization');
    if (authorization === `Bearer ${configuredSecret}`) {
        return true;
    }

    return request.headers.get('x-charging-sync-secret') === configuredSecret;
}

function parseLimit(request: NextRequest) {
    const rawLimit = request.nextUrl.searchParams.get('limit');
    const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : 10;

    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
        return 10;
    }

    return Math.min(parsedLimit, 50);
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const summary = await processPendingTeslaChargingSyncJobs(parseLimit(request));

        return NextResponse.json({
            success: true,
            ...summary,
            processedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Tesla charging sync processor failed:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Tesla charging sync failed',
            },
            { status: 500 },
        );
    }
}
