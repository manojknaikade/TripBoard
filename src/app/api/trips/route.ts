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
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const supabase = await getSupabase();

    // Query trips - using the original schema structure
    let query = supabase
        .from('trips')
        .select('*')
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

    // Only apply pagination if no date range is provided
    if (!from && !to) {
        query = query.range(offset, offset + limit - 1);
    }

    const { data: trips, error, count } = await query;

    if (error) {
        console.error('Trips fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter out very short trips (parking maneuvers) - minimum 0.3 miles / 0.5 km
    const MINIMUM_DISTANCE_MILES = 0.3;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredTrips = (trips || []).filter((trip: any) => {
        const distance = trip.distance_miles ? parseFloat(trip.distance_miles.toString()) : 0;
        // Also calculate from odometer if available
        const odometerDistance = (trip.start_odometer && trip.end_odometer)
            ? parseFloat(trip.end_odometer.toString()) - parseFloat(trip.start_odometer.toString())
            : 0;
        const actualDistance = distance || odometerDistance;
        return actualDistance >= MINIMUM_DISTANCE_MILES;
    });

    // Transform to match frontend expectations
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
            status: trip.is_complete ? 'completed' : 'in_progress',
        };
    });

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
