'use client';

import { startTransition, useState, useEffect, useCallback, useDeferredValue, useRef } from 'react';
import {
    TrendingUp,
    TrendingDown,
    Battery,
    Gauge,
    Navigation,
    Clock,
    Loader2,
    Trophy,
    ShieldAlert
} from 'lucide-react';
import dynamic from 'next/dynamic';
import AnalyticsChartsSkeleton from '@/components/analytics/AnalyticsChartsSkeleton';
import ViewportGate from '@/components/ViewportGate';
import { fetchCachedJson, readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AnalyticTrip, DrivingAnalyticsData } from '@/lib/analytics/types';
import {
    AnalyticsTabs,
    DashboardStatCard,
    PageHero,
    PageShell,
    StatusBadge,
    SUBCARD_CLASS,
    SURFACE_CARD_CLASS,
    TimeframeSelector,
} from '@/components/ui/dashboardPage';

const DrivingAnalyticsCharts = dynamic(() => import('@/components/analytics/DrivingAnalyticsCharts'), {
    ssr: false,
    loading: () => <AnalyticsChartsSkeleton />,
});

const ANALYTICS_CACHE_TTL_MS = 45_000;
const DEFAULT_DRIVING_TIMEFRAME = '7days';
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

function buildDrivingAnalyticsUrl(timeframe: string, customStart: string, customEnd: string) {
    let url = `/api/analytics/summary?scope=driving&timeframe=${timeframe}`;
    if (timeframe === 'custom' && customStart && customEnd) {
        url += `&startDate=${customStart}&endDate=${customEnd}`;
    }

    return url;
}

const DEFAULT_DRIVING_ANALYTICS_URL = buildDrivingAnalyticsUrl(DEFAULT_DRIVING_TIMEFRAME, '', '');
const DEFAULT_DRIVING_ANALYTICS_CACHE_KEY = `analytics:driving:${DEFAULT_DRIVING_ANALYTICS_URL}`;

