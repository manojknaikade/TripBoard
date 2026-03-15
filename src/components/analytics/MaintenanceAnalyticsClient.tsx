'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
        <main className="mx-auto max-w-7xl px-6 py-8">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold">
                        <Wrench className="h-6 w-6 text-red-500" />
                        Maintenance Analytics
                    </h1>
                    <p className="text-slate-400">Service volume, tyre work, and logged maintenance cost over time</p>
                </div>

                <TimeframeSelector
                    selected={timeframe}
                    onSelect={setTimeframe}
                />
            </div>

            {loading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
                    <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                </div>
            )}

            <div className="mb-8 flex gap-4 border-b border-slate-700/50 pb-4">
                <Link href="/dashboard/analytics" className="text-sm font-medium text-slate-400 transition-colors hover:text-white">
                    Driving Activity
                </Link>
                <Link href="/dashboard/analytics/charging" className="text-sm font-medium text-slate-400 transition-colors hover:text-white">
                    Charging
                </Link>
                <span className="border-b-2 border-red-500 pb-4 text-sm font-medium text-white -mb-[18px]">
                    Maintenance
                </span>
            </div>

            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                    icon={<Wrench className="h-5 w-5" />}
                    label="Records Logged"
                    value={summary.totalRecords.toString()}
                    helper={`${summary.paidRecords} with cost`}
                    color="blue"
                />
                <StatCard
                    icon={<CircleDollarSign className="h-5 w-5" />}
                    label="Logged Spend"
                    value={spendValue}
                    helper={summary.mixedCurrencies ? 'Grouped by currency below' : 'Within selected timeframe'}
                    color="purple"
                />
                <StatCard
                    icon={<BarChart3 className="h-5 w-5" />}
                    label="Avg Service Cost"
                    value={
                        summary.averagePaidCost != null && summary.spendCurrency
                            ? formatCurrency(summary.averagePaidCost, summary.spendCurrency)
                            : 'Not available'
                    }
                    helper={summary.mixedCurrencies ? 'Unavailable across mixed currencies' : 'Across paid maintenance entries'}
                    color="orange"
                />
                <StatCard
                    icon={<RotateCw className="h-5 w-5" />}
                    label="Tyre Work"
                    value={summary.tyreWorkRecords.toString()}
                    helper={`${summary.seasonChanges} seasonal swaps • ${summary.rotations} rotations`}
                    color="green"
                />
                <StatCard
                    icon={<ShieldCheck className="h-5 w-5" />}
                    label="Active Tyre Sets"
                    value={summary.activeTyreSets.toString()}
                    helper="Current tracked sets"
                    color="blue"
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
        </main>
    );
}

function StatCard({
    icon,
    label,
    value,
    helper,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    helper: string;
    color: 'blue' | 'green' | 'purple' | 'orange';
}) {
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
            <p className="text-2xl font-bold">{value}</p>
            <p className="mt-2 text-sm text-slate-500">{helper}</p>
        </div>
    );
}

const timeframeOptions = [
    { id: 'year', label: 'This Year' },
    { id: 'lastyear', label: 'Last Year' },
    { id: 'alltime', label: 'All Time' },
];

interface TimeframeSelectorProps {
    selected: string;
    onSelect: (id: string) => void;
}

function TimeframeSelector({
    selected,
    onSelect,
}: TimeframeSelectorProps) {
    return (
        <div className="flex flex-wrap gap-2">
            {timeframeOptions.map((option) => (
                <button
                    key={option.id}
                    onClick={() => onSelect(option.id)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${selected === option.id
                        ? 'bg-red-500 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
