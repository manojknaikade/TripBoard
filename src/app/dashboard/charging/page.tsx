'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { fetchCachedJson, invalidateCachedJsonMatching, readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';
import VirtualizedList from '@/components/VirtualizedList';
import {
    DashboardStatCard,
    EmptyStateCard,
    LIST_CARD_CLASS,
    PageHero,
    PageShell,
    SectionDateHeader,
    StatusBadge,
    SUBCARD_CLASS,
    TimeframeSelector,
} from '@/components/ui/dashboardPage';

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

const CHARGING_PAGE_SIZE = 20;
const CHARGING_AUTOLOAD_ROOT_MARGIN = '640px 0px';
const CHARGING_LABEL_FETCH_ROOT_MARGIN = '320px';
const CHARGING_BOOTSTRAP_CACHE_TTL_MS = 45_000;
const chargingLocationLabelCache = new Map<string, string>();
const chargingLocationLabelRequestCache = new Map<string, Promise<string>>();
const timeframeOptions = [
    { id: 'week', label: 'This Week' },
    { id: '7days', label: 'Last 7 Days' },
    { id: 'month', label: 'This Month' },
    { id: '30days', label: 'Last 30 Days' },
    { id: '3months', label: 'Last 3 Months' },
    { id: 'year', label: 'This Year' },
    { id: 'alltime', label: 'All Time' },
    { id: 'custom', label: 'Custom' },
];

type ChargingListResponse = {
    success?: boolean;
    sessions?: ChargingSession[];
    summary?: ChargingSummary | null;
    nextOffset?: number | null;
    error?: string;
};

