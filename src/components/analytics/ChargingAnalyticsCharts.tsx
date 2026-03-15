'use client';

import { useMemo } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

type ChargingMixDatum = {
    name: string;
    value: number;
    color: string;
};

type CostBySourceDatum = {
    name: string;
    cost: number;
    color: string;
};

type DailyChargingDatum = {
    day: string;
    dateKey: string;
    axisLabel: string;
    tooltipLabel: string;
    batteryEnergy: number;
    deliveredEnergy: number;
    lossEnergy: number;
    cost: number;
    sessions: number;
};

interface ChargingAnalyticsChartsProps {
    dailyData: DailyChargingDatum[];
    chargingMix: ChargingMixDatum[];
    costBySource: CostBySourceDatum[];
    preferredCurrency: string;
}

export default function ChargingAnalyticsCharts({
    dailyData,
    chargingMix,
    costBySource,
    preferredCurrency,
}: ChargingAnalyticsChartsProps) {
    const axisLabelMap = useMemo(
        () => Object.fromEntries(dailyData.map((item) => [item.dateKey, item.axisLabel])),
        [dailyData]
    );
    const tooltipLabelMap = useMemo(
        () => Object.fromEntries(dailyData.map((item) => [item.dateKey, item.tooltipLabel])),
        [dailyData]
    );
    const hasRealChargingData =
        chargingMix.length > 0 &&
        !(chargingMix.length === 1 && chargingMix[0].name === 'No Data');
    const maxCost = useMemo(
        () => costBySource.reduce((highest, source) => Math.max(highest, source.cost), 0),
        [costBySource]
    );
    const totalCost = useMemo(
        () => costBySource.reduce((sum, source) => sum + source.cost, 0),
        [costBySource]
    );

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                <h2 className="mb-6 text-lg font-semibold">Charging Energy (Daily)</h2>
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                            dataKey="dateKey"
                            stroke="#94a3b8"
                            fontSize={12}
                            interval={0}
                            tickFormatter={(value) => axisLabelMap[String(value)] || ''}
                        />
                        <YAxis stroke="#94a3b8" fontSize={12} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                            labelFormatter={(value) => tooltipLabelMap[String(value)] || value}
                            formatter={(value: number, name: string) => {
                                const labelMap: Record<string, string> = {
                                    batteryEnergy: 'Battery',
                                    lossEnergy: 'Loss',
                                };
                                return [`${value} kWh`, labelMap[name] || name];
                            }}
                        />
                        <Bar dataKey="batteryEnergy" stackId="energy" fill="#22c55e" radius={[0, 0, 4, 4]} />
                        <Bar dataKey="lossEnergy" stackId="energy" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
                <p className="mt-4 text-sm text-slate-400">
                    Green is energy stored in the battery. Amber is measured charging loss where Tesla delivered energy is available.
                </p>
            </div>

            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                <h2 className="mb-6 text-lg font-semibold">Charging Cost (Daily)</h2>
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                            dataKey="dateKey"
                            stroke="#94a3b8"
                            fontSize={12}
                            interval={0}
                            tickFormatter={(value) => axisLabelMap[String(value)] || ''}
                        />
                        <YAxis stroke="#94a3b8" fontSize={12} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                            labelFormatter={(value) => tooltipLabelMap[String(value)] || value}
                            formatter={(value: number) => [`${value} ${preferredCurrency}`, 'Cost']}
                        />
                        <Bar dataKey="cost" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                <h2 className="mb-2 text-center text-lg font-semibold">Charging Sources Match</h2>
                {!hasRealChargingData && (
                    <p className="mb-4 text-center text-sm text-slate-400">
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
                                    <Cell key={`${entry.name}-${index}`} fill={entry.color} />
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

            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                <h2 className="mb-2 text-lg font-semibold">Cost by Charging Source</h2>
                {costBySource.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">
                        No cost data available. Add costs to individual charging sessions to see this breakdown.
                    </p>
                ) : (
                    <div className="mt-4 space-y-4">
                        {costBySource.map((source) => {
                            const pct = maxCost > 0 ? (source.cost / maxCost) * 100 : 0;

                            return (
                                <div key={source.name} className="flex items-center gap-4">
                                    <div className="w-28 shrink-0 text-sm font-medium text-slate-300">{source.name}</div>
                                    <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-slate-700/50">
                                        <div
                                            className="flex h-full items-center rounded-lg px-3 text-xs font-bold text-white transition-all duration-500"
                                            style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: source.color }}
                                        >
                                            <span className="whitespace-nowrap drop-shadow">
                                                {source.cost.toFixed(2)} {preferredCurrency}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div className="mt-4 flex justify-between border-t border-slate-700/50 pt-4 text-sm">
                            <span className="text-slate-400">Total</span>
                            <span className="font-bold text-white">
                                {totalCost.toFixed(2)} {preferredCurrency}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
