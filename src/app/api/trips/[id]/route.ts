import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeslaSession } from '@/lib/tesla/auth-server';

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

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = createAdminClient();

    const { data: trip, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .maybeSingle<TripRow>();

    if (error) {
        console.error('Trip fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!trip) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    return NextResponse.json({
        success: true,
        trip: formatTrip(trip),
    });
}
