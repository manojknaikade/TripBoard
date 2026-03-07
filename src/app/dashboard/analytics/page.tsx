'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { handleSignOut } from '@/lib/utils/auth';
import {
    Zap,
    Gauge,
    History,
    BarChart3,
    Settings,
    LogOut,
    TrendingUp,
    TrendingDown,
    Battery,
    Navigation,
    Clock,
    Calendar,
    Loader2,
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import Header from '@/components/Header';
import { useSettingsStore } from '@/stores/settingsStore';

// Default fallback data
const defaultWeeklyData = [
    { day: 'Mon', distance: 0, energy: 0, trips: 0 },
    { day: 'Tue', distance: 0, energy: 0, trips: 0 },
    { day: 'Wed', distance: 0, energy: 0, trips: 0 },
    { day: 'Thu', distance: 0, energy: 0, trips: 0 },
    { day: 'Fri', distance: 0, energy: 0, trips: 0 },
    { day: 'Sat', distance: 0, energy: 0, trips: 0 },
    { day: 'Sun', distance: 0, energy: 0, trips: 0 },
];

const defaultEfficiencyData = [
    { time: '6am', efficiency: 250 },
    { time: '9am', efficiency: 265 },
    { time: '12pm', efficiency: 260 },
    { time: '3pm', efficiency: 258 },
    { time: '6pm', efficiency: 275 },
    { time: '9pm', efficiency: 252 },
];

const defaultChargingMix = [
    { name: 'Home', value: 68, color: '#22c55e' },
    { name: 'Supercharger', value: 25, color: '#ef4444' },
    { name: 'Other', value: 7, color: '#6b7280' },
];

interface AnalyticsData {
    summary: {
        totalDistance: number;
        totalEnergy: number;
        avgEfficiency: number;
        drivingTime: number;
        tripCount: number;
        trends?: {
            distance: number;
            energy: number;
            efficiency: number;
            drivingTime: number;
        };
    };
    weeklyData: typeof defaultWeeklyData;
    efficiencyData: typeof defaultEfficiencyData;
    chargingMix: typeof defaultChargingMix;
}

export default function AnalyticsPage() {
    const [timeframe, setTimeframe] = useState('week');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AnalyticsData | null>(null);
    const { units } = useSettingsStore();

    const fetchAnalytics = useCallback(async () => {
        setLoading(true);
        try {
            let url = `/api/analytics/summary?timeframe=${timeframe}`;
            if (timeframe === 'custom' && customStart && customEnd) {
                url += `&startDate=${customStart}&endDate=${customEnd}`;
            }
            const res = await fetch(url);
            const text = await res.text();
            const json = JSON.parse(text);

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
        fetchAnalytics();
        // Ignoring fetchAnalytics in deps to prevent infinite loops if it changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeframe, customStart, customEnd]);

    const weeklyData = data?.weeklyData || [];
    const efficiencyData = data?.efficiencyData || [];
    const summary = data?.summary || { totalDistance: 0, totalEnergy: 0, avgEfficiency: 0, drivingTime: 0, tripCount: 0 };

    return (
        <div className="min-h-screen">
            <Header />

            {/* Main Content */}
            <main className="mx-auto max-w-7xl px-6 py-8">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Gauge className="h-6 w-6 text-red-500" />
                            Driving Analytics
                        </h1>
                        <p className="text-slate-400">Insights into your driving patterns and efficiency</p>
                    </div>

                    {/* Timeframe Selector */}
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

                {/* Loading Overlay */}
                {loading && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
                        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                    </div>
                )}

                {/* Secondary navigation for analytics types */}
                <div className="mb-8 flex gap-4 border-b border-slate-700/50 pb-4">
                    <span className="text-sm font-medium text-white border-b-2 border-red-500 pb-4 -mb-[18px]">
                        Driving Activity
                    </span>
                    <Link href="/dashboard/analytics/charging" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
                        Charging
                    </Link>
                </div>

                {/* Stats Cards */}
                <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        icon={<Navigation className="h-5 w-5" />}
                        label="Distance"
                        value={`${summary.totalDistance} ${units === 'metric' ? 'km' : 'mi'}`}
                        change={summary.trends?.distance ?? 0}
                        color="blue"
                    />
                    <StatCard
                        icon={<Battery className="h-5 w-5" />}
                        label="Energy Used"
                        value={`${summary.totalEnergy} kWh`}
                        change={summary.trends?.energy ?? 0}
                        color="green"
                    />
                    <StatCard
                        icon={<Gauge className="h-5 w-5" />}
                        label="Avg Efficiency"
                        value={`${summary.avgEfficiency} ${units === 'metric' ? 'Wh/km' : 'Wh/mi'}`}
                        change={summary.trends?.efficiency ?? 0}
                        color="purple"
                        invertColor
                    />
                    <StatCard
                        icon={<Clock className="h-5 w-5" />}
                        label="Driving Time"
                        value={`${summary.drivingTime} hrs`}
                        change={summary.trends?.drivingTime ?? 0}
                        color="orange"
                    />
                </div>

                {/* Charts Grid */}
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Daily Distance */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-6 text-lg font-semibold">Daily Distance</h2>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={weeklyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                    }}
                                />
                                <Bar dataKey="distance" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Efficiency Over Time */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <div className="mb-6">
                            <h2 className="text-lg font-semibold">Efficiency by Time of Day</h2>
                            <p className="text-sm text-slate-400 mt-1">Average {units === 'metric' ? 'Wh/km' : 'Wh/mi'} for trips in selected period</p>
                        </div>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={efficiencyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                    }}
                                    formatter={(value: number) => [`${value} ${units === 'metric' ? 'Wh/km' : 'Wh/mi'}`, 'Efficiency']}
                                />
                                <Bar dataKey="efficiency" fill="#a855f7" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Energy by Day */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-6 text-lg font-semibold">Daily Energy Consumption</h2>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={weeklyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                    }}
                                    formatter={(value: number) => [`${value} kWh`, 'Energy']}
                                />
                                <Bar dataKey="energy" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
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
    change,
    color,
    invertColor,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    change: number;
    color: 'blue' | 'green' | 'purple' | 'orange';
    invertColor?: boolean;
}) {
    const colors = {
        blue: 'bg-blue-500/10 text-blue-400',
        green: 'bg-green-500/10 text-green-400',
        purple: 'bg-purple-500/10 text-purple-400',
        orange: 'bg-orange-500/10 text-orange-400',
    };

    const isPositive = change > 0;
    const isGood = invertColor ? !isPositive : isPositive;

    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
            <div className={`mb-3 inline-flex rounded-lg p-2 ${colors[color]}`}>{icon}</div>
            <p className="text-sm text-slate-400">{label}</p>
            <div className="flex items-end justify-between">
                <p className="text-2xl font-bold">{value}</p>
                <div
                    className={`flex items-center gap-1 text-sm ${isGood ? 'text-green-400' : 'text-red-400'
                        }`}
                >
                    {isPositive ? (
                        <TrendingUp className="h-4 w-4" />
                    ) : (
                        <TrendingDown className="h-4 w-4" />
                    )}
                    {Math.abs(change)}%
                </div>
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

            {/* Custom Date Picker */}
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
