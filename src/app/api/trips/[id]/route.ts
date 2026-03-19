import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUserId } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import {
    dedupeRoutePoints,
    extractRoutePointFromTelemetry,
    sampleRoutePoints,
    type TripRoutePoint,
} from '@/lib/trips/routePoints';

const THUMBNAIL_ROUTE_POINTS_MAX = 24;

type TripRow = {
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

type TripWaypointRow = {
    timestamp: string;
    latitude: number;
    longitude: number;
    speed_mph: number | null;
    battery_level: number | null;
    odometer: number | null;
    heading: number | null;
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

type VehicleLookupRow = {
    id: string;
    vin: string | null;
};

function normalizeTelemetryVin(value: string | null): string | null {
    if (!value) {
        return null;
    }

    return value.replace(/^vehicle_device\./, '');
}

async function loadAccessibleVehicles(
    supabase: Awaited<ReturnType<typeof createClient>>
) {
    const { data, error } = await supabase
        .from('vehicles')
        .select('id, vin')
        .order('created_at', { ascending: true });

    if (error) {
        throw error;
    }

    return ((data || []) as unknown) as VehicleLookupRow[];
}

function formatTrip(trip: TripRow) {
    let distance = trip.distance_miles;
    if (!distance && trip.start_odometer && trip.end_odometer) {
        distance = trip.end_odometer - trip.start_odometer;
    }

    let energy = trip.energy_used_kwh;
    if (!energy && trip.start_battery_pct && trip.end_battery_pct) {
        const batteryDelta = trip.start_battery_pct - trip.end_battery_pct;
        if (batteryDelta > 0) {
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
    };
}

function resolveTripVin(
    trip: TripRow,
    vehicles: VehicleLookupRow[]
): string | null {
    const directVin = normalizeTelemetryVin(trip.vin);
    if (directVin) {
        return directVin;
    }

    if (!trip.vehicle_id) {
        return null;
    }

    const vehicle = vehicles.find((candidate) => candidate.id === trip.vehicle_id);

    return vehicle?.vin ?? null;
}

async function loadRoutePoints(
    supabase: Awaited<ReturnType<typeof createClient>>,
    trip: TripRow,
    vehicles: VehicleLookupRow[]
): Promise<TripRoutePoint[]> {
    const { data: storedWaypoints, error: waypointError } = await supabase
        .from('trip_waypoints')
        .select('timestamp, latitude, longitude, speed_mph, battery_level, odometer, heading')
        .eq('trip_id', trip.id)
        .order('timestamp', { ascending: true });

    if (waypointError) {
        throw waypointError;
    }

    if (storedWaypoints && storedWaypoints.length > 0) {
        return dedupeRoutePoints(storedWaypoints as TripWaypointRow[]);
    }

    const vin = resolveTripVin(trip, vehicles);
    if (!vin) {
        return [];
    }

    const from = new Date(new Date(trip.start_time).getTime() - 30_000).toISOString();
    const to = new Date(
        trip.end_time
            ? new Date(trip.end_time).getTime() + 30_000
            : Date.now()
    ).toISOString();

    const telemetrySupabase = createAdminClient();
    const { data: telemetryRows, error: telemetryError } = await telemetrySupabase
        .from('telemetry_raw')
        .select('timestamp, payload')
        .eq('vin', vin)
        .gte('timestamp', from)
        .lte('timestamp', to)
        .order('timestamp', { ascending: true });

    if (telemetryError) {
        throw telemetryError;
    }

    const parsedPoints = (telemetryRows as TelemetryRawRow[] | null | undefined)
        ?.map((row) => extractRoutePointFromTelemetry(row.timestamp, row.payload))
        .filter((point): point is TripRoutePoint => point !== null) ?? [];

    return dedupeRoutePoints(parsedPoints);
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const isThumbnailRequest = searchParams.get('thumbnail') === '1';
    const includeRoute = isThumbnailRequest || searchParams.get('includeRoute') === '1';
    const { id } = await context.params;
    const supabase = await createClient();

    const { data: trip, error } = await supabase
        .from('trips')
        .select('id, vin, vehicle_id, start_time, end_time, start_latitude, start_longitude, start_address, end_latitude, end_longitude, end_address, distance_miles, energy_used_kwh, start_battery_pct, end_battery_pct, start_odometer, end_odometer, max_speed_mph, avg_speed_mph, min_outside_temp, max_outside_temp, avg_outside_temp, is_complete')
        .eq('id', id)
        .maybeSingle<TripRow>();

    if (error) {
        console.error('Trip fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!trip) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    if (!includeRoute) {
        return NextResponse.json({
            success: true,
            trip: formatTrip(trip),
        });
    }

    try {
        const vehicles = await loadAccessibleVehicles(supabase);
        const routePoints = await loadRoutePoints(supabase, trip, vehicles);
        const responseRoutePoints = isThumbnailRequest
            ? sampleRoutePoints(routePoints, THUMBNAIL_ROUTE_POINTS_MAX)
            : routePoints;

        return NextResponse.json({
            success: true,
            trip: formatTrip(trip),
            route_points: responseRoutePoints,
        });
    } catch (routeError) {
        console.error('Trip route fetch error:', routeError);
        return NextResponse.json({
            success: true,
            trip: formatTrip(trip),
            route_points: [],
            route_error: routeError instanceof Error ? routeError.message : 'Failed to load route points',
        });
    }
}
