import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - List trips for the authenticated user
export async function GET(request: NextRequest) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;
    const userId = request.cookies.get('user_id')?.value;

    if (!accessToken || !userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const vehicleId = searchParams.get('vehicleId');

    let query = supabase
        .from('trips')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
    }

    const { data: trips, error, count } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        trips,
        total: count,
        limit,
        offset,
    });
}

// POST - Start a new trip
export async function POST(request: NextRequest) {
    const userId = request.cookies.get('user_id')?.value;

    if (!userId) {
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

        const { data: trip, error } = await supabase
            .from('trips')
            .insert({
                user_id: userId,
                vehicle_id: vehicleId,
                started_at: new Date().toISOString(),
                start_latitude: latitude,
                start_longitude: longitude,
                start_odometer: odometer,
                start_battery_level: batteryLevel,
                start_address: address,
                status: 'in_progress',
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, trip });
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}

// PATCH - End/update a trip
export async function PATCH(request: NextRequest) {
    const userId = request.cookies.get('user_id')?.value;

    if (!userId) {
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
        } = body;

        if (!tripId) {
            return NextResponse.json({ error: 'Trip ID required' }, { status: 400 });
        }

        const { data: trip, error } = await supabase
            .from('trips')
            .update({
                ended_at: new Date().toISOString(),
                end_latitude: latitude,
                end_longitude: longitude,
                end_odometer: odometer,
                end_battery_level: batteryLevel,
                end_address: address,
                max_speed: maxSpeed,
                avg_speed: avgSpeed,
                status: 'completed',
            })
            .eq('id', tripId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, trip });
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
