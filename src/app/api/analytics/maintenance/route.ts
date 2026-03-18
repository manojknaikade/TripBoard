import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTeslaSession } from '@/lib/tesla/auth-server';
import { type MaintenanceServiceType, type TyreSeason } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

type MaintenanceRecordRow = {
    service_type: MaintenanceServiceType;
    start_date: string;
    cost_amount: number | null;
    cost_currency: string | null;
};

type TyreSetRow = {
    id: string;
    name: string;
    season: TyreSeason;
    status: 'active' | 'retired';
};

type TyreMileageRecordRow = {
    tyre_set_id: string;
    end_date: string | null;
    start_odometer_km: number | null;
    end_odometer_km: number | null;
    odometer_km: number | null;
};

type LatestOdometerRow = {
    odometer_km: number | null;
};

type MaintenanceSummaryRow = {
    total_records: number;
    tyre_records: number;
    other_records: number;
    latest_logged_odometer_km: number | null;
    paid_records: number;
    total_spend: number | null;
    average_paid_cost: number | null;
    spend_currency: string | null;
    mixed_currencies: boolean;
    season_changes: number;
    rotations: number;
    tyre_work_records: number;
    active_tyre_sets: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MILES_TO_KM = 1.60934;

function getTimeframeRange(searchParams: URLSearchParams) {
    const timeframe = searchParams.get('timeframe') || 'week';
    const toDate = new Date();
    toDate.setHours(23, 59, 59, 999);
    let fromDate = new Date();

    if (timeframe === 'custom') {
        const startDateParam = searchParams.get('startDate');
        const endDateParam = searchParams.get('endDate');

        if (startDateParam && endDateParam) {
            fromDate = new Date(startDateParam);
            fromDate.setHours(0, 0, 0, 0);
            const customToDate = new Date(endDateParam);
            customToDate.setHours(23, 59, 59, 999);
            return { timeframe, fromDate, toDate: customToDate };
        }
    }

    switch (timeframe) {
        case 'alltime':
            fromDate = new Date(0);
            fromDate.setHours(0, 0, 0, 0);
            break;
        case 'lastyear':
            fromDate = new Date(toDate.getFullYear() - 1, 0, 1);
            fromDate.setHours(0, 0, 0, 0);
            toDate.setFullYear(toDate.getFullYear() - 1, 11, 31);
            toDate.setHours(23, 59, 59, 999);
            break;
        case '7days':
            fromDate = new Date(toDate.getTime() - 7 * MS_PER_DAY);
            break;
        case 'month':
            fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
            break;
        case '30days':
            fromDate = new Date(toDate.getTime() - 30 * MS_PER_DAY);
            break;
        case '3months':
            fromDate = new Date(toDate.getTime() - 90 * MS_PER_DAY);
            break;
        case 'year':
            fromDate = new Date(toDate.getFullYear(), 0, 1);
            fromDate.setHours(0, 0, 0, 0);
            break;
        case 'week':
        default: {
            const day = toDate.getDay();
            const diff = toDate.getDate() - day + (day === 0 ? -6 : 1);
            fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), diff);
            fromDate.setHours(0, 0, 0, 0);
            break;
        }
    }

    return { timeframe, fromDate, toDate };
}

function buildBuckets(fromDate: Date, toDate: Date, timeframe: string) {
    const rangeDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY) + 1;
    const mode: 'month' | 'day' = rangeDays > 62 ? 'month' : 'day';
    const buckets: Array<{ key: string; label: string; date: Date }> = [];
    const includeYearInMonthLabel = rangeDays > 366 || timeframe === 'alltime';

    if (mode === 'month') {
        const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
        const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);

        while (cursor <= end) {
            buckets.push({
                key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
                label: cursor.toLocaleDateString('en-GB', includeYearInMonthLabel
                    ? { month: 'short', year: '2-digit' }
                    : { month: 'short' }),
                date: new Date(cursor),
            });
            cursor.setMonth(cursor.getMonth() + 1);
        }
    } else {
        const cursor = new Date(fromDate);
        while (cursor <= toDate) {
            const key = cursor.toISOString().slice(0, 10);
            const label = timeframe === 'week'
                ? cursor.toLocaleDateString('en-GB', { weekday: 'short' })
                : cursor.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            buckets.push({ key, label, date: new Date(cursor) });
            cursor.setDate(cursor.getDate() + 1);
        }
    }

    return { mode, buckets };
}

