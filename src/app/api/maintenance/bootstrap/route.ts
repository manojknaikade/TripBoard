import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTeslaSession } from '@/lib/tesla/auth-server';

export const dynamic = 'force-dynamic';

const HISTORY_PAGE_SIZE_DEFAULT = 20;
const MILES_TO_KM = 1.60934;

type MaintenanceSummaryRow = {
    total_records: number;
    tyre_records: number;
    other_records: number;
    latest_logged_odometer_km: number | null;
};

type MaintenanceSummaryFallbackRow = {
    odometer_km: number | null;
};

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const limitParam = Number(request.nextUrl.searchParams.get('limit') || '');
    const historyLimit = Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.trunc(limitParam), 100)
        : HISTORY_PAGE_SIZE_DEFAULT;

    try {
        const supabase = await createClient();

        const [
            linkedRecordsResult,
            historyRecordsResult,
            tyreSetsResult,
            summaryRpcResult,
            vehicleStatusResult,
        ] = await Promise.all([
            supabase
                .from('maintenance_records')
                .select('*')
                .in('service_type', ['tyre_season', 'tyre_rotation'])
                .order('start_date', { ascending: false })
                .order('created_at', { ascending: false }),
            supabase
                .from('maintenance_records')
                .select('*')
                .order('start_date', { ascending: false })
                .order('created_at', { ascending: false })
                .range(0, historyLimit - 1),
            supabase
                .from('tyre_sets')
                .select('*')
                .order('created_at', { ascending: false }),
            supabase
                .rpc('get_maintenance_summary', {
                    p_from_date: null,
                    p_to_date: null,
                }),
            supabase
                .from('vehicle_status')
                .select('odometer')
                .order('updated_at', { ascending: false })
                .limit(1),
        ]);

        if (linkedRecordsResult.error) {
            return NextResponse.json({ error: linkedRecordsResult.error.message }, { status: 500 });
        }

        if (historyRecordsResult.error) {
            return NextResponse.json({ error: historyRecordsResult.error.message }, { status: 500 });
        }

        if (tyreSetsResult.error) {
            return NextResponse.json({ error: tyreSetsResult.error.message }, { status: 500 });
        }

        if (vehicleStatusResult.error) {
            return NextResponse.json({ error: vehicleStatusResult.error.message }, { status: 500 });
        }

        let summary = null as {
            totalRecords: number;
            tyreRecords: number;
            otherRecords: number;
            latestLoggedOdometerKm: number | null;
        } | null;

        if (summaryRpcResult.error) {
            console.warn('Maintenance bootstrap summary RPC unavailable, using query fallback:', summaryRpcResult.error.message);

            const [{ count: totalRecords, error: totalError }, { count: tyreRecords, error: tyreError }, { data: latestOdometerRows, error: latestOdometerError }] = await Promise.all([
                supabase
                    .from('maintenance_records')
                    .select('id', { count: 'exact', head: true }),
                supabase
                    .from('maintenance_records')
                    .select('id', { count: 'exact', head: true })
                    .in('service_type', ['tyre_season', 'tyre_rotation']),
                supabase
                    .from('maintenance_records')
                    .select('odometer_km')
                    .not('odometer_km', 'is', null)
                    .order('odometer_km', { ascending: false })
                    .limit(1),
            ]);

            if (totalError || tyreError || latestOdometerError) {
                const fallbackError = totalError || tyreError || latestOdometerError;
                return NextResponse.json({ error: fallbackError?.message || 'Failed to load maintenance summary' }, { status: 500 });
            }

            const totalCount = totalRecords || 0;
            const tyreCount = tyreRecords || 0;

            summary = {
                totalRecords: totalCount,
                tyreRecords: tyreCount,
                otherRecords: Math.max(0, totalCount - tyreCount),
                latestLoggedOdometerKm: (latestOdometerRows?.[0] as MaintenanceSummaryFallbackRow | undefined)?.odometer_km ?? null,
            };
        } else {
            const summaryRow = (summaryRpcResult.data?.[0] ?? null) as MaintenanceSummaryRow | null;
            const totalCount = summaryRow?.total_records || 0;
            const tyreCount = summaryRow?.tyre_records || 0;

            summary = {
                totalRecords: totalCount,
                tyreRecords: tyreCount,
                otherRecords: summaryRow?.other_records ?? Math.max(0, totalCount - tyreCount),
                latestLoggedOdometerKm: summaryRow?.latest_logged_odometer_km ?? null,
            };
        }

        const rawOdometer = vehicleStatusResult.data?.[0]?.odometer;
        const parsedOdometer = typeof rawOdometer === 'number'
            ? rawOdometer
            : typeof rawOdometer === 'string'
                ? Number(rawOdometer)
                : null;
        const convertedOdometer = parsedOdometer != null && Number.isFinite(parsedOdometer)
            ? Math.round(parsedOdometer * MILES_TO_KM)
            : null;
        const currentVehicleOdometerKm = convertedOdometer != null && summary?.latestLoggedOdometerKm != null
            ? Math.max(convertedOdometer, summary.latestLoggedOdometerKm)
            : (convertedOdometer ?? summary?.latestLoggedOdometerKm ?? null);

        return NextResponse.json({
            success: true,
            linkedRecords: linkedRecordsResult.data || [],
            historyRecords: historyRecordsResult.data || [],
            tyreSets: tyreSetsResult.data || [],
            summary,
            currentVehicleOdometerKm,
            hasMoreHistory: summary
                ? historyLimit < summary.totalRecords
                : (historyRecordsResult.data?.length || 0) === historyLimit,
            nextHistoryOffset: historyRecordsResult.data?.length || 0,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to load maintenance bootstrap data' },
            { status: 500 }
        );
    }
}
