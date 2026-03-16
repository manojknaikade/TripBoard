import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { getTeslaSession } from '@/lib/tesla/auth-server';
import {
    getChargingBatteryEnergyKwh,
    getChargingDeliveredEnergyKwh,
    getChargingDisplayCost,
    getChargingLossCost,
    getChargingLossKwh,
} from '@/lib/charging/energy';

export const dynamic = 'force-dynamic';

type AnalyticsScope = 'all' | 'driving' | 'charging';
type UserUnits = 'imperial' | 'metric';
type UserDateFormat = 'DD/MM' | 'MM/DD';

type TripRecord = {
    id: string;
    start_time: string;
    end_time: string | null;
    distance_miles: number | null;
    start_odometer: number | null;
    end_odometer: number | null;
    energy_used_kwh: number | null;
    start_battery_pct: number | null;
    end_battery_pct: number | null;
    min_outside_temp?: number | null;
    max_outside_temp?: number | null;
    avg_outside_temp?: number | null;
};

type TripMetricSource = Pick<
    TripRecord,
    'start_time' | 'end_time' | 'distance_miles' | 'start_odometer' | 'end_odometer' | 'energy_used_kwh' | 'start_battery_pct' | 'end_battery_pct'
>;

type ChargingSessionRecord = {
    id: string;
    start_time: string;
    energy_added_kwh: number | null;
    energy_delivered_kwh: number | null;
    charger_type: string | null;
    cost_user_entered: number | null;
    cost_estimate: number | null;
    charger_price_per_kwh: number | null;
    currency: string | null;
    tesla_charge_event_id: string | null;
    is_complete: boolean | null;
};

type ChargingSessionTimingRecord = {
    start_time: string;
};

type ChargingSummaryRow = {
    total_sessions: number;
    total_battery_energy: number | null;
    total_delivered_energy: number | null;
    total_loss_energy: number | null;
    total_loss_cost: number | null;
    total_cost: number | null;
    home_energy: number | null;
    supercharger_energy: number | null;
    third_party_fast_energy: number | null;
    destination_energy: number | null;
    other_energy: number | null;
    home_cost: number | null;
    supercharger_cost: number | null;
    third_party_fast_cost: number | null;
    destination_cost: number | null;
    other_cost: number | null;
};

type ChargingDailyRow = {
    day: string;
    battery_energy: number | null;
    delivered_energy: number | null;
    loss_energy: number | null;
    cost: number | null;
    sessions: number | null;
};

type LeaderboardTrip = TripRecord & {
    calculatedDistance: number;
    calculatedEnergy: number;
    calculatedEfficiency: number;
};

type TripBucketDatum = {
    day: string;
    dateKey: string;
    axisLabel: string;
    tooltipLabel: string;
    distance: number;
    energy: number;
    trips: number;
};

