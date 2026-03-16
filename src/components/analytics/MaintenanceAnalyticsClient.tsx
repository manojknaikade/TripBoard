'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { fetchCachedJson, readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';
import { useSettingsStore } from '@/stores/settingsStore';
import type { MaintenanceAnalyticsData } from '@/lib/analytics/types';
import {
    AnalyticsTabs,
    DashboardStatCard,
    PageHero,
    PageShell,
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

export default function MaintenanceAnalyticsClient({ initialData = null }: { initialData?: MaintenanceAnalyticsData | null }) {
    const [timeframe, setTimeframe] = useState(DEFAULT_MAINTENANCE_TIMEFRAME);
    const [loading, setLoading] = useState(!initialData);
    const [data, setData] = useState<MaintenanceAnalyticsData | null>(initialData);
    const units = useSettingsStore((state) => state.units);
    const preferredCurrency = useSettingsStore((state) => state.currency);

    useEffect(() => {
        if (!initialData) {
            return;
        }

        writeCachedJson(
            `analytics:maintenance:${buildMaintenanceAnalyticsUrl(DEFAULT_MAINTENANCE_TIMEFRAME)}`,
            initialData,
            MAINTENANCE_ANALYTICS_CACHE_TTL_MS
        );
    }, [initialData]);

    const fetchAnalytics = useCallback(async () => {
        const url = buildMaintenanceAnalyticsUrl(timeframe);
        const cacheKey = `analytics:maintenance:${url}`;
        const cached = readCachedJson<MaintenanceAnalyticsData>(cacheKey);
        if (cached) {
            setData(cached);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const json = await fetchCachedJson<MaintenanceAnalyticsData & { success?: boolean }>(
                cacheKey,
                async () => {
                    const response = await fetch(url);
                    return response.json();
                },
                MAINTENANCE_ANALYTICS_CACHE_TTL_MS
            );

            if (json.success) {
                setData(json);
            } else {
                console.error('Maintenance analytics API returned success=false:', json);
            }
        } catch (error) {
            console.error('Failed to fetch maintenance analytics:', error);
        } finally {
            setLoading(false);
        }
    }, [timeframe]);

    useEffect(() => {
        void fetchAnalytics();
    }, [fetchAnalytics]);

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
                actions={
                    <TimeframeSelector
                        options={timeframeOptions}
                        selected={timeframe}
                        onSelect={setTimeframe}
                    />
                }
            />

            {loading && (
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

            <MaintenanceAnalyticsCharts
                activityData={data?.activityData || []}
                mixedCurrencies={summary.mixedCurrencies}
                spendCurrency={summary.spendCurrency}
                preferredCurrency={preferredCurrency}
                currencyTotals={currencyTotals}
                serviceTypeBreakdown={data?.serviceTypeBreakdown || []}
                tyreSetMileage={data?.tyreSetMileage || []}
                units={units}
            />
        </PageShell>
    );
}
