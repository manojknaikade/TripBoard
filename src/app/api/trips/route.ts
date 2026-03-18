import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getTeslaSession } from '@/lib/tesla/auth-server';
import {
    dedupeRoutePoints,
    extractRoutePointFromTelemetry,
    sampleRoutePoints,
    type TripRoutePoint,
} from '@/lib/trips/routePoints';

async function getSupabase() {
    return createClient();
}

async function getTelemetrySupabase() {
    return createAdminClient();
}

type TripWaypointRow = {
    trip_id: string;
    timestamp: string;
    latitude: number;
    longitude: number;
};

type TelemetryRawRow = {
    timestamp: string;
    payload: {
        data?: Array<{
            key?: string;
            value?: Record<string, unknown>;
        }>;
    } | null;
};

type TripWithVin = {
    id: string;
    vin: string;
    start_time: string;
    end_time: string | null;
};

type TripForVinResolution = {
    id: string;
    vin: string | null;
    vehicle_id: string | null;
    start_time: string;
    end_time: string | null;
};

type TripListRow = {
    id: string;
    vin: string | null;
    vehicle_id: string | null;
    start_time: string;
    end_time: string | null;
    start_latitude: number | null;
    start_longitude: number | null;
    start_address: string | null;
    end_latitude: number | null;
    end_longitude: number | null;
    end_address: string | null;
    distance_miles: number | null;
    energy_used_kwh: number | null;
    start_battery_pct: number | null;
    end_battery_pct: number | null;
    start_odometer: number | null;
    end_odometer: number | null;
    max_speed_mph: number | null;
    avg_speed_mph: number | null;
    min_outside_temp: number | null;
    max_outside_temp: number | null;
    avg_outside_temp: number | null;
    is_complete: boolean | null;
};

type TripSummaryRow = Pick<
    TripListRow,
    'distance_miles'
    | 'start_odometer'
    | 'end_odometer'
    | 'energy_used_kwh'
    | 'start_battery_pct'
    | 'end_battery_pct'
>;

type NumericLike = number | string | null;

type TripListSummaryRpcRow = {
    total_trips: NumericLike;
    total_distance: NumericLike;
    total_energy: NumericLike;
    avg_efficiency: NumericLike;
};

function parseNumericLike(value: NumericLike): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

const MAX_THUMBNAIL_POINTS = 24;
const MAX_TELEMETRY_THUMBNAIL_FALLBACK_TRIPS = 8;
const TRIP_LIST_SELECT = [
    'id',
    'vin',
    'vehicle_id',
    'start_time',
    'end_time',
    'start_latitude',
    'start_longitude',
    'start_address',
    'end_latitude',
    'end_longitude',
    'end_address',
    'distance_miles',
    'energy_used_kwh',
    'start_battery_pct',
    'end_battery_pct',
    'start_odometer',
    'end_odometer',
    'max_speed_mph',
    'avg_speed_mph',
    'min_outside_temp',
    'max_outside_temp',
    'avg_outside_temp',
    'is_complete',
].join(', ');
const TRIP_SUMMARY_SELECT = [
    'distance_miles',
    'start_odometer',
    'end_odometer',
    'energy_used_kwh',
    'start_battery_pct',
    'end_battery_pct',
].join(', ');

function getTripDistance(trip: TripSummaryRow): number {
    if (trip.distance_miles != null) {
        return Number(trip.distance_miles) || 0;
    }

    if (trip.start_odometer != null && trip.end_odometer != null) {
        return Number(trip.end_odometer) - Number(trip.start_odometer);
    }

    return 0;
}

function getTripEnergy(trip: TripSummaryRow): number {
    if (trip.energy_used_kwh != null) {
        return Number(trip.energy_used_kwh) || 0;
    }

    if (trip.start_battery_pct != null && trip.end_battery_pct != null) {
        const batteryDelta = Number(trip.start_battery_pct) - Number(trip.end_battery_pct);

        if (batteryDelta > 0) {
            return (batteryDelta / 100) * 75;
        }
    }

    return 0;
}

