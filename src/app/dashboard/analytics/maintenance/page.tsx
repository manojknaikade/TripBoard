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
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import Header from '@/components/Header';
import { SERVICE_TYPE_OPTIONS, type MaintenanceServiceType, type TyreSeason } from '@/lib/maintenance';
import { useSettingsStore } from '@/stores/settingsStore';

type AnalyticsData = {
    summary: {
        totalRecords: number;
        paidRecords: number;
        totalSpend: number | null;
        averagePaidCost: number | null;
        spendCurrency: string | null;
        mixedCurrencies: boolean;
        seasonChanges: number;
        rotations: number;
        tyreWorkRecords: number;
        activeTyreSets: number;
    };
    activityData: Array<{ period: string; records: number; spend: number }>;
    serviceTypeBreakdown: Array<{ serviceType: MaintenanceServiceType; records: number }>;
    tyreSetMileage: Array<{ name: string; season: TyreSeason; status: 'active' | 'retired'; mileageKm: number }>;
    currencyTotals: Array<{ currency: string; total: number }>;
};

const SERVICE_TYPE_LABELS = Object.fromEntries(
    SERVICE_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<MaintenanceServiceType, string>;

const SERVICE_TYPE_COLORS: Record<MaintenanceServiceType, string> = {
    tyre_season: '#38bdf8',
    tyre_rotation: '#22c55e',
    wheel_alignment: '#f59e0b',
    cabin_air_filter: '#a855f7',
    hepa_filter: '#8b5cf6',
    brake_fluid_check: '#ef4444',
    brake_service: '#fb7185',
    wiper_blades: '#14b8a6',
    ac_desiccant_bag: '#6366f1',
    twelve_volt_battery: '#eab308',
    other: '#94a3b8',
};

const KM_TO_MI = 0.621371;
const NUMBER_FORMATTER = new Intl.NumberFormat('en-CH');

function formatDistance(km: number, units: 'metric' | 'imperial') {
    const value = units === 'metric' ? km : km * KM_TO_MI;
    return `${NUMBER_FORMATTER.format(Math.round(value))} ${units === 'metric' ? 'km' : 'mi'}`;
}

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

export default function MaintenanceAnalyticsPage() {
    const [timeframe, setTimeframe] = useState('year');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AnalyticsData | null>(null);
    const { units, currency: preferredCurrency } = useSettingsStore();

    const fetchAnalytics = useCallback(async () => {
        setLoading(true);
        try {
            const url = `/api/analytics/maintenance?timeframe=${timeframe}`;
            const response = await fetch(url);
            const json = await response.json();

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
        fetchAnalytics();
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

    const activityData = data?.activityData || [];
    const serviceTypeBreakdown = data?.serviceTypeBreakdown || [];
    const tyreSetMileage = data?.tyreSetMileage || [];
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
        <div className="min-h-screen">
            <Header />

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

                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-6 text-lg font-semibold">Maintenance Activity</h2>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={activityData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="period" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                    formatter={(value: number) => [value, 'Records']}
                                />
                                <Bar dataKey="records" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-6 text-lg font-semibold">
                            {summary.mixedCurrencies ? 'Spend by Currency' : 'Logged Spend'}
                        </h2>

                        {summary.mixedCurrencies ? (
                            <div className="space-y-4">
                                {currencyTotals.map((entry) => (
                                    <div key={entry.currency} className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-900/20 px-4 py-3">
                                        <span className="text-sm text-slate-300">{entry.currency}</span>
                                        <span className="text-lg font-semibold text-white">{formatCurrency(entry.total, entry.currency)}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={activityData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                    <XAxis dataKey="period" stroke="#94a3b8" fontSize={12} />
                                    <YAxis stroke="#94a3b8" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                        formatter={(value: number) => [
                                            formatCurrency(value, summary.spendCurrency || preferredCurrency),
                                            'Spend',
                                        ]}
                                    />
                                    <Bar dataKey="spend" fill="#a855f7" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-4 text-lg font-semibold">Service Mix</h2>
                        {serviceTypeBreakdown.length === 0 ? (
                            <p className="py-10 text-center text-sm text-slate-400">No maintenance records in the selected period.</p>
                        ) : (
                            <div className="space-y-4">
                                {serviceTypeBreakdown.map((entry) => {
                                    const maxCount = Math.max(...serviceTypeBreakdown.map((item) => item.records));
                                    const width = maxCount > 0 ? (entry.records / maxCount) * 100 : 0;

                                    return (
                                        <div key={entry.serviceType} className="flex items-center gap-4">
                                            <div className="w-40 shrink-0 text-sm text-slate-300">
                                                {SERVICE_TYPE_LABELS[entry.serviceType]}
                                            </div>
                                            <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-slate-700/40">
                                                <div
                                                    className="flex h-full items-center px-3 text-xs font-semibold text-white"
                                                    style={{
                                                        width: `${Math.max(width, 10)}%`,
                                                        backgroundColor: SERVICE_TYPE_COLORS[entry.serviceType],
                                                    }}
                                                >
                                                    {entry.records}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-4 text-lg font-semibold">Tyre Set Mileage Tracked</h2>
                        {tyreSetMileage.length === 0 ? (
                            <p className="py-10 text-center text-sm text-slate-400">No seasonal tyre mileage with explicit odometer ranges in the selected period.</p>
                        ) : (
                            <div className="space-y-4">
                                {tyreSetMileage.map((entry) => {
                                    const maxMileage = Math.max(...tyreSetMileage.map((item) => item.mileageKm));
                                    const width = maxMileage > 0 ? (entry.mileageKm / maxMileage) * 100 : 0;

                                    return (
                                        <div key={entry.name} className="flex items-center gap-4">
                                            <div className="w-48 shrink-0">
                                                <div className="text-sm font-medium text-slate-200">{entry.name}</div>
                                                <div className="text-xs text-slate-500">
                                                    {entry.season === 'winter' ? 'Winter' : entry.season === 'summer' ? 'Summer' : 'All-season'}
                                                </div>
                                            </div>
                                            <div className="relative h-10 flex-1 overflow-hidden rounded-lg bg-slate-700/40">
                                                <div
                                                    className="flex h-full items-center px-3 text-xs font-semibold text-white"
                                                    style={{
                                                        width: `${Math.max(width, 10)}%`,
                                                        backgroundColor: entry.season === 'winter' ? '#38bdf8' : entry.season === 'summer' ? '#f59e0b' : '#94a3b8',
                                                    }}
                                                >
                                                    {formatDistance(entry.mileageKm, units)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
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
