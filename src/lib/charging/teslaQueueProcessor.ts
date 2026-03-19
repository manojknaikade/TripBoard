import { createAdminClient } from '@/lib/supabase/admin';
import {
    buildTeslaChargingHistoryFailedUpdate,
    buildTeslaChargingHistorySuccessUpdate,
    buildTeslaChargingHistoryUnavailableUpdate,
    buildTeslaDeliveredEnergyUpdate,
    hasStoredTeslaChargingHistoryData,
    needsTeslaChargingHistorySync,
} from '@/lib/charging/teslaHistory';
import { getTeslaChargingSyncStatus } from '@/lib/charging/teslaSync';
import {
    ensureFreshStoredTeslaSession,
    getStoredTeslaSessionForUser,
} from '@/lib/tesla/auth-server';

type TeslaChargingSyncJob = {
    id: string;
    charging_session_id: string;
    vehicle_id: string;
    status: 'pending' | 'processing' | 'completed' | 'unavailable' | 'failed';
    attempt_count: number;
    queued_at: string;
    processing_started_at: string | null;
    processed_at: string | null;
    last_error: string | null;
};

type ChargingSessionRow = {
    id: string;
    vehicle_id: string;
    start_time: string;
    end_time: string | null;
    charger_type: string | null;
    location_name: string | null;
    energy_added_kwh: number | null;
    energy_delivered_kwh: number | null;
    cost_estimate: number | null;
    charger_price_per_kwh: number | null;
    tesla_charge_event_id: string | null;
    is_complete: boolean | null;
};

type VehicleRow = {
    id: string;
    user_id: string | null;
    region: string | null;
};

type QueueProcessingSummary = {
    claimed: number;
    synced: number;
    unavailable: number;
    failed: number;
    deferred: number;
};

const TESLA_CHARGING_HISTORY_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

async function markJobState(
    jobId: string,
    values: Partial<TeslaChargingSyncJob> & {
        status: TeslaChargingSyncJob['status'];
    },
) {
    const supabase = createAdminClient();
    const { error } = await supabase
        .from('charging_session_tesla_sync_jobs')
        .update(values)
        .eq('id', jobId);

    if (error) {
        throw new Error(`Failed to update charging sync job: ${error.message}`);
    }
}

async function loadChargingSession(sessionId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('charging_sessions')
        .select('id, vehicle_id, start_time, end_time, charger_type, location_name, energy_added_kwh, energy_delivered_kwh, cost_estimate, charger_price_per_kwh, tesla_charge_event_id, is_complete')
        .eq('id', sessionId)
        .maybeSingle<ChargingSessionRow>();

    if (error) {
        throw new Error(`Failed to load charging session: ${error.message}`);
    }

    return data;
}

async function loadVehicle(vehicleId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('vehicles')
        .select('id, user_id, region')
        .eq('id', vehicleId)
        .maybeSingle<VehicleRow>();

    if (error) {
        throw new Error(`Failed to load vehicle: ${error.message}`);
    }

    return data;
}

async function updateChargingSession(
    sessionId: string,
    values: Record<string, number | string | null>,
) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('charging_sessions')
        .update(values)
        .eq('id', sessionId)
        .select('id, vehicle_id, start_time, end_time, charger_type, location_name, energy_added_kwh, energy_delivered_kwh, cost_estimate, charger_price_per_kwh, tesla_charge_event_id, is_complete')
        .maybeSingle<ChargingSessionRow>();

    if (error) {
        throw new Error(`Failed to update charging session: ${error.message}`);
    }

    return data;
}

function getCompletedJobStatus(session: ChargingSessionRow): 'completed' | 'unavailable' | 'failed' {
    const syncStatus = getTeslaChargingSyncStatus(session);

    if (syncStatus === 'synced') {
        return 'completed';
    }

    if (syncStatus === 'unavailable') {
        return 'unavailable';
    }

    return 'failed';
}

function shouldRetryTeslaChargingHistoryLookup(session: ChargingSessionRow) {
    const syncStatus = getTeslaChargingSyncStatus(session);

    if (syncStatus !== 'pending') {
        return false;
    }

    const referenceTime = session.end_time ?? session.start_time;
    if (!referenceTime) {
        return false;
    }

    const completedAtMs = Date.parse(referenceTime);
    if (!Number.isFinite(completedAtMs)) {
        return false;
    }

    return Date.now() - completedAtMs < TESLA_CHARGING_HISTORY_RETRY_WINDOW_MS;
}