async function loadTripSummaryFallback(
    supabase: Awaited<ReturnType<typeof getSupabase>>,
    options: {
        from: string | null;
        to: string | null;
        vehicleId: string | null;
    }
) {
    let query = supabase
        .from('trips')
        .select(TRIP_SUMMARY_SELECT);

    if (options.from) {
        query = query.gte('start_time', options.from);
    }
    if (options.to) {
        query = query.lte('start_time', options.to);
    }
    if (options.vehicleId) {
        query = query.eq('vehicle_id', options.vehicleId);
    }

    const { data, error } = await query;

    if (error) {
        throw error;
    }

    const rows = ((data || []) as unknown) as TripSummaryRow[];
    let totalTrips = 0;
    let totalDistance = 0;
    let totalEnergy = 0;

    for (const row of rows) {
        const distance = getTripDistance(row);

        if (distance < 0.3) {
            continue;
        }

        totalTrips += 1;
        totalDistance += distance;
        totalEnergy += getTripEnergy(row);
    }

    return {
        totalTrips,
        totalDistance,
        totalEnergy,
        avgEfficiency: totalDistance > 0 ? (totalEnergy * 1000) / totalDistance : 0,
    };
}

async function loadTripSummary(
    supabase: Awaited<ReturnType<typeof getSupabase>>,
    options: {
        from: string | null;
        to: string | null;
        vehicleId: string | null;
    }
) {
    const { data, error } = await supabase.rpc('get_trip_list_summary', {
        p_from: options.from,
        p_to: options.to,
        p_vehicle_id: options.vehicleId,
    });

    if (error) {
        console.warn('Trip list summary RPC unavailable, using in-route fallback:', error.message);
        return loadTripSummaryFallback(supabase, options);
    }

    const summaryRow = (data?.[0] ?? null) as TripListSummaryRpcRow | null;

    if (!summaryRow) {
        return {
            totalTrips: 0,
            totalDistance: 0,
            totalEnergy: 0,
            avgEfficiency: 0,
        };
    }

    return {
        totalTrips: Math.round(parseNumericLike(summaryRow.total_trips)),
        totalDistance: parseNumericLike(summaryRow.total_distance),
        totalEnergy: parseNumericLike(summaryRow.total_energy),
        avgEfficiency: parseNumericLike(summaryRow.avg_efficiency),
    };
}

async function resolveTripsWithVin(
    supabase: Awaited<ReturnType<typeof getSupabase>>,
    trips: TripForVinResolution[]
) {
    const vehicleIds = Array.from(
        new Set(
            trips
                .map((trip) => trip.vehicle_id)
                .filter((vehicleId): vehicleId is string =>
                    typeof vehicleId === 'string' && !vehicleId.startsWith('vehicle_device.')
                )
        )
    );

    const vehicleVinMap = new Map<string, string>();

    if (vehicleIds.length > 0) {
        const { data: vehicles, error } = await supabase
            .from('vehicles')
            .select('id, vin')
            .in('id', vehicleIds);

        if (error) {
            throw error;
        }

        for (const vehicle of vehicles || []) {
            if (vehicle.id && vehicle.vin) {
                vehicleVinMap.set(vehicle.id, vehicle.vin);
            }
        }
    }

    return trips.flatMap((trip) => {
        const resolvedVin =
            trip.vin
            || (trip.vehicle_id?.startsWith('vehicle_device.') ? trip.vehicle_id : null)
            || (trip.vehicle_id ? vehicleVinMap.get(trip.vehicle_id) || null : null);

        if (!resolvedVin) {
            return [];
        }

        return [{
            id: trip.id,
            vin: resolvedVin,
            start_time: trip.start_time,
            end_time: trip.end_time,
        }];
    });
}

async function loadStoredThumbnailRoutePoints(
    supabase: Awaited<ReturnType<typeof getSupabase>>,
    tripIds: string[]
) {
    const routePointMap = new Map<string, TripRoutePoint[]>();

    if (tripIds.length === 0) {
        return routePointMap;
    }

    const { data: waypointRows, error } = await supabase
        .from('trip_waypoints')
        .select('trip_id, timestamp, latitude, longitude')
        .in('trip_id', tripIds)
        .order('trip_id', { ascending: true })
        .order('timestamp', { ascending: true });

    if (error) {
        throw error;
    }

    const rows = (waypointRows || []) as TripWaypointRow[];
    const groupedRows = new Map<string, TripRoutePoint[]>();

    for (const row of rows) {
        const points = groupedRows.get(row.trip_id) || [];
        points.push({
            timestamp: row.timestamp,
            latitude: row.latitude,
            longitude: row.longitude,
            speed_mph: null,
            battery_level: null,
            odometer: null,
            heading: null,
        });
        groupedRows.set(row.trip_id, points);
    }

    for (const [tripId, points] of groupedRows) {
        routePointMap.set(
            tripId,
            sampleRoutePoints(dedupeRoutePoints(points), MAX_THUMBNAIL_POINTS)
        );
    }

    return routePointMap;
}

