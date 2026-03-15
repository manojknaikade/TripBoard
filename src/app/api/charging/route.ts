import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeslaSession } from '@/lib/tesla/auth-server';
import {
    getChargingBatteryEnergyKwh,
    getChargingDeliveredEnergyKwh,
    getChargingDisplayCost,
} from '@/lib/charging/energy';

export const dynamic = 'force-dynamic';

const CHARGING_LIST_SELECT = [
    'id',
    'vehicle_id',
    'start_time',
    'end_time',
    'start_battery_pct',
    'end_battery_pct',
    'energy_added_kwh',
    'energy_delivered_kwh',
    'charger_price_per_kwh',
    'charge_rate_kw',
    'latitude',
    'longitude',
    'location_name',
    'charger_type',
    'cost_estimate',
    'cost_user_entered',
    'currency',
    'tesla_charge_event_id',
    'is_complete',
].join(', ');
const CHARGING_SUMMARY_SELECT = [
    'energy_added_kwh',
    'energy_delivered_kwh',
    'charge_rate_kw',
    'cost_estimate',
    'cost_user_entered',
    'currency',
    'charger_type',
    'tesla_charge_event_id',
    'is_complete',
].join(', ');

type ChargingSummaryRow = {
    energy_added_kwh: number | null;
    energy_delivered_kwh: number | null;
    charge_rate_kw: number | null;
    cost_estimate: number | null;
    cost_user_entered: number | null;
    currency: string | null;
    charger_type: string | null;
    tesla_charge_event_id: string | null;
    is_complete: boolean | null;
};

async function loadChargingSummary(
    supabase: ReturnType<typeof createAdminClient>,
    options: {
        from: string | null;
        to: string | null;
        vehicleId: string | null;
        preferredCurrency: string | null;
    }
) {
    let query = supabase
        .from('charging_sessions')
        .select(CHARGING_SUMMARY_SELECT);

    if (options.from) {
        query = query.gte('start_time', options.from);
    }
    if (options.to) {
        query = query.lte('start_time', options.to);
    }
    if (options.vehicleId) {
        query = query.eq('vehicle_id', options.vehicleId);
    }

    const { data, error } = await query;

    if (error) {
        throw error;
    }

    const rows = ((data || []) as unknown) as ChargingSummaryRow[];
    let totalBatteryEnergy = 0;
    let totalDeliveredEnergy = 0;
    let maxChargeRate = 0;
    let totalCost = 0;

    for (const row of rows) {
        totalBatteryEnergy += getChargingBatteryEnergyKwh(row) || 0;
        totalDeliveredEnergy += getChargingDeliveredEnergyKwh(row) || 0;
        maxChargeRate = Math.max(maxChargeRate, row.charge_rate_kw || 0);

        const displayCost = getChargingDisplayCost(row);
        if (
            displayCost != null
            && (row.currency === options.preferredCurrency || !row.currency)
        ) {
            totalCost += displayCost;
        }
    }

    return {
        totalSessions: rows.length,
        totalBatteryEnergy,
        totalDeliveredEnergy,
        maxChargeRate,
        totalCost,
    };
}

export async function GET(request: NextRequest) {
    const teslaSession = await getTeslaSession(request);

    if (!teslaSession) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20'), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const includeSummary = searchParams.get('includeSummary') === '1';
    const preferredCurrency = searchParams.get('preferredCurrency');
    const vehicleId = searchParams.get('vehicleId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const supabase = createAdminClient();

    let query = supabase
        .from('charging_sessions')
        .select(CHARGING_LIST_SELECT)
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

    query = query.range(offset, offset + limit);

    const [listResult, summary] = await Promise.all([
        query,
        includeSummary
            ? loadChargingSummary(supabase, { from, to, vehicleId, preferredCurrency })
            : Promise.resolve(null),
    ]);

    const { data: sessions, error } = listResult;

    if (error) {
        console.error('Charging fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const pagedSessions = sessions || [];
    const hasMore = pagedSessions.length > limit;
    const visibleSessions = pagedSessions.slice(0, limit);

    return NextResponse.json({
        success: true,
        sessions: visibleSessions,
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
        summary,
    });
}
