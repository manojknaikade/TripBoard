'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    TrendingUp,
    TrendingDown,
    Battery,
    Gauge,
    Navigation,
    Clock,
    Calendar,
    Loader2,
    Trophy,
    ShieldAlert
} from 'lucide-react';
import dynamic from 'next/dynamic';
import AnalyticsChartsSkeleton from '@/components/analytics/AnalyticsChartsSkeleton';
import { fetchCachedJson, readCachedJson } from '@/lib/client/fetchCache';
import { useSettingsStore } from '@/stores/settingsStore';

interface AnalyticTrip {
    id: string;
    date: string;
    distance: number;
    efficiency: number;
}

interface WeeklyDatum {
    day: string;
    dateKey: string;
    axisLabel: string;
    tooltipLabel: string;
    distance: number;
    energy: number;
    trips: number;
}

interface EfficiencyDatum {
    time: string;
    efficiency: number;
}

interface AnalyticsData {
    summary: {
        totalDistance: number;
        totalEnergy: number;
        avgEfficiency: number;
        drivingTime: number;
        tripCount: number;
        vampireDrainKwh: number;
        trends?: {
            distance: number;
            energy: number;
            efficiency: number;
            drivingTime: number;
        };
    };
    weeklyData: WeeklyDatum[];
    efficiencyData: EfficiencyDatum[];
    leaderboard: {
        longest: AnalyticTrip | null;
        shortest: AnalyticTrip | null;
        mostEfficient: AnalyticTrip | null;
    };
    temperatureImpact: Array<{ temp: number; efficiency: number }>;
}

const DrivingAnalyticsCharts = dynamic(() => import('@/components/analytics/DrivingAnalyticsCharts'), {
    ssr: false,
    loading: () => <AnalyticsChartsSkeleton />,
});

const ANALYTICS_CACHE_TTL_MS = 45_000;

export default function DrivingAnalyticsClient() {
    const [timeframe, setTimeframe] = useState('7days');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AnalyticsData | null>(null);
    const units = useSettingsStore((state) => state.units);
    const hasCompleteDateRange = timeframe !== 'custom' || (!!customStart && !!customEnd);

    const fetchAnalytics = useCallback(async () => {
        let url = `/api/analytics/summary?scope=driving&timeframe=${timeframe}`;
        if (timeframe === 'custom' && customStart && customEnd) {
            url += `&startDate=${customStart}&endDate=${customEnd}`;
        }

        const cacheKey = `analytics:driving:${url}`;
        const cached = readCachedJson<AnalyticsData>(cacheKey);
        if (cached) {
            setData(cached);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const json = await fetchCachedJson<AnalyticsData & { success?: boolean }>(
                cacheKey,
                async () => {
                    const res = await fetch(url);
                    const text = await res.text();
                    return JSON.parse(text);
                },
                ANALYTICS_CACHE_TTL_MS
            );

            if (json.success) {
                setData(json);
            } else {
                console.error('API returned success=false:', json);
            }
        } catch (err) {
            console.error('Failed to fetch analytics:', err);
        } finally {
            setLoading(false);
        }
    }, [timeframe, customStart, customEnd]);

    useEffect(() => {
        if (!hasCompleteDateRange) {
            return;
        }

        void fetchAnalytics();
    }, [fetchAnalytics, hasCompleteDateRange]);

    const weeklyData = data?.weeklyData || [];
    const efficiencyData = data?.efficiencyData || [];
    const summary = data?.summary || { totalDistance: 0, totalEnergy: 0, avgEfficiency: 0, drivingTime: 0, tripCount: 0, vampireDrainKwh: 0 };

    return (
        <main className="mx-auto max-w-7xl px-6 py-8">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Gauge className="h-6 w-6 text-red-500" />
                        Driving Analytics
                    </h1>
                    <p className="text-slate-400">Insights into your driving patterns and efficiency</p>
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

            {loading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
                    <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                </div>
            )}

            <div className="mb-8 flex gap-4 border-b border-slate-700/50 pb-4">
                <span className="text-sm font-medium text-white border-b-2 border-red-500 pb-4 -mb-[18px]">
                    Driving Activity
                </span>
                <Link href="/dashboard/analytics/charging" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
                    Charging
                </Link>
                <Link href="/dashboard/analytics/maintenance" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
                    Maintenance
                </Link>
            </div>

            <div className="mb-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <StatCard
                    icon={<Navigation className="h-5 w-5" />}
                    label="Distance"
                    value={`${summary.totalDistance} ${units === 'metric' ? 'km' : 'mi'}`}
                    change={summary.trends?.distance ?? 0}
                    color="blue"
                />
                <StatCard
                    icon={<Battery className="h-5 w-5" />}
                    label="Used"
                    value={`${summary.totalEnergy} kWh`}
                    change={summary.trends?.energy ?? 0}
                    color="green"
                />
                <StatCard
                    icon={<ShieldAlert className="h-5 w-5" />}
                    label="Vampire Drain"
                    value={`${summary.vampireDrainKwh} kWh`}
                    color="orange"
                />
                <StatCard
                    icon={<Gauge className="h-5 w-5" />}
                    label="Efficiency"
                    value={`${summary.avgEfficiency} ${units === 'metric' ? 'Wh/km' : 'Wh/mi'}`}
                    change={summary.trends?.efficiency ?? 0}
                    color="purple"
                    invertColor
                />
                <StatCard
                    icon={<Clock className="h-5 w-5" />}
                    label="Driving"
                    value={`${summary.drivingTime} hrs`}
                    change={summary.trends?.drivingTime ?? 0}
                    color="blue"
                />
            </div>

            <div className="mb-8">
                <h2 className="mb-4 text-xl font-bold flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Period Top Trips
                </h2>
                <div className="grid gap-4 sm:grid-cols-3">
                    <LeaderboardCard
                        title="Longest Trip"
                        trip={data?.leaderboard?.longest || null}
                        units={units}
                        type="distance"
                    />
                    <LeaderboardCard
                        title="Shortest Trip"
                        trip={data?.leaderboard?.shortest || null}
                        units={units}
                        type="distance"
                    />
                    <LeaderboardCard
                        title="Most Efficient"
                        trip={data?.leaderboard?.mostEfficient || null}
                        units={units}
                        type="efficiency"
                    />
                </div>
            </div>

            <DrivingAnalyticsCharts
                weeklyData={weeklyData}
                efficiencyData={efficiencyData}
                temperatureImpact={data?.temperatureImpact || []}
                units={units}
            />
        </main>
    );
}

