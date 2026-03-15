'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
    Zap,
    History,
    Calendar,
    Clock,
    Battery,
    Loader2,
    Banknote,
    Check,
} from 'lucide-react';
import Header from '@/components/Header';
import { useSettingsStore } from '@/stores/settingsStore';
import dynamic from 'next/dynamic';
import {
    canUseManualChargingCost,
    getChargingBatteryEnergyKwh,
    getChargingCostSource,
    getChargingDeliveredEnergyKwh,
    getChargingDisplayCost,
    getChargingUnitCost,
} from '@/lib/charging/energy';
import {
    getTeslaChargingSyncMessage,
    getTeslaChargingSyncStatus,
    isSuperchargerChargingSession,
} from '@/lib/charging/teslaSync';
import { invalidateCachedJsonMatching, readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';

const TripMiniMap = dynamic(() => import('@/components/TripMiniMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-700/30 animate-pulse rounded-lg" />
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

interface ChargingSummary {
    totalSessions: number;
    totalBatteryEnergy: number;
    totalDeliveredEnergy: number;
    maxChargeRate: number;
    totalCost: number;
}

type GeocodeResult = {
    success?: boolean;
    address?: string;
    raw?: Record<string, string | undefined>;
    fallback?: string;
};

interface TimeframeSelectorProps {
    selected: string;
    onSelect: (value: string) => void;
    customStart: string;
    customEnd: string;
    onCustomStartChange: (value: string) => void;
    onCustomEndChange: (value: string) => void;
    showCustomPicker: boolean;
    onToggleCustomPicker: () => void;
}

const CHARGING_PAGE_SIZE = 20;
const CHARGING_LABEL_FETCH_ROOT_MARGIN = '320px';
const CHARGING_BOOTSTRAP_CACHE_TTL_MS = 45_000;
const chargingLocationLabelCache = new Map<string, string>();
const chargingLocationLabelRequestCache = new Map<string, Promise<string>>();

type ChargingListResponse = {
    success?: boolean;
    sessions?: ChargingSession[];
    summary?: ChargingSummary | null;
    nextOffset?: number | null;
    error?: string;
};

function formatDuration(start: string, end: string | null): string {
    if (!end) return 'In Progress';
    const seconds = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    else if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    else return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getSessionCoordinateKey(session: ChargingSession): string | null {
    if (session.latitude == null || session.longitude == null) {
        return null;
    }

    return `${session.latitude.toFixed(4)},${session.longitude.toFixed(4)}`;
}

function getFallbackChargingLocationLabel(session: ChargingSession): string {
    if (session.location_name && session.location_name !== 'Charging Location') {
        return session.location_name;
    }

    return 'Charging Location';
}

function extractLocalityLabel(data: GeocodeResult, session: ChargingSession): string {
    const raw = data.raw || {};
    const locality =
        raw.suburb ||
        raw.neighbourhood ||
        raw.city_district ||
        raw.quarter ||
        raw.borough ||
        raw.town ||
        raw.city ||
        raw.village ||
        raw.municipality ||
        raw.hamlet;

    const city =
        raw.city ||
        raw.town ||
        raw.village ||
        raw.municipality ||
        raw.county ||
        raw.state;

    if (locality && city && locality !== city) {
        return `${locality}, ${city}`;
    }

    if (locality) {
        return locality;
    }

    if (city) {
        return city;
    }

    if (session.location_name && session.location_name !== 'Charging Location') {
        return session.location_name;
    }

    return 'Charging Location';
}

async function getChargingLocationLabel(session: ChargingSession): Promise<string> {
    const key = getSessionCoordinateKey(session);

    if (!key) {
        return getFallbackChargingLocationLabel(session);
    }

    if (chargingLocationLabelCache.has(key)) {
        return chargingLocationLabelCache.get(key) || getFallbackChargingLocationLabel(session);
    }

    let pendingRequest = chargingLocationLabelRequestCache.get(key);

    if (!pendingRequest) {
        pendingRequest = fetch(`/api/geocode?lat=${session.latitude}&lng=${session.longitude}`)
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error('Geocode request failed');
                }

                const data: GeocodeResult = await response.json();
                return extractLocalityLabel(data, session);
            })
            .catch(() => getFallbackChargingLocationLabel(session))
            .then((label) => {
                chargingLocationLabelCache.set(key, label);
                return label;
            })
            .finally(() => {
                chargingLocationLabelRequestCache.delete(key);
            });

        chargingLocationLabelRequestCache.set(key, pendingRequest);
    }

    return pendingRequest;
}

export default function ChargingPage() {
    const preferredCurrency = useSettingsStore((state) => state.currency);
    const [sessions, setSessions] = useState<ChargingSession[]>([]);
    const [summary, setSummary] = useState<ChargingSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nextOffset, setNextOffset] = useState<number | null>(0);
    const [timeframe, setTimeframe] = useState('7days');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const hasCompleteDateRange = timeframe !== 'custom' || (!!customStart && !!customEnd);

    // Modal state
    const [editingSession, setEditingSession] = useState<ChargingSession | null>(null);
    const [costInput, setCostInput] = useState('');
    const [currencyInput, setCurrencyInput] = useState(preferredCurrency);
    const [savingCost, setSavingCost] = useState(false);

    // Calculate date range
    const getDateRange = useCallback(() => {
        const toDate = new Date();
        toDate.setHours(23, 59, 59, 999);
        let fromDate = new Date();

        if (timeframe === 'custom' && customStart && customEnd) {
            fromDate = new Date(customStart);
            fromDate.setHours(0, 0, 0, 0);
            const customToDate = new Date(customEnd);
            customToDate.setHours(23, 59, 59, 999);
            return { fromDate, toDate: customToDate };
        } else {
            switch (timeframe) {
                case '7days': fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000); break;
                case 'month': fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), 1); break;
                case '30days': fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000); break;
                case '3months': fromDate = new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000); break;
                case 'year': fromDate = new Date(toDate.getFullYear(), 0, 1); fromDate.setHours(0, 0, 0, 0); break;
                case 'alltime': fromDate = new Date(0); fromDate.setHours(0, 0, 0, 0); break;
                case 'week':
                default:
                    const day = toDate.getDay();
                    const diff = toDate.getDate() - day + (day === 0 ? -6 : 1);
                    fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), diff);
                    fromDate.setHours(0, 0, 0, 0);
                    break;
            }
        }
        return { fromDate, toDate };
    }, [timeframe, customStart, customEnd]);

    const handleSaveCost = async () => {
        if (!editingSession || !costInput) return;
        setSavingCost(true);
        try {
            const response = await fetch(`/api/charging/${editingSession.id}/cost`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cost: parseFloat(costInput),
                    currency: currencyInput
                })
            });
            const data = await response.json();

            if (data.success && data.session) {
                setSessions(prev =>
                    prev.map(s => s.id === editingSession.id ? {
                        ...s,
                        cost_user_entered: data.session.cost_user_entered,
                        currency: data.session.currency
                    } : s)
                );
                invalidateCachedJsonMatching('charging:list:');
                invalidateCachedJsonMatching(`charging:detail:${editingSession.id}`);
                setEditingSession(null);
                setCostInput('');
            }
        } catch (err) {
            console.error('Failed to save cost', err);
        } finally {
            setSavingCost(false);
        }
    };

    const fetchSessions = useCallback(async ({ reset, offset }: { reset: boolean; offset: number }) => {
        let hydratedFromCache = false;
        let requestCacheKey = '';

        if (reset) {
            setError(null);
            setSummary(null);
        } else {
            setLoadingMore(true);
        }

        try {
            const { fromDate, toDate } = getDateRange();
            const params = new URLSearchParams({
                from: fromDate.toISOString(),
                to: toDate.toISOString(),
                limit: String(CHARGING_PAGE_SIZE),
                offset: String(offset),
                includeSummary: reset ? '1' : '0',
                preferredCurrency,
            });

            requestCacheKey = `charging:list:${params.toString()}`;

            if (reset) {
                const cached = readCachedJson<ChargingListResponse>(requestCacheKey);

                if (cached?.success) {
                    setSessions(Array.isArray(cached.sessions) ? cached.sessions : []);
                    setNextOffset(typeof cached.nextOffset === 'number' ? cached.nextOffset : null);
                    setSummary(cached.summary || null);
                    setLoading(false);
                    hydratedFromCache = true;
                } else {
                    setLoading(true);
                }
            }

            const response = await fetch(`/api/charging?${params}`);
            const data = await response.json();

            if (data.success) {
                if (reset) {
                    writeCachedJson(requestCacheKey, data, CHARGING_BOOTSTRAP_CACHE_TTL_MS);
                }

                const incomingSessions = Array.isArray(data.sessions) ? data.sessions : [];

                setSessions((currentSessions) => {
                    if (reset) {
                        return incomingSessions;
                    }

                    const mergedSessions = [...currentSessions];
                    const seenSessionIds = new Set(currentSessions.map((session) => session.id));

                    for (const session of incomingSessions) {
                        if (!seenSessionIds.has(session.id)) {
                            mergedSessions.push(session);
                            seenSessionIds.add(session.id);
                        }
                    }

                    return mergedSessions;
                });
                setNextOffset(typeof data.nextOffset === 'number' ? data.nextOffset : null);
                if (reset) {
                    setSummary(data.summary || null);
                }
            } else {
                if (!hydratedFromCache) {
                    setError(data.error || 'Failed to load charging sessions');
                }
            }
        } catch {
            if (!hydratedFromCache) {
                setError('Failed to load charging sessions');
            }
        } finally {
            if (reset) {
                if (!hydratedFromCache) {
                    setLoading(false);
                }
            } else {
                setLoadingMore(false);
            }
        }
    }, [getDateRange, preferredCurrency]);

    // Re-fetch when timeframe or custom dates change
    useEffect(() => {
        if (!hasCompleteDateRange) {
            setNextOffset(null);
            return;
        }

        void fetchSessions({ reset: true, offset: 0 });
    }, [fetchSessions, hasCompleteDateRange]);

    const displayedSessions = sessions;

    const sessionsByDate = displayedSessions.reduce((acc, session) => {
        const date = formatDate(session.start_time);
        if (!acc[date]) acc[date] = [];
        acc[date].push(session);
        return acc;
    }, {} as Record<string, ChargingSession[]>);

    const totalSessions = summary?.totalSessions ?? displayedSessions.length;
    const totalBatteryEnergy = summary?.totalBatteryEnergy ?? displayedSessions.reduce((sum, s) => sum + (getChargingBatteryEnergyKwh(s) || 0), 0);
    const totalDeliveredEnergy = summary?.totalDeliveredEnergy ?? displayedSessions.reduce((sum, s) => sum + (getChargingDeliveredEnergyKwh(s) || 0), 0);
    const maxChargeRate = summary?.maxChargeRate ?? Math.max(...displayedSessions.map(s => s.charge_rate_kw || 0), 0);
    const totalCost = summary?.totalCost ?? displayedSessions
        .filter((s) => getChargingDisplayCost(s) != null && (s.currency === preferredCurrency || !s.currency))
        .reduce((sum, s) => sum + (getChargingDisplayCost(s) ?? 0), 0);

    return (
        <div className="min-h-screen">
            <Header />

            {/* Modal for Cost Entry */}
            {editingSession && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                        <h3 className="mb-4 text-xl font-bold">Add Charging Cost</h3>
                        <p className="mb-6 text-sm text-slate-400">
                            Enter the total cost for the session on {new Date(editingSession.start_time).toLocaleDateString()}.
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
                                onClick={() => setEditingSession(null)}
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

            <main className="mx-auto max-w-7xl px-6 py-8">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Charging History</h1>
                        <p className="text-slate-400">View and manage your charging sessions</p>
                    </div>

                    <TimeframeSelector
                        selected={timeframe}
                        onSelect={setTimeframe}
                        customStart={customStart}
                        customEnd={customEnd}
                        onCustomStartChange={setCustomStart}
                        onCustomEndChange={setCustomEnd}
                        showCustomPicker={showCustomPicker}
                        onToggleCustomPicker={() => setShowCustomPicker(!showCustomPicker)}
                    />
                </div>

                <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <StatCard
                        icon={<Zap className="h-5 w-5" />}
                        label="Total Sessions"
                        value={totalSessions.toString()}
                        color="blue"
                    />
                    <StatCard
                        icon={<Battery className="h-5 w-5" />}
                        label="Energy to Battery"
                        value={`${totalBatteryEnergy.toFixed(1)} kWh`}
                        color="green"
                    />
                    <StatCard
                        icon={<Zap className="h-5 w-5" />}
                        label="Tesla Delivered"
                        value={totalDeliveredEnergy > 0 ? `${totalDeliveredEnergy.toFixed(1)} kWh` : '--'}
                        color="purple"
                    />
                    <StatCard
                        icon={<Zap className="h-5 w-5" />}
                        label="Max Charge Rate"
                        value={maxChargeRate > 0 ? `${maxChargeRate.toFixed(0)} kW` : '--'}
                        color="orange"
                    />
                    <StatCard
                        icon={<Banknote className="h-5 w-5" />}
                        label="Total Cost"
                        value={`${totalCost.toFixed(2)} ${preferredCurrency}`}
                        color="purple"
                    />
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                    </div>
                ) : error ? (
                    <div className="rounded-xl bg-red-500/10 p-6 text-center text-red-400">{error}</div>
                ) : displayedSessions.length === 0 ? (
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-12 text-center">
                        <History className="mx-auto mb-4 h-12 w-12 text-slate-500" />
                        <h2 className="mb-2 text-xl font-semibold">No charging yet</h2>
                        <p className="text-slate-400">Charging sessions will appear here automatically.</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-6">
                            {Object.entries(sessionsByDate).map(([date, dateSessions]) => (
                                <div key={date}>
                                    <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                                        <Calendar className="h-4 w-4" />
                                        {date}
                                    </div>
                                    <div className="space-y-3">
                                        {dateSessions.map((session) => (
                                            <SessionCard
                                                key={session.id}
                                                session={session}
                                                preferredCurrency={preferredCurrency}
                                                onAddCost={() => {
                                                    setEditingSession(session);
                                                    setCostInput((session.cost_user_entered ?? getChargingDisplayCost(session))?.toString() || '');
                                                    setCurrencyInput(session.currency || preferredCurrency);
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {nextOffset !== null && (
                            <div className="mt-8 flex justify-center">
                                <button
                                    onClick={() => void fetchSessions({ reset: false, offset: nextOffset })}
                                    disabled={loadingMore}
                                    className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {loadingMore ? 'Loading more sessions...' : 'Load more sessions'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

function SessionCard({
    session,
    preferredCurrency,
    onAddCost,
}: {
    session: ChargingSession;
    preferredCurrency: string;
    onAddCost: () => void;
}) {
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [isNearViewport, setIsNearViewport] = useState(false);
    const [resolvedLocationLabel, setResolvedLocationLabel] = useState<string | null>(() => {
        const coordinateKey = getSessionCoordinateKey(session);

        if (!coordinateKey) {
            return getFallbackChargingLocationLabel(session);
        }

        return chargingLocationLabelCache.get(coordinateKey) || null;
    });
    const isSupercharger = isSuperchargerChargingSession(session);
    const isDC = session.charger_type?.toLowerCase().includes('3rd_party_fast') || isSupercharger;
    const hasLocation = session.latitude != null && session.longitude != null;
    const batteryEnergy = getChargingBatteryEnergyKwh(session);
    const deliveredEnergy = getChargingDeliveredEnergyKwh(session);
    const displayCost = getChargingDisplayCost(session);
    const unitCost = getChargingUnitCost(session);
    const costSource = getChargingCostSource(session);
    const canUseManualCost = canUseManualChargingCost(session);
    const teslaSyncStatus = getTeslaChargingSyncStatus(session);
    const teslaSyncMessage = getTeslaChargingSyncMessage(session);
    const costSubtext =
        costSource === 'manual' && isSupercharger
            ? `Manual cost; ${teslaSyncMessage?.toLowerCase() || 'Tesla unavailable'}`
            : unitCost != null
                ? `${unitCost.toFixed(2)} / kWh${costSource === 'tesla' ? ' from Tesla' : ''}`
                : null;
    const displayLocationLabel = resolvedLocationLabel || getFallbackChargingLocationLabel(session);

    useEffect(() => {
        if (isNearViewport || !cardRef.current || !hasLocation) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setIsNearViewport(true);
                        observer.disconnect();
                        break;
                    }
                }
            },
            { rootMargin: CHARGING_LABEL_FETCH_ROOT_MARGIN }
        );

        observer.observe(cardRef.current);

        return () => observer.disconnect();
    }, [hasLocation, isNearViewport]);

    useEffect(() => {
        if (!isNearViewport || !hasLocation || resolvedLocationLabel !== null) {
            return;
        }

        let cancelled = false;

        void getChargingLocationLabel(session).then((label) => {
            if (!cancelled) {
                setResolvedLocationLabel(label);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [hasLocation, isNearViewport, resolvedLocationLabel, session]);

    return (
        <div ref={cardRef}>
            <Link
                href={`/dashboard/charging/${session.id}`}
                className="block rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 transition-all hover:border-slate-600 hover:bg-slate-800/50"
            >
                <div className="flex items-stretch gap-4">
                    {hasLocation && (
                        <div className="relative hidden h-24 w-32 flex-shrink-0 overflow-hidden rounded-lg border border-slate-600/50 sm:block">
                            <TripMiniMap
                                startLat={session.latitude!}
                                startLon={session.longitude!}
                                endLat={session.latitude!}
                                endLon={session.longitude!}
                            />
                        </div>
                    )}

                    <div className="flex flex-1 flex-col justify-between">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                        {displayLocationLabel}
                                    </span>
                                    {isSupercharger && (
                                        <span className="rounded-full border border-red-500/20 bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-500">
                                            Supercharger
                                        </span>
                                    )}
                                    {!isSupercharger && isDC && (
                                        <span className="rounded-full border border-orange-500/20 bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
                                            DC Fast
                                        </span>
                                    )}
                                    {!session.is_complete && (
                                        <span className="animate-pulse rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                                            Charging...
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {formatTime(session.start_time)}
                                        <span className="mx-0.5 text-slate-600">•</span>
                                        {formatDuration(session.start_time, session.end_time)}
                                    </span>
                                    {batteryEnergy != null && (
                                        <span className="flex items-center gap-1">
                                            <Battery className="h-3 w-3" />
                                            Battery: +{batteryEnergy.toFixed(1)} kWh
                                        </span>
                                    )}
                                    {(deliveredEnergy != null || isSupercharger) && (
                                        <span className="flex items-center gap-1">
                                            <Zap className="h-3 w-3" />
                                            Delivered:{' '}
                                            {deliveredEnergy != null
                                                ? `${deliveredEnergy.toFixed(1)} kWh`
                                                : teslaSyncStatus === 'pending'
                                                    ? 'pending'
                                                    : 'unavailable'
                                            }
                                        </span>
                                    )}
                                    {session.charge_rate_kw && (
                                        <span className="flex items-center gap-1">
                                            <Zap className="h-3 w-3" />
                                            Max: {session.charge_rate_kw.toFixed(0)} kW
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Cost Display / Button */}
                            <div className="ml-4 text-right">
                                {displayCost != null && !canUseManualCost ? (
                                    <div className="flex flex-col items-end text-sm">
                                        <span className="text-lg font-bold text-white">
                                            {session.currency || preferredCurrency} {displayCost.toFixed(2)}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {costSource === 'tesla' ? 'Tesla billing' : ''}
                                        </span>
                                    </div>
                                ) : displayCost != null ? (
                                    <button
                                        onClick={(e) => { e.preventDefault(); onAddCost(); }}
                                        className="group flex flex-col items-end text-sm transition-colors hover:opacity-80"
                                    >
                                        <span className="text-lg font-bold text-white transition-colors group-hover:text-red-400">
                                            {session.currency || preferredCurrency} {displayCost.toFixed(2)}
                                        </span>
                                        {costSubtext != null && (
                                            <span className="text-xs text-slate-500">
                                                {costSubtext}
                                            </span>
                                        )}
                                    </button>
                                ) : canUseManualCost ? (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            onAddCost();
                                        }}
                                        className="flex items-center gap-1.5 rounded-lg border border-slate-600/50 bg-slate-700/50 px-3 py-1.5 text-sm font-medium text-slate-300 transition-all hover:bg-slate-700 hover:text-white"
                                    >
                                        <Banknote className="h-4 w-4" />
                                        Add Cost
                                    </button>
                                ) : (
                                    <div className="text-sm text-slate-500">
                                        {teslaSyncStatus === 'pending' ? 'Waiting for Tesla billing' : 'Tesla billing unavailable'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Battery bar - separate full-width row */}
                {session.start_battery_pct != null && (
                    <div className="mt-4 flex items-center gap-4 border-t border-slate-700/50 pt-3">
                        <div className="flex flex-1 items-center gap-3">
                            <div className="text-sm font-medium">Battery</div>
                            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-700">
                                <div
                                    className="absolute left-0 top-0 h-full bg-slate-500"
                                    style={{ width: `${session.start_battery_pct}%` }}
                                />
                                {session.end_battery_pct != null && (
                                    <div
                                        className="absolute top-0 h-full bg-green-500"
                                        style={{
                                            left: `${session.start_battery_pct}%`,
                                            width: `${session.end_battery_pct - session.start_battery_pct}%`
                                        }}
                                    />
                                )}
                            </div>
                            <div className="whitespace-nowrap font-mono text-sm text-slate-400">
                                {session.start_battery_pct.toFixed(2)}%
                                {session.end_battery_pct != null ? ` → ${session.end_battery_pct.toFixed(2)}%` : ''}
                            </div>
                        </div>
                    </div>
                )}
            </Link>
        </div>
    );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: 'blue' | 'green' | 'purple' | 'orange'; }) {
    const colors = {
        blue: 'bg-blue-500/10 text-blue-400',
        green: 'bg-green-500/10 text-green-400',
        purple: 'bg-purple-500/10 text-purple-400',
        orange: 'bg-orange-500/10 text-orange-400',
    };
    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
            <div className={`mb-3 inline-flex rounded-lg p-2 ${colors[color]}`}>{icon}</div>
            <p className="text-sm text-slate-400">{label}</p>
            <p className="text-xl font-bold truncate">{value}</p>
        </div>
    );
}

// Reuse the TimeframeSelector from Trips page (simplified here for brevity, usually extracted to a component)
function TimeframeSelector({ selected, onSelect, customStart, customEnd, onCustomStartChange, onCustomEndChange, showCustomPicker, onToggleCustomPicker }: TimeframeSelectorProps) {
    const options = [
        { id: 'week', label: 'This Week' }, { id: '7days', label: 'Last 7 Days' },
        { id: 'month', label: 'This Month' }, { id: '30days', label: 'Last 30 Days' },
        { id: '3months', label: 'Last 3 Months' }, { id: 'year', label: 'This Year' }, { id: 'alltime', label: 'All Time' }, { id: 'custom', label: 'Custom' },
    ];
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                {options.map((opt) => (
                    <button
                        key={opt.id}
                        onClick={() => { onSelect(opt.id); if (opt.id === 'custom') onToggleCustomPicker(); }}
                        className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${selected === opt.id ? 'bg-red-500 text-white' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'}`}
                    >
                        {opt.id === 'custom' && <Calendar className="h-3.5 w-3.5" />} {opt.label}
                    </button>
                ))}
            </div>
            {selected === 'custom' && showCustomPicker && (
                <div className="flex gap-3 rounded-lg bg-slate-800/50 p-3">
                    <input type="date" value={customStart} onChange={(e) => onCustomStartChange(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm" />
                    <input type="date" value={customEnd} onChange={(e) => onCustomEndChange(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm" />
                </div>
            )}
        </div>
    );
}