type ChargingBucketDatum = {
    day: string;
    dateKey: string;
    axisLabel: string;
    tooltipLabel: string;
    batteryEnergy: number;
    deliveredEnergy: number;
    lossEnergy: number;
    cost: number;
    sessions: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TIME_SLOTS = [
    { bucket: 0, label: '00' }, { bucket: 2, label: '02' },
    { bucket: 4, label: '04' }, { bucket: 6, label: '06' },
    { bucket: 8, label: '08' }, { bucket: 10, label: '10' },
    { bucket: 12, label: '12' }, { bucket: 14, label: '14' },
    { bucket: 16, label: '16' }, { bucket: 18, label: '18' },
    { bucket: 20, label: '20' }, { bucket: 22, label: '22' },
] as const;
const NO_DATA_CHARGING_MIX = [{ name: 'No Data', value: 100, color: '#334155' }];

function normalizeScope(value: string | null): AnalyticsScope {
    if (value === 'driving' || value === 'charging') {
        return value;
    }

    return 'all';
}

function buildBuckets(
    fromDate: Date,
    toDate: Date,
    timeframe: string,
    userDateFormat: UserDateFormat
) {
    if (timeframe === 'week') {
        const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return {
            mode: 'weekday' as const,
            buckets: weekDays.map((day) => ({ key: day, label: day, axisLabel: day, tooltipLabel: day })),
        };
    }

    const rangeDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY) + 1;
    const buckets: Array<{ key: string; label: string; axisLabel: string; tooltipLabel: string }> = [];
    const cursor = new Date(fromDate);
    let dayIndex = 0;

    while (cursor <= toDate) {
        const key = cursor.toISOString().slice(0, 10);
        const m = cursor.getMonth() + 1;
        const d = cursor.getDate();
        const shortLabel = userDateFormat === 'MM/DD' ? `${m}/${d}` : `${d}/${m}`;
        const tooltipLabel = cursor.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: rangeDays > 366 ? '2-digit' : undefined,
        });

        let axisLabel = '';
        const isStart = dayIndex === 0;
        const isEnd = key === toDate.toISOString().slice(0, 10);
        const isMonthStart = cursor.getDate() === 1;

        if (rangeDays <= 14) {
            axisLabel = dayIndex % 2 === 0 || isStart || isEnd ? shortLabel : '';
        } else if (rangeDays <= 45) {
            axisLabel = dayIndex % 7 === 0 || isStart || isEnd ? shortLabel : '';
        } else if (rangeDays <= 180) {
            axisLabel = isMonthStart || isStart || isEnd
                ? cursor.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                : '';
        } else {
            axisLabel = isMonthStart || isStart || isEnd
                ? cursor.toLocaleDateString('en-GB', {
                    month: 'short',
                    year: rangeDays > 366 && cursor.getMonth() === 0 ? '2-digit' : undefined,
                })
                : '';
        }

        buckets.push({ key, label: shortLabel, axisLabel, tooltipLabel });
        cursor.setDate(cursor.getDate() + 1);
        dayIndex += 1;
    }

    return { mode: 'day' as const, buckets };
}

function getBucketKey(timestamp: string, mode: 'weekday' | 'day') {
    const date = new Date(timestamp);

    if (mode === 'weekday') {
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    }

    return date.toISOString().slice(0, 10);
}

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

function computeTripMetrics(trip: TripMetricSource, distanceMultiplier: number) {
    const distance = trip.distance_miles ?? (
        trip.end_odometer != null && trip.start_odometer != null
            ? trip.end_odometer - trip.start_odometer
            : 0
    );
    const energy = trip.energy_used_kwh ?? (
        trip.start_battery_pct != null && trip.end_battery_pct != null
            ? (trip.start_battery_pct - trip.end_battery_pct) * 0.75
            : 0
    );
    const drivingTimeHours =
        trip.start_time && trip.end_time
            ? Math.max(0, new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()) / (1000 * 60 * 60)
            : 0;
    const distanceInUserUnits = distance * distanceMultiplier;
    const efficiency = distanceInUserUnits > 0 ? (energy * 1000) / distanceInUserUnits : 0;

    return { distance, energy, drivingTimeHours, efficiency };
}

function normalizeChargingType(rawType: string | null) {
    const typeKey = (rawType ?? 'other').toLowerCase();

    if (typeKey.includes('3rd_party_fast')) return '3rd_party_fast';
    if (typeKey.includes('super')) return 'supercharger';
    if (typeKey.includes('home')) return 'home';
    if (typeKey.includes('dest')) return 'destination';
    return 'other';
}

function pctChange(curr: number, prev: number) {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
}

function computeVampireDrainKwh(trips: TripMetricSource[], chargeStartTimes: number[]) {
    let vampireDrainKwh = 0;
    let chargeIndex = 0;

    for (let index = 1; index < trips.length; index += 1) {
        const previousTrip = trips[index - 1];
        const currentTrip = trips[index];

        if (
            previousTrip.end_battery_pct == null ||
            currentTrip.start_battery_pct == null ||
            !previousTrip.end_time
        ) {
            continue;
        }

        const batteryDrop = previousTrip.end_battery_pct - currentTrip.start_battery_pct;
        if (batteryDrop <= 0.1 || batteryDrop >= 15) {
            continue;
        }

        const prevEndMs = new Date(previousTrip.end_time).getTime();
        const currStartMs = new Date(currentTrip.start_time).getTime();

        if (!Number.isFinite(prevEndMs) || !Number.isFinite(currStartMs) || currStartMs <= prevEndMs) {
            continue;
        }

        while (chargeIndex < chargeStartTimes.length && chargeStartTimes[chargeIndex] <= prevEndMs) {
            chargeIndex += 1;
        }

        const hasChargingBetween = chargeIndex < chargeStartTimes.length && chargeStartTimes[chargeIndex] < currStartMs;

        if (!hasChargingBetween) {
            vampireDrainKwh += (batteryDrop / 100) * 75;
        }
    }

    return vampireDrainKwh;
}

