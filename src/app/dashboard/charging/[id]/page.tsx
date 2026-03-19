'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSettingsStore } from '@/stores/settingsStore';
import {
    ArrowLeft,
    Clock,
    MapPin,
    Battery,
    Zap,
    Banknote,
    Activity,
    Calendar,
    Check,
    Loader2,
    ExternalLink,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import ViewportGate from '@/components/ViewportGate';
import { fetchReverseGeocode, formatCoordinateFallback } from '@/lib/client/geocode';
import {
    canUseManualChargingCost,
    getChargingBatteryEnergyKwh,
    getChargingCostSource,
    getChargingDeliveredEnergyKwh,
    getChargingDisplayCost,
    getChargingLossCost,
    getChargingLossKwh,
    getChargingLossPercent,
} from '@/lib/charging/energy';
import {
    getStoredTeslaChargeEventId,
    getTeslaChargingSyncMessage,
    getTeslaChargingSyncStatus,
    isSuperchargerChargingSession,
} from '@/lib/charging/teslaSync';
import { invalidateCachedJsonMatching, readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';
import {
    PageHero,
    PageShell,
    StatusBadge,
    SUBCARD_CLASS,
    SURFACE_CARD_CLASS,
} from '@/components/ui/dashboardPage';

const TripDetailMap = dynamic(() => import('@/components/TripDetailMap'), {
    loading: () => <div className="h-96 w-full animate-pulse rounded-xl bg-slate-800" />,
    ssr: false
});

interface ChargingSession {
    id: string;
    vehicle_id: string;
    start_time: string;
    end_time: string | null;
    start_battery_pct: number | null;
    end_battery_pct: number | null;
    energy_added_kwh: number | null;
    energy_delivered_kwh: number | null;
    charger_price_per_kwh: number | null;
    charge_rate_kw: number | null;
    latitude: number | null;
    longitude: number | null;
    location_name: string | null;
    charger_type: string | null;
    cost_estimate: number | null;
    cost_user_entered: number | null;
    currency: string | null;
    tesla_charge_event_id: string | null;
    is_complete: boolean;
}

type ChargingDetailResponse = {
    success?: boolean;
    session?: ChargingSession | null;
    error?: string;
};

const CHARGING_DETAIL_CACHE_TTL_MS = 45_000;

function formatDuration(start: string, end: string | null): string {
    if (!end) return 'In Progress';
    const seconds = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function buildGoogleMapsUrl(lat: number, lon: number, label?: string | null): string {
    const coordinates = `${lat},${lon}`;
    const query = label ? `${label} (${coordinates})` : coordinates;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function ChargingDetailPage() {
    const params = useParams();
    const sessionId = params.id as string;

    const [session, setSession] = useState<ChargingSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [address, setAddress] = useState<string>('');

    // Cost Editor State
    const preferredCurrency = useSettingsStore((state) => state.currency);
    const [isEditingCost, setIsEditingCost] = useState(false);
    const [costInput, setCostInput] = useState('');
    const [currencyInput, setCurrencyInput] = useState(preferredCurrency);
    const [savingCost, setSavingCost] = useState(false);

    const fetchSessionDetails = useCallback(async (signal?: AbortSignal) => {
        const cacheKey = `charging:detail:${sessionId}`;
        const cached = readCachedJson<ChargingDetailResponse>(cacheKey);

        try {
            setError(null);
            if (cached?.success && cached.session) {
                setSession(cached.session);
                setLoading(false);
            } else {
                setLoading(true);
            }
            const res = await fetch(`/api/charging/${sessionId}`, {
                cache: 'no-store',
                signal,
            });
            const data = await res.json();

            if (signal?.aborted) {
                return;
            }

            if (data.success && data.session) {
                writeCachedJson(cacheKey, data, CHARGING_DETAIL_CACHE_TTL_MS);
                setSession(data.session);
            } else {
                if (!(cached?.success && cached.session)) {
                    setError('Charging session not found');
                }
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                return;
            }
            console.error('Failed to fetch session:', err);
            if (!(cached?.success && cached.session)) {
                setError('Failed to load charging details');
            }
        } finally {
            if (!signal?.aborted) {
                if (!(cached?.success && cached.session)) {
                    setLoading(false);
                }
            }
        }
    }, [sessionId]);

    useEffect(() => {
        const controller = new AbortController();
        void fetchSessionDetails(controller.signal);

        return () => controller.abort();
    }, [fetchSessionDetails]);

    const fetchAddressFromCoords = useCallback(async (signal?: AbortSignal) => {
        if (!session || session.latitude == null || session.longitude == null) return;

        if (session.location_name) {
            setAddress(session.location_name);
            return;
        }

        const fallbackAddress = formatCoordinateFallback(session.latitude, session.longitude);

        try {
            const data = await fetchReverseGeocode(session.latitude, session.longitude);
            const resolvedAddress = data?.success && data?.address
                ? data.address
                : data?.fallback || fallbackAddress;

            if (!signal?.aborted) {
                setAddress(resolvedAddress);
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            setAddress(fallbackAddress);
        }
    }, [session]);

    useEffect(() => {
        if (session) {
            const controller = new AbortController();
            void fetchAddressFromCoords(controller.signal);

            return () => controller.abort();
        }
    }, [session, fetchAddressFromCoords]);

    const handleSaveCost = async () => {
        if (!session || !costInput) return;
        setSavingCost(true);
        try {
            const response = await fetch(`/api/charging/${session.id}/cost`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cost: parseFloat(costInput),
                    currency: currencyInput
                })
            });
            const data = await response.json();

            if (data.success && data.session) {
                const updatedSession = {
                    ...session,
                    cost_user_entered: data.session.cost_user_entered,
                    currency: data.session.currency
                };
                setSession(updatedSession);
                writeCachedJson(`charging:detail:${session.id}`, { success: true, session: updatedSession }, CHARGING_DETAIL_CACHE_TTL_MS);
                invalidateCachedJsonMatching('charging:list:');
                setIsEditingCost(false);
            }
        } catch (err) {
            console.error('Failed to save cost', err);
        } finally {
            setSavingCost(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
            </div>
        );
    }

    if (error || !session) {
        return (
            <div className="min-h-screen">
                <PageShell>
                    <Link
                        href="/dashboard/charging"
                        className="inline-flex items-center gap-2 text-slate-400 transition-colors hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Charging History
                    </Link>
                    <div className={`mt-8 p-8 text-center ${SURFACE_CARD_CLASS}`}>
                        <p className="text-slate-400">{error || 'Session not found'}</p>
                    </div>
                </PageShell>
            </div>
        );
    }

    const hasCoords = session.latitude != null && session.longitude != null;
    const isSupercharger = isSuperchargerChargingSession(session);
    const isDC = session.charger_type?.toLowerCase().includes('3rd_party_fast') || isSupercharger;
    const batteryEnergy = getChargingBatteryEnergyKwh(session);
    const deliveredEnergy = getChargingDeliveredEnergyKwh(session);
    const lossEnergy = getChargingLossKwh(session);
    const lossPercent = getChargingLossPercent(session);
    const lossCost = getChargingLossCost(session);
    const displayCost = getChargingDisplayCost(session);
    const costSource = getChargingCostSource(session);
    const canUseManualCost = canUseManualChargingCost(session);
    const teslaSyncStatus = getTeslaChargingSyncStatus(session);
    const teslaSyncMessage = getTeslaChargingSyncMessage(session);
    const teslaEventId = getStoredTeslaChargeEventId(session.tesla_charge_event_id);
    const googleMapsUrl = hasCoords
        ? buildGoogleMapsUrl(session.latitude!, session.longitude!, address || session.location_name)
        : null;

    return (
        <div className="min-h-screen">
            {/* Modal for Cost Entry */}
            {isEditingCost && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                        <h3 className="mb-4 text-xl font-bold">Edit Charging Cost</h3>
                        <p className="mb-6 text-sm text-slate-400">
                            Update the total cost for this session.
                        </p>

                        <div className="mb-6 grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <label className="mb-1 block text-sm text-slate-400">Total Cost</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={costInput}
                                    onChange={(e) => setCostInput(e.target.value)}
                                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                                    placeholder="0.00"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm text-slate-400">Currency</label>
                                <select
                                    value={currencyInput}
                                    onChange={(e) => setCurrencyInput(e.target.value)}
                                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                                >
                                    <option value="CHF">CHF</option>
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="GBP">GBP</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setIsEditingCost(false)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveCost}
                                disabled={savingCost || !costInput}
                                className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                            >
                                {savingCost ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <PageShell>
                <PageHero
                    title="Charging Details"
                    description={
                        <div className="space-y-2">
                            <div>{address || (!hasCoords ? 'Unknown location' : 'Loading location...')}</div>
                            {googleMapsUrl ? (
                                <a
                                    href={googleMapsUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
                                >
                                    <MapPin className="h-4 w-4" />
                                    Open in Google Maps
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            ) : null}
                        </div>
                    }
                    badge={
                        isSupercharger ? (
                            <StatusBadge tone="brand">Supercharger</StatusBadge>
                        ) : !isSupercharger && isDC ? (
                            <StatusBadge tone="warning">DC Fast</StatusBadge>
                        ) : undefined
                    }
                    meta={
                        <Link
                            href="/dashboard/charging"
                            className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to Charging
                        </Link>
                    }
                    actions={
                        canUseManualCost ? (
                            <button
                                onClick={() => {
                                    setCostInput((session.cost_user_entered ?? displayCost)?.toString() || '');
                                    setCurrencyInput(session.currency || preferredCurrency);
                                    setIsEditingCost(true);
                                }}
                                className="flex items-center gap-2 rounded-2xl border border-slate-700/50 bg-slate-900/25 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-slate-600 hover:bg-slate-800/50"
                            >
                                <Banknote className="h-4 w-4" />
                                {session.cost_user_entered != null ? 'Edit Manual Cost' : 'Add Manual Cost'}
                            </button>
                        ) : undefined
                    }
                />

                {hasCoords && (
                    <section className={`relative mb-6 overflow-hidden p-4 ${SURFACE_CARD_CLASS}`}>
                        <ViewportGate
                            className="h-96 w-full"
                            placeholder={<div className={`h-96 w-full animate-pulse ${SUBCARD_CLASS}`} />}
                        >
                            <TripDetailMap
                                startLat={session.latitude!}
                                startLng={session.longitude!}
                                endLat={session.latitude!}
                                endLng={session.longitude!}
                            />
                        </ViewportGate>
                    </section>
                )}

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <StatBox
                        icon={<Calendar className="h-5 w-5" />}
                        label="Started"
                        value={formatDateTime(session.start_time)}
                        color="blue"
                    />
                    <StatBox
                        icon={<Clock className="h-5 w-5" />}
                        label="Duration"
                        value={formatDuration(session.start_time, session.end_time)}
                        color="green"
                    />
                    {session.end_time && (
                        <StatBox
                            icon={<Calendar className="h-5 w-5" />}
                            label="Ended"
                            value={formatDateTime(session.end_time)}
                            color="purple"
                        />
                    )}

                    {/* Energy & Speed */}
                    <StatBox
                        icon={<Battery className="h-5 w-5" />}
                        label="Energy Added"
                        value={batteryEnergy != null ? `+${batteryEnergy.toFixed(2)} kWh` : 'N/A'}
                        color="green"
                        subtext="Vehicle-reported"
                    />
                    {isSupercharger && (
                        <StatBox
                            icon={<Zap className="h-5 w-5" />}
                            label="Energy Delivered"
                            value={deliveredEnergy != null
                                ? `${deliveredEnergy.toFixed(2)} kWh`
                                : teslaSyncStatus === 'pending'
                                    ? 'Waiting for Tesla'
                                    : 'Tesla unavailable'
                            }
                            color="yellow"
                            subtext={
                                deliveredEnergy != null
                                    ? 'Tesla charging history'
                                    : teslaSyncMessage || 'No matched Tesla data yet'
                            }
                        />
                    )}
                    {isSupercharger && (
                        <StatBox
                            icon={<Zap className="h-5 w-5" />}
                            label="Energy Loss"
                            value={lossPercent != null
                                ? `${lossPercent.toFixed(1)}%`
                                : deliveredEnergy != null && batteryEnergy != null
                                    ? '0.0%'
                                    : teslaSyncStatus === 'pending'
                                        ? 'Waiting for Tesla'
                                        : 'Tesla unavailable'
                            }
                            color={lossPercent != null && lossPercent > 0 ? "orange" : "slate"}
                            subtext={
                                lossEnergy != null && lossEnergy > 0
                                    ? `${lossEnergy.toFixed(2)} kWh`
                                    : deliveredEnergy != null && batteryEnergy != null
                                        ? 'No measurable gap'
                                        : undefined
                            }
                            detail={
                                lossCost != null && lossCost > 0
                                    ? `${session.currency || preferredCurrency} ${lossCost.toFixed(2)} equivalent cost`
                                    : displayCost != null && deliveredEnergy != null && batteryEnergy != null
                                        ? `${session.currency || preferredCurrency} 0.00 equivalent cost`
                                        : undefined
                            }
                        />
                    )}
                    <StatBox
                        icon={<Activity className="h-5 w-5" />}
                        label="Max Charge Rate"
                        value={session.charge_rate_kw ? `${session.charge_rate_kw.toFixed(0)} kW` : 'N/A'}
                        color="orange"
                    />

                    {/* Cost Information */}
                    <StatBox
                        icon={<Banknote className="h-5 w-5" />}
                        label="Total Cost"
                        value={
                            displayCost != null
                                ? `${session.currency || preferredCurrency} ${displayCost.toFixed(2)}`
                                : isSupercharger
                                    ? teslaSyncStatus === 'pending'
                                        ? 'Tesla cost pending'
                                        : 'Tesla cost unavailable'
                                    : 'Not entered'
                        }
                        color={displayCost != null ? "green" : "slate"}
                        subtext={
                            displayCost != null
                                ? costSource === 'manual'
                                    ? isSupercharger
                                        ? 'Manual cost because Tesla billing was unavailable'
                                        : 'Manual entry'
                                    : costSource === 'tesla'
                                        ? 'Tesla charging history'
                                        : undefined
                                : isSupercharger
                                    ? (teslaSyncMessage || 'Tesla billing unavailable')
                                    : undefined
                        }
                    />
                    {isSupercharger && (
                        <StatBox
                            icon={<Banknote className="h-5 w-5" />}
                            label="Tesla Rate"
                            value={session.charger_price_per_kwh != null
                                ? `${session.charger_price_per_kwh.toFixed(2)} / kWh`
                                : teslaSyncStatus === 'pending'
                                    ? 'Waiting for Tesla'
                                    : 'Tesla unavailable'
                            }
                            color={session.charger_price_per_kwh != null ? "yellow" : "slate"}
                            subtext={session.charger_price_per_kwh != null
                                ? (
                                    teslaEventId
                                        ? `Tesla event ${teslaEventId}`
                                        : 'Reported by Tesla'
                                )
                                : teslaSyncMessage || 'No matched Tesla billing record yet'
                            }
                        />
                    )}

                    {/* Battery State */}
                    {session.start_battery_pct != null && (
                        <StatBox
                            icon={<Battery className="h-5 w-5" />}
                            label="Battery Start"
                            value={`${session.start_battery_pct.toFixed(2)}%`}
                            color="red"
                        />
                    )}
                    {session.end_battery_pct != null && (
                        <StatBox
                            icon={<Battery className="h-5 w-5" />}
                            label="Battery End"
                            value={`${session.end_battery_pct.toFixed(2)}%`}
                            color="green"
                        />
                    )}

                    {/* Raw Location */}
                    {hasCoords && (
                        <LocationCard
                            title="Station Coordinates"
                            lat={session.latitude}
                            lon={session.longitude}
                            color="blue"
                            googleMapsUrl={googleMapsUrl}
                        />
                    )}
                </div>
            </PageShell>
        </div>
    );
}

function StatBox({
    icon,
    label,
    value,
    color,
    subtext,
    detail,
}: {
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    color: string;
    subtext?: React.ReactNode;
    detail?: React.ReactNode;
}) {
    const colorClasses = {
        blue: 'text-slate-300',
        green: 'text-green-300',
        yellow: 'text-amber-300',
        orange: 'text-amber-300',
        red: 'text-red-300',
        purple: 'text-slate-300',
        slate: 'text-slate-300',
    };

    return (
        <div className={`flex flex-col justify-center p-5 ${SURFACE_CARD_CLASS}`}>
            <div className="flex items-center gap-4">
                <div className={`flex h-11 w-11 items-center justify-center ${SUBCARD_CLASS} ${colorClasses[color as keyof typeof colorClasses]}`}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{label}</div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <div className="text-2xl font-semibold tracking-tight text-white">
                            {value}
                        </div>
                        {subtext && <span className="text-xs font-normal text-slate-500">{subtext}</span>}
                    </div>
                    {detail && (
                        <div className="mt-2 text-xs font-medium text-slate-400">
                            {detail}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function LocationCard({
    title,
    lat,
    lon,
    color,
    googleMapsUrl,
}: {
    title: string;
    lat?: number | null;
    lon?: number | null;
    color: string;
    googleMapsUrl?: string | null;
}) {
    const toneMap = {
        blue: 'quiet' as const,
        green: 'live' as const,
        red: 'brand' as const,
    };

    return (
        <div className={`flex flex-col justify-center p-6 ${SURFACE_CARD_CLASS}`}>
            <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 items-center justify-center ${SUBCARD_CLASS}`}>
                    <MapPin className="mt-0.5 h-5 w-5 text-slate-300" />
                </div>
                <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">{title}</h3>
                        <StatusBadge tone={toneMap[color as keyof typeof toneMap]}>Coordinates</StatusBadge>
                    </div>
                    <p className="mt-2 break-all font-mono text-sm tracking-tight text-slate-300">
                        {lat != null && lon != null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : 'Unknown'}
                    </p>
                    {googleMapsUrl ? (
                        <a
                            href={googleMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
                        >
                            Open in Google Maps
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
