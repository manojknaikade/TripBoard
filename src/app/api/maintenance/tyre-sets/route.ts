import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { getTeslaSession } from '@/lib/tesla/auth-server';
import {
    TYRE_SEASON_OPTIONS,
    TYRE_SET_STATUS_OPTIONS,
    type TyreSeason,
    type TyreSetStatus,
} from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

const VALID_TYRE_SEASONS = new Set<TyreSeason>(
    TYRE_SEASON_OPTIONS.map((option) => option.value)
);
const VALID_TYRE_SET_STATUSES = new Set<TyreSetStatus>(
    TYRE_SET_STATUS_OPTIONS.map((option) => option.value)
);

function isValidDate(value: string | null | undefined) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export async function GET(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
        .from('tyre_sets')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Tyre set fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        tyreSets: data || [],
    });
}

export async function POST(request: NextRequest) {
    const session = await getTeslaSession(request);

    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json();

        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const season = body.season as TyreSeason;
        const purchaseDate = body.purchaseDate as string | null | undefined;
        const purchaseOdometerKm =
            body.purchaseOdometerKm === '' || body.purchaseOdometerKm == null
                ? null
                : Number(body.purchaseOdometerKm);
        const status = (body.status || 'active') as TyreSetStatus;
        const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

        if (!name) {
            return NextResponse.json({ error: 'Tyre set name is required' }, { status: 400 });
        }

        if (!VALID_TYRE_SEASONS.has(season)) {
            return NextResponse.json({ error: 'Invalid tyre season' }, { status: 400 });
        }

        if (purchaseDate && !isValidDate(purchaseDate)) {
            return NextResponse.json({ error: 'Purchase date must be a valid date' }, { status: 400 });
        }

        if (purchaseOdometerKm != null && (!Number.isFinite(purchaseOdometerKm) || purchaseOdometerKm < 0)) {
            return NextResponse.json({ error: 'Purchase odometer must be a positive number' }, { status: 400 });
        }

        if (!VALID_TYRE_SET_STATUSES.has(status)) {
            return NextResponse.json({ error: 'Invalid tyre set status' }, { status: 400 });
        }

        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('tyre_sets')
            .insert({
                user_id: user.id,
                name,
                season,
                purchase_date: purchaseDate || null,
                purchase_odometer_km: purchaseOdometerKm == null ? null : Math.round(purchaseOdometerKm),
                status,
                notes: notes || null,
            })
            .select('*')
            .single();

        if (error) {
            console.error('Tyre set insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            tyreSet: data,
        });
    } catch (err) {
        console.error('Tyre set save error:', err);
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
