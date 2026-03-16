'use client';

import { useMemo } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { SERVICE_TYPE_OPTIONS, type MaintenanceServiceType, type TyreSeason } from '@/lib/maintenance';
import { SUBCARD_CLASS, SURFACE_CARD_CLASS } from '@/components/ui/dashboardPage';

type ActivityDatum = {
    period: string;
    records: number;
    spend: number;
};

type CurrencyTotal = {
    currency: string;
    total: number;
};

type ServiceTypeDatum = {
    serviceType: MaintenanceServiceType;
    records: number;
};

type TyreMileageDatum = {
    name: string;
    season: TyreSeason;
    status: 'active' | 'retired';
    mileageKm: number;
};

interface MaintenanceAnalyticsChartsProps {
    activityData: ActivityDatum[];
    mixedCurrencies: boolean;
    spendCurrency: string | null;
    preferredCurrency: string;
    currencyTotals: CurrencyTotal[];
    serviceTypeBreakdown: ServiceTypeDatum[];
    tyreSetMileage: TyreMileageDatum[];
    units: 'metric' | 'imperial';
}

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

export default function MaintenanceAnalyticsCharts({
    activityData,
    mixedCurrencies,
    spendCurrency,
    preferredCurrency,
    currencyTotals,
    serviceTypeBreakdown,
    tyreSetMileage,
    units,
}: MaintenanceAnalyticsChartsProps) {
    const maxServiceTypeCount = useMemo(
        () => serviceTypeBreakdown.reduce((highest, item) => Math.max(highest, item.records), 0),
        [serviceTypeBreakdown]
    );
    const maxTyreMileage = useMemo(
        () => tyreSetMileage.reduce((highest, item) => Math.max(highest, item.mileageKm), 0),
        [tyreSetMileage]
    );

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <div className={`p-6 ${SURFACE_CARD_CLASS}`}>
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

            <div className={`p-6 ${SURFACE_CARD_CLASS}`}>
                <h2 className="mb-6 text-lg font-semibold">
                    {mixedCurrencies ? 'Spend by Currency' : 'Logged Spend'}
                </h2>

                {mixedCurrencies ? (
                    <div className="space-y-4">
                        {currencyTotals.map((entry) => (
                            <div key={entry.currency} className={`flex items-center justify-between px-4 py-3 ${SUBCARD_CLASS}`}>
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
                                    formatCurrency(value, spendCurrency || preferredCurrency),
                                    'Spend',
                                ]}
                            />
                            <Bar dataKey="spend" fill="#a855f7" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className={`p-6 ${SURFACE_CARD_CLASS}`}>
                <h2 className="mb-4 text-lg font-semibold">Service Mix</h2>
                {serviceTypeBreakdown.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-400">No maintenance records in the selected period.</p>
                ) : (
                    <div className="space-y-4">
                        {serviceTypeBreakdown.map((entry) => {
                            const width = maxServiceTypeCount > 0 ? (entry.records / maxServiceTypeCount) * 100 : 0;

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

            <div className={`p-6 ${SURFACE_CARD_CLASS}`}>
                <h2 className="mb-4 text-lg font-semibold">Tyre Set Mileage Tracked</h2>
                {tyreSetMileage.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-400">No seasonal tyre mileage with explicit odometer ranges in the selected period.</p>
                ) : (
                    <div className="space-y-4">
                        {tyreSetMileage.map((entry) => {
                            const width = maxTyreMileage > 0 ? (entry.mileageKm / maxTyreMileage) * 100 : 0;

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
    );
}
