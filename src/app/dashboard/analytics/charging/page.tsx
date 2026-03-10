'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    Zap,
    Battery,
    Calendar,
    Loader2,
    Banknote,
    Activity
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import Header from '@/components/Header';
import { useSettingsStore } from '@/stores/settingsStore';

interface AnalyticsData {
    summary: {
        chargingSessions: number;
        totalChargingEnergy: number;
        totalChargingCost: number;
        avgCostPerKwh: number;
    };
    dailyChargingData: Array<{ day: string; energy: number; cost: number; sessions: number; }>;
    chargingMix: Array<{ name: string; value: number; color: string; }>;
    costBySource: Array<{ name: string; cost: number; color: string; }>;
}

export default function ChargingAnalyticsPage() {
    const [timeframe, setTimeframe] = useState('7days');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AnalyticsData | null>(null);
    const { currency: preferredCurrency } = useSettingsStore();

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
    }, [fetchAnalytics]);

    const dailyData = data?.dailyChargingData || [];
    const chargingMix = data?.chargingMix || [];
    const costBySource = data?.costBySource || [];
    const summary = data?.summary || { chargingSessions: 0, totalChargingEnergy: 0, totalChargingCost: 0, avgCostPerKwh: 0 };

    const hasRealChargingData =
        chargingMix.length > 0 &&
        !(chargingMix.length === 1 && chargingMix[0].name === 'No Data');

    return (
        <div className="min-h-screen">
            <Header />

            <main className="mx-auto max-w-7xl px-6 py-8">
                {/* Header and Controls */}
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Zap className="h-6 w-6 text-yellow-500" />
                            Charging Analytics
                        </h1>
                        <p className="text-slate-400">Insights into your charging costs and behavior</p>
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

                {/* Secondary navigation for general analytics */}
                <div className="mb-8 flex gap-4 border-b border-slate-700/50 pb-4">
                    <Link href="/dashboard/analytics" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
                        Driving Activity
                    </Link>
                    <span className="text-sm font-medium text-white border-b-2 border-red-500 pb-4 -mb-[18px]">
                        Charging
                    </span>
                </div>

                {/* Stats Cards */}
                <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        icon={<Battery className="h-5 w-5" />}
                        label="Energy Added"
                        value={`${summary.totalChargingEnergy} kWh`}
                        color="green"
                    />
                    <StatCard
                        icon={<Banknote className="h-5 w-5" />}
                        label="Total Cost"
                        value={`${summary.totalChargingCost.toFixed(2)} ${preferredCurrency}`}
                        color="purple"
                    />
                    <StatCard
                        icon={<Activity className="h-5 w-5" />}
                        label="Average Cost"
                        value={`${summary.avgCostPerKwh.toFixed(2)} ${preferredCurrency}/kWh`}
                        color="blue"
                    />
                    <StatCard
                        icon={<Zap className="h-5 w-5" />}
                        label="Sessions"
                        value={summary.chargingSessions.toString()}
                        color="orange"
                    />
                </div>

                {/* Charts Grid */}
                <div className="grid gap-6 lg:grid-cols-2">

                    {/* Energy by Day */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-6 text-lg font-semibold">Energy Added (Daily)</h2>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={dailyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                    formatter={(value: number) => [`${value} kWh`, 'Energy']}
                                />
                                <Bar dataKey="energy" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Cost by Day */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-6 text-lg font-semibold">Charging Cost (Daily)</h2>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={dailyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                    formatter={(value: number) => [`${value} ${preferredCurrency}`, 'Cost']}
                                />
                                <Bar dataKey="cost" fill="#a855f7" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Charging Mix */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-2 text-lg font-semibold text-center">Charging Sources Match</h2>
                        {!hasRealChargingData && (
                            <p className="mb-4 text-sm text-slate-400 text-center">
                                No charging sessions found for the selected period.
                            </p>
                        )}
                        <div className="flex items-center justify-center">
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={chargingMix}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={80}
                                        outerRadius={110}
                                        paddingAngle={4}
                                        dataKey="value"
                                    >
                                        {chargingMix.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                        formatter={(value: number) => [`${value}%`, 'Type']}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-4 flex flex-wrap justify-center gap-6">
                            {chargingMix.map((item) => (
                                <div key={item.name} className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-sm font-medium text-slate-300">
                                        {item.name} <span className="text-slate-500">({item.value}%)</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Cost by Source */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-2 text-lg font-semibold">Cost by Charging Source</h2>
                        {costBySource.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-8">
                                No cost data available. Add costs to individual charging sessions to see this breakdown.
                            </p>
                        ) : (
                            <div className="space-y-4 mt-4">
                                {costBySource.map((source) => {
                                    const maxCost = Math.max(...costBySource.map(s => s.cost));
                                    const pct = maxCost > 0 ? (source.cost / maxCost) * 100 : 0;
                                    return (
                                        <div key={source.name} className="flex items-center gap-4">
                                            <div className="w-28 text-sm font-medium text-slate-300 shrink-0">{source.name}</div>
                                            <div className="flex-1 h-8 bg-slate-700/50 rounded-lg overflow-hidden relative">
                                                <div
                                                    className="h-full rounded-lg transition-all duration-500 flex items-center px-3"
                                                    style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: source.color }}
                                                >
                                                    <span className="text-xs font-bold text-white whitespace-nowrap drop-shadow">
                                                        {source.cost.toFixed(2)} {preferredCurrency}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="mt-4 pt-4 border-t border-slate-700/50 flex justify-between text-sm">
                                    <span className="text-slate-400">Total</span>
                                    <span className="font-bold text-white">
                                        {costBySource.reduce((sum, s) => sum + s.cost, 0).toFixed(2)} {preferredCurrency}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </main>
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
            <p className="text-2xl font-bold">{value}</p>
        </div>
    );
}

function TimeframeSelector({ selected, onSelect, customStart, customEnd, onCustomStartChange, onCustomEndChange, showCustomPicker, onToggleCustomPicker }: any) {
    const options = [
        { id: 'week', label: 'This Week' }, { id: '7days', label: 'Last 7 Days' },
        { id: 'month', label: 'This Month' }, { id: '30days', label: 'Last 30 Days' },
        { id: '3months', label: 'Last 3 Months' }, { id: 'custom', label: 'Custom' },
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
