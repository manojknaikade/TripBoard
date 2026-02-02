import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getSupabase() {
    return await createClient();
}

// GET - List trips for the authenticated user
export async function GET(request: NextRequest) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const vehicleId = searchParams.get('vehicleId');

    const supabase = await getSupabase();

    // Query trips - using the original schema structure
    let query = supabase
        .from('trips')
        .select('*')
        .order('start_time', { ascending: false })
        .range(offset, offset + limit - 1);

    if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
    }

    const { data: trips, error, count } = await query;

    if (error) {
        console.error('Trips fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform to match frontend expectations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedTrips = (trips || []).map((trip: any) => ({
        id: trip.id,
        vehicle_id: trip.vehicle_id || trip.vin,
        started_at: trip.start_time,
        ended_at: trip.end_time,
        duration_seconds: trip.end_time
            ? Math.floor((new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()) / 1000)
            : null,
        start_latitude: trip.start_latitude,
        start_longitude: trip.start_longitude,
        start_address: trip.start_address,
        end_latitude: trip.end_latitude,
        end_longitude: trip.end_longitude,
        end_address: trip.end_address,
        distance_miles: trip.distance_miles,
        energy_used_kwh: trip.energy_used_kwh,
        efficiency_wh_mi: trip.distance_miles && trip.energy_used_kwh
            ? (trip.energy_used_kwh * 1000) / trip.distance_miles
            : null,
        start_battery_level: trip.start_battery_pct,
        end_battery_level: trip.end_battery_pct,
        max_speed: trip.max_speed_mph,
        avg_speed: trip.avg_speed_mph,
        status: trip.is_complete ? 'completed' : 'in_progress',
    }));

    return NextResponse.json({
        success: true,
        trips: formattedTrips,
        total: count,
        limit,
        offset,
    });
}

// POST - Start a new trip
export async function POST(request: NextRequest) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            vehicleId,
            latitude,
            longitude,
            odometer,
            batteryLevel,
            address,
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
    const accessToken = request.cookies.get('tesla_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            tripId,
            latitude,
            longitude,
            odometer,
            batteryLevel,
            address,
            maxSpeed,
            avgSpeed,
            distanceMiles,
            energyUsedKwh,
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
