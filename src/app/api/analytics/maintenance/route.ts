import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeslaSession } from '@/lib/tesla/auth-server';
import { type MaintenanceServiceType, type RotationStatus, type TyreSeason } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

type MaintenanceRecordRow = {
    service_type: MaintenanceServiceType;
    start_date: string;
    cost_amount: number | null;
    cost_currency: string | null;
    tyre_set_id: string | null;
    start_odometer_km: number | null;
    end_odometer_km: number | null;
    odometer_km: number | null;
    season: TyreSeason | null;
    rotation_status: RotationStatus;
};

type TyreSetRow = {
    id: string;
    name: string;
    season: TyreSeason;
    status: 'active' | 'retired';
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
        const supabase = createAdminClient();
        const { searchParams } = new URL(request.url);
        const { timeframe, fromDate, toDate } = getTimeframeRange(searchParams);

        const [
            { data: allMaintenanceRecords, error: allRecordsError },
            { data: tyreSets, error: tyreSetsError },
            { data: vehicleStatus, error: vehicleStatusError },
        ] = await Promise.all([
            supabase
                .from('maintenance_records')
                .select('service_type, start_date, end_date, cost_amount, cost_currency, tyre_set_id, start_odometer_km, end_odometer_km, odometer_km, season, rotation_status')
                .order('start_date', { ascending: true }),
            supabase
                .from('tyre_sets')
                .select('id, name, season, status')
                .order('created_at', { ascending: false }),
            supabase
                .from('vehicle_status')
                .select('odometer')
                .maybeSingle(),
        ]);

        if (allRecordsError) {
            return NextResponse.json({ error: allRecordsError.message }, { status: 500 });
        }

        if (tyreSetsError) {
            return NextResponse.json({ error: tyreSetsError.message }, { status: 500 });
        }

        if (vehicleStatusError) {
            return NextResponse.json({ error: vehicleStatusError.message }, { status: 500 });
        }

        const allRecords = ((allMaintenanceRecords || []) as Array<MaintenanceRecordRow & { end_date?: string | null }>);
        const maintenanceRecords = allRecords.filter((record) => {
            const recordDate = new Date(`${record.start_date}T12:00:00`).getTime();
            return recordDate >= fromDate.getTime() && recordDate <= toDate.getTime();
        });
        const effectiveFromDate = timeframe === 'alltime' && allRecords.length > 0
            ? new Date(`${allRecords[0].start_date}T12:00:00`)
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
        const latestLoggedOdometer = allRecords.reduce<number | null>((highest, record) => {
            if (record.odometer_km == null) {
                return highest;
            }

            if (highest == null || record.odometer_km > highest) {
                return record.odometer_km;
            }

            return highest;
        }, null);
        const rawVehicleOdometer =
            typeof vehicleStatus?.odometer === 'number'
                ? vehicleStatus.odometer
                : typeof vehicleStatus?.odometer === 'string'
                    ? Number(vehicleStatus.odometer)
                    : null;
        const currentVehicleOdometerKm = rawVehicleOdometer != null && Number.isFinite(rawVehicleOdometer)
            ? Math.round(rawVehicleOdometer * MILES_TO_KM)
            : null;
        const inferredCurrentOdometerKm = currentVehicleOdometerKm != null && latestLoggedOdometer != null
            ? Math.max(currentVehicleOdometerKm, latestLoggedOdometer)
            : (currentVehicleOdometerKm ?? latestLoggedOdometer);

        let totalSpend = 0;
        let paidRecords = 0;
        let rotations = 0;
        let seasonChanges = 0;

        for (const record of maintenanceRecords) {
            const bucketKey = getBucketKey(record.start_date, mode);
            const activity = activityByBucket.get(bucketKey);
            if (activity) {
                activity.records += 1;
            }

            serviceTypeCounts.set(record.service_type, (serviceTypeCounts.get(record.service_type) || 0) + 1);

            if (record.service_type === 'tyre_rotation') {
                rotations += 1;
            }

            if (record.service_type === 'tyre_season') {
                seasonChanges += 1;
            }

            if (record.cost_amount != null) {
                paidRecords += 1;
                totalSpend += record.cost_amount;
                const currency = record.cost_currency || 'CHF';
                costByCurrency.set(currency, (costByCurrency.get(currency) || 0) + record.cost_amount);
                if (activity) {
                    activity.spend += record.cost_amount;
                }
            }
        }

        for (const record of allRecords) {
            if (record.service_type !== 'tyre_season' || !record.tyre_set_id) {
                continue;
            }

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
        const mixedCurrencies = currencyTotals.length > 1;

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
                totalRecords: maintenanceRecords.length,
                paidRecords,
                totalSpend: mixedCurrencies ? null : Number(totalSpend.toFixed(2)),
                averagePaidCost: !mixedCurrencies && paidRecords > 0 ? Number((totalSpend / paidRecords).toFixed(2)) : null,
                spendCurrency: mixedCurrencies ? null : (currencyTotals[0]?.currency || null),
                mixedCurrencies,
                seasonChanges,
                rotations,
                tyreWorkRecords: seasonChanges + rotations,
                activeTyreSets: tyreSetRows.filter((item) => item.status === 'active').length,
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