export default function DrivingAnalyticsClient({ initialData = null }: { initialData?: DrivingAnalyticsData | null }) {
    const initialCachedData = initialData ?? readCachedJson<DrivingAnalyticsData>(DEFAULT_DRIVING_ANALYTICS_CACHE_KEY);
    const [timeframe, setTimeframe] = useState(DEFAULT_DRIVING_TIMEFRAME);
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const [loading, setLoading] = useState(!initialCachedData);
    const [data, setData] = useState<DrivingAnalyticsData | null>(initialCachedData);
    const deferredData = useDeferredValue(data);
    const skipInitialDefaultFetchRef = useRef(Boolean(initialCachedData));
    const units = useSettingsStore((state) => state.units);
    const hasCompleteDateRange = timeframe !== 'custom' || (!!customStart && !!customEnd);

    useEffect(() => {
        if (!initialData) {
            return;
        }

        writeCachedJson(
            DEFAULT_DRIVING_ANALYTICS_CACHE_KEY,
            initialData,
            ANALYTICS_CACHE_TTL_MS
        );
    }, [initialData]);

    const fetchAnalytics = useCallback(async (signal: AbortSignal) => {
        const url = buildDrivingAnalyticsUrl(timeframe, customStart, customEnd);
        const cacheKey = `analytics:driving:${url}`;
        const cached = readCachedJson<DrivingAnalyticsData>(cacheKey);
        if (cached) {
            startTransition(() => {
                setData(cached);
            });
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const json = await fetchCachedJson<DrivingAnalyticsData & { success?: boolean }>(
                cacheKey,
                async () => {
                    const res = await fetch(url, { signal });
                    const text = await res.text();
                    return JSON.parse(text);
                },
                ANALYTICS_CACHE_TTL_MS
            );

            if (signal.aborted) {
                return;
            }

            if (json.success) {
                startTransition(() => {
                    setData(json);
                });
            } else {
                console.error('API returned success=false:', json);
            }
        } catch (err) {
            if (signal.aborted) {
                return;
            }
            console.error('Failed to fetch analytics:', err);
        } finally {
            if (!signal.aborted) {
                setLoading(false);
            }
        }
    }, [timeframe, customStart, customEnd]);

    useEffect(() => {
        if (!hasCompleteDateRange) {
            return;
        }

        const isDefaultTimeframe = timeframe === DEFAULT_DRIVING_TIMEFRAME && !customStart && !customEnd;
        if (skipInitialDefaultFetchRef.current && isDefaultTimeframe) {
            skipInitialDefaultFetchRef.current = false;
            return;
        }

        const abortController = new AbortController();
        void fetchAnalytics(abortController.signal);

        return () => {
            abortController.abort();
        };
    }, [customEnd, customStart, fetchAnalytics, hasCompleteDateRange, timeframe]);

    const weeklyData = deferredData?.weeklyData || [];
    const efficiencyData = deferredData?.efficiencyData || [];
    const summary = data?.summary || { totalDistance: 0, totalEnergy: 0, avgEfficiency: 0, drivingTime: 0, tripCount: 0, vampireDrainKwh: 0 };
    const leaderboard = deferredData?.leaderboard;
    const temperatureImpact = deferredData?.temperatureImpact || [];
    const showBlockingLoader = loading && !data;
    const isRefreshing = loading && !!data;

    return (
        <PageShell>
            <PageHero
                title="Driving Analytics"
                description="Trends in distance, energy use, driving time, and efficiency for the selected period."
                badge={isRefreshing ? <StatusBadge tone="quiet">Refreshing</StatusBadge> : undefined}
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

            {showBlockingLoader && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
                    <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                </div>
            )}

            <AnalyticsTabs activeHref="/dashboard/analytics" />

            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <DashboardStatCard
                    icon={<Navigation className="h-5 w-5" />}
                    label="Distance"
                    value={`${summary.totalDistance} ${units === 'metric' ? 'km' : 'mi'}`}
                    helper="Total driving distance in the selected period."
                    tone="brand"
                    aside={<TrendBadge change={summary.trends?.distance ?? 0} />}
                />
                <DashboardStatCard
                    icon={<Battery className="h-5 w-5" />}
                    label="Used"
                    value={`${summary.totalEnergy} kWh`}
                    helper="Estimated battery energy consumed while driving."
                    tone="live"
                    aside={<TrendBadge change={summary.trends?.energy ?? 0} />}
                />
                <DashboardStatCard
                    icon={<ShieldAlert className="h-5 w-5" />}
                    label="Vampire Drain"
                    value={`${summary.vampireDrainKwh} kWh`}
                    helper="Estimated idle drain captured by telemetry."
                    tone="warning"
                    aside={<TrendBadge change={summary.trends?.vampireDrain} />}
                />
                <DashboardStatCard
                    icon={<Gauge className="h-5 w-5" />}
                    label="Efficiency"
                    value={
                        <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
                            <span>{summary.avgEfficiency}</span>
                            <span className="text-[0.58em] font-medium tracking-normal text-slate-300">
                                {units === 'metric' ? 'Wh/km' : 'Wh/mi'}
                            </span>
                        </span>
                    }
                    helper="Average drive efficiency across completed trips."
                    tone="quiet"
                    aside={<TrendBadge change={summary.trends?.efficiency ?? 0} invertColor />}
                />
                <DashboardStatCard
                    icon={<Clock className="h-5 w-5" />}
                    label="Driving"
                    value={`${summary.drivingTime} hrs`}
                    helper="Total time spent driving in the selected period."
                    tone="quiet"
                    aside={<TrendBadge change={summary.trends?.drivingTime ?? 0} />}
                />
            </div>

            <section className={`mb-6 p-6 ${SURFACE_CARD_CLASS}`}>
                <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold tracking-tight text-white">
                    <Trophy className="h-5 w-5 text-amber-300" />
                    Period Top Trips
                </h2>
                <div className="grid gap-4 sm:grid-cols-3">
                    <LeaderboardCard
                        title="Longest Trip"
                        trip={leaderboard?.longest || null}
                        units={units}
                        type="distance"
                    />
                    <LeaderboardCard
                        title="Shortest Trip"
                        trip={leaderboard?.shortest || null}
                        units={units}
                        type="distance"
                    />
                    <LeaderboardCard
                        title="Most Efficient"
                        trip={leaderboard?.mostEfficient || null}
                        units={units}
                        type="efficiency"
                    />
                </div>
            </section>

            <ViewportGate
                rootMargin="320px"
                placeholder={<AnalyticsChartsSkeleton />}
            >
                <DrivingAnalyticsCharts
                    weeklyData={weeklyData}
                    efficiencyData={efficiencyData}
                    temperatureImpact={temperatureImpact}
                    units={units}
                />
            </ViewportGate>
        </PageShell>
    );
}

function LeaderboardCard({ title, trip, units, type }: { title: string, trip: AnalyticTrip | null, units: string, type: 'distance' | 'efficiency' }) {
    return (
        <div className={`p-4 ${SUBCARD_CLASS}`}>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{title}</p>
            {trip ? (
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <p className="text-lg font-bold">
                            {type === 'distance' ? `${trip.distance} ${units === 'metric' ? 'km' : 'mi'}` : `${trip.efficiency} ${units === 'metric' ? 'Wh/km' : 'Wh/mi'}`}
                        </p>
                        <p className="text-xs text-slate-500">{trip.date}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-semibold text-slate-300">
                            {type === 'distance'
                                ? `${trip.efficiency} ${units === 'metric' ? 'Wh/km' : 'Wh/mi'}`
                                : `${trip.distance} ${units === 'metric' ? 'km' : 'mi'}`}
                        </p>
                        <p className="text-[10px] text-slate-500 uppercase">
                            {type === 'distance' ? 'Efficiency' : 'Distance'}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="py-2">
                    <p className="text-sm text-slate-500 italic">No qualifying trips</p>
                </div>
            )}
        </div>
    );
}

function TrendBadge({ change, invertColor = false }: { change?: number; invertColor?: boolean }) {
    if (change === undefined) {
        return null;
    }

    const isPositive = (change || 0) > 0;
    const isGood = invertColor ? !isPositive : isPositive;

    return (
        <div className={`inline-flex items-center gap-1 text-xs font-medium ${isGood ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {Math.abs(change)}%
        </div>
    );
}
