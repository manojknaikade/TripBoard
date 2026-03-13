import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
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

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const { id } = await context.params;
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

        if (!id) {
            return NextResponse.json({ error: 'Record id is required' }, { status: 400 });
        }

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

        const supabase = createAdminClient();
        let tyreSetSeason: TyreSeason | null = null;

        if (tyreSetId) {
            const { data: tyreSet, error: tyreSetError } = await supabase
                .from('tyre_sets')
                .select('id, season')
                .eq('id', tyreSetId)
                .maybeSingle();

            if (tyreSetError) {
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
            .update(payload)
            .eq('id', id)
            .select('*')
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, record: data });
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