async function processClaimedJob(job: TeslaChargingSyncJob): Promise<'completed' | 'unavailable' | 'failed' | 'deferred'> {
    const chargingSession = await loadChargingSession(job.charging_session_id);

    if (!chargingSession) {
        await markJobState(job.id, {
            status: 'failed',
            processing_started_at: null,
            processed_at: new Date().toISOString(),
            last_error: 'Charging session not found',
        });
        return 'failed';
    }

    if (!needsTeslaChargingHistorySync(chargingSession)) {
        const resolvedStatus = getCompletedJobStatus(chargingSession);
        await markJobState(job.id, {
            status: resolvedStatus,
            processing_started_at: null,
            processed_at: new Date().toISOString(),
            last_error: null,
        });
        return resolvedStatus;
    }

    const vehicle = await loadVehicle(chargingSession.vehicle_id);
    if (!vehicle) {
        await updateChargingSession(chargingSession.id, buildTeslaChargingHistoryFailedUpdate());
        await markJobState(job.id, {
            status: 'failed',
            processing_started_at: null,
            processed_at: new Date().toISOString(),
            last_error: 'Vehicle not found',
        });
        return 'failed';
    }

    const storedTeslaSession = await getStoredTeslaSessionForUser(
        vehicle.user_id,
        vehicle.region,
    );

    if (!storedTeslaSession) {
        await updateChargingSession(chargingSession.id, buildTeslaChargingHistoryFailedUpdate());
        await markJobState(job.id, {
            status: 'failed',
            processing_started_at: null,
            processed_at: new Date().toISOString(),
            last_error: 'No stored Tesla session available',
        });
        return 'failed';
    }

    const freshTeslaSession = await ensureFreshStoredTeslaSession(storedTeslaSession);

    if (!freshTeslaSession) {
        await updateChargingSession(chargingSession.id, buildTeslaChargingHistoryFailedUpdate());
        await markJobState(job.id, {
            status: 'failed',
            processing_started_at: null,
            processed_at: new Date().toISOString(),
            last_error: 'Stored Tesla session is expired',
        });
        return 'failed';
    }

    const update = await buildTeslaDeliveredEnergyUpdate({
        accessToken: freshTeslaSession.accessToken,
        region: freshTeslaSession.region,
        session: chargingSession,
    });

    if (!update && !hasStoredTeslaChargingHistoryData(chargingSession) && shouldRetryTeslaChargingHistoryLookup(chargingSession)) {
        await markJobState(job.id, {
            status: 'processing',
            processed_at: null,
            processing_started_at: new Date().toISOString(),
            last_error: 'Waiting for Tesla charging history',
        });

        return 'deferred';
    }

    const sessionUpdate =
        update || hasStoredTeslaChargingHistoryData(chargingSession)
            ? buildTeslaChargingHistorySuccessUpdate(chargingSession, update)
            : buildTeslaChargingHistoryUnavailableUpdate();

    const updatedSession = await updateChargingSession(chargingSession.id, sessionUpdate);
    const nextStatus = updatedSession ? getCompletedJobStatus(updatedSession) : 'failed';

    await markJobState(job.id, {
        status: nextStatus,
        processing_started_at: null,
        processed_at: new Date().toISOString(),
        last_error: null,
    });

    return nextStatus;
}

export async function processPendingTeslaChargingSyncJobs(limit = 10): Promise<QueueProcessingSummary> {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('claim_pending_tesla_charging_sync_jobs', {
        p_limit: limit,
    });

    if (error) {
        throw new Error(`Failed to claim Tesla charging sync jobs: ${error.message}`);
    }

    const jobs = ((data ?? []) as TeslaChargingSyncJob[]);
    const summary: QueueProcessingSummary = {
        claimed: jobs.length,
        synced: 0,
        unavailable: 0,
        failed: 0,
        deferred: 0,
    };

    for (const job of jobs) {
        try {
            const result = await processClaimedJob(job);

            if (result === 'completed') {
                summary.synced += 1;
            } else if (result === 'unavailable') {
                summary.unavailable += 1;
            } else if (result === 'deferred') {
                summary.deferred += 1;
            } else {
                summary.failed += 1;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown Tesla sync error';

            console.warn('Tesla charging sync job failed:', {
                jobId: job.id,
                chargingSessionId: job.charging_session_id,
                error: message,
            });

            try {
                await updateChargingSession(
                    job.charging_session_id,
                    buildTeslaChargingHistoryFailedUpdate(),
                );
            } catch (sessionError) {
                console.warn('Failed to mark charging session as Tesla sync failed:', sessionError);
            }

            await markJobState(job.id, {
                status: 'failed',
                processing_started_at: null,
                processed_at: new Date().toISOString(),
                last_error: message,
            });

            summary.failed += 1;
        }
    }

    return summary;
}
