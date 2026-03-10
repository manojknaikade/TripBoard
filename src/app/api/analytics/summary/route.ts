import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const supabase = createAdminClient()

        // Enforce authentication so this isn't globally exposed and Next.js knows it's dynamic
        const accessToken = request.cookies.get('tesla_access_token')?.value;
        if (!accessToken) {
            console.warn('Analytics API: No tesla_access_token found in cookies. This may be due to the "secure" flag on localhost in prod build.');
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Get timeframe from query params
        const { searchParams } = new URL(request.url)
        const timeframe = searchParams.get('timeframe') || 'week'
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')

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
        } else {
            // Default: 'week' - Monday to Sunday of current week
            const day = toDate.getDay();
            const diff = toDate.getDate() - day + (day === 0 ? -6 : 1);
            fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), diff);
            fromDate.setHours(0, 0, 0, 0);
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

        // Calculate summary stats
        let totalDistance = 0
        let totalEnergy = 0
        let totalDrivingTime = 0
        const dailyData: Record<string, { distance: number; energy: number; trips: number }> = {}
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

            // Daily aggregation
            const day = new Date(trip.start_time).toLocaleDateString('en-US', { weekday: 'short' })
            if (!dailyData[day]) {
                dailyData[day] = { distance: 0, energy: 0, trips: 0 }
            }
            dailyData[day].distance += distance
            dailyData[day].energy += energy
            dailyData[day].trips += 1

            // Bucket trip into 2-hour time slot for efficiency chart
            const hour = new Date(trip.start_time).getHours()
            const bucket = Math.floor(hour / 2) * 2;
            const distInUserUnit = distance * distanceMultiplier;
            const efficiency = distInUserUnit > 0 ? (energy * 1000) / distInUserUnit : 0
            if (efficiency > 0) {
                if (!hourlyEfficiency[bucket]) {
                    hourlyEfficiency[bucket] = { total: 0, count: 0 }
                }
                hourlyEfficiency[bucket].total += efficiency
                hourlyEfficiency[bucket].count += 1
            }
        }

        // Format data for charts based on timeframe
        let weeklyData: Array<{ day: string; distance: number; energy: number; trips: number }>;

        if (timeframe === 'week') {
            // For weekly view, use weekday names
            const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            weeklyData = weekDays.map(day => {
                const rawDistance = dailyData[day]?.distance || 0;
                const convertedDistance = Math.round(rawDistance * distanceMultiplier * 10) / 10;
                return {
                    day,
                    distance: convertedDistance,
                    energy: Math.round((dailyData[day]?.energy || 0) * 10) / 10,
                    trips: dailyData[day]?.trips || 0,
                };
            });
        } else {
            // For month/30days/3months, generate date-based data
            const dataByDate: Record<string, { distance: number; energy: number; trips: number }> = {};

            for (const trip of trips || []) {
                const tripDate = new Date(trip.start_time);
                const m = tripDate.getMonth() + 1;
                const d = tripDate.getDate();
                const dateKey = userDateFormat === 'MM/DD' ? `${m}/${d}` : `${d}/${m}`;

                // Get distance (with fallback to odometer)
                const distance = trip.distance_miles ||
                    ((trip.end_odometer && trip.start_odometer)
                        ? trip.end_odometer - trip.start_odometer
                        : 0);

                // Get energy (with fallback to battery delta)
                let energy = trip.energy_used_kwh || 0;
                if (!energy && trip.start_battery_pct && trip.end_battery_pct) {
                    const delta = trip.start_battery_pct - trip.end_battery_pct;
                    if (delta > 0) {
                        energy = (delta / 100) * 75; // Approximate kWh for Tesla
                    }
                }

                if (!dataByDate[dateKey]) {
                    dataByDate[dateKey] = { distance: 0, energy: 0, trips: 0 };
                }
                dataByDate[dateKey].distance += distance;
                dataByDate[dateKey].energy += energy;
                dataByDate[dateKey].trips += 1;
            }

            // Generate array with one entry per day in range
            const currentDate = new Date(fromDate);
            const endDateCalc = new Date(toDate);
            weeklyData = [];

            while (currentDate <= endDateCalc) {
                const m = currentDate.getMonth() + 1;
                const d = currentDate.getDate();
                const dateKey = userDateFormat === 'MM/DD' ? `${m}/${d}` : `${d}/${m}`;
                weeklyData.push({
                    day: dateKey,
                    distance: Math.round((dataByDate[dateKey]?.distance || 0) * distanceMultiplier * 10) / 10,
                    energy: Math.round((dataByDate[dateKey]?.energy || 0) * 10) / 10,
                    trips: dataByDate[dateKey]?.trips || 0,
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }

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

        for (const session of chargingSessions || []) {
            // Column in DB is `charger_type` (see schema / telemetry server),
            // not `charging_type`. Fall back to 'other' if missing.
            const rawType = (session as any).charger_type as string | null | undefined;
            const typeKey = (rawType ?? 'other').toLowerCase();

            // Normalise to our known buckets
            const normalisedKey =
                typeKey.includes('3rd_party_fast') ? '3rd_party_fast' :
                    typeKey.includes('super') ? 'supercharger' :
                        typeKey.includes('home') ? 'home' :
                            typeKey.includes('dest') ? 'destination' :
                                'other';

            // Accumulate cost by type (for ALL sessions, even without energy)
            const sessionCost = (session as any).cost_user_entered || 0;
            if (!costByType[normalisedKey]) costByType[normalisedKey] = 0;
            costByType[normalisedKey] += sessionCost;

            const energy = session.energy_added_kwh || 0;
            if (energy <= 0) continue;

            totalChargingEnergy += energy;
            chargingByType[normalisedKey] = (chargingByType[normalisedKey] || 0) + energy;
        }

        // --- NEW: Calculate Total Cost & Daily Charging Data ---
        let totalChargingCost = 0;
        const dailyChargingData: Record<string, { energy: number; cost: number; sessions: number }> = {};

        for (const session of chargingSessions || []) {
            // Aggregate Total Cost (simple sum here, ignoring currency conversion complexity for MVP)
            const cost = session.cost_user_entered || 0;
            totalChargingCost += cost;

            // Group by Day (using the same 'day' keys as weeklyData depending on timeframe)
            const d = new Date(session.start_time);
            let dayKey = d.toLocaleDateString('en-US', { weekday: 'short' });
            if (timeframe !== 'week') {
                const m = d.getMonth() + 1;
                const dNum = d.getDate();
                dayKey = userDateFormat === 'MM/DD' ? `${m}/${dNum}` : `${dNum}/${m}`;
            }

            if (!dailyChargingData[dayKey]) {
                dailyChargingData[dayKey] = { energy: 0, cost: 0, sessions: 0 };
            }

            dailyChargingData[dayKey].energy += (session.energy_added_kwh || 0);
            dailyChargingData[dayKey].cost += cost;
            dailyChargingData[dayKey].sessions += 1;
        }

        // Format daily charging array to match weeklyData exactly
        const formattedDailyChargingData = timeframe === 'week'
            ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
                day,
                energy: Math.round((dailyChargingData[day]?.energy || 0) * 10) / 10,
                cost: Math.round((dailyChargingData[day]?.cost || 0) * 100) / 100,
                sessions: dailyChargingData[day]?.sessions || 0,
            }))
            : weeklyData.map(w => ({
                day: w.day,
                energy: Math.round((dailyChargingData[w.day]?.energy || 0) * 10) / 10,
                cost: Math.round((dailyChargingData[w.day]?.cost || 0) * 100) / 100,
                sessions: dailyChargingData[w.day]?.sessions || 0,
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
        const validTrips = (trips || []).map(t => {
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

        const formatTripForLeaderboard = (trip: any) => {
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

        console.log(`[Analytics] Found ${trips?.length || 0} trips and ${snapshots?.length || 0} snapshots`);

        // Calculate Vampire Drain (trip-to-trip estimation)
        // We look at the battery drop between consecutive trips (End of Trip N to Start of Trip N+1)
        let vampireDrainKwh = 0;
        const allTripsForDrain = trips || [];
        if (allTripsForDrain.length > 1) {
            for (let i = 1; i < allTripsForDrain.length; i++) {
                const prevTrip = allTripsForDrain[i - 1];
                const currTrip = allTripsForDrain[i];
                
                if (prevTrip.end_battery_pct !== null && currTrip.start_battery_pct !== null) {
                    const batteryDrop = prevTrip.end_battery_pct - currTrip.start_battery_pct;
                    
                    // If battery dropped between trips, and it's a reasonable drop (ignore charging or weird resets)
                    if (batteryDrop > 0.1 && batteryDrop < 15) {
                        // Check if there was a charging session in between to avoid counting charging as drain
                        const hasChargingBetween = (chargingSessions || []).some(s => {
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
            const start = new Date(trip.start_time).getTime();
            const end = new Date(trip.end_time).getTime();
            const tripSnapshots = (snapshots || []).filter(s => {
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
                const bucket = Math.round(trip.avg_outside_temp / 5) * 5;
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
    } catch (err: any) {
        console.error('CRITICAL Analytics error:', err);
        return NextResponse.json({ success: false, error: err.message || 'Failed to fetch analytics', stack: err.stack }, { status: 500 });
    }
}