function LeaderboardCard({ title, trip, units, type }: { title: string, trip: AnalyticTrip | null, units: string, type: 'distance' | 'efficiency' }) {
    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">{title}</p>
            {trip ? (
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <p className="text-lg font-bold">
                            {type === 'distance' ? `${trip.distance} ${units === 'metric' ? 'km' : 'mi'}` : `${trip.efficiency} Wh/k`}
                        </p>
                        <p className="text-xs text-slate-500">{trip.date}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-semibold text-slate-300">
                            {type === 'distance' ? `${trip.efficiency} Wh/k` : `${trip.distance} km`}
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

function StatCard({
    icon,
    label,
    value,
    change,
    color,
    invertColor,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    change?: number;
    color: 'blue' | 'green' | 'purple' | 'orange';
    invertColor?: boolean;
}) {
    const colors = {
        blue: 'bg-blue-500/10 text-blue-400',
        green: 'bg-green-500/10 text-green-400',
        purple: 'bg-purple-500/10 text-purple-400',
        orange: 'bg-orange-500/10 text-orange-400',
    };

    const isPositive = (change || 0) > 0;
    const isGood = invertColor ? !isPositive : isPositive;

    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
            <div className={`mb-3 inline-flex rounded-lg p-2 ${colors[color]}`}>{icon}</div>
            <p className="text-xs text-slate-400 truncate mb-1">{label}</p>
            <div className="flex items-end justify-between gap-1 flex-wrap">
                <p className="text-lg font-bold whitespace-nowrap">{value}</p>
                {change !== undefined && (
                    <div
                        className={`flex items-center gap-0.5 text-[10px] font-medium ${isGood ? 'text-green-400' : 'text-red-400'
                            }`}
                    >
                        {isPositive ? (
                            <TrendingUp className="h-3 w-3" />
                        ) : (
                            <TrendingDown className="h-3 w-3" />
                        )}
                        {Math.abs(change)}%
                    </div>
                )}
            </div>
        </div>
    );
}

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

interface TimeframeSelectorProps {
    selected: string;
    onSelect: (id: string) => void;
    customStart: string;
    customEnd: string;
    onCustomStartChange: (date: string) => void;
    onCustomEndChange: (date: string) => void;
    showCustomPicker: boolean;
    onToggleCustomPicker: () => void;
}

function TimeframeSelector({
    selected,
    onSelect,
    customStart,
    customEnd,
    onCustomStartChange,
    onCustomEndChange,
    showCustomPicker,
    onToggleCustomPicker,
}: TimeframeSelectorProps) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
                {timeframeOptions.map((option) => (
                    <button
                        key={option.id}
                        onClick={() => {
                            onSelect(option.id);
                            if (option.id === 'custom') {
                                onToggleCustomPicker();
                            }
                        }}
                        className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${selected === option.id
                            ? 'bg-red-500 text-white'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
                            }`}
                    >
                        {option.id === 'custom' && <Calendar className="h-3.5 w-3.5" />}
                        {option.label}
                    </button>
                ))}
            </div>

            {selected === 'custom' && showCustomPicker && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-800/50 p-3">
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-400">From:</label>
                        <input
                            type="date"
                            value={customStart}
                            onChange={(e) => onCustomStartChange(e.target.value)}
                            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white focus:border-red-500 focus:outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-400">To:</label>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => onCustomEndChange(e.target.value)}
                            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white focus:border-red-500 focus:outline-none"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
