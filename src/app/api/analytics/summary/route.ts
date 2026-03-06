import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

    // Get user settings to determine units
    let userUnits: 'imperial' | 'metric' = 'metric'; // DEFAULT TO METRIC

    try {
        const { data: settings } = await supabase
            .from('app_settings')
            .select('units')
            .eq('id', 'default')
            .single();

        if (settings?.units) {
            userUnits = settings.units as 'imperial' | 'metric';
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
    } else {
        // Default: 'week' - Monday to Sunday of current week
        const day = toDate.getDay();
        const diff = toDate.getDate() - day + (day === 0 ? -6 : 1);
        fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), diff);
        fromDate.setHours(0, 0, 0, 0);
    }

    try {
        // Fetch completed trips in the date range
        const { data: trips, error } = await supabase
            .from('trips')
            .select('*')
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
                const dateKey = `${tripDate.getMonth() + 1}/${tripDate.getDate()}`;

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
                const dateKey = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;
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
            { bucket: 0, label: '12am' }, { bucket: 2, label: '2am' },
            { bucket: 4, label: '4am' }, { bucket: 6, label: '6am' },
            { bucket: 8, label: '8am' }, { bucket: 10, label: '10am' },
            { bucket: 12, label: '12pm' }, { bucket: 14, label: '2pm' },
            { bucket: 16, label: '4pm' }, { bucket: 18, label: '6pm' },
            { bucket: 20, label: '8pm' }, { bucket: 22, label: '10pm' },
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
        const { data: chargingSessions } = await supabase
            .from('charging_sessions')
            .select('*')
            .eq('is_complete', true)
            .gte('start_time', fromDate.toISOString())
            .lte('start_time', toDate.toISOString())

        // Calculate charging mix from real data
        const chargingByType: Record<string, number> = { home: 0, supercharger: 0, destination: 0, '3rd_party_fast': 0, other: 0 }
        let totalChargingEnergy = 0

        for (const session of chargingSessions || []) {
            const energy = session.energy_added_kwh || 0;
            if (energy <= 0) continue;

            totalChargingEnergy += energy;

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

            chargingByType[normalisedKey] = (chargingByType[normalisedKey] || 0) + energy;
        }

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

        // --- Previous period comparison for trend % ---
        const periodMs = toDate.getTime() - fromDate.getTime();
        const prevToDate = new Date(fromDate.getTime() - 1); // 1ms before current period start
        const prevFromDate = new Date(prevToDate.getTime() - periodMs);

        const { data: prevTrips } = await supabase
            .from('trips')
            .select('*')
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
                trends,
            },
            weeklyData,
            efficiencyData,
            chargingMix,
        })
    } catch (err) {
        console.error('Analytics error:', err)
        return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
    }
}
