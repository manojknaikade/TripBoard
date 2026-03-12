import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeslaSession } from '@/lib/tesla/auth-server';

const MINIMUM_DISTANCE_MILES = 0.3;

// Universal headers for a unified export
const CSV_HEADERS = [
    'type',
    'id',
    'date',
    'duration_min',
    'location_origin',
    'destination',
    'latitude',
    'longitude',
    'distance_mi',
    'energy_kwh',
    'efficiency_wh_mi',
    'start_soc_pct',
    'end_soc_pct',
    'cost',
    'currency',
    'status',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformTrip(trip: any) {
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
        ? Math.floor(
            (new Date(trip.end_time).getTime() -
                new Date(trip.start_time).getTime()) /
            1000,
        )
        : null;

    return {
        type: 'trip',
        id: trip.id,
        date: trip.start_time,
        duration_min:
            durationSeconds != null
                ? Math.round((durationSeconds / 60) * 10) / 10
                : null,
        location_origin: trip.start_address || null,
        destination: trip.end_address || null,
        latitude: trip.start_latitude || null,
        longitude: trip.start_longitude || null,
        distance_mi: distance
            ? Math.round(parseFloat(distance) * 100) / 100
            : null,
        energy_kwh: energy
            ? Math.round(parseFloat(energy) * 100) / 100
            : null,
        efficiency_wh_mi:
            distance && energy
                ? Math.round(((energy * 1000) / distance) * 10) / 10
                : null,
        start_soc_pct: trip.start_battery_pct,
        end_soc_pct: trip.end_battery_pct,
        cost: null,
        currency: null,
        status: trip.is_complete ? 'completed' : 'in_progress',
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformCharge(charge: any) {
    const durationSeconds = charge.end_time
        ? Math.floor(
            (new Date(charge.end_time).getTime() -
                new Date(charge.start_time).getTime()) /
            1000,
        )
        : null;

    return {
        type: 'charge',
        id: charge.id,
        date: charge.start_time,
        duration_min:
            durationSeconds != null
                ? Math.round((durationSeconds / 60) * 10) / 10
                : null,
        location_origin: charge.location_name || null,
        destination: null,
        latitude: charge.latitude || null,
        longitude: charge.longitude || null,
        distance_mi: null,
        energy_kwh: charge.energy_added_kwh
            ? Math.round(parseFloat(charge.energy_added_kwh) * 100) / 100
            : null,
        efficiency_wh_mi: null,
        start_soc_pct: charge.start_battery_pct,
        end_soc_pct: charge.end_battery_pct,
        cost: charge.cost_user_entered || charge.cost_estimate || null,
        currency: charge.currency || null,
        status: charge.is_complete ? 'completed' : 'in_progress',
    };
}

function escapeCsvField(value: unknown): string {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCsv(items: any[]): string {
    const rows = items.map((item) =>
        CSV_HEADERS.map((h) => escapeCsvField(item[h])).join(','),
    );
    return [CSV_HEADERS.join(','), ...rows].join('\n');
}

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const format = new URL(request.url).searchParams.get('format') || 'json';
    if (format !== 'csv' && format !== 'json') {
        return NextResponse.json(
            { error: 'Invalid format. Use csv or json.' },
            { status: 400 },
        );
    }

    // Use admin client to ensure we bypass RLS and get all data for the export
    const supabase = createAdminClient();

    // Fetch trips
    const { data: trips, error: tripsError } = await supabase
        .from('trips')
        .select('*')
        .order('start_time', { ascending: false });

    if (tripsError) {
        console.error('Export fetch error (trips):', tripsError);
        return NextResponse.json({ error: tripsError.message }, { status: 500 });
    }

    // Fetch charging sessions
    const { data: charges, error: chargesError } = await supabase
        .from('charging_sessions')
        .select('*')
        .order('start_time', { ascending: false });

    if (chargesError) {
        console.warn('Export fetch error (charges):', chargesError);
    }

    // Filter short trips
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredTrips = (trips || []).filter((t: any) => {
        const d = t.distance_miles ? parseFloat(t.distance_miles.toString()) : 0;
        const od =
            t.start_odometer && t.end_odometer
                ? parseFloat(t.end_odometer.toString()) -
                parseFloat(t.start_odometer.toString())
                : 0;
        return (d || od) >= MINIMUM_DISTANCE_MILES;
    });

    const transformedTrips = filteredTrips.map(transformTrip);
    const transformedCharges = (charges || []).map(transformCharge);

    // Combine and sort by date descending
    const combined = [...transformedTrips, ...transformedCharges].sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateB - dateA;
    });

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
        return new NextResponse(toCsv(combined), {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="tripboard_export_${timestamp}.csv"`,
            },
        });
    }

    return new NextResponse(JSON.stringify(combined, null, 2), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="tripboard_export_${timestamp}.json"`,
        },
    });
}
