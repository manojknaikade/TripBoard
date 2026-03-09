'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Zap,
    History,
    Calendar,
    MapPin,
    Clock,
    Battery,
    Loader2,
    Banknote,
    Check,
} from 'lucide-react';
import Header from '@/components/Header';
import { useSettingsStore } from '@/stores/settingsStore';
import dynamic from 'next/dynamic';

const TripMiniMap = dynamic(() => import('@/components/TripMiniMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-700/30 animate-pulse rounded-lg" />
});

interface ChargingSession {
    id: string;
    vehicle_id: string;
    start_time: string;
    end_time: string | null;
    start_battery_pct: number | null;
    end_battery_pct: number | null;
    energy_added_kwh: number | null;
    charge_rate_kw: number | null;
    latitude: number | null;
    longitude: number | null;
    location_name: string | null;
    charger_type: string | null;
    cost_estimate: number | null;
    cost_user_entered: number | null;
    currency: string | null;
    is_complete: boolean;
}

function formatDuration(start: string, end: string | null): string {
    if (!end) return 'In Progress';
    const seconds = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    else if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    else return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ChargingPage() {
    const { units, currency: preferredCurrency } = useSettingsStore();
    const [sessions, setSessions] = useState<ChargingSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [timeframe, setTimeframe] = useState('7days');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showCustomPicker, setShowCustomPicker] = useState(false);

    // Modal state
    const [editingSession, setEditingSession] = useState<ChargingSession | null>(null);
    const [costInput, setCostInput] = useState('');
    const [currencyInput, setCurrencyInput] = useState(preferredCurrency);
    const [savingCost, setSavingCost] = useState(false);

    // Calculate date range
    const getDateRange = () => {
        const toDate = new Date();
        toDate.setHours(23, 59, 59, 999);
        let fromDate = new Date();

        if (timeframe === 'custom' && customStart && customEnd) {
            fromDate = new Date(customStart);
            fromDate.setHours(0, 0, 0, 0);
            const customToDate = new Date(customEnd);
            customToDate.setHours(23, 59, 59, 999);
            return { fromDate, toDate: customToDate };
        } else {
            switch (timeframe) {
                case '7days': fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000); break;
                case 'month': fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), 1); break;
                case '30days': fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000); break;
                case '3months': fromDate = new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000); break;
                case 'week':
                default:
                    const day = toDate.getDay();
                    const diff = toDate.getDate() - day + (day === 0 ? -6 : 1);
                    fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), diff);
                    fromDate.setHours(0, 0, 0, 0);
                    break;
            }
        }
        return { fromDate, toDate };
    };

    const handleSaveCost = async () => {
        if (!editingSession || !costInput) return;
        setSavingCost(true);
        try {
            const response = await fetch(`/api/charging/${editingSession.id}/cost`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cost: parseFloat(costInput),
                    currency: currencyInput
                })
            });
            const data = await response.json();

            if (data.success && data.session) {
                setSessions(prev =>
                    prev.map(s => s.id === editingSession.id ? {
                        ...s,
                        cost_user_entered: data.session.cost_user_entered,
                        currency: data.session.currency
                    } : s)
                );
                setEditingSession(null);
                setCostInput('');
            }
        } catch (err) {
            console.error('Failed to save cost', err);
        } finally {
            setSavingCost(false);
        }
    };

    const fetchSessions = async () => {
        setLoading(true);
        setError(null);
        try {
            const { fromDate, toDate } = getDateRange();
            const params = new URLSearchParams({
                from: fromDate.toISOString(),
                to: toDate.toISOString(),
            });
            const response = await fetch(`/api/charging?${params}`);
            const data = await response.json();

            if (data.success) {
                setSessions(data.sessions || []);
            } else {
                setError(data.error || 'Failed to load charging sessions');
            }
        } catch {
            setError('Failed to load charging sessions');
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch when timeframe or custom dates change
    useEffect(() => {
        fetchSessions();
    }, [timeframe, customStart, customEnd]);

    const filteredSessions = sessions;

    const sessionsByDate = filteredSessions.reduce((acc, session) => {
        const date = formatDate(session.start_time);
        if (!acc[date]) acc[date] = [];
        acc[date].push(session);
        return acc;
    }, {} as Record<string, ChargingSession[]>);

    const totalSessions = filteredSessions.length;
    const totalEnergy = filteredSessions.reduce((sum, s) => sum + (s.energy_added_kwh || 0), 0);
    const maxChargeRate = Math.max(...filteredSessions.map(s => s.charge_rate_kw || 0), 0);

    // Cost calculation (simplified summation assuming mostly 1 currency)
    const baseCurrencySessions = filteredSessions.filter(s => s.cost_user_entered && (s.currency === preferredCurrency || !s.currency));
    const totalCost = baseCurrencySessions.reduce((sum, s) => sum + (s.cost_user_entered || 0), 0);

    return (
        <div className="min-h-screen">
            <Header />

            {/* Modal for Cost Entry */}
            {editingSession && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                        <h3 className="mb-4 text-xl font-bold">Add Charging Cost</h3>
                        <p className="mb-6 text-sm text-slate-400">
                            Enter the total cost for the session on {new Date(editingSession.start_time).toLocaleDateString()}.
                        </p>

                        <div className="mb-6 grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <label className="mb-1 block text-sm text-slate-400">Total Cost</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={costInput}
                                    onChange={(e) => setCostInput(e.target.value)}
                                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                                    placeholder="0.00"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm text-slate-400">Currency</label>
                                <select
                                    value={currencyInput}
                                    onChange={(e) => setCurrencyInput(e.target.value)}
                                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                                >
                                    <option value="CHF">CHF</option>
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="GBP">GBP</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setEditingSession(null)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveCost}
                                disabled={savingCost || !costInput}
                                className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                            >
                                {savingCost ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="mx-auto max-w-7xl px-6 py-8">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Charging History</h1>
                        <p className="text-slate-400">View and manage your charging sessions</p>
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

                <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        icon={<Zap className="h-5 w-5" />}
                        label="Total Sessions"
                        value={totalSessions.toString()}
                        color="blue"
                    />
                    <StatCard
                        icon={<Battery className="h-5 w-5" />}
                        label="Energy Added"
                        value={`${totalEnergy.toFixed(1)} kWh`}
                        color="green"
                    />
                    <StatCard
                        icon={<Zap className="h-5 w-5" />}
                        label="Max Charge Rate"
                        value={maxChargeRate > 0 ? `${maxChargeRate.toFixed(0)} kW` : '--'}
                        color="orange"
                    />
                    <StatCard
                        icon={<Banknote className="h-5 w-5" />}
                        label="Total Cost"
                        value={`${totalCost.toFixed(2)} ${preferredCurrency}`}
                        color="purple"
                    />
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                    </div>
                ) : error ? (
                    <div className="rounded-xl bg-red-500/10 p-6 text-center text-red-400">{error}</div>
                ) : filteredSessions.length === 0 ? (
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-12 text-center">
                        <History className="mx-auto mb-4 h-12 w-12 text-slate-500" />
                        <h2 className="mb-2 text-xl font-semibold">No charging yet</h2>
                        <p className="text-slate-400">Charging sessions will appear here automatically.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {Object.entries(sessionsByDate).map(([date, dateSessions]) => (
                            <div key={date}>
                                <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                                    <Calendar className="h-4 w-4" />
                                    {date}
                                </div>
                                <div className="space-y-3">
                                    {dateSessions.map((session) => (
                                        <SessionCard
                                            key={session.id}
                                            session={session}
                                            preferredCurrency={preferredCurrency}
                                            onAddCost={() => {
                                                setEditingSession(session);
                                                setCostInput(session.cost_user_entered ? session.cost_user_entered.toString() : '');
                                                setCurrencyInput(session.currency || preferredCurrency);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

function SessionCard({ session, preferredCurrency, onAddCost }: { session: ChargingSession; preferredCurrency: string; onAddCost: () => void; }) {
    const isSupercharger = session.charger_type?.toLowerCase().includes('supercharger');
    const isDC = session.charger_type?.toLowerCase().includes('3rd_party_fast') || isSupercharger;
    const hasLocation = session.latitude && session.longitude;

    return (
        <Link
            href={`/dashboard/charging/${session.id}`}
            className="block rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 transition-all hover:border-slate-600 hover:bg-slate-800/50"
        >
            <div className="flex items-stretch gap-4">
                {hasLocation && (
                    <div className="hidden sm:block h-24 w-32 flex-shrink-0 rounded-lg overflow-hidden border border-slate-600/50 z-0 relative">
                        <TripMiniMap
                            startLat={session.latitude!}
                            startLon={session.longitude!}
                            endLat={session.latitude!}
                            endLon={session.longitude!}
                        />
                    </div>
                )}

                <div className="flex flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-medium">
                                    {session.location_name || 'Charging Location'}
                                </span>
                                {isSupercharger && (
                                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-500 border border-red-500/20">
                                        Supercharger
                                    </span>
                                )}
                                {!isSupercharger && isDC && (
                                    <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400 border border-orange-500/20">
                                        DC Fast
                                    </span>
                                )}
                                {!session.is_complete && (
                                    <span className="animate-pulse rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                                        Charging...
                                    </span>
                                )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                                <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatTime(session.start_time)}
                                    <span className="text-slate-600 mx-0.5">•</span>
                                    {formatDuration(session.start_time, session.end_time)}
                                </span>
                                {session.energy_added_kwh && (
                                    <span className="flex items-center gap-1">
                                        <Battery className="h-3 w-3" />
                                        +{session.energy_added_kwh.toFixed(1)} kWh
                                    </span>
                                )}
                                {session.charge_rate_kw && (
                                    <span className="flex items-center gap-1">
                                        <Zap className="h-3 w-3" />
                                        Max: {session.charge_rate_kw.toFixed(0)} kW
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Cost Display / Button */}
                        <div className="text-right ml-4">
                            {session.cost_user_entered ? (
                                <button
                                    onClick={(e) => { e.preventDefault(); onAddCost(); }}
                                    className="group flex flex-col items-end text-sm transition-colors hover:opacity-80"
                                >
                                    <span className="font-bold text-lg text-white group-hover:text-red-400 transition-colors">
                                        {session.currency || preferredCurrency} {session.cost_user_entered.toFixed(2)}
                                    </span>
                                    {session.energy_added_kwh && session.cost_user_entered > 0 && (
                                        <span className="text-xs text-slate-500">
                                            {((session.cost_user_entered / session.energy_added_kwh)).toFixed(2)} / kWh
                                        </span>
                                    )}
                                </button>
                            ) : (
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onAddCost();
                                    }}
                                    className="flex items-center gap-1.5 rounded-lg border border-slate-600/50 bg-slate-700/50 px-3 py-1.5 text-sm font-medium text-slate-300 transition-all hover:bg-slate-700 hover:text-white"
                                >
                                    <Banknote className="h-4 w-4" />
                                    Add Cost
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Battery bar - separate full-width row */}
            {session.start_battery_pct != null && (
                <div className="mt-4 flex items-center gap-4 border-t border-slate-700/50 pt-3">
                    <div className="flex flex-1 items-center gap-3">
                        <div className="text-sm font-medium">Battery</div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700 relative">
                            <div
                                className="absolute left-0 top-0 h-full bg-slate-500"
                                style={{ width: `${session.start_battery_pct}%` }}
                            />
                            {session.end_battery_pct && (
                                <div
                                    className="absolute top-0 h-full bg-green-500"
                                    style={{
                                        left: `${session.start_battery_pct}%`,
                                        width: `${session.end_battery_pct - session.start_battery_pct}%`
                                    }}
                                />
                            )}
                        </div>
                        <div className="text-sm font-mono text-slate-400 whitespace-nowrap">
                            {session.start_battery_pct.toFixed(2)}%
                            {session.end_battery_pct ? ` → ${session.end_battery_pct.toFixed(2)}%` : ''}
                        </div>
                    </div>
                </div>
            )}
        </Link>
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
            <p className="text-xl font-bold truncate">{value}</p>
        </div>
    );
}

// Reuse the TimeframeSelector from Trips page (simplified here for brevity, usually extracted to a component)
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
