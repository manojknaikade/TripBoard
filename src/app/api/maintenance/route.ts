import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { getTeslaSession } from '@/lib/tesla/auth-server';
import {
    ROTATION_STATUS_OPTIONS,
    SERVICE_TYPE_OPTIONS,
    TYRE_SEASON_OPTIONS,
    isTyreLinkedRecord,
    isTyreSeasonRecord,
    type MaintenanceServiceType,
    type RotationStatus,
    type TyreSeason,
} from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

type MaintenanceSummaryRow = {
    total_records: number;
    tyre_records: number;
    other_records: number;
    latest_logged_odometer_km: number | null;
};

type MaintenanceSummaryFallbackRow = {
    odometer_km: number | null;
};

const VALID_SERVICE_TYPES = new Set<MaintenanceServiceType>(
    SERVICE_TYPE_OPTIONS.map((option) => option.value)
);
const VALID_ROTATION_STATUSES = new Set<RotationStatus>(
    ROTATION_STATUS_OPTIONS.map((option) => option.value)
);
const VALID_TYRE_SEASONS = new Set<TyreSeason>(
    TYRE_SEASON_OPTIONS.map((option) => option.value)
);

function isValidDate(value: string | null | undefined) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limitParam = Number(searchParams.get('limit') || '');
    const offsetParam = Number(searchParams.get('offset') || '');
    const includeSummary = searchParams.get('includeSummary') === '1';
    const linkedOnly = searchParams.get('linked_only') === '1';
    const limit = Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.trunc(limitParam), 100)
        : null;
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0
        ? Math.trunc(offsetParam)
        : 0;

    const supabase = await createClient();
    let query = supabase
        .from('maintenance_records')
        .select('*')
        .order('start_date', { ascending: false })
        .order('created_at', { ascending: false });

    if (linkedOnly) {
        query = query.in('service_type', ['tyre_season', 'tyre_rotation']);
    }

    if (limit != null) {
        query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Maintenance fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let summary: {
        totalRecords: number;
        tyreRecords: number;
        otherRecords: number;
        latestLoggedOdometerKm: number | null;
    } | null = null;

    if (includeSummary) {
        const { data: summaryRows, error: summaryError } = await supabase
            .rpc('get_maintenance_summary', {
                p_from_date: null,
                p_to_date: null,
            });

        if (summaryError) {
            console.warn('Maintenance summary RPC unavailable, using query fallback:', summaryError.message);

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
                console.error('Maintenance summary fallback fetch error:', fallbackError);
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
            const summaryRow = (summaryRows?.[0] ?? null) as MaintenanceSummaryRow | null;
            const totalCount = summaryRow?.total_records || 0;
            const tyreCount = summaryRow?.tyre_records || 0;

            summary = {
                totalRecords: totalCount,
                tyreRecords: tyreCount,
                otherRecords: summaryRow?.other_records ?? Math.max(0, totalCount - tyreCount),
                latestLoggedOdometerKm: summaryRow?.latest_logged_odometer_km ?? null,
            };
        }
    }

    return NextResponse.json({
        success: true,
        records: data || [],
        hasMore: limit != null ? (data?.length || 0) === limit : false,
        nextOffset: limit != null ? offset + (data?.length || 0) : null,
        summary,
    });
}

