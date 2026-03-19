'use client';

import { useMemo } from 'react';
import { ThermometerSnowflake } from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { SURFACE_CARD_CLASS } from '@/components/ui/dashboardPage';

type WeeklyDatum = {
    day: string;
    dateKey: string;
    axisLabel: string;
    tooltipLabel: string;
    distance: number;
    energy: number;
    trips: number;
};

type EfficiencyDatum = {
    time: string;
    efficiency: number;
};

type TemperatureDatum = {
    temp: number;
    efficiency: number;
};

interface DrivingAnalyticsChartsProps {
    weeklyData: WeeklyDatum[];
    efficiencyData: EfficiencyDatum[];
    temperatureImpact: TemperatureDatum[];
    units: 'metric' | 'imperial';
}

export default function DrivingAnalyticsCharts({
    weeklyData,
    efficiencyData,
    temperatureImpact,
    units,
}: DrivingAnalyticsChartsProps) {
    const axisLabelMap = useMemo(
        () => Object.fromEntries(weeklyData.map((item) => [item.dateKey, item.axisLabel])),
        [weeklyData]
    );
    const tooltipLabelMap = useMemo(
        () => Object.fromEntries(weeklyData.map((item) => [item.dateKey, item.tooltipLabel])),
        [weeklyData]
    );

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <div className={`p-6 ${SURFACE_CARD_CLASS}`}>
                <h2 className="mb-6 text-lg font-semibold">Distance Over Time</h2>
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={weeklyData}>
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
                            contentStyle={{
                                backgroundColor: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                            }}
                            labelFormatter={(value) => tooltipLabelMap[String(value)] || value}
                        />
                        <Bar dataKey="distance" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className={`p-6 ${SURFACE_CARD_CLASS}`}>
                <h2 className="mb-6 text-lg font-semibold">Energy Consumption Over Time</h2>
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={weeklyData}>
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
                            contentStyle={{
                                backgroundColor: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                            }}
                            labelFormatter={(value) => tooltipLabelMap[String(value)] || value}
                            formatter={(value: number) => [`${value} kWh`, 'Energy']}
                        />
                        <Bar dataKey="energy" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className={`p-6 ${SURFACE_CARD_CLASS}`}>
                <div className="mb-6">
                    <h2 className="text-lg font-semibold">Efficiency by Time of Day</h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Average {units === 'metric' ? 'Wh/km' : 'Wh/mi'} for trips in selected period
                    </p>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={efficiencyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} interval={0} />
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

            <div className={`p-6 ${SURFACE_CARD_CLASS}`}>
                <div className="mb-6">
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                        <ThermometerSnowflake className="h-5 w-5 text-blue-400" />
                        Temperature Impact
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Efficiency ({units === 'metric' ? 'Wh/km' : 'Wh/mi'}) vs External Temperature
                    </p>
                </div>
                <div className="relative flex h-[250px] w-full items-center justify-center">
                    {temperatureImpact.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={temperatureImpact}>
                                <defs>
                                    <linearGradient id="driving-temp-gradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis
                                    dataKey="temp"
                                    stroke="#94a3b8"
                                    fontSize={12}
                                    label={{ value: 'Temp (°C)', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 10 }}
                                />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                    }}
                                    formatter={(value: number) => [`${value} ${units === 'metric' ? 'Wh/km' : 'Wh/mi'}`, 'Avg Efficiency']}
                                    labelFormatter={(label) => `${label}°C Outside`}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="efficiency"
                                    stroke="#3b82f6"
                                    fillOpacity={1}
                                    fill="url(#driving-temp-gradient)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-sm italic text-slate-500">
                            Not enough data to calculate temperature impact for this period.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
