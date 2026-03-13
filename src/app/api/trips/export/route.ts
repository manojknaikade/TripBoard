import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeslaSession } from '@/lib/tesla/auth-server';

const MINIMUM_DISTANCE_MILES = 0.3;

// Universal headers for a unified export
const CSV_HEADERS = [
    'type',
    'id',
    'vehicle_id',
    'vin',
    'date',
    'duration_min',
    'location_origin',
    'destination',
    'latitude',
    'longitude',
    'end_latitude',
    'end_longitude',
    'distance_mi',
    'energy_kwh',
    'efficiency_wh_mi',
    'max_speed_mph',
    'avg_speed_mph',
    'start_soc_pct',
    'end_soc_pct',
    'charger_type',
    'charge_rate_kw',
    'cost',
    'currency',
    'min_outside_temp',
    'max_outside_temp',
    'avg_outside_temp',
    'status',
];

type TripExportRow = {
    id: string;
    vehicle_id: string | null;
    vin: string | null;
    start_time: string;
    end_time: string | null;
    start_address: string | null;
    end_address: string | null;
    start_latitude: number | string | null;
    start_longitude: number | string | null;
    end_latitude: number | string | null;
    end_longitude: number | string | null;
    distance_miles: number | string | null;
    energy_used_kwh: number | string | null;
    start_battery_pct: number | string | null;
    end_battery_pct: number | string | null;
    start_odometer: number | string | null;
    end_odometer: number | string | null;
    min_outside_temp: number | string | null;
    max_outside_temp: number | string | null;
    avg_outside_temp: number | string | null;
    max_speed_mph: number | string | null;
    avg_speed_mph: number | string | null;
    is_complete: boolean | null;
};

type ChargeExportRow = {
    id: string;
    vehicle_id: string | null;
    start_time: string;
    end_time: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
    energy_added_kwh: number | string | null;
    charge_rate_kw: number | string | null;
    start_battery_pct: number | string | null;
    end_battery_pct: number | string | null;
    charger_type: string | null;
    location_name: string | null;
    cost_estimate: number | string | null;
    cost_user_entered: number | string | null;
    currency: string | null;
    is_complete: boolean | null;
};

function toNumber(value: number | string | null | undefined): number | null {
    if (value == null || value === '') return null;
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number | null, digits = 2): number | null {
    if (value == null) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function transformTrip(trip: TripExportRow) {
    let distance = toNumber(trip.distance_miles);
    const startOdometer = toNumber(trip.start_odometer);
    const endOdometer = toNumber(trip.end_odometer);
    if (distance == null && startOdometer != null && endOdometer != null) {
        distance = endOdometer - startOdometer;
    }

    let energy = toNumber(trip.energy_used_kwh);
    const startSoc = toNumber(trip.start_battery_pct);
    const endSoc = toNumber(trip.end_battery_pct);
    if (energy == null && startSoc != null && endSoc != null) {
        const batteryDelta = startSoc - endSoc;
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
        vehicle_id: trip.vehicle_id,
        vin: trip.vin,
        date: trip.start_time,
        duration_min:
            durationSeconds != null
                ? Math.round((durationSeconds / 60) * 10) / 10
                : null,
        location_origin: trip.start_address || null,
        destination: trip.end_address || null,
        latitude: toNumber(trip.start_latitude),
        longitude: toNumber(trip.start_longitude),
        end_latitude: toNumber(trip.end_latitude),
        end_longitude: toNumber(trip.end_longitude),
        distance_mi: round(distance),
        energy_kwh: round(energy),
        efficiency_wh_mi:
            distance != null && energy != null && distance > 0
                ? Math.round(((energy * 1000) / distance) * 10) / 10
                : null,
        max_speed_mph: round(toNumber(trip.max_speed_mph)),
        avg_speed_mph: round(toNumber(trip.avg_speed_mph)),
        start_soc_pct: startSoc,
        end_soc_pct: endSoc,
        charger_type: null,
        charge_rate_kw: null,
        cost: null,
        currency: null,
        min_outside_temp: toNumber(trip.min_outside_temp),
        max_outside_temp: toNumber(trip.max_outside_temp),
        avg_outside_temp: toNumber(trip.avg_outside_temp),
        status: trip.is_complete ? 'completed' : 'in_progress',
    };
}

function transformCharge(charge: ChargeExportRow) {
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
        vehicle_id: charge.vehicle_id,
        vin: null,
        date: charge.start_time,
        duration_min:
            durationSeconds != null
                ? Math.round((durationSeconds / 60) * 10) / 10
                : null,
        location_origin: charge.location_name || null,
        destination: null,
        latitude: toNumber(charge.latitude),
        longitude: toNumber(charge.longitude),
        end_latitude: null,
        end_longitude: null,
        distance_mi: null,
        energy_kwh: round(toNumber(charge.energy_added_kwh)),
        efficiency_wh_mi: null,
        max_speed_mph: null,
        avg_speed_mph: null,
        start_soc_pct: toNumber(charge.start_battery_pct),
        end_soc_pct: toNumber(charge.end_battery_pct),
        charger_type: charge.charger_type || null,
        charge_rate_kw: round(toNumber(charge.charge_rate_kw)),
        cost:
            round(toNumber(charge.cost_user_entered)) ??
            round(toNumber(charge.cost_estimate)),
        currency: charge.currency || null,
        min_outside_temp: null,
        max_outside_temp: null,
        avg_outside_temp: null,
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

function toCsv(items: Array<Record<string, unknown>>): string {
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
    const filteredTrips = (trips as TripExportRow[] | null || []).filter((t) => {
        const d = toNumber(t.distance_miles) || 0;
        const startOdometer = toNumber(t.start_odometer);
        const endOdometer = toNumber(t.end_odometer);
        const od =
            startOdometer != null && endOdometer != null
                ? endOdometer - startOdometer
                : 0;
        return (d || od) >= MINIMUM_DISTANCE_MILES;
    });

    const transformedTrips = filteredTrips.map(transformTrip);
    const transformedCharges = ((charges as ChargeExportRow[] | null) || []).map(transformCharge);

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