async function loadThumbnailRoutePointsFromTelemetry(
    supabase: ReturnType<typeof createAdminClient>,
    tripId: string,
    vin: string | null,
    startTime: string,
    endTime: string | null
) {
    void tripId;

    if (!vin) {
        return [];
    }

    const fromTimestamp = new Date(new Date(startTime).getTime() - 30_000).toISOString();
    const toTimestamp = new Date(
        endTime
            ? new Date(endTime).getTime() + 30_000
            : Date.now()
    ).toISOString();

    const { data: telemetryRows, error: telemetryError } = await supabase
        .from('telemetry_raw')
        .select('timestamp, payload')
        .eq('vin', vin)
        .gte('timestamp', fromTimestamp)
        .lte('timestamp', toTimestamp)
        .order('timestamp', { ascending: true });

    if (telemetryError) {
        throw telemetryError;
    }

    const parsedPoints = ((telemetryRows || []) as TelemetryRawRow[])
        .map((row) => extractRoutePointFromTelemetry(row.timestamp, row.payload))
        .filter((point): point is TripRoutePoint => point !== null);

    return sampleRoutePoints(dedupeRoutePoints(parsedPoints), MAX_THUMBNAIL_POINTS);
}

// GET - List trips for the authenticated user
export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20'), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const includeSummary = searchParams.get('includeSummary') === '1';
    const vehicleId = searchParams.get('vehicleId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const supabase = await getSupabase();

    // Query trips - using the original schema structure
    let query = supabase
        .from('trips')
        .select(TRIP_LIST_SELECT)
        .order('start_time', { ascending: false });

    if (from) {
        query = query.gte('start_time', from);
    }
    if (to) {
        query = query.lte('start_time', to);
    }
    if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
    }

    query = query.range(offset, offset + limit);

    const [listResult, summary] = await Promise.all([
        query,
        includeSummary
            ? loadTripSummary(supabase, { from, to, vehicleId })
            : Promise.resolve(null),
    ]);

    const { data: trips, error } = listResult;

    if (error) {
        console.error('Trips fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const pagedTrips = ((trips || []) as unknown) as TripListRow[];
    const hasMore = pagedTrips.length > limit;
    const visibleTrips = pagedTrips.slice(0, limit);

    // Filter out very short trips (parking maneuvers) - minimum 0.3 miles / 0.5 km
    const MINIMUM_DISTANCE_MILES = 0.3;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredTrips = visibleTrips.filter((trip: any) => {
        const distance = trip.distance_miles ? parseFloat(trip.distance_miles.toString()) : 0;
        // Also calculate from odometer if available
        const odometerDistance = (trip.start_odometer && trip.end_odometer)
            ? parseFloat(trip.end_odometer.toString()) - parseFloat(trip.start_odometer.toString())
            : 0;
        const actualDistance = distance || odometerDistance;
        return actualDistance >= MINIMUM_DISTANCE_MILES;
    });

    // Transform to match frontend expectations
    let routePointMap = new Map<string, TripRoutePoint[]>();
    let tripsWithResolvedVin: TripWithVin[] = [];

    try {
        tripsWithResolvedVin = await resolveTripsWithVin(
            supabase,
            filteredTrips.map((trip) => ({
                id: trip.id,
                vin: typeof trip?.vin === 'string' ? trip.vin : null,
                vehicle_id: typeof trip?.vehicle_id === 'string' ? trip.vehicle_id : null,
                start_time: trip.start_time,
                end_time: trip.end_time,
            }))
        );
    } catch (vinError) {
        console.error('Trip VIN resolution error:', vinError);
    }

    const vinByTripId = new Map(tripsWithResolvedVin.map((trip) => [trip.id, trip.vin]));

    try {
        routePointMap = await loadStoredThumbnailRoutePoints(
            supabase,
            filteredTrips.map((trip) => trip.id)
        );
    } catch (routeError) {
        console.error('Trip thumbnail waypoint batch fetch error:', routeError);
    }

    const missingStoredRoutes = tripsWithResolvedVin.filter((trip) => !routePointMap.has(trip.id));

    // Telemetry fallback is the expensive path. Keep it for small result sets so
    // detail-rich recent views still work, but avoid turning large history ranges
    // into one telemetry query per trip.
    if (missingStoredRoutes.length > 0 && filteredTrips.length <= MAX_TELEMETRY_THUMBNAIL_FALLBACK_TRIPS) {
        const telemetrySupabase = await getTelemetrySupabase();
        await Promise.all(missingStoredRoutes.map(async (trip) => {
            try {
                const points = await loadThumbnailRoutePointsFromTelemetry(
                    telemetrySupabase,
                    trip.id,
                    vinByTripId.get(trip.id) || null,
                    trip.start_time,
                    trip.end_time
                );

                if (points.length > 0) {
                    routePointMap.set(trip.id, points);
                }
            } catch (routeError) {
                console.error(`Trip thumbnail route fallback fetch error for ${trip.id}:`, routeError);
            }
        }));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedTrips = filteredTrips.map((trip: any) => {
        // Calculate distance from odometer if distance_miles is null
        let distance = trip.distance_miles;
        if (!distance && trip.start_odometer && trip.end_odometer) {
            distance = trip.end_odometer - trip.start_odometer;
        }

        // Calculate energy from battery percentage if energy_used_kwh is null
        let energy = trip.energy_used_kwh;
        if (!energy && trip.start_battery_pct && trip.end_battery_pct) {
            const batteryDelta = trip.start_battery_pct - trip.end_battery_pct;
            if (batteryDelta > 0) {
                // Assume 75 kWh battery capacity for Tesla Model 3
                energy = (batteryDelta / 100) * 75;
            }
        }

        const durationSeconds = trip.end_time
            ? Math.floor((new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()) / 1000)
            : null;

        return {
            id: trip.id,
            vehicle_id: trip.vehicle_id || trip.vin,
            started_at: trip.start_time,
            ended_at: trip.end_time,
            duration_seconds: durationSeconds,
            start_latitude: trip.start_latitude,
            start_longitude: trip.start_longitude,
            start_address: trip.start_address,
            end_latitude: trip.end_latitude,
            end_longitude: trip.end_longitude,
            end_address: trip.end_address,
            distance_miles: distance,
            energy_used_kwh: energy,
            efficiency_wh_mi: distance && energy ? (energy * 1000) / distance : null,
            start_battery_level: trip.start_battery_pct,
            end_battery_level: trip.end_battery_pct,
            max_speed: trip.max_speed_mph,
            avg_speed: trip.avg_speed_mph || (distance && durationSeconds && durationSeconds > 0
                ? Math.round((distance / (durationSeconds / 3600)) * 10) / 10
                : null),
            min_outside_temp: trip.min_outside_temp ?? null,
            max_outside_temp: trip.max_outside_temp ?? null,
            avg_outside_temp: trip.avg_outside_temp ?? null,
            status: trip.is_complete ? 'completed' : 'in_progress',
            route_points: routePointMap.get(trip.id) || [],
        };
    });

    return NextResponse.json({
        success: true,
        trips: formattedTrips,
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
        summary,
    });
}

// POST - Start a new trip
export async function POST(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            vehicleId,
            latitude,
            longitude,
            batteryLevel,
            address,
            outsideTemp,
        } = body;

        if (!vehicleId) {
            return NextResponse.json({ error: 'Vehicle ID required' }, { status: 400 });
        }

        const supabase = await getSupabase();
        const { data: trip, error } = await supabase
            .from('trips')
            .insert({
                vehicle_id: vehicleId,
                start_time: new Date().toISOString(),
                start_latitude: latitude,
                start_longitude: longitude,
                start_battery_pct: batteryLevel,
                start_address: address,
                min_outside_temp: outsideTemp,
                max_outside_temp: outsideTemp,
                avg_outside_temp: outsideTemp,
                is_complete: false,
            })
            .select()
            .single();

        if (error) {
            console.error('Trip create error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, trip });
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}

// PATCH - End/update a trip
export async function PATCH(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            tripId,
            latitude,
            longitude,
            batteryLevel,
            address,
            maxSpeed,
            avgSpeed,
            distanceMiles,
            energyUsedKwh,
            minTemp,
            maxTemp,
            avgTemp,
        } = body;

        if (!tripId) {
            return NextResponse.json({ error: 'Trip ID required' }, { status: 400 });
        }

        const supabase = await getSupabase();
        const { data: trip, error } = await supabase
            .from('trips')
            .update({
                end_time: new Date().toISOString(),
                end_latitude: latitude,
                end_longitude: longitude,
                end_battery_pct: batteryLevel,
                end_address: address,
                max_speed_mph: maxSpeed,
                avg_speed_mph: avgSpeed,
                distance_miles: distanceMiles,
                energy_used_kwh: energyUsedKwh,
                min_outside_temp: minTemp,
                max_outside_temp: maxTemp,
                avg_outside_temp: avgTemp,
                is_complete: true,
            })
            .eq('id', tripId)
            .select()
            .single();

        if (error) {
            console.error('Trip update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, trip });
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
