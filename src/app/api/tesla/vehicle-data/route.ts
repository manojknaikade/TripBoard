import { NextRequest, NextResponse } from 'next/server';
import { fetchTeslaApi, normalizeTeslaRegion } from '@/lib/tesla/api';
import { getTeslaSession } from '@/lib/tesla/auth-server';

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);
    const vehicleId = request.nextUrl.searchParams.get('id');
    const region = normalizeTeslaRegion(request.nextUrl.searchParams.get('region')) || session?.region || 'eu';

    if (!session) {
        return NextResponse.json(
            { error: 'Not authenticated with Tesla' },
            { status: 401 }
        );
    }

    if (!vehicleId) {
        return NextResponse.json(
            { error: 'Vehicle ID is required' },
            { status: 400 }
        );
    }
    try {
        // Fetch vehicle data from Tesla Fleet API
        const response = await fetchTeslaApi(
            session.accessToken,
            region,
            `/api/1/vehicles/${vehicleId}/vehicle_data`
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));

            // Handle vehicle asleep
            if (response.status === 408) {
                return NextResponse.json({
                    success: true,
                    state: 'asleep',
                    message: 'Vehicle is asleep',
                });
            }

            return NextResponse.json({
                success: false,
                error: error.error || `Failed to fetch vehicle data: ${response.status}`,
            }, { status: response.status });
        }

        const data = await response.json();
        const vehicleData = data.response;

        // Extract and format the relevant data
        return NextResponse.json({
            success: true,
            state: 'online',
            timestamp: Date.now(),
            vehicle: {
                id: vehicleData.id,
                vin: vehicleData.vin,
                display_name: vehicleData.display_name,
                state: vehicleData.state,
                // Charge state
                battery_level: vehicleData.charge_state?.battery_level,
                battery_range: vehicleData.charge_state?.battery_range,
                charging_state: vehicleData.charge_state?.charging_state,
                charge_limit_soc: vehicleData.charge_state?.charge_limit_soc,
                charge_rate: vehicleData.charge_state?.charge_rate,
                charger_power: vehicleData.charge_state?.charger_power,
                time_to_full_charge: vehicleData.charge_state?.time_to_full_charge,
                charge_energy_added: vehicleData.charge_state?.charge_energy_added,
                charger_voltage: vehicleData.charge_state?.charger_voltage,
                // Drive state
                latitude: vehicleData.drive_state?.latitude,
                longitude: vehicleData.drive_state?.longitude,
                heading: vehicleData.drive_state?.heading,
                speed: vehicleData.drive_state?.speed,
                shift_state: vehicleData.drive_state?.shift_state,
                power: vehicleData.drive_state?.power,
                // Climate state
                inside_temp: vehicleData.climate_state?.inside_temp,
                outside_temp: vehicleData.climate_state?.outside_temp,
                is_climate_on: vehicleData.climate_state?.is_climate_on,
                driver_temp_setting: vehicleData.climate_state?.driver_temp_setting,
                // Vehicle state
                odometer: vehicleData.vehicle_state?.odometer,
                locked: vehicleData.vehicle_state?.locked,
                car_version: vehicleData.vehicle_state?.car_version,
                sentry_mode: vehicleData.vehicle_state?.sentry_mode,
                // Doors & openings
                df: vehicleData.vehicle_state?.df, // driver front door
                pf: vehicleData.vehicle_state?.pf, // passenger front door
                dr: vehicleData.vehicle_state?.dr, // driver rear door
                pr: vehicleData.vehicle_state?.pr, // passenger rear door
                ft: vehicleData.vehicle_state?.ft, // front trunk (frunk)
                rt: vehicleData.vehicle_state?.rt, // rear trunk
                // Tire pressure (in bar)
                tpms_pressure_fl: vehicleData.vehicle_state?.tpms_pressure_fl,
                tpms_pressure_fr: vehicleData.vehicle_state?.tpms_pressure_fr,
                tpms_pressure_rl: vehicleData.vehicle_state?.tpms_pressure_rl,
                tpms_pressure_rr: vehicleData.vehicle_state?.tpms_pressure_rr,
            },
        });
    } catch (err) {
        console.error('Vehicle data fetch error:', err);
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to fetch vehicle data',
        }, { status: 500 });
    }
}