type VirtualChargingListItem =
    | { key: string; type: 'header'; label: string }
    | { key: string; type: 'session'; session: ChargingSession };

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
    const autoLoadTriggerRef = useRef<HTMLDivElement | null>(null);
    const autoLoadOffsetRef = useRef<number | null>(null);
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

    const getChargingRequestParams = useCallback((offset: number, includeSummary: boolean) => {
        const { fromDate, toDate } = getDateRange();

        return new URLSearchParams({
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            limit: String(CHARGING_PAGE_SIZE),
            offset: String(offset),
            includeSummary: includeSummary ? '1' : '0',
            preferredCurrency,
        });
    }, [getDateRange, preferredCurrency]);

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
            autoLoadOffsetRef.current = null;
        } else {
            setLoadingMore(true);
        }

        try {
            const params = getChargingRequestParams(offset, reset);

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

            const data = !reset
                ? await fetchCachedJson<ChargingListResponse>(
                    requestCacheKey,
                    async () => {
                        const response = await fetch(`/api/charging?${params}`);
                        return response.json();
                    },
                    CHARGING_BOOTSTRAP_CACHE_TTL_MS
                )
                : await fetch(`/api/charging?${params}`).then((response) => response.json());

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
    }, [getChargingRequestParams]);

    // Re-fetch when timeframe or custom dates change
    useEffect(() => {
        if (!hasCompleteDateRange) {
            autoLoadOffsetRef.current = null;
            setNextOffset(null);
            return;
        }

        void fetchSessions({ reset: true, offset: 0 });
    }, [fetchSessions, hasCompleteDateRange]);

    useEffect(() => {
        if (!hasCompleteDateRange || loading || loadingMore || nextOffset === null || !autoLoadTriggerRef.current) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) {
                        if (autoLoadOffsetRef.current === nextOffset) {
                            autoLoadOffsetRef.current = null;
                        }
                        continue;
                    }

                    if (autoLoadOffsetRef.current === nextOffset) {
                        continue;
                    }

                    autoLoadOffsetRef.current = nextOffset;
                    void fetchSessions({ reset: false, offset: nextOffset });
                }
            },
            { rootMargin: CHARGING_AUTOLOAD_ROOT_MARGIN }
        );

        observer.observe(autoLoadTriggerRef.current);

        return () => observer.disconnect();
    }, [fetchSessions, hasCompleteDateRange, loading, loadingMore, nextOffset]);

    useEffect(() => {
        if (!hasCompleteDateRange || loading || nextOffset === null) {
            return;
        }

        const params = getChargingRequestParams(nextOffset, false);
        const requestCacheKey = `charging:list:${params.toString()}`;

        void fetchCachedJson<ChargingListResponse>(
            requestCacheKey,
            async () => {
                const response = await fetch(`/api/charging?${params}`);
                return response.json();
            },
            CHARGING_BOOTSTRAP_CACHE_TTL_MS
        ).catch(() => {
            // Ignore prefetch failures; the visible fetch path handles retries and errors.
        });
    }, [getChargingRequestParams, hasCompleteDateRange, loading, nextOffset]);

    const displayedSessions = sessions;

    const virtualChargingListItems = useMemo(() => {
        const items: VirtualChargingListItem[] = [];
        let currentDateLabel: string | null = null;

        for (const session of displayedSessions) {
            const nextDateLabel = formatDate(session.start_time);

            if (nextDateLabel !== currentDateLabel) {
                currentDateLabel = nextDateLabel;
                items.push({
                    key: `header:${nextDateLabel}`,
                    type: 'header',
                    label: nextDateLabel,
                });
            }

            items.push({
                key: `session:${session.id}`,
                type: 'session',
                session,
            });
        }

        return items;
    }, [displayedSessions]);

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

            <PageShell>
                <PageHero
                    title="Charging History"
                    description="Charging sessions, delivered energy, peak rate, and cost across the selected timeframe."
                    actions={
                        <TimeframeSelector
                            options={timeframeOptions}
                            selected={timeframe}
                            onSelect={setTimeframe}
                            customStart={customStart}
                            customEnd={customEnd}
                            onCustomStartChange={setCustomStart}
                            onCustomEndChange={setCustomEnd}
                            showCustomPicker={showCustomPicker}
                            onToggleCustomPicker={() => setShowCustomPicker(!showCustomPicker)}
                        />
                    }
                />

                <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <DashboardStatCard
                        icon={<Zap className="h-5 w-5" />}
                        label="Total Sessions"
                        value={totalSessions.toString()}
                        helper="Charging sessions recorded in the active period."
                        tone="brand"
                    />
                    <DashboardStatCard
                        icon={<Battery className="h-5 w-5" />}
                        label="Energy to Battery"
                        value={`${totalBatteryEnergy.toFixed(1)} kWh`}
                        helper="Estimated energy stored in the battery."
                        tone="live"
                    />
                    <DashboardStatCard
                        icon={<Zap className="h-5 w-5" />}
                        label="Tesla Delivered"
                        value={totalDeliveredEnergy > 0 ? `${totalDeliveredEnergy.toFixed(1)} kWh` : '--'}
                        helper="Delivered energy where charger-side telemetry is available."
                        tone="quiet"
                    />
                    <DashboardStatCard
                        icon={<Zap className="h-5 w-5" />}
                        label="Max Charge Rate"
                        value={maxChargeRate > 0 ? `${maxChargeRate.toFixed(0)} kW` : '--'}
                        helper="Highest observed charge rate across visible sessions."
                        tone="warning"
                    />
                    <DashboardStatCard
                        icon={<Banknote className="h-5 w-5" />}
                        label="Total Cost"
                        value={`${totalCost.toFixed(2)} ${preferredCurrency}`}
                        helper="Visible total using Tesla billing or manual cost entries."
                        tone="quiet"
                    />
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                    </div>
                ) : error ? (
                    <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-300">{error}</div>
                ) : displayedSessions.length === 0 ? (
                    <EmptyStateCard
                        icon={<History className="h-7 w-7" />}
                        title="No charging yet"
                        description="Charging sessions will appear here automatically."
                    />
                ) : (
                    <>
                        <VirtualizedList
                            key={`charging:${virtualChargingListItems[0]?.key || 'empty'}:${virtualChargingListItems[virtualChargingListItems.length - 1]?.key || 'empty'}:${virtualChargingListItems.length}`}
                            items={virtualChargingListItems}
                            getItemKey={(item) => item.key}
                            estimateHeight={(item) => item.type === 'header' ? 40 : 196}
                            overscanPx={1000}
                            renderItem={(item) => (
                                item.type === 'header' ? (
                                    <SectionDateHeader>
                                        <Calendar className="h-4 w-4" />
                                        {item.label}
                                    </SectionDateHeader>
                                ) : (
                                    <div className="pb-4">
                                        <SessionCard
                                            session={item.session}
                                            preferredCurrency={preferredCurrency}
                                            onAddCost={() => {
                                                const session = item.session;
                                                setEditingSession(session);
                                                setCostInput((session.cost_user_entered ?? getChargingDisplayCost(session))?.toString() || '');
                                                setCurrencyInput(session.currency || preferredCurrency);
                                            }}
                                        />
                                    </div>
                                )
                            )}
                        />

                        {nextOffset !== null && (
                            <div ref={autoLoadTriggerRef} className="mt-6 flex justify-center py-4">
                                {loadingMore ? (
                                    <div className="flex items-center gap-2 text-sm text-slate-400">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading more sessions...
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500">
                                        Scroll for more sessions
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </PageShell>
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
                className={LIST_CARD_CLASS}
            >
                <div className="flex items-stretch gap-5">
                    {hasLocation && (
                        <div className={`relative hidden h-28 w-36 flex-shrink-0 overflow-hidden sm:block ${SUBCARD_CLASS}`}>
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
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-base font-semibold text-white">
                                        {displayLocationLabel}
                                    </span>
                                    {isSupercharger && (
                                        <StatusBadge tone="brand" className="py-1 text-xs">
                                            Supercharger
                                        </StatusBadge>
                                    )}
                                    {!isSupercharger && isDC && (
                                        <StatusBadge tone="warning" className="py-1 text-xs">
                                            DC Fast
                                        </StatusBadge>
                                    )}
                                    {!session.is_complete && (
                                        <StatusBadge tone="live" className="py-1 text-xs">
                                            Charging...
                                        </StatusBadge>
                                    )}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
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

                {session.start_battery_pct != null && (
                    <div className="mt-5 border-t border-slate-700/50 pt-4">
                        <div className="flex flex-1 items-center gap-3">
                            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Battery</div>
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
                            <div className="whitespace-nowrap text-sm font-medium text-slate-300">
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
