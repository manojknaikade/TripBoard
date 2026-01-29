import { NextRequest, NextResponse } from 'next/server';

const REGIONAL_ENDPOINTS = {
    na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
    cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
};

export async function GET(request: NextRequest) {
    const accessToken = request.cookies.get('tesla_access_token')?.value;
    const vehicleId = request.nextUrl.searchParams.get('id');
    const region = request.nextUrl.searchParams.get('region') || 'eu';

    if (!accessToken) {
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

    const baseUrl = REGIONAL_ENDPOINTS[region as keyof typeof REGIONAL_ENDPOINTS] || REGIONAL_ENDPOINTS.eu;

    try {
        // Fetch vehicle data from Tesla Fleet API
        const response = await fetch(
            `${baseUrl}/api/1/vehicles/${vehicleId}/vehicle_data`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
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
                // Drive state
                latitude: vehicleData.drive_state?.latitude,
                longitude: vehicleData.drive_state?.longitude,
                heading: vehicleData.drive_state?.heading,
                speed: vehicleData.drive_state?.speed,
                shift_state: vehicleData.drive_state?.shift_state,
                // Climate state
                inside_temp: vehicleData.climate_state?.inside_temp,
                outside_temp: vehicleData.climate_state?.outside_temp,
                is_climate_on: vehicleData.climate_state?.is_climate_on,
                // Vehicle state
                odometer: vehicleData.vehicle_state?.odometer,
                locked: vehicleData.vehicle_state?.locked,
                car_version: vehicleData.vehicle_state?.car_version,
                sentry_mode: vehicleData.vehicle_state?.sentry_mode,
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
