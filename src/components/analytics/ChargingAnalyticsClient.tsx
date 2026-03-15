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
import dynamic from 'next/dynamic';
import AnalyticsChartsSkeleton from '@/components/analytics/AnalyticsChartsSkeleton';
import { fetchCachedJson, readCachedJson } from '@/lib/client/fetchCache';
import { useSettingsStore } from '@/stores/settingsStore';

interface AnalyticsData {
    summary: {
        chargingSessions: number;
        totalChargingEnergy: number;
        totalChargingBatteryEnergy: number;
        totalChargingDeliveredEnergy: number;
        totalChargingLossEnergy: number;
        totalChargingLossCost: number;
        totalChargingCost: number;
        avgCostPerKwh: number;
        avgChargingLossPct: number;
    };
    dailyChargingData: Array<{
        day: string;
        dateKey: string;
        axisLabel: string;
        tooltipLabel: string;
        batteryEnergy: number;
        deliveredEnergy: number;
        lossEnergy: number;
        cost: number;
        sessions: number;
    }>;
    chargingMix: Array<{ name: string; value: number; color: string; }>;
    costBySource: Array<{ name: string; cost: number; color: string; }>;
}

interface TimeframeSelectorProps {
    selected: string;
    onSelect: (value: string) => void;
    customStart: string;
    customEnd: string;
    onCustomStartChange: (value: string) => void;
    onCustomEndChange: (value: string) => void;
    showCustomPicker: boolean;
    onToggleCustomPicker: () => void;
}

const ChargingAnalyticsCharts = dynamic(() => import('@/components/analytics/ChargingAnalyticsCharts'), {
    ssr: false,
    loading: () => <AnalyticsChartsSkeleton />,
});

const ANALYTICS_CACHE_TTL_MS = 45_000;

export default function ChargingAnalyticsClient() {
    const [timeframe, setTimeframe] = useState('7days');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AnalyticsData | null>(null);
    const preferredCurrency = useSettingsStore((state) => state.currency);
    const hasCompleteDateRange = timeframe !== 'custom' || (!!customStart && !!customEnd);

    const fetchAnalytics = useCallback(async () => {
        let url = `/api/analytics/summary?scope=charging&timeframe=${timeframe}`;
        if (timeframe === 'custom' && customStart && customEnd) {
            url += `&startDate=${customStart}&endDate=${customEnd}`;
        }

        const cacheKey = `analytics:charging:${url}`;
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

    return (
        <main className="mx-auto max-w-7xl px-6 py-8">
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

            <div className="mb-8 flex gap-4 border-b border-slate-700/50 pb-4">
                <Link href="/dashboard/analytics" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
                    Driving Activity
                </Link>
                <span className="text-sm font-medium text-white border-b-2 border-red-500 pb-4 -mb-[18px]">
                    Charging
                </span>
                <Link href="/dashboard/analytics/maintenance" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
                    Maintenance
                </Link>
            </div>

            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <StatCard
                    icon={<Battery className="h-5 w-5" />}
                    label="Energy to Battery"
                    value={`${summary.totalChargingBatteryEnergy} kWh`}
                    color="green"
                />
                <StatCard
                    icon={<Zap className="h-5 w-5" />}
                    label="Energy Delivered"
                    value={`${summary.totalChargingDeliveredEnergy} kWh`}
                    color="blue"
                />
                <StatCard
                    icon={<Activity className="h-5 w-5" />}
                    label="Charging Loss"
                    value={`${summary.totalChargingLossEnergy} kWh`}
                    detail={`${summary.avgChargingLossPct.toFixed(1)}% of delivered`}
                    color="orange"
                />
                <StatCard
                    icon={<Banknote className="h-5 w-5" />}
                    label="Wasted Cost"
                    value={`${summary.totalChargingLossCost.toFixed(2)} ${preferredCurrency}`}
                    color="purple"
                />
                <StatCard
                    icon={<Banknote className="h-5 w-5" />}
                    label="Total Cost"
                    value={`${summary.totalChargingCost.toFixed(2)} ${preferredCurrency}`}
                    detail={`${summary.avgCostPerKwh.toFixed(2)} ${preferredCurrency}/delivered kWh`}
                    color="purple"
                />
                <StatCard
                    icon={<Zap className="h-5 w-5" />}
                    label="Sessions"
                    value={summary.chargingSessions.toString()}
                    color="orange"
                />
            </div>

            <ChargingAnalyticsCharts
                dailyData={data?.dailyChargingData || []}
                chargingMix={data?.chargingMix || []}
                costBySource={data?.costBySource || []}
                preferredCurrency={preferredCurrency}
            />
        </main>
    );
}

function StatCard({ icon, label, value, color, detail }: { icon: React.ReactNode; label: string; value: string; color: 'blue' | 'green' | 'purple' | 'orange'; detail?: string; }) {
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
            {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
        </div>
    );
}

function TimeframeSelector({ selected, onSelect, customStart, customEnd, onCustomStartChange, onCustomEndChange, showCustomPicker, onToggleCustomPicker }: TimeframeSelectorProps) {
    const options = [
        { id: 'week', label: 'This Week' }, { id: '7days', label: 'Last 7 Days' },
        { id: 'month', label: 'This Month' }, { id: '30days', label: 'Last 30 Days' },
        { id: '3months', label: 'Last 3 Months' }, { id: 'year', label: 'This Year' }, { id: 'alltime', label: 'All Time' }, { id: 'custom', label: 'Custom' },
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
