import { createAdminClient } from '@/lib/supabase/admin'
import { getTeslaSession } from '@/lib/tesla/auth-server'
import { NextRequest, NextResponse } from 'next/server'

const ACTIVE_CHARGING_STATES = new Set(['Charging', 'Starting'])

function deriveTelemetryVehicleStateFallback(data: {
    charge_state?: string | null
    shift_state?: string | null
    speed?: number | string | null
}) {
    const speed = Number(data.speed || 0)

    if (data.shift_state === 'D' || data.shift_state === 'R' || speed > 0) {
        return 'driving'
    }

    if (ACTIVE_CHARGING_STATES.has(data.charge_state || '')) {
        return 'charging'
    }

    return 'parked'
}

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request)
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = createAdminClient()

    // Query the vehicle_status table - get the real car (not simulated)
    // Real VIN format: vehicle_device.XP7YGCES0RB433079
    const { data: rows, error } = await supabase
        .from('vehicle_status')
        .select('*')
        .ilike('vin', 'vehicle_device.%')  // Match real car VIN
        .order('updated_at', { ascending: false })
        .limit(1)

    const data = rows?.[0];

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
        return NextResponse.json({
            status: 'waiting_for_telemetry',
            message: 'No telemetry data received yet. Run the SQL script to backfill from telemetry_raw.'
        })
    }

    const state = typeof data.state === 'string' && data.state.length > 0
        ? data.state
        : deriveTelemetryVehicleStateFallback(data)

    // Transform to match the dashboard's expected format
    return NextResponse.json({
        success: true,
        source: 'telemetry',
        state: state,
        timestamp: new Date(data.updated_at).getTime(),
        vehicle: {
            id: 0,
            vin: data.vin,
            display_name: data.vin?.split('.')[1] || 'Tesla',
            state: state,
            battery_level: data.battery_level || 0,
            battery_range: Math.round(data.rated_range || data.est_battery_range || (data.battery_level || 0) * 4),
            charging_state: data.charge_state || 'Disconnected',
            charge_limit_soc: data.charge_limit_soc ?? null,
            charge_rate: 0,
            charger_power: data.charger_power || 0,
            time_to_full_charge: data.time_to_full_charge || 0,
            charge_energy_added: data.charge_energy_added || 0,
            inside_temp: data.inside_temp,
            outside_temp: data.outside_temp,
            odometer: data.odometer,
            locked: data.is_locked ?? true,
            is_climate_on: data.is_climate_on ?? false,
            latitude: data.lat,
            longitude: data.lon,
            sentry_mode: data.sentry_mode ?? false,
            car_version: data.car_version || '',
            power: 0,
            speed: data.speed || 0,
            heading: data.heading || 0,
            // Doors (from telemetry, with fallback to closed)
            df: data.door_df ? 1 : 0,
            pf: data.door_pf ? 1 : 0,
            dr: data.door_dr ? 1 : 0,
            pr: data.door_pr ? 1 : 0,
            ft: data.trunk_ft ? 1 : 0,
            rt: data.trunk_rt ? 1 : 0,
            // Tire pressure (from telemetry, with fallback)
            tpms_pressure_fl: data.tpms_fl || null,
            tpms_pressure_fr: data.tpms_fr || null,
            tpms_pressure_rl: data.tpms_rl || null,
            tpms_pressure_rr: data.tpms_rr || null,
            // Window states (Closed, PartiallyOpen, Opened)
            fd_window: data.window_fd?.replace('WindowState', '') || 'Closed',
            fp_window: data.window_fp?.replace('WindowState', '') || 'Closed',
            rd_window: data.window_rd?.replace('WindowState', '') || 'Closed',
            rp_window: data.window_rp?.replace('WindowState', '') || 'Closed',
        }
    })
}
