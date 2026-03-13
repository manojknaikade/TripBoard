import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { getTeslaSession } from '@/lib/tesla/auth-server'

export const dynamic = 'force-dynamic';

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

type ChargingSessionRecord = {
    start_time: string;
    energy_added_kwh: number | null;
    charger_type: string | null;
    cost_user_entered: number | null;
};

type SnapshotRecord = {
    timestamp: string;
    outside_temp: number | null;
};

type LeaderboardTrip = TripRecord & {
    calculatedDistance: number;
    calculatedEnergy: number;
    calculatedEfficiency: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function buildBuckets(
    fromDate: Date,
    toDate: Date,
    timeframe: string,
    userDateFormat: 'DD/MM' | 'MM/DD'
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
        const isEnd = cursor.toISOString().slice(0, 10) === toDate.toISOString().slice(0, 10);
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

export async function GET(request: NextRequest) {
    try {
        const supabase = createAdminClient()

        // Enforce authentication so this isn't globally exposed and Next.js knows it's dynamic
        const session = await getTeslaSession(request);
        if (!session) {
            console.warn('Analytics API: No Tesla session found.');
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Get timeframe from query params
        const { searchParams } = new URL(request.url)
        const timeframe = searchParams.get('timeframe') || 'week'
        let userUnits: 'imperial' | 'metric' = 'metric'; // DEFAULT TO METRIC
        let userDateFormat: 'DD/MM' | 'MM/DD' = 'DD/MM';

        try {
            const { data: settings } = await supabase
                .from('app_settings')
                .select('units, date_format')
                .eq('id', 'default')
                .single();

            if (settings?.units) {
                userUnits = settings.units as 'imperial' | 'metric';
            }
            if (settings?.date_format) {
                userDateFormat = settings.date_format as 'DD/MM' | 'MM/DD';
            }
        } catch (e) {
            console.warn('Could not fetch user settings (check SUPABASE_SERVICE_ROLE_KEY), defaulting to metric:', e);
        }
        // Calculate date range based on timeframe
        const toDate = new Date();
        toDate.setHours(23, 59, 59, 999); // End of day
        let fromDate = new Date();

        if (timeframe === 'custom') {
            const startDateParam = searchParams.get('startDate');
            const endDateParam = searchParams.get('endDate');
            if (startDateParam && endDateParam) {
                fromDate = new Date(startDateParam);
                fromDate.setHours(0, 0, 0, 0); // Start of day
                const customToDate = new Date(endDateParam);
                customToDate.setHours(23, 59, 59, 999); // End of day
                toDate.setTime(customToDate.getTime());
            }
        } else if (timeframe === '7days') {
            fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (timeframe === 'month') {
            fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
        } else if (timeframe === '30days') {
            fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        } else if (timeframe === '3months') {
            fromDate = new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        } else if (timeframe === 'year') {
            fromDate = new Date(toDate.getFullYear(), 0, 1);
            fromDate.setHours(0, 0, 0, 0);
        } else if (timeframe === 'alltime') {
            fromDate = new Date(0);
            fromDate.setHours(0, 0, 0, 0);
        } else {
            // Default: 'week' - Monday to Sunday of current week
            const day = toDate.getDay();
            const diff = toDate.getDate() - day + (day === 0 ? -6 : 1);
            fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), diff);
            fromDate.setHours(0, 0, 0, 0);
        }

        if (timeframe === 'alltime') {
            const [{ data: firstTrip }, { data: firstCharge }] = await Promise.all([
                supabase
                    .from('trips')
                    .select('start_time')
                    .eq('is_complete', true)
                    .order('start_time', { ascending: true })
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from('charging_sessions')
                    .select('start_time')
                    .eq('is_complete', true)
                    .order('start_time', { ascending: true })
                    .limit(1)
                    .maybeSingle(),
            ]);

            const candidateTimes = [firstTrip?.start_time, firstCharge?.start_time]
                .filter((value): value is string => Boolean(value))
                .map((value) => new Date(value).getTime())
                .filter((value) => Number.isFinite(value));

            if (candidateTimes.length > 0) {
                fromDate = new Date(Math.min(...candidateTimes));
                fromDate.setHours(0, 0, 0, 0);
            }
        }

        // Fetch completed trips in the date range
        const { data: trips, error } = await supabase
            .from('trips')
            .select('id, start_time, end_time, distance_miles, start_odometer, end_odometer, energy_used_kwh, start_battery_pct, end_battery_pct, min_outside_temp, max_outside_temp, avg_outside_temp')
            .eq('is_complete', true)
            .gte('start_time', fromDate.toISOString())
            .lte('start_time', toDate.toISOString())
            .order('start_time', { ascending: true })

        if (error) {
            console.error('Error fetching trips:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        const { mode: bucketMode, buckets } = buildBuckets(fromDate, toDate, timeframe, userDateFormat);
        const tripBucketData = new Map(
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

        // Calculate summary stats
        let totalDistance = 0
        let totalEnergy = 0
        let totalDrivingTime = 0
        const hourlyEfficiency: Record<number, { total: number; count: number }> = {}
        const distanceMultiplier = userUnits === 'metric' ? 1.60934 : 1;

        for (const trip of trips || []) {
            // Distance
            const distance = trip.distance_miles ||
                ((trip.end_odometer && trip.start_odometer)
                    ? trip.end_odometer - trip.start_odometer
                    : 0)
            totalDistance += distance

            // Energy
            const energy = trip.energy_used_kwh ||
                ((trip.start_battery_pct && trip.end_battery_pct)
                    ? (trip.start_battery_pct - trip.end_battery_pct) * 0.75 // Approx kWh
                    : 0)
            totalEnergy += energy

            // Driving time
            if (trip.start_time && trip.end_time) {
                const duration = new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()
                totalDrivingTime += duration / (1000 * 60 * 60) // Hours
            }

            // Bucket aggregation for charts
            const bucketKey = getBucketKey(trip.start_time, bucketMode);
            const bucket = tripBucketData.get(bucketKey);
            if (bucket) {
                bucket.distance += distance;
                bucket.energy += energy;
                bucket.trips += 1;
            }

            // Bucket trip into 2-hour time slot for efficiency chart
            const hour = new Date(trip.start_time).getHours()
            const hourBucket = Math.floor(hour / 2) * 2;
            const distInUserUnit = distance * distanceMultiplier;
            const efficiency = distInUserUnit > 0 ? (energy * 1000) / distInUserUnit : 0
            if (efficiency > 0) {
                if (!hourlyEfficiency[hourBucket]) {
                    hourlyEfficiency[hourBucket] = { total: 0, count: 0 }
                }
                hourlyEfficiency[hourBucket].total += efficiency
                hourlyEfficiency[hourBucket].count += 1
            }
        }

        const weeklyData = [...tripBucketData.values()].map((bucket) => ({
            day: bucket.day,
            dateKey: bucket.dateKey,
            axisLabel: bucket.axisLabel,
            tooltipLabel: bucket.tooltipLabel,
            distance: Math.round(bucket.distance * distanceMultiplier * 10) / 10,
            energy: Math.round(bucket.energy * 10) / 10,
            trips: bucket.trips,
        }));

        // Format efficiency by time of day — 12 slots, 2-hour buckets
        const timeSlots = [
            { bucket: 0, label: '00' }, { bucket: 2, label: '02' },
            { bucket: 4, label: '04' }, { bucket: 6, label: '06' },
            { bucket: 8, label: '08' }, { bucket: 10, label: '10' },
            { bucket: 12, label: '12' }, { bucket: 14, label: '14' },
            { bucket: 16, label: '16' }, { bucket: 18, label: '18' },
            { bucket: 20, label: '20' }, { bucket: 22, label: '22' },
        ];
        const efficiencyData = timeSlots.map(({ bucket, label }) => ({
            time: label,
            efficiency: hourlyEfficiency[bucket]
                ? Math.round(hourlyEfficiency[bucket].total / hourlyEfficiency[bucket].count)
                : 0,
        }));

        // Average efficiency (use converted distance in user units)
        const totalDistConverted = totalDistance * distanceMultiplier;
        const avgEfficiency = totalDistConverted > 0
            ? Math.round((totalEnergy * 1000) / totalDistConverted)
            : 260 // Default

        // Fetch charging sessions for the period
        const { data: chargingSessions, error: chargingError } = await supabase
            .from('charging_sessions')
            .select('id, energy_added_kwh, charger_type, cost_user_entered, currency, start_time')
            .eq('is_complete', true)
            .gte('start_time', fromDate.toISOString())
            .lte('start_time', toDate.toISOString())

        if (chargingError) {
            console.error('Error fetching charging sessions:', chargingError);
        }

        // Calculate charging mix from real data
        const chargingByType: Record<string, number> = { home: 0, supercharger: 0, destination: 0, '3rd_party_fast': 0, other: 0 }
        const costByType: Record<string, number> = {};
        let totalChargingEnergy = 0

        const typedChargingSessions = (chargingSessions || []) as ChargingSessionRecord[];
        const typedTrips = (trips || []) as TripRecord[];

        for (const session of typedChargingSessions) {
            // Column in DB is `charger_type` (see schema / telemetry server),
            // not `charging_type`. Fall back to 'other' if missing.
            const rawType = session.charger_type;
            const typeKey = (rawType ?? 'other').toLowerCase();

            // Normalise to our known buckets
            const normalisedKey =
                typeKey.includes('3rd_party_fast') ? '3rd_party_fast' :
                    typeKey.includes('super') ? 'supercharger' :
                        typeKey.includes('home') ? 'home' :
                            typeKey.includes('dest') ? 'destination' :
                                'other';

            // Accumulate cost by type (for ALL sessions, even without energy)
            const sessionCost = session.cost_user_entered || 0;
            if (!costByType[normalisedKey]) costByType[normalisedKey] = 0;
            costByType[normalisedKey] += sessionCost;

            const energy = session.energy_added_kwh || 0;
            if (energy <= 0) continue;

            totalChargingEnergy += energy;
            chargingByType[normalisedKey] = (chargingByType[normalisedKey] || 0) + energy;
        }

        // --- NEW: Calculate Total Cost & Daily Charging Data ---
        let totalChargingCost = 0;
        const chargingBucketData = new Map(
            buckets.map((bucket) => [bucket.key, {
                day: bucket.label,
                dateKey: bucket.key,
                axisLabel: bucket.axisLabel,
                tooltipLabel: bucket.tooltipLabel,
                energy: 0,
                cost: 0,
                sessions: 0,
            }])
        );

        for (const session of typedChargingSessions) {
            // Aggregate Total Cost (simple sum here, ignoring currency conversion complexity for MVP)
            const cost = session.cost_user_entered || 0;
            totalChargingCost += cost;

            const bucketKey = getBucketKey(session.start_time, bucketMode);
            const bucket = chargingBucketData.get(bucketKey);
            if (bucket) {
                bucket.energy += (session.energy_added_kwh || 0);
                bucket.cost += cost;
                bucket.sessions += 1;
            }
        }

        const formattedDailyChargingData = [...chargingBucketData.values()].map((bucket) => ({
            day: bucket.day,
            dateKey: bucket.dateKey,
            axisLabel: bucket.axisLabel,
            tooltipLabel: bucket.tooltipLabel,
            energy: Math.round(bucket.energy * 10) / 10,
            cost: Math.round(bucket.cost * 100) / 100,
            sessions: bucket.sessions,
        }));

        // Calculate average cost per kwh
        const avgCostPerKwh = totalChargingEnergy > 0 ? totalChargingCost / totalChargingEnergy : 0;


        // Calculate percentages
        const chargingMix = totalChargingEnergy > 0 ? [
            { name: 'Home', value: Math.round((chargingByType.home / totalChargingEnergy) * 100), color: '#22c55e' },
            { name: 'Supercharger', value: Math.round((chargingByType.supercharger / totalChargingEnergy) * 100), color: '#ef4444' },
            { name: '3rd Party DC', value: Math.round((chargingByType['3rd_party_fast'] / totalChargingEnergy) * 100), color: '#f97316' }, // Orange slice
            { name: 'Destination', value: Math.round((chargingByType.destination / totalChargingEnergy) * 100), color: '#3b82f6' },
            { name: 'Other', value: Math.round((chargingByType.other / totalChargingEnergy) * 100), color: '#6b7280' },
        ].filter(item => item.value > 0) : [
            // Default if no charging data for this timeframe
            { name: 'No Data', value: 100, color: '#334155' },
        ]

        // Cost by source breakdown
        const sourceColorMap: Record<string, { name: string; color: string }> = {
            home: { name: 'Home', color: '#22c55e' },
            supercharger: { name: 'Supercharger', color: '#ef4444' },
            '3rd_party_fast': { name: '3rd Party DC', color: '#f97316' },
            destination: { name: 'Destination', color: '#3b82f6' },
            other: { name: 'Other', color: '#6b7280' },
        };
        const costBySource = Object.entries(costByType)
            .filter(([, cost]) => cost > 0)
            .map(([key, cost]) => ({
                name: sourceColorMap[key]?.name || key,
                cost: Math.round(cost * 100) / 100,
                color: sourceColorMap[key]?.color || '#6b7280',
            }))
            .sort((a, b) => b.cost - a.cost);

        // --- Previous period comparison for trend % ---
        const periodMs = toDate.getTime() - fromDate.getTime();
        const prevToDate = new Date(fromDate.getTime() - 1); // 1ms before current period start
        const prevFromDate = new Date(prevToDate.getTime() - periodMs);

        const { data: prevTrips } = await supabase
            .from('trips')
            .select('distance_miles, start_odometer, end_odometer, energy_used_kwh, start_battery_pct, end_battery_pct, start_time, end_time')
            .eq('is_complete', true)
            .gte('start_time', prevFromDate.toISOString())
            .lte('start_time', prevToDate.toISOString());

        let prevDistance = 0;
        let prevEnergy = 0;
        let prevDrivingTime = 0;

        for (const trip of prevTrips || []) {
            const d = trip.distance_miles ||
                ((trip.end_odometer && trip.start_odometer) ? trip.end_odometer - trip.start_odometer : 0);
            prevDistance += d;

            const e = trip.energy_used_kwh ||
                ((trip.start_battery_pct && trip.end_battery_pct)
                    ? (trip.start_battery_pct - trip.end_battery_pct) * 0.75 : 0);
            prevEnergy += e;

            if (trip.start_time && trip.end_time) {
                prevDrivingTime += (new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()) / (1000 * 60 * 60);
            }
        }

        const prevDistConverted = prevDistance * distanceMultiplier;
        const prevEfficiency = prevDistConverted > 0 ? (prevEnergy * 1000) / prevDistConverted : 0;

        // Calculate % change (positive = increase)
        const pctChange = (curr: number, prev: number) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return Math.round(((curr - prev) / prev) * 100);
        };

        const trends = {
            distance: pctChange(totalDistance * distanceMultiplier, prevDistConverted),
            energy: pctChange(totalEnergy, prevEnergy),
            efficiency: pctChange(avgEfficiency, prevEfficiency),
            drivingTime: pctChange(totalDrivingTime, prevDrivingTime),
        };

        // --- NEW: ADVANCED ANALYTICS ---

        // 1. Top Trips Leaderboard
        const validTrips: LeaderboardTrip[] = typedTrips.map((t) => {
            const dist = t.distance_miles ||
            ((t.end_odometer && t.start_odometer) ? t.end_odometer - t.start_odometer : 0);
            const energy = t.energy_used_kwh ||
            ((t.start_battery_pct && t.end_battery_pct) ? (t.start_battery_pct - t.end_battery_pct) * 0.75 : 0);
            
            const distInUnits = dist * distanceMultiplier;
            const efficiency = distInUnits > 0 ? (energy * 1000) / distInUnits : 0;
            
            return { ...t, calculatedDistance: dist, calculatedEnergy: energy, calculatedEfficiency: efficiency };
        }).filter(t => t.calculatedDistance > 0.1 && t.calculatedEfficiency > 0);

        const topTrips = {
            longest: validTrips.length > 0 ? validTrips.reduce((prev, curr) => curr.calculatedDistance > prev.calculatedDistance ? curr : prev) : null,
            shortest: validTrips.length > 0 ? validTrips.reduce((prev, curr) => curr.calculatedDistance < prev.calculatedDistance ? curr : prev) : null,
            mostEfficient: validTrips.length > 0 ? validTrips.reduce((prev, curr) => {
                return (curr.calculatedEfficiency < prev.calculatedEfficiency) ? curr : prev;
            }) : null,
        };

        const formatTripForLeaderboard = (trip: LeaderboardTrip | null) => {
            if (!trip) return null;
            const dist = trip.calculatedDistance * distanceMultiplier;
            return {
                id: trip.id,
                date: new Date(trip.start_time).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
                distance: Math.round(dist * 10) / 10,
                efficiency: Math.round(trip.calculatedEfficiency),
            };
        };

        // 2. Fetch Snapshots for Vampire Drain & Temperature Impact
        const { data: snapshots } = await supabase
            .from('vehicle_snapshots')
            .select('timestamp, battery_level, battery_range, outside_temp, charging_state, shift_state')
            .gte('timestamp', fromDate.toISOString())
            .lte('timestamp', toDate.toISOString())
            .order('timestamp', { ascending: true });
        const typedSnapshots = (snapshots || []) as SnapshotRecord[];

        console.log(`[Analytics] Found ${trips?.length || 0} trips and ${snapshots?.length || 0} snapshots`);

        // Calculate Vampire Drain (trip-to-trip estimation)
        // We look at the battery drop between consecutive trips (End of Trip N to Start of Trip N+1)
        let vampireDrainKwh = 0;
        const allTripsForDrain = typedTrips;
        if (allTripsForDrain.length > 1) {
            for (let i = 1; i < allTripsForDrain.length; i++) {
                const prevTrip = allTripsForDrain[i - 1];
                const currTrip = allTripsForDrain[i];
                
                if (prevTrip.end_battery_pct !== null && currTrip.start_battery_pct !== null) {
                    const batteryDrop = prevTrip.end_battery_pct - currTrip.start_battery_pct;
                    
                    // If battery dropped between trips, and it's a reasonable drop (ignore charging or weird resets)
                    if (batteryDrop > 0.1 && batteryDrop < 15) {
                        // Check if there was a charging session in between to avoid counting charging as drain
                        const hasChargingBetween = typedChargingSessions.some((s) => {
                            const sessionStart = new Date(s.start_time).getTime();
                            const prevEnd = new Date(prevTrip.end_time || '').getTime();
                            const currStart = new Date(currTrip.start_time || '').getTime();
                            return sessionStart > prevEnd && sessionStart < currStart;
                        });

                        if (!hasChargingBetween) {
                            vampireDrainKwh += (batteryDrop / 100) * 75; // Approx 75kWh pack
                        }
                    }
                }
            }
        }
        
        console.log(`[Analytics] Trip-based Vampire Drain calculated: ${vampireDrainKwh.toFixed(2)} kWh`);

        // Calculate Temperature Impact
        const tempBuckets: Record<number, { totalEff: number, count: number }> = {};
        for (const trip of validTrips) {
            if (!trip.end_time) {
                continue;
            }

            const start = new Date(trip.start_time).getTime();
            const end = new Date(trip.end_time).getTime();
            const tripSnapshots = typedSnapshots.filter((s) => {
                const t = new Date(s.timestamp).getTime();
                return t >= start && t <= end;
            });

            if (tripSnapshots.length > 0) {
                const avgTemp = tripSnapshots.reduce((acc, s) => acc + (s.outside_temp || 0), 0) / tripSnapshots.length;
                const bucket = Math.round(avgTemp / 5) * 5; // 5 degree buckets
                
                const dist = (trip.distance_miles || 0) * distanceMultiplier;
                const efficiency = dist > 0 ? ((trip.energy_used_kwh || 0) * 1000) / dist : 0;

                if (efficiency > 100 && efficiency < 600) {
                    if (!tempBuckets[bucket]) tempBuckets[bucket] = { totalEff: 0, count: 0 };
                    tempBuckets[bucket].totalEff += efficiency;
                    tempBuckets[bucket].count += 1;
                }
            }
        }

        let temperatureImpact = Object.keys(tempBuckets)
            .map(temp => ({
                temp: parseInt(temp),
                efficiency: Math.round(tempBuckets[parseInt(temp)].totalEff / tempBuckets[parseInt(temp)].count)
            }))
            .sort((a, b) => a.temp - b.temp);

        // Fallback: If snapshots provided no temp data, use the aggregated columns from the trips table
        if (temperatureImpact.length === 0) {
            const fallbackBuckets: Record<number, { totalEff: number, count: number }> = {};
            // Only use trips that actually have temperature data
            const tripsWithTemp = validTrips.filter(t => t.avg_outside_temp !== null && t.avg_outside_temp !== undefined);
            for (const trip of tripsWithTemp) {
                const avgOutsideTemp = trip.avg_outside_temp;
                if (avgOutsideTemp == null) {
                    continue;
                }

                const bucket = Math.round(avgOutsideTemp / 5) * 5;
                const efficiency = trip.calculatedEfficiency;
                
                if (efficiency > 100 && efficiency < 600) {
                    if (!fallbackBuckets[bucket]) fallbackBuckets[bucket] = { totalEff: 0, count: 0 };
                    fallbackBuckets[bucket].totalEff += efficiency;
                    fallbackBuckets[bucket].count += 1;
                }
            }
            
            temperatureImpact = Object.keys(fallbackBuckets)
                .map(temp => ({
                    temp: parseInt(temp),
                    efficiency: Math.round(fallbackBuckets[parseInt(temp)].totalEff / fallbackBuckets[parseInt(temp)].count)
                }))
                .sort((a, b) => a.temp - b.temp);
        }

        return NextResponse.json({
            success: true,
            timeframe,
            fromDate: fromDate.toISOString(),
            toDate: toDate.toISOString(),
            summary: {
                totalDistance: Math.round(totalDistance * distanceMultiplier * 10) / 10,
                totalEnergy: Math.round(totalEnergy * 10) / 10,
                avgEfficiency: Math.round(avgEfficiency),
                drivingTime: Math.round(totalDrivingTime * 10) / 10,
                tripCount: trips?.length || 0,
                chargingSessions: chargingSessions?.length || 0,
                totalChargingEnergy: Math.round(totalChargingEnergy * 10) / 10,
                totalChargingCost: Math.round(totalChargingCost * 100) / 100,
                avgCostPerKwh: Math.round(avgCostPerKwh * 100) / 100,
                vampireDrainKwh: Math.round(vampireDrainKwh * 10) / 10,
                trends,
            },
            weeklyData,
            efficiencyData,
            chargingMix,
            dailyChargingData: formattedDailyChargingData,
            leaderboard: {
                longest: formatTripForLeaderboard(topTrips.longest),
                shortest: formatTripForLeaderboard(topTrips.shortest),
                mostEfficient: formatTripForLeaderboard(topTrips.mostEfficient),
            },
            temperatureImpact,
            costBySource,
        })
    } catch (err: unknown) {
        console.error('CRITICAL Analytics error:', err);
        const message = err instanceof Error ? err.message : 'Failed to fetch analytics';
        const stack = err instanceof Error ? err.stack : undefined;
        return NextResponse.json({ success: false, error: message, stack }, { status: 500 });
    }
}