function formatTripForLeaderboard(trip: LeaderboardTrip | null, distanceMultiplier: number) {
    if (!trip) {
        return null;
    }

    return {
        id: trip.id,
        date: new Date(trip.start_time).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        distance: Math.round(trip.calculatedDistance * distanceMultiplier * 10) / 10,
        efficiency: Math.round(trip.calculatedEfficiency),
    };
}

function buildFallbackTemperatureImpact(validTrips: LeaderboardTrip[]) {
    const fallbackBuckets: Record<number, { totalEff: number; count: number }> = {};

    for (const trip of validTrips) {
        const avgOutsideTemp = trip.avg_outside_temp;

        if (avgOutsideTemp == null) {
            continue;
        }

        const bucket = Math.round(avgOutsideTemp / 5) * 5;
        const efficiency = trip.calculatedEfficiency;

        if (efficiency > 100 && efficiency < 600) {
            if (!fallbackBuckets[bucket]) {
                fallbackBuckets[bucket] = { totalEff: 0, count: 0 };
            }

            fallbackBuckets[bucket].totalEff += efficiency;
            fallbackBuckets[bucket].count += 1;
        }
    }

    return Object.keys(fallbackBuckets)
        .map((temp) => {
            const bucket = parseInt(temp, 10);
            return {
                temp: bucket,
                efficiency: Math.round(fallbackBuckets[bucket].totalEff / fallbackBuckets[bucket].count),
            };
        })
        .sort((a, b) => a.temp - b.temp);
}

