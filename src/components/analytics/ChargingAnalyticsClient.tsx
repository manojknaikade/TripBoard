'use client';

import { startTransition, useState, useEffect, useCallback, useDeferredValue, useRef } from 'react';
import {
    Zap,
    Battery,
    Loader2,
    Banknote,
    Activity
} from 'lucide-react';
import dynamic from 'next/dynamic';
import AnalyticsChartsSkeleton from '@/components/analytics/AnalyticsChartsSkeleton';
import ViewportGate from '@/components/ViewportGate';
import { fetchCachedJson, readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ChargingAnalyticsData } from '@/lib/analytics/types';
import {
    AnalyticsTabs,
    DashboardStatCard,
    PageHero,
    PageShell,
    StatusBadge,
    TimeframeSelector,
} from '@/components/ui/dashboardPage';

const ChargingAnalyticsCharts = dynamic(() => import('@/components/analytics/ChargingAnalyticsCharts'), {
    ssr: false,
    loading: () => <AnalyticsChartsSkeleton />,
});

const ANALYTICS_CACHE_TTL_MS = 45_000;
const DEFAULT_CHARGING_TIMEFRAME = '7days';
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

function buildChargingAnalyticsUrl(timeframe: string, customStart: string, customEnd: string) {
    let url = `/api/analytics/summary?scope=charging&timeframe=${timeframe}`;
    if (timeframe === 'custom' && customStart && customEnd) {
        url += `&startDate=${customStart}&endDate=${customEnd}`;
    }

    return url;
}

const DEFAULT_CHARGING_ANALYTICS_URL = buildChargingAnalyticsUrl(DEFAULT_CHARGING_TIMEFRAME, '', '');
const DEFAULT_CHARGING_ANALYTICS_CACHE_KEY = `analytics:charging:${DEFAULT_CHARGING_ANALYTICS_URL}`;

export default function ChargingAnalyticsClient({ initialData = null }: { initialData?: ChargingAnalyticsData | null }) {
    const initialCachedData = initialData ?? readCachedJson<ChargingAnalyticsData>(DEFAULT_CHARGING_ANALYTICS_CACHE_KEY);
    const [timeframe, setTimeframe] = useState(DEFAULT_CHARGING_TIMEFRAME);
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const [loading, setLoading] = useState(!initialCachedData);
    const [data, setData] = useState<ChargingAnalyticsData | null>(initialCachedData);
    const deferredData = useDeferredValue(data);
    const skipInitialDefaultFetchRef = useRef(Boolean(initialCachedData));
    const preferredCurrency = useSettingsStore((state) => state.currency);
    const hasCompleteDateRange = timeframe !== 'custom' || (!!customStart && !!customEnd);

    useEffect(() => {
        if (!initialData) {
            return;
        }

        writeCachedJson(
            DEFAULT_CHARGING_ANALYTICS_CACHE_KEY,
            initialData,
            ANALYTICS_CACHE_TTL_MS
        );
    }, [initialData]);

    const fetchAnalytics = useCallback(async (signal: AbortSignal) => {
        const url = buildChargingAnalyticsUrl(timeframe, customStart, customEnd);
        const cacheKey = `analytics:charging:${url}`;
        const cached = readCachedJson<ChargingAnalyticsData>(cacheKey);
        if (cached) {
            startTransition(() => {
                setData(cached);
            });
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const json = await fetchCachedJson<ChargingAnalyticsData & { success?: boolean }>(
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

        const isDefaultTimeframe = timeframe === DEFAULT_CHARGING_TIMEFRAME && !customStart && !customEnd;
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

    const summary = data?.summary || {
        chargingSessions: 0,
        totalChargingEnergy: 0,
        totalChargingBatteryEnergy: 0,
        totalChargingDeliveredEnergy: 0,
        totalChargingLossEnergy: 0,
        totalChargingLossCost: 0,
        totalChargingCost: 0,
        avgCostPerKwh: 0,
        avgChargingLossPct: 0,
    };
    const showBlockingLoader = loading && !data;
    const isRefreshing = loading && !!data;

    return (
        <PageShell>
            <PageHero
                title="Charging Analytics"
                description="Trends in charging energy, losses, source mix, and cost across the selected period."
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

            <AnalyticsTabs activeHref="/dashboard/analytics/charging" />

            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <DashboardStatCard
                    icon={<Battery className="h-5 w-5" />}
                    label="Energy to Battery"
                    value={`${summary.totalChargingBatteryEnergy} kWh`}
                    helper="Estimated energy stored in the battery."
                    tone="live"
                />
                <DashboardStatCard
                    icon={<Zap className="h-5 w-5" />}
                    label="Energy Delivered"
                    value={`${summary.totalChargingDeliveredEnergy} kWh`}
                    helper="Charger-delivered energy reported by Tesla or source telemetry."
                    tone="brand"
                />
                <DashboardStatCard
                    icon={<Activity className="h-5 w-5" />}
                    label="Charging Loss"
                    value={`${summary.totalChargingLossEnergy} kWh`}
                    helper={`${summary.avgChargingLossPct.toFixed(1)}% of delivered energy`}
                    tone="warning"
                />
                <DashboardStatCard
                    icon={<Banknote className="h-5 w-5" />}
                    label="Wasted Cost"
                    value={`${summary.totalChargingLossCost.toFixed(2)} ${preferredCurrency}`}
                    helper="Estimated cost associated with charging loss."
                    tone="warning"
                />
                <DashboardStatCard
                    icon={<Banknote className="h-5 w-5" />}
                    label="Total Cost"
                    value={`${summary.totalChargingCost.toFixed(2)} ${preferredCurrency}`}
                    helper={`${summary.avgCostPerKwh.toFixed(2)} ${preferredCurrency}/delivered kWh`}
                    tone="quiet"
                />
                <DashboardStatCard
                    icon={<Zap className="h-5 w-5" />}
                    label="Sessions"
                    value={summary.chargingSessions.toString()}
                    helper="Charging sessions captured in the selected timeframe."
                    tone="quiet"
                />
            </div>

            <ViewportGate
                rootMargin="320px"
                placeholder={<AnalyticsChartsSkeleton />}
            >
                <ChargingAnalyticsCharts
                    dailyData={deferredData?.dailyChargingData || []}
                    chargingMix={deferredData?.chargingMix || []}
                    costBySource={deferredData?.costBySource || []}
                    preferredCurrency={preferredCurrency}
                />
            </ViewportGate>
        </PageShell>
    );
}
