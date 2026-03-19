'use client';

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
    BarChart3,
    CircleDollarSign,
    Loader2,
    RotateCw,
    ShieldCheck,
    Wrench,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import AnalyticsChartsSkeleton from '@/components/analytics/AnalyticsChartsSkeleton';
import ViewportGate from '@/components/ViewportGate';
import { fetchCachedJson, readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';
import { useSettingsStore } from '@/stores/settingsStore';
import type { MaintenanceAnalyticsData } from '@/lib/analytics/types';
import {
    AnalyticsTabs,
    DashboardStatCard,
    PageHero,
    PageShell,
    StatusBadge,
    TimeframeSelector,
} from '@/components/ui/dashboardPage';

function formatCurrency(value: number, currency: string) {
    try {
        return new Intl.NumberFormat('en-CH', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        return `${currency} ${value.toFixed(2)}`;
    }
}

const MaintenanceAnalyticsCharts = dynamic(() => import('@/components/analytics/MaintenanceAnalyticsCharts'), {
    ssr: false,
    loading: () => <AnalyticsChartsSkeleton />,
});

const MAINTENANCE_ANALYTICS_CACHE_TTL_MS = 45_000;
const DEFAULT_MAINTENANCE_TIMEFRAME = 'year';
const timeframeOptions = [
    { id: 'year', label: 'This Year' },
    { id: 'lastyear', label: 'Last Year' },
    { id: 'alltime', label: 'All Time' },
];

function buildMaintenanceAnalyticsUrl(timeframe: string) {
    return `/api/analytics/maintenance?timeframe=${timeframe}`;
}

const DEFAULT_MAINTENANCE_ANALYTICS_URL = buildMaintenanceAnalyticsUrl(DEFAULT_MAINTENANCE_TIMEFRAME);
const DEFAULT_MAINTENANCE_ANALYTICS_CACHE_KEY = `analytics:maintenance:${DEFAULT_MAINTENANCE_ANALYTICS_URL}`;

export default function MaintenanceAnalyticsClient({ initialData = null }: { initialData?: MaintenanceAnalyticsData | null }) {
    const initialCachedData = initialData ?? readCachedJson<MaintenanceAnalyticsData>(DEFAULT_MAINTENANCE_ANALYTICS_CACHE_KEY);
    const [timeframe, setTimeframe] = useState(DEFAULT_MAINTENANCE_TIMEFRAME);
    const [loading, setLoading] = useState(!initialCachedData);
    const [data, setData] = useState<MaintenanceAnalyticsData | null>(initialCachedData);
    const deferredData = useDeferredValue(data);
    const skipInitialDefaultFetchRef = useRef(Boolean(initialCachedData));
    const units = useSettingsStore((state) => state.units);
    const preferredCurrency = useSettingsStore((state) => state.currency);

    useEffect(() => {
        if (!initialData) {
            return;
        }

        writeCachedJson(
            DEFAULT_MAINTENANCE_ANALYTICS_CACHE_KEY,
            initialData,
            MAINTENANCE_ANALYTICS_CACHE_TTL_MS
        );
    }, [initialData]);

    const fetchAnalytics = useCallback(async (signal: AbortSignal) => {
        const url = buildMaintenanceAnalyticsUrl(timeframe);
        const cacheKey = `analytics:maintenance:${url}`;
        const cached = readCachedJson<MaintenanceAnalyticsData>(cacheKey);
        if (cached) {
            startTransition(() => {
                setData(cached);
            });
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const json = await fetchCachedJson<MaintenanceAnalyticsData & { success?: boolean }>(
                cacheKey,
                async () => {
                    const response = await fetch(url, { signal });
                    return response.json();
                },
                MAINTENANCE_ANALYTICS_CACHE_TTL_MS
            );

            if (signal.aborted) {
                return;
            }

            if (json.success) {
                startTransition(() => {
                    setData(json);
                });
            } else {
                console.error('Maintenance analytics API returned success=false:', json);
            }
        } catch (error) {
            if (signal.aborted) {
                return;
            }
            console.error('Failed to fetch maintenance analytics:', error);
        } finally {
            if (!signal.aborted) {
                setLoading(false);
            }
        }
    }, [timeframe]);

    useEffect(() => {
        if (skipInitialDefaultFetchRef.current && timeframe === DEFAULT_MAINTENANCE_TIMEFRAME) {
            skipInitialDefaultFetchRef.current = false;
            return;
        }

        const abortController = new AbortController();
        void fetchAnalytics(abortController.signal);

        return () => {
            abortController.abort();
        };
    }, [fetchAnalytics, timeframe]);

    const summary = data?.summary || {
        totalRecords: 0,
        paidRecords: 0,
        totalSpend: 0,
        averagePaidCost: 0,
        spendCurrency: preferredCurrency,
        mixedCurrencies: false,
        seasonChanges: 0,
        rotations: 0,
        tyreWorkRecords: 0,
        activeTyreSets: 0,
    };

    const currencyTotals = data?.currencyTotals || [];
    const showBlockingLoader = loading && !data;
    const isRefreshing = loading && !!data;

    const spendValue = useMemo(() => {
        if (summary.mixedCurrencies) {
            return currencyTotals.length > 0 ? `${currencyTotals.length} currencies` : 'Mixed';
        }
        if (summary.totalSpend == null || !summary.spendCurrency) {
            return 'No spend';
        }
        return formatCurrency(summary.totalSpend, summary.spendCurrency);
    }, [currencyTotals.length, summary.mixedCurrencies, summary.spendCurrency, summary.totalSpend]);

    return (
        <PageShell>
            <PageHero
                title="Maintenance Analytics"
                description="Service volume, tyre work, and logged maintenance cost across the selected timeframe."
                badge={isRefreshing ? <StatusBadge tone="quiet">Refreshing</StatusBadge> : undefined}
                actions={
                    <TimeframeSelector
                        options={timeframeOptions}
                        selected={timeframe}
                        onSelect={setTimeframe}
                    />
                }
            />

            {showBlockingLoader && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
                    <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                </div>
            )}

            <AnalyticsTabs activeHref="/dashboard/analytics/maintenance" />

            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <DashboardStatCard
                    icon={<Wrench className="h-5 w-5" />}
                    label="Records Logged"
                    value={summary.totalRecords.toString()}
                    helper={`${summary.paidRecords} with cost`}
                    tone="brand"
                />
                <DashboardStatCard
                    icon={<CircleDollarSign className="h-5 w-5" />}
                    label="Logged Spend"
                    value={spendValue}
                    helper={summary.mixedCurrencies ? 'Grouped by currency below' : 'Within selected timeframe'}
                    tone="quiet"
                />
                <DashboardStatCard
                    icon={<BarChart3 className="h-5 w-5" />}
                    label="Avg Service Cost"
                    value={
                        summary.averagePaidCost != null && summary.spendCurrency
                            ? formatCurrency(summary.averagePaidCost, summary.spendCurrency)
                            : 'Not available'
                    }
                    helper={summary.mixedCurrencies ? 'Unavailable across mixed currencies' : 'Across paid maintenance entries'}
                    tone="warning"
                />
                <DashboardStatCard
                    icon={<RotateCw className="h-5 w-5" />}
                    label="Tyre Work"
                    value={summary.tyreWorkRecords.toString()}
                    helper={`${summary.seasonChanges} seasonal swaps • ${summary.rotations} rotations`}
                    tone="live"
                />
                <DashboardStatCard
                    icon={<ShieldCheck className="h-5 w-5" />}
                    label="Active Tyre Sets"
                    value={summary.activeTyreSets.toString()}
                    helper="Current tracked sets"
                    tone="quiet"
                />
            </div>

            <ViewportGate
                rootMargin="320px"
                placeholder={<AnalyticsChartsSkeleton />}
            >
                <MaintenanceAnalyticsCharts
                    activityData={deferredData?.activityData || []}
                    mixedCurrencies={summary.mixedCurrencies}
                    spendCurrency={summary.spendCurrency}
                    preferredCurrency={preferredCurrency}
                    currencyTotals={deferredData?.currencyTotals || []}
                    serviceTypeBreakdown={deferredData?.serviceTypeBreakdown || []}
                    tyreSetMileage={deferredData?.tyreSetMileage || []}
                    units={units}
                />
            </ViewportGate>
        </PageShell>
    );
}