export async function POST(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json();

        const serviceType = body.serviceType as MaintenanceServiceType;
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const startDate = body.startDate as string;
        const endDate = body.endDate as string | null | undefined;
        const notes = typeof body.notes === 'string' ? body.notes.trim() : null;
        const tyreSetId = typeof body.tyreSetId === 'string' && body.tyreSetId.trim()
            ? body.tyreSetId.trim()
            : null;
        const costAmount =
            body.costAmount === '' || body.costAmount == null
                ? null
                : Number(body.costAmount);
        const costCurrency = typeof body.costCurrency === 'string' && body.costCurrency.trim()
            ? body.costCurrency.trim()
            : null;
        const startOdometerKm =
            body.startOdometerKm === '' || body.startOdometerKm == null
                ? null
                : Number(body.startOdometerKm);
        const endOdometerKm =
            body.endOdometerKm === '' || body.endOdometerKm == null
                ? null
                : Number(body.endOdometerKm);
        const odometerKm =
            endOdometerKm ?? (
                body.odometerKm === '' || body.odometerKm == null
                    ? null
                    : Number(body.odometerKm)
            );
        const rotationStatus = (body.rotationStatus || 'not_applicable') as RotationStatus;
        const season = body.season ? (body.season as TyreSeason) : null;

        if (!VALID_SERVICE_TYPES.has(serviceType)) {
            return NextResponse.json({ error: 'Invalid service type' }, { status: 400 });
        }

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        if (!isValidDate(startDate)) {
            return NextResponse.json({ error: 'A valid start date is required' }, { status: 400 });
        }

        if (endDate && !isValidDate(endDate)) {
            return NextResponse.json({ error: 'End date must be a valid date' }, { status: 400 });
        }

        if (endDate && new Date(endDate).getTime() < new Date(startDate).getTime()) {
            return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
        }

        if (startOdometerKm != null && (!Number.isFinite(startOdometerKm) || startOdometerKm < 0)) {
            return NextResponse.json({ error: 'Start odometer must be a positive number' }, { status: 400 });
        }

        if (endOdometerKm != null && (!Number.isFinite(endOdometerKm) || endOdometerKm < 0)) {
            return NextResponse.json({ error: 'End odometer must be a positive number' }, { status: 400 });
        }

        if (odometerKm != null && (!Number.isFinite(odometerKm) || odometerKm < 0)) {
            return NextResponse.json({ error: 'Odometer must be a positive number' }, { status: 400 });
        }

        if (startOdometerKm != null && endOdometerKm != null && endOdometerKm < startOdometerKm) {
            return NextResponse.json({ error: 'End odometer must be greater than or equal to start odometer' }, { status: 400 });
        }

        if (costAmount != null && (!Number.isFinite(costAmount) || costAmount < 0)) {
            return NextResponse.json({ error: 'Cost must be a positive number' }, { status: 400 });
        }

        if (!VALID_ROTATION_STATUSES.has(rotationStatus)) {
            return NextResponse.json({ error: 'Invalid rotation status' }, { status: 400 });
        }

        if (season && !VALID_TYRE_SEASONS.has(season)) {
            return NextResponse.json({ error: 'Invalid tyre season' }, { status: 400 });
        }

        if (isTyreSeasonRecord(serviceType) && !season) {
            return NextResponse.json({ error: 'Tyre season is required for seasonal tyre records' }, { status: 400 });
        }

        if (isTyreLinkedRecord(serviceType) && !tyreSetId) {
            return NextResponse.json({ error: 'Select a tyre set for tyre-related records' }, { status: 400 });
        }

        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }
        const supabase = await createClient();

        let tyreSetSeason: TyreSeason | null = null;

        if (tyreSetId) {
            const { data: tyreSet, error: tyreSetError } = await supabase
                .from('tyre_sets')
                .select('id, season')
                .eq('id', tyreSetId)
                .maybeSingle();

            if (tyreSetError) {
                console.error('Tyre set validation error:', tyreSetError);
                return NextResponse.json({ error: tyreSetError.message }, { status: 500 });
            }

            if (!tyreSet) {
                return NextResponse.json({ error: 'Selected tyre set was not found' }, { status: 400 });
            }

            tyreSetSeason = tyreSet.season as TyreSeason;
        }

        if (isTyreSeasonRecord(serviceType) && tyreSetSeason && season !== tyreSetSeason) {
            return NextResponse.json({ error: 'Tyre season record must match the selected tyre set season' }, { status: 400 });
        }

        const tyreEndOdometer = endOdometerKm ?? odometerKm;

        const payload = {
            user_id: user.id,
            tyre_set_id: isTyreLinkedRecord(serviceType) ? tyreSetId : null,
            service_type: serviceType,
            title,
            start_date: startDate,
            end_date: endDate || null,
            start_odometer_km: isTyreSeasonRecord(serviceType) ? (startOdometerKm == null ? null : Math.round(startOdometerKm)) : null,
            end_odometer_km: isTyreSeasonRecord(serviceType)
                ? (tyreEndOdometer == null ? null : Math.round(tyreEndOdometer))
                : (odometerKm == null ? null : Math.round(odometerKm)),
            odometer_km: odometerKm == null ? null : Math.round(odometerKm),
            cost_amount: costAmount == null ? null : costAmount,
            cost_currency: costAmount == null ? null : costCurrency,
            season: isTyreSeasonRecord(serviceType) ? season : null,
            rotation_status: isTyreSeasonRecord(serviceType) || serviceType === 'tyre_rotation'
                ? rotationStatus
                : 'not_applicable',
            notes: notes || null,
        };

        const { data, error } = await supabase
            .from('maintenance_records')
            .insert(payload)
            .select('*')
            .single();

        if (error) {
            console.error('Maintenance insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            record: data,
        });
    } catch (err) {
        console.error('Maintenance save error:', err);
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
