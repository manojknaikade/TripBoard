import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MINIMUM_DISTANCE_MILES = 0.3;

const CSV_HEADERS = [
    'id',
    'started_at',
    'ended_at',
    'duration_minutes',
    'start_address',
    'end_address',
    'start_latitude',
    'start_longitude',
    'end_latitude',
    'end_longitude',
    'distance_miles',
    'energy_used_kwh',
    'efficiency_wh_mi',
    'start_battery',
    'end_battery',
    'max_speed_mph',
    'avg_speed_mph',
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
        id: trip.id,
        started_at: trip.start_time,
        ended_at: trip.end_time,
        duration_minutes:
            durationSeconds != null
                ? Math.round((durationSeconds / 60) * 10) / 10
                : null,
        start_address: trip.start_address || null,
        end_address: trip.end_address || null,
        start_latitude: trip.start_latitude || null,
        start_longitude: trip.start_longitude || null,
        end_latitude: trip.end_latitude || null,
        end_longitude: trip.end_longitude || null,
        distance_miles: distance
            ? Math.round(parseFloat(distance) * 100) / 100
            : null,
        energy_used_kwh: energy
            ? Math.round(parseFloat(energy) * 100) / 100
            : null,
        efficiency_wh_mi:
            distance && energy
                ? Math.round(((energy * 1000) / distance) * 10) / 10
                : null,
        start_battery: trip.start_battery_pct,
        end_battery: trip.end_battery_pct,
        max_speed_mph: trip.max_speed_mph || null,
        avg_speed_mph: trip.avg_speed_mph || (distance && durationSeconds && durationSeconds > 0
            ? Math.round((parseFloat(distance) / (durationSeconds / 3600)) * 10) / 10
            : null),
        status: trip.is_complete ? 'completed' : 'in_progress',
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
function toCsv(trips: any[]): string {
    const rows = trips.map((trip) =>
        CSV_HEADERS.map((h) => escapeCsvField(trip[h])).join(','),
    );
    return [CSV_HEADERS.join(','), ...rows].join('\n');
}

export async function GET(request: NextRequest) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;
    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const format = new URL(request.url).searchParams.get('format') || 'json';
    if (format !== 'csv' && format !== 'json') {
        return NextResponse.json(
            { error: 'Invalid format. Use csv or json.' },
            { status: 400 },
        );
    }

    const supabase = await createClient();

    const { data: trips, error } = await supabase
        .from('trips')
        .select('*')
        .order('start_time', { ascending: false });

    if (error) {
        console.error('Export fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter short trips
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = (trips || []).filter((t: any) => {
        const d = t.distance_miles ? parseFloat(t.distance_miles.toString()) : 0;
        const od =
            t.start_odometer && t.end_odometer
                ? parseFloat(t.end_odometer.toString()) -
                parseFloat(t.start_odometer.toString())
                : 0;
        return (d || od) >= MINIMUM_DISTANCE_MILES;
    });

    const transformed = filtered.map(transformTrip);

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
        return new NextResponse(toCsv(transformed), {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="tripboard_export_${timestamp}.csv"`,
            },
        });
    }

    return new NextResponse(JSON.stringify(transformed, null, 2), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="tripboard_export_${timestamp}.json"`,
        },
    });
}