export async function GET(request: NextRequest) {
    try {
        const session = await getTeslaSession(request);

        if (!session) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const supabase = createAdminClient();
        const { searchParams } = new URL(request.url);
        const scope = normalizeScope(searchParams.get('scope'));
        const includeDriving = scope !== 'charging';
        const includeCharging = scope !== 'driving';

        let userUnits: UserUnits = 'metric';
        let userDateFormat: UserDateFormat = 'DD/MM';

        try {
            const { data: settings } = await supabase
                .from('app_settings')
                .select('units, date_format')
                .eq('id', 'default')
                .single();

            if (settings?.units) {
                userUnits = settings.units as UserUnits;
            }

            if (settings?.date_format) {
                userDateFormat = settings.date_format as UserDateFormat;
            }
        } catch (error) {
            console.warn('Could not fetch analytics settings, falling back to defaults:', error);
        }

        const { timeframe, fromDate, toDate } = getTimeframeRange(searchParams);

        if (timeframe === 'alltime') {
            const [firstTripResult, firstChargeResult] = await Promise.all([
                includeDriving
                    ? supabase
                        .from('trips')
                        .select('start_time')
                        .eq('is_complete', true)
                        .order('start_time', { ascending: true })
                        .limit(1)
                        .maybeSingle()
                    : Promise.resolve({ data: null, error: null }),
                includeCharging
                    ? supabase
                        .from('charging_sessions')
                        .select('start_time')
                        .eq('is_complete', true)
                        .order('start_time', { ascending: true })
                        .limit(1)
                        .maybeSingle()
                    : Promise.resolve({ data: null, error: null }),
            ]);

            const candidateTimes = [firstTripResult.data?.start_time, firstChargeResult.data?.start_time]
                .filter((value): value is string => Boolean(value))
                .map((value) => new Date(value).getTime())
                .filter((value) => Number.isFinite(value));

            if (candidateTimes.length > 0) {
                fromDate.setTime(Math.min(...candidateTimes));
            } else {
                fromDate.setTime(toDate.getTime());
            }

            fromDate.setHours(0, 0, 0, 0);
        }

        const distanceMultiplier = userUnits === 'metric' ? 1.60934 : 1;
        const { mode: bucketMode, buckets } = buildBuckets(fromDate, toDate, timeframe, userDateFormat);
        const tripBucketData = new Map<string, TripBucketDatum>(
            buckets.map((bucket) => [bucket.key, {
                day: bucket.label,
                dateKey: bucket.key,
                axisLabel: bucket.axisLabel,
                tooltipLabel: bucket.tooltipLabel,
                distance: 0,
                energy: 0,
                trips: 0,
            }])
        );
        const chargingBucketData = new Map<string, ChargingBucketDatum>(
            buckets.map((bucket) => [bucket.key, {
                day: bucket.label,
                dateKey: bucket.key,
                axisLabel: bucket.axisLabel,
                tooltipLabel: bucket.tooltipLabel,
                batteryEnergy: 0,
                deliveredEnergy: 0,
                lossEnergy: 0,
                cost: 0,
                sessions: 0,
            }])
        );

        const periodStartIso = fromDate.toISOString();
        const periodEndIso = toDate.toISOString();
        const periodMs = toDate.getTime() - fromDate.getTime();
        const prevToDate = new Date(fromDate.getTime() - 1);
        const prevFromDate = new Date(prevToDate.getTime() - periodMs);

        const [tripsResult, chargeTimingResult, prevTripsResult, prevChargeTimingResult, chargingSummaryResult, chargingDailyResult] = await Promise.all([
            includeDriving
                ? supabase
                    .from('trips')
                    .select('id, start_time, end_time, distance_miles, start_odometer, end_odometer, energy_used_kwh, start_battery_pct, end_battery_pct, min_outside_temp, max_outside_temp, avg_outside_temp')
                    .eq('is_complete', true)
                    .gte('start_time', periodStartIso)
                    .lte('start_time', periodEndIso)
                    .order('start_time', { ascending: true })
                : Promise.resolve({ data: [] as TripRecord[], error: null }),
            includeDriving
                ? supabase
                    .from('charging_sessions')
                    .select('start_time')
                    .eq('is_complete', true)
                    .gte('start_time', periodStartIso)
                    .lte('start_time', periodEndIso)
                    .order('start_time', { ascending: true })
                : Promise.resolve({ data: [] as ChargingSessionTimingRecord[], error: null }),
            includeDriving
                ? supabase
                    .from('trips')
                    .select('start_time, end_time, distance_miles, start_odometer, end_odometer, energy_used_kwh, start_battery_pct, end_battery_pct')
                    .eq('is_complete', true)
                    .gte('start_time', prevFromDate.toISOString())
                    .lte('start_time', prevToDate.toISOString())
                    .order('start_time', { ascending: true })
                : Promise.resolve({ data: [] as TripMetricSource[], error: null }),
            includeDriving
                ? supabase
                    .from('charging_sessions')
                    .select('start_time')
                    .eq('is_complete', true)
                    .gte('start_time', prevFromDate.toISOString())
                    .lte('start_time', prevToDate.toISOString())
                    .order('start_time', { ascending: true })
                : Promise.resolve({ data: [] as ChargingSessionTimingRecord[], error: null }),
            includeCharging
                ? supabase.rpc('get_charging_analytics_summary', {
                    p_from: periodStartIso,
                    p_to: periodEndIso,
                })
                : Promise.resolve({ data: [] as ChargingSummaryRow[], error: null }),
            includeCharging
                ? supabase.rpc('get_charging_analytics_daily', {
                    p_from: periodStartIso,
                    p_to: periodEndIso,
                })
                : Promise.resolve({ data: [] as ChargingDailyRow[], error: null }),
        ]);

        if (tripsResult.error) {
            return NextResponse.json({ error: tripsResult.error.message }, { status: 500 });
        }

        if (chargeTimingResult.error) {
            console.error('Error fetching charging session timing for analytics:', chargeTimingResult.error);
        }

        if (prevTripsResult.error) {
            console.error('Error fetching previous-period trips for analytics trends:', prevTripsResult.error);
        }

        if (prevChargeTimingResult.error) {
            console.error('Error fetching previous-period charging session timing for analytics trends:', prevChargeTimingResult.error);
        }

        if (chargingSummaryResult.error) {
            console.error('Error fetching charging summary rollup for analytics:', chargingSummaryResult.error);
        }

        if (chargingDailyResult.error) {
            console.error('Error fetching charging daily rollup for analytics:', chargingDailyResult.error);
        }

        const typedTrips = (tripsResult.data || []) as TripRecord[];
        const prevTrips = (prevTripsResult.data || []) as TripMetricSource[];
        const prevChargeTimingRecords = (prevChargeTimingResult.data || []) as ChargingSessionTimingRecord[];
        const chargeTimingRecords = (chargeTimingResult.data || []) as ChargingSessionTimingRecord[];
        const chargeStartTimes = chargeTimingRecords
            .map((sessionRecord) => new Date(sessionRecord.start_time).getTime())
            .filter((value) => Number.isFinite(value));
        const prevChargeStartTimes = prevChargeTimingRecords
            .map((sessionRecord) => new Date(sessionRecord.start_time).getTime())
            .filter((value) => Number.isFinite(value));
        const chargingSummaryRow = ((chargingSummaryResult.data || [])[0] ?? null) as ChargingSummaryRow | null;
        const chargingDailyRows = (chargingDailyResult.data || []) as ChargingDailyRow[];
        let fallbackChargingSessions: ChargingSessionRecord[] = [];

        if (includeCharging && (chargingSummaryResult.error || chargingDailyResult.error)) {
            const { data, error } = await supabase
                .from('charging_sessions')
                .select('id, energy_added_kwh, energy_delivered_kwh, charger_type, cost_user_entered, cost_estimate, charger_price_per_kwh, currency, start_time, tesla_charge_event_id, is_complete')
                .eq('is_complete', true)
                .gte('start_time', periodStartIso)
                .lte('start_time', periodEndIso)
                .order('start_time', { ascending: true });

            if (error) {
                console.error('Error fetching charging sessions fallback for analytics:', error);
            } else {
                fallbackChargingSessions = (data || []) as ChargingSessionRecord[];
            }
        }

        let totalDistance = 0;
        let totalEnergy = 0;
        let totalDrivingTime = 0;
        let avgEfficiency = 0;
        let vampireDrainKwh = 0;
        const hourlyEfficiency: Record<number, { total: number; count: number }> = {};
        const validTrips: LeaderboardTrip[] = [];

        if (includeDriving) {
            for (const trip of typedTrips) {
                const metrics = computeTripMetrics(trip, distanceMultiplier);

                totalDistance += metrics.distance;
                totalEnergy += metrics.energy;
                totalDrivingTime += metrics.drivingTimeHours;

                const tripBucket = tripBucketData.get(getBucketKey(trip.start_time, bucketMode));
                if (tripBucket) {
                    tripBucket.distance += metrics.distance;
                    tripBucket.energy += metrics.energy;
                    tripBucket.trips += 1;
                }

                if (metrics.efficiency > 0) {
                    const hourBucket = Math.floor(new Date(trip.start_time).getHours() / 2) * 2;
                    if (!hourlyEfficiency[hourBucket]) {
                        hourlyEfficiency[hourBucket] = { total: 0, count: 0 };
                    }
                    hourlyEfficiency[hourBucket].total += metrics.efficiency;
                    hourlyEfficiency[hourBucket].count += 1;
                }

                if (metrics.distance > 0.1 && metrics.efficiency > 0) {
                    validTrips.push({
                        ...trip,
                        calculatedDistance: metrics.distance,
                        calculatedEnergy: metrics.energy,
                        calculatedEfficiency: metrics.efficiency,
                    });
                }
            }

            const totalDistanceInUserUnits = totalDistance * distanceMultiplier;
            avgEfficiency = totalDistanceInUserUnits > 0
                ? Math.round((totalEnergy * 1000) / totalDistanceInUserUnits)
                : 260;

            vampireDrainKwh = computeVampireDrainKwh(typedTrips, chargeStartTimes);
        }

        let totalChargingBatteryEnergy = includeCharging ? Number(chargingSummaryRow?.total_battery_energy || 0) : 0;
        let totalChargingDeliveredEnergy = includeCharging ? Number(chargingSummaryRow?.total_delivered_energy || 0) : 0;
        let totalChargingLossEnergy = includeCharging ? Number(chargingSummaryRow?.total_loss_energy || 0) : 0;
        let totalChargingLossCost = includeCharging ? Number(chargingSummaryRow?.total_loss_cost || 0) : 0;
        let totalChargingCost = includeCharging ? Number(chargingSummaryRow?.total_cost || 0) : 0;
        const chargingByType = {
            home: Number(chargingSummaryRow?.home_energy || 0),
            supercharger: Number(chargingSummaryRow?.supercharger_energy || 0),
            '3rd_party_fast': Number(chargingSummaryRow?.third_party_fast_energy || 0),
            destination: Number(chargingSummaryRow?.destination_energy || 0),
            other: Number(chargingSummaryRow?.other_energy || 0),
        };
        const costByType = {
            home: Number(chargingSummaryRow?.home_cost || 0),
            supercharger: Number(chargingSummaryRow?.supercharger_cost || 0),
            '3rd_party_fast': Number(chargingSummaryRow?.third_party_fast_cost || 0),
            destination: Number(chargingSummaryRow?.destination_cost || 0),
            other: Number(chargingSummaryRow?.other_cost || 0),
        };

        if (includeCharging && fallbackChargingSessions.length === 0) {
            for (const row of chargingDailyRows) {
                const chargingBucket = chargingBucketData.get(getBucketKey(row.day, bucketMode));
                if (!chargingBucket) {
                    continue;
                }

                chargingBucket.batteryEnergy += Number(row.battery_energy || 0);
                chargingBucket.deliveredEnergy += Number(row.delivered_energy || 0);
                chargingBucket.lossEnergy += Number(row.loss_energy || 0);
                chargingBucket.cost += Number(row.cost || 0);
                chargingBucket.sessions += Number(row.sessions || 0);
            }
        } else if (includeCharging) {
            totalChargingBatteryEnergy = 0;
            totalChargingDeliveredEnergy = 0;
            totalChargingLossEnergy = 0;
            totalChargingLossCost = 0;
            totalChargingCost = 0;
            chargingByType.home = 0;
            chargingByType.supercharger = 0;
            chargingByType['3rd_party_fast'] = 0;
            chargingByType.destination = 0;
            chargingByType.other = 0;
            costByType.home = 0;
            costByType.supercharger = 0;
            costByType['3rd_party_fast'] = 0;
            costByType.destination = 0;
            costByType.other = 0;

            for (const sessionRecord of fallbackChargingSessions) {
                const normalizedKey = normalizeChargingType(sessionRecord.charger_type) as keyof typeof chargingByType;
                const cost = getChargingDisplayCost(sessionRecord) ?? 0;
                const batteryEnergy = getChargingBatteryEnergyKwh(sessionRecord) ?? 0;
                const deliveredEnergy = getChargingDeliveredEnergyKwh(sessionRecord) ?? batteryEnergy;
                const lossEnergy = getChargingLossKwh(sessionRecord) ?? 0;
                const lossCost = getChargingLossCost(sessionRecord) ?? 0;

                totalChargingBatteryEnergy += batteryEnergy;
                totalChargingDeliveredEnergy += deliveredEnergy;
                totalChargingLossEnergy += lossEnergy;
                totalChargingLossCost += lossCost;
                totalChargingCost += cost;
                chargingByType[normalizedKey] += batteryEnergy;
                costByType[normalizedKey] += cost;

                const chargingBucket = chargingBucketData.get(getBucketKey(sessionRecord.start_time, bucketMode));
                if (chargingBucket) {
                    chargingBucket.batteryEnergy += batteryEnergy;
                    chargingBucket.deliveredEnergy += deliveredEnergy;
                    chargingBucket.lossEnergy += lossEnergy;
                    chargingBucket.cost += cost;
                    chargingBucket.sessions += 1;
                }
            }
        }

        let prevDistance = 0;
        let prevEnergy = 0;
        let prevDrivingTime = 0;
        let prevVampireDrainKwh = 0;

        if (includeDriving) {
            for (const trip of prevTrips) {
                const metrics = computeTripMetrics(trip, distanceMultiplier);
                prevDistance += metrics.distance;
                prevEnergy += metrics.energy;
                prevDrivingTime += metrics.drivingTimeHours;
            }

            prevVampireDrainKwh = computeVampireDrainKwh(prevTrips, prevChargeStartTimes);
        }

        const prevDistanceInUserUnits = prevDistance * distanceMultiplier;
        const prevEfficiency = prevDistanceInUserUnits > 0 ? (prevEnergy * 1000) / prevDistanceInUserUnits : 0;
        const trends = includeDriving
            ? {
                distance: pctChange(totalDistance * distanceMultiplier, prevDistanceInUserUnits),
                energy: pctChange(totalEnergy, prevEnergy),
                efficiency: pctChange(avgEfficiency, prevEfficiency),
                drivingTime: pctChange(totalDrivingTime, prevDrivingTime),
                vampireDrain: pctChange(vampireDrainKwh, prevVampireDrainKwh),
            }
            : {
                distance: 0,
                energy: 0,
                efficiency: 0,
                drivingTime: 0,
                vampireDrain: 0,
            };

        const temperatureImpact = includeDriving && validTrips.length > 0
            ? buildFallbackTemperatureImpact(validTrips)
            : [];

        const weeklyData = [...tripBucketData.values()].map((bucket) => ({
            day: bucket.day,
            dateKey: bucket.dateKey,
            axisLabel: bucket.axisLabel,
            tooltipLabel: bucket.tooltipLabel,
            distance: Math.round(bucket.distance * distanceMultiplier * 10) / 10,
            energy: Math.round(bucket.energy * 10) / 10,
            trips: bucket.trips,
        }));

        const efficiencyData = TIME_SLOTS.map(({ bucket, label }) => ({
            time: label,
            efficiency: hourlyEfficiency[bucket]
                ? Math.round(hourlyEfficiency[bucket].total / hourlyEfficiency[bucket].count)
                : 0,
        }));

        const chargingMix = includeCharging
            ? (totalChargingBatteryEnergy > 0
                ? [
                    { name: 'Home', value: Math.round((chargingByType.home / totalChargingBatteryEnergy) * 100), color: '#22c55e' },
                    { name: 'Supercharger', value: Math.round((chargingByType.supercharger / totalChargingBatteryEnergy) * 100), color: '#ef4444' },
                    { name: '3rd Party DC', value: Math.round((chargingByType['3rd_party_fast'] / totalChargingBatteryEnergy) * 100), color: '#f97316' },
                    { name: 'Destination', value: Math.round((chargingByType.destination / totalChargingBatteryEnergy) * 100), color: '#3b82f6' },
                    { name: 'Other', value: Math.round((chargingByType.other / totalChargingBatteryEnergy) * 100), color: '#6b7280' },
                ].filter((item) => item.value > 0)
                : NO_DATA_CHARGING_MIX)
            : [];

        const sourceColorMap: Record<string, { name: string; color: string }> = {
            home: { name: 'Home', color: '#22c55e' },
            supercharger: { name: 'Supercharger', color: '#ef4444' },
            '3rd_party_fast': { name: '3rd Party DC', color: '#f97316' },
            destination: { name: 'Destination', color: '#3b82f6' },
            other: { name: 'Other', color: '#6b7280' },
        };

        const costBySource = includeCharging
            ? Object.entries({
                home: costByType.home,
                supercharger: costByType.supercharger,
                '3rd_party_fast': costByType['3rd_party_fast'],
                destination: costByType.destination,
                other: costByType.other,
            })
                .filter(([, cost]) => cost > 0)
                .map(([key, cost]) => ({
                    name: sourceColorMap[key]?.name || key,
                    cost: Math.round(cost * 100) / 100,
                    color: sourceColorMap[key]?.color || '#6b7280',
                }))
                .sort((a, b) => b.cost - a.cost)
            : [];

        const dailyChargingData = [...chargingBucketData.values()].map((bucket) => ({
            day: bucket.day,
            dateKey: bucket.dateKey,
            axisLabel: bucket.axisLabel,
            tooltipLabel: bucket.tooltipLabel,
            batteryEnergy: Math.round(bucket.batteryEnergy * 10) / 10,
            deliveredEnergy: Math.round(bucket.deliveredEnergy * 10) / 10,
            lossEnergy: Math.round(bucket.lossEnergy * 10) / 10,
            cost: Math.round(bucket.cost * 100) / 100,
            sessions: bucket.sessions,
        }));

        const avgCostPerKwh = totalChargingDeliveredEnergy > 0 ? totalChargingCost / totalChargingDeliveredEnergy : 0;
        const avgChargingLossPct = totalChargingDeliveredEnergy > 0
            ? (totalChargingLossEnergy / totalChargingDeliveredEnergy) * 100
            : 0;

        const topTrips = includeDriving && validTrips.length > 0
            ? {
                longest: validTrips.reduce((prev, curr) => (
                    curr.calculatedDistance > prev.calculatedDistance ? curr : prev
                )),
                shortest: validTrips.reduce((prev, curr) => (
                    curr.calculatedDistance < prev.calculatedDistance ? curr : prev
                )),
                mostEfficient: validTrips.reduce((prev, curr) => (
                    curr.calculatedEfficiency < prev.calculatedEfficiency ? curr : prev
                )),
            }
            : {
                longest: null,
                shortest: null,
                mostEfficient: null,
            };

        const chargeSessionCount = includeCharging
            ? (fallbackChargingSessions.length > 0 ? fallbackChargingSessions.length : Number(chargingSummaryRow?.total_sessions || 0))
            : chargeStartTimes.length;

        return NextResponse.json({
            success: true,
            scope,
            timeframe,
            fromDate: fromDate.toISOString(),
            toDate: toDate.toISOString(),
            summary: {
                totalDistance: Math.round(totalDistance * distanceMultiplier * 10) / 10,
                totalEnergy: Math.round(totalEnergy * 10) / 10,
                avgEfficiency: Math.round(avgEfficiency),
                drivingTime: Math.round(totalDrivingTime * 10) / 10,
                tripCount: typedTrips.length,
                chargingSessions: chargeSessionCount,
                totalChargingEnergy: Math.round(totalChargingBatteryEnergy * 10) / 10,
                totalChargingBatteryEnergy: Math.round(totalChargingBatteryEnergy * 10) / 10,
                totalChargingDeliveredEnergy: Math.round(totalChargingDeliveredEnergy * 10) / 10,
                totalChargingLossEnergy: Math.round(totalChargingLossEnergy * 10) / 10,
                totalChargingLossCost: Math.round(totalChargingLossCost * 100) / 100,
                avgChargingLossPct: Math.round(avgChargingLossPct * 10) / 10,
                totalChargingCost: Math.round(totalChargingCost * 100) / 100,
                avgCostPerKwh: Math.round(avgCostPerKwh * 100) / 100,
                vampireDrainKwh: Math.round(vampireDrainKwh * 10) / 10,
                trends,
            },
            weeklyData,
            efficiencyData,
            chargingMix,
            dailyChargingData,
            leaderboard: {
                longest: formatTripForLeaderboard(topTrips.longest, distanceMultiplier),
                shortest: formatTripForLeaderboard(topTrips.shortest, distanceMultiplier),
                mostEfficient: formatTripForLeaderboard(topTrips.mostEfficient, distanceMultiplier),
            },
            temperatureImpact,
            costBySource,
        });
    } catch (error) {
        console.error('CRITICAL Analytics error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
            { status: 500 }
        );
    }
}
