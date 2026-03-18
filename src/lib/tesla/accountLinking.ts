import { createAdminClient } from '@/lib/supabase/admin';
import type { TeslaRegion } from '@/lib/tesla/api';
import type { TeslaVehicleSummary } from '@/lib/tesla/vehicleSummaries';

type VehicleRow = {
    id: string;
    user_id: string | null;
    tesla_id: string;
    vin: string;
    display_name: string | null;
    created_at: string;
};

type UserSettingsRow = {
    user_id: string;
    home_latitude: number | null;
    home_longitude: number | null;
    home_address: string | null;
};

function uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function dedupeVehicleRows(rows: VehicleRow[]) {
    return Array.from(
        rows.reduce((map, row) => {
            if (!map.has(row.id)) {
                map.set(row.id, row);
            }
            return map;
        }, new Map<string, VehicleRow>()).values()
    );
}

function sortVehicleMatches(matches: VehicleRow[], currentUserId: string) {
    return [...matches].sort((left, right) => {
        const leftScore = left.user_id === currentUserId ? 1 : 0;
        const rightScore = right.user_id === currentUserId ? 1 : 0;

        if (leftScore !== rightScore) {
            return leftScore - rightScore;
        }

        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    });
}

async function updateUserSettingsHomeLocation(params: {
    currentUserId: string;
    previousOwnerIds: string[];
}) {
    const supabase = createAdminClient();
    const { data: currentSettings, error: currentSettingsError } = await supabase
        .from('user_settings')
        .select('user_id, home_latitude, home_longitude, home_address')
        .eq('user_id', params.currentUserId)
        .maybeSingle<UserSettingsRow>();

    if (currentSettingsError) {
        throw new Error(`Failed to load current user settings: ${currentSettingsError.message}`);
    }

    const hasCurrentHomeLocation = Boolean(
        currentSettings?.home_latitude != null
        && currentSettings.home_longitude != null
    );

    if (hasCurrentHomeLocation || params.previousOwnerIds.length === 0) {
        return;
    }

    const { data: previousSettings, error: previousSettingsError } = await supabase
        .from('user_settings')
        .select('user_id, home_latitude, home_longitude, home_address')
        .in('user_id', params.previousOwnerIds)
        .not('home_latitude', 'is', null)
        .not('home_longitude', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1);

    if (previousSettingsError) {
        throw new Error(`Failed to load previous user settings: ${previousSettingsError.message}`);
    }

    const sourceSettings = previousSettings?.[0];

    if (!sourceSettings) {
        return;
    }

    const { error: upsertError } = await supabase
        .from('user_settings')
        .upsert({
            user_id: params.currentUserId,
            home_latitude: sourceSettings.home_latitude,
            home_longitude: sourceSettings.home_longitude,
            home_address: sourceSettings.home_address,
        }, {
            onConflict: 'user_id',
        });

    if (upsertError) {
        throw new Error(`Failed to copy home location to current user: ${upsertError.message}`);
    }
}

async function transferOwnedRecords(params: {
    currentUserId: string;
    previousOwnerIds: string[];
}) {
    if (params.previousOwnerIds.length === 0) {
        return;
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const transferUpdate = async (table: 'maintenance_records' | 'tyre_sets') => {
        const { error } = await supabase
            .from(table)
            .update({
                user_id: params.currentUserId,
                updated_at: now,
            })
            .in('user_id', params.previousOwnerIds);

        if (error) {
            throw new Error(`Failed to transfer ${table}: ${error.message}`);
        }
    };

    await Promise.all([
        transferUpdate('maintenance_records'),
        transferUpdate('tyre_sets'),
        updateUserSettingsHomeLocation(params),
    ]);

    const { error: deleteSessionsError } = await supabase
        .from('tesla_sessions')
        .delete()
        .in('user_id', params.previousOwnerIds);

    if (deleteSessionsError) {
        throw new Error(`Failed to delete stale Tesla sessions: ${deleteSessionsError.message}`);
    }
}

export async function reconcileTeslaAccountOwnership(params: {
    currentUserId: string;
    region: TeslaRegion;
    vehicles: TeslaVehicleSummary[];
}) {
    const vehicles = params.vehicles.filter((vehicle) => vehicle.vin && vehicle.id != null);

    if (vehicles.length === 0) {
        return;
    }

    const supabase = createAdminClient();
    const vins = uniqueStrings(vehicles.map((vehicle) => vehicle.vin));
    const teslaIds = uniqueStrings(vehicles.map((vehicle) => String(vehicle.id)));

    const [byVinResult, byTeslaIdResult] = await Promise.all([
        vins.length > 0
            ? supabase
                .from('vehicles')
                .select('id, user_id, tesla_id, vin, display_name, created_at')
                .in('vin', vins)
            : Promise.resolve({ data: [], error: null }),
        teslaIds.length > 0
            ? supabase
                .from('vehicles')
                .select('id, user_id, tesla_id, vin, display_name, created_at')
                .in('tesla_id', teslaIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    if (byVinResult.error) {
        throw new Error(`Failed to load vehicles by VIN: ${byVinResult.error.message}`);
    }

    if (byTeslaIdResult.error) {
        throw new Error(`Failed to load vehicles by Tesla ID: ${byTeslaIdResult.error.message}`);
    }

    const existingRows = dedupeVehicleRows([
        ...((byVinResult.data || []) as VehicleRow[]),
        ...((byTeslaIdResult.data || []) as VehicleRow[]),
    ]);

    const previousOwnerIds = uniqueStrings(
        existingRows
            .map((row) => row.user_id)
            .filter((userId) => userId && userId !== params.currentUserId)
    );

    for (const vehicle of vehicles) {
        const matches = sortVehicleMatches(
            existingRows.filter((row) => row.tesla_id === String(vehicle.id) || row.vin === vehicle.vin),
            params.currentUserId
        );
        const matchedRow = matches[0];
        const payload = {
            user_id: params.currentUserId,
            tesla_id: String(vehicle.id),
            vin: vehicle.vin,
            display_name: vehicle.display_name,
            region: params.region,
            is_active: true,
            updated_at: new Date().toISOString(),
        };

        if (matchedRow) {
            const { error } = await supabase
                .from('vehicles')
                .update(payload)
                .eq('id', matchedRow.id);

            if (error) {
                throw new Error(`Failed to claim vehicle ${vehicle.vin}: ${error.message}`);
            }
            continue;
        }

        const { error } = await supabase
            .from('vehicles')
            .insert(payload);

        if (error) {
            throw new Error(`Failed to insert vehicle ${vehicle.vin}: ${error.message}`);
        }
    }

    await transferOwnedRecords({
        currentUserId: params.currentUserId,
        previousOwnerIds,
    });
}