function getBucketKey(dateValue: string, mode: 'day' | 'month') {
    const date = new Date(`${dateValue}T12:00:00`);
    if (mode === 'month') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const { timeframe, fromDate, toDate } = getTimeframeRange(searchParams);
        const fromDateKey = fromDate.toISOString().slice(0, 10);
        const toDateKey = toDate.toISOString().slice(0, 10);

        const [
            { data: summaryRows, error: summaryError },
            { data: maintenanceRecords, error: maintenanceRecordsError },
            { data: tyreMileageRecords, error: tyreMileageError },
            { data: tyreSets, error: tyreSetsError },
            { data: vehicleStatus, error: vehicleStatusError },
            { data: latestLoggedOdometerRecord, error: latestLoggedOdometerError },
        ] = await Promise.all([
            supabase
                .rpc('get_maintenance_summary', {
                    p_from_date: fromDateKey,
                    p_to_date: toDateKey,
                }),
            supabase
                .from('maintenance_records')
                .select('service_type, start_date, cost_amount, cost_currency')
                .gte('start_date', fromDateKey)
                .lte('start_date', toDateKey)
                .order('start_date', { ascending: true }),
            supabase
                .from('maintenance_records')
                .select('tyre_set_id, end_date, start_odometer_km, end_odometer_km, odometer_km')
                .eq('service_type', 'tyre_season')
                .not('tyre_set_id', 'is', null)
                .order('start_date', { ascending: true }),
            supabase
                .from('tyre_sets')
                .select('id, name, season, status')
                .order('created_at', { ascending: false }),
            supabase
                .from('vehicle_status')
                .select('odometer')
                .order('updated_at', { ascending: false })
                .limit(1),
            supabase
                .from('maintenance_records')
                .select('odometer_km')
                .not('odometer_km', 'is', null)
                .order('odometer_km', { ascending: false })
                .limit(1)
                .maybeSingle(),
        ]);

        if (summaryError) {
            console.warn('Maintenance analytics summary RPC unavailable, using in-route fallback:', summaryError.message);
        }

        if (maintenanceRecordsError) {
            return NextResponse.json({ error: maintenanceRecordsError.message }, { status: 500 });
        }

        if (tyreMileageError) {
            return NextResponse.json({ error: tyreMileageError.message }, { status: 500 });
        }

        if (tyreSetsError) {
            return NextResponse.json({ error: tyreSetsError.message }, { status: 500 });
        }

        if (vehicleStatusError) {
            return NextResponse.json({ error: vehicleStatusError.message }, { status: 500 });
        }

        if (latestLoggedOdometerError) {
            return NextResponse.json({ error: latestLoggedOdometerError.message }, { status: 500 });
        }

        const filteredMaintenanceRecords = (maintenanceRecords || []) as MaintenanceRecordRow[];
        const summaryRow = (summaryRows?.[0] ?? null) as MaintenanceSummaryRow | null;
        const tyreMileageHistory = (tyreMileageRecords || []) as TyreMileageRecordRow[];
        const effectiveFromDate = timeframe === 'alltime' && filteredMaintenanceRecords.length > 0
            ? new Date(`${filteredMaintenanceRecords[0].start_date}T12:00:00`)
            : fromDate;
        effectiveFromDate.setHours(0, 0, 0, 0);

        const tyreSetRows = (tyreSets || []) as TyreSetRow[];
        const { mode, buckets } = buildBuckets(effectiveFromDate, toDate, timeframe);
        const activityByBucket = new Map(
            buckets.map((bucket) => [bucket.key, { period: bucket.label, records: 0, spend: 0 }])
        );

        const serviceTypeCounts = new Map<MaintenanceServiceType, number>();
        const costByCurrency = new Map<string, number>();
        const tyreSetMileageById = new Map<string, number>();
        const latestLoggedOdometer = (latestLoggedOdometerRecord as LatestOdometerRow | null)?.odometer_km ?? null;
        const vehicleStatusRow = vehicleStatus?.[0] ?? null;
        const rawVehicleOdometer =
            typeof vehicleStatusRow?.odometer === 'number'
                ? vehicleStatusRow.odometer
                : typeof vehicleStatusRow?.odometer === 'string'
                    ? Number(vehicleStatusRow.odometer)
                    : null;
        const currentVehicleOdometerKm = rawVehicleOdometer != null && Number.isFinite(rawVehicleOdometer)
            ? Math.round(rawVehicleOdometer * MILES_TO_KM)
            : null;
        const inferredCurrentOdometerKm = currentVehicleOdometerKm != null && latestLoggedOdometer != null
            ? Math.max(currentVehicleOdometerKm, latestLoggedOdometer)
            : (currentVehicleOdometerKm ?? latestLoggedOdometer);
        let fallbackPaidRecords = 0;
        let fallbackTotalSpend = 0;
        let fallbackSeasonChanges = 0;
        let fallbackRotations = 0;

        for (const record of filteredMaintenanceRecords) {
            const bucketKey = getBucketKey(record.start_date, mode);
            const activity = activityByBucket.get(bucketKey);
            if (activity) {
                activity.records += 1;
            }

            serviceTypeCounts.set(record.service_type, (serviceTypeCounts.get(record.service_type) || 0) + 1);

            if (record.service_type === 'tyre_season') {
                fallbackSeasonChanges += 1;
            }

            if (record.service_type === 'tyre_rotation') {
                fallbackRotations += 1;
            }

            if (record.cost_amount != null) {
                fallbackPaidRecords += 1;
                fallbackTotalSpend += record.cost_amount;
                const currency = record.cost_currency || 'CHF';
                costByCurrency.set(currency, (costByCurrency.get(currency) || 0) + record.cost_amount);
                if (activity) {
                    activity.spend += record.cost_amount;
                }
            }
        }

        for (const record of tyreMileageHistory) {
            const mileageEnd = record.end_odometer_km
                ?? record.odometer_km
                ?? (!record.end_date ? inferredCurrentOdometerKm : null);

            if (
                record.start_odometer_km != null &&
                mileageEnd != null &&
                mileageEnd >= record.start_odometer_km
            ) {
                tyreSetMileageById.set(
                    record.tyre_set_id,
                    (tyreSetMileageById.get(record.tyre_set_id) || 0) + (mileageEnd - record.start_odometer_km)
                );
            }
        }

        const currencyTotals = [...costByCurrency.entries()].map(([currency, total]) => ({
            currency,
            total: Number(total.toFixed(2)),
        }));
        const mixedCurrencies = summaryRow?.mixed_currencies ?? currencyTotals.length > 1;
        const fallbackAveragePaidCost = !mixedCurrencies && fallbackPaidRecords > 0
            ? Number((fallbackTotalSpend / fallbackPaidRecords).toFixed(2))
            : null;

        const tyreSetMileage = tyreSetRows
            .map((tyreSet) => ({
                name: tyreSet.name,
                season: tyreSet.season,
                status: tyreSet.status,
                mileageKm: tyreSetMileageById.get(tyreSet.id) || 0,
            }))
            .filter((item) => item.mileageKm > 0)
            .sort((a, b) => b.mileageKm - a.mileageKm);

        return NextResponse.json({
            success: true,
            summary: {
                totalRecords: summaryRow?.total_records ?? filteredMaintenanceRecords.length,
                paidRecords: summaryRow?.paid_records ?? fallbackPaidRecords,
                totalSpend: summaryRow?.total_spend ?? (!mixedCurrencies ? Number(fallbackTotalSpend.toFixed(2)) : null),
                averagePaidCost: summaryRow?.average_paid_cost ?? fallbackAveragePaidCost,
                spendCurrency: summaryRow?.spend_currency ?? (mixedCurrencies ? null : (currencyTotals[0]?.currency || null)),
                mixedCurrencies,
                seasonChanges: summaryRow?.season_changes ?? fallbackSeasonChanges,
                rotations: summaryRow?.rotations ?? fallbackRotations,
                tyreWorkRecords: summaryRow?.tyre_work_records ?? (fallbackSeasonChanges + fallbackRotations),
                activeTyreSets: summaryRow?.active_tyre_sets ?? tyreSetRows.filter((item) => item.status === 'active').length,
            },
            activityData: [...activityByBucket.values()].map((item) => ({
                period: item.period,
                records: item.records,
                spend: Number(item.spend.toFixed(2)),
            })),
            serviceTypeBreakdown: [...serviceTypeCounts.entries()]
                .map(([serviceType, recordsCount]) => ({ serviceType, records: recordsCount }))
                .sort((a, b) => b.records - a.records),
            tyreSetMileage,
            currencyTotals,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to load maintenance analytics' },
            { status: 500 }
        );
    }
}
