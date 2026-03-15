'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSettingsStore } from '@/stores/settingsStore';
import {
    ArrowLeft,
    Clock,
    MapPin,
    Battery,
    Zap,
    Banknote,
    Activity,
    Calendar,
    Check,
    Loader2
} from 'lucide-react';
import Header from '@/components/Header';
import dynamic from 'next/dynamic';
import {
    canUseManualChargingCost,
    getChargingBatteryEnergyKwh,
    getChargingCostSource,
    getChargingDeliveredEnergyKwh,
    getChargingDisplayCost,
} from '@/lib/charging/energy';
import {
    getStoredTeslaChargeEventId,
    getTeslaChargingSyncMessage,
    getTeslaChargingSyncStatus,
    isSuperchargerChargingSession,
} from '@/lib/charging/teslaSync';

const TripDetailMap = dynamic(() => import('@/components/TripDetailMap'), {
    loading: () => <div className="h-96 w-full animate-pulse rounded-xl bg-slate-800" />,
    ssr: false
});

interface ChargingSession {
    id: string;
    vehicle_id: string;
    start_time: string;
    end_time: string | null;
    start_battery_pct: number | null;
    end_battery_pct: number | null;
    energy_added_kwh: number | null;
    energy_delivered_kwh: number | null;
    charger_price_per_kwh: number | null;
    charge_rate_kw: number | null;
    latitude: number | null;
    longitude: number | null;
    location_name: string | null;
    charger_type: string | null;
    cost_estimate: number | null;
    cost_user_entered: number | null;
    currency: string | null;
    tesla_charge_event_id: string | null;
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

function formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export default function ChargingDetailPage() {
    const params = useParams();
    const sessionId = params.id as string;

    const [session, setSession] = useState<ChargingSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [address, setAddress] = useState<string>('');

    // Cost Editor State
    const { currency: preferredCurrency } = useSettingsStore();
    const [isEditingCost, setIsEditingCost] = useState(false);
    const [costInput, setCostInput] = useState('');
    const [currencyInput, setCurrencyInput] = useState(preferredCurrency);
    const [savingCost, setSavingCost] = useState(false);

    const fetchSessionDetails = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/charging/${sessionId}`);
            const data = await res.json();

            if (data.success && data.session) {
                setSession(data.session);
            } else {
                setError('Charging session not found');
            }
        } catch (err) {
            console.error('Failed to fetch session:', err);
            setError('Failed to load charging details');
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    useEffect(() => {
        fetchSessionDetails();
    }, [fetchSessionDetails]);

    const fetchAddressFromCoords = useCallback(async () => {
        if (!session || session.latitude == null || session.longitude == null) return;

        if (session.location_name) {
            setAddress(session.location_name);
        } else {
            try {
                const res = await fetch(`/api/geocode?lat=${session.latitude}&lng=${session.longitude}`);
                const data = await res.json();
                if (data.success) {
                    setAddress(data.address);
                } else {
                    setAddress(`${session.latitude.toFixed(4)}, ${session.longitude.toFixed(4)}`);
                }
            } catch {
                setAddress(`${session.latitude.toFixed(4)}, ${session.longitude.toFixed(4)}`);
            }
        }
    }, [session]);

    useEffect(() => {
        if (session) {
            fetchAddressFromCoords();
        }
    }, [session, fetchAddressFromCoords]);

    const handleSaveCost = async () => {
        if (!session || !costInput) return;
        setSavingCost(true);
        try {
            const response = await fetch(`/api/charging/${session.id}/cost`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cost: parseFloat(costInput),
                    currency: currencyInput
                })
            });
            const data = await response.json();

            if (data.success && data.session) {
                setSession({
                    ...session,
                    cost_user_entered: data.session.cost_user_entered,
                    currency: data.session.currency
                });
                setIsEditingCost(false);
            }
        } catch (err) {
            console.error('Failed to save cost', err);
        } finally {
            setSavingCost(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
            </div>
        );
    }

    if (error || !session) {
        return (
            <div className="min-h-screen p-8">
                <div className="mx-auto max-w-4xl">
                    <Link
                        href="/dashboard/charging"
                        className="inline-flex items-center gap-2 text-slate-400 hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Charging History
                    </Link>
                    <div className="mt-8 rounded-xl border border-slate-700/50 bg-slate-800/30 p-8 text-center">
                        <p className="text-slate-400">{error || 'Session not found'}</p>
                    </div>
                </div>
            </div>
        );
    }

    const hasCoords = session.latitude != null && session.longitude != null;
    const isSupercharger = isSuperchargerChargingSession(session);
    const isDC = session.charger_type?.toLowerCase().includes('3rd_party_fast') || isSupercharger;
    const batteryEnergy = getChargingBatteryEnergyKwh(session);
    const deliveredEnergy = getChargingDeliveredEnergyKwh(session);
    const displayCost = getChargingDisplayCost(session);
    const costSource = getChargingCostSource(session);
    const canUseManualCost = canUseManualChargingCost(session);
    const teslaSyncStatus = getTeslaChargingSyncStatus(session);
    const teslaSyncMessage = getTeslaChargingSyncMessage(session);
    const teslaEventId = getStoredTeslaChargeEventId(session.tesla_charge_event_id);

    return (
        <div className="min-h-screen">
            <Header />

            {/* Modal for Cost Entry */}
            {isEditingCost && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                        <h3 className="mb-4 text-xl font-bold">Edit Charging Cost</h3>
                        <p className="mb-6 text-sm text-slate-400">
                            Update the total cost for this session.
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
                                onClick={() => setIsEditingCost(false)}
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

            <main className="mx-auto max-w-7xl px-6 pb-24 pt-8 md:pb-8">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="mb-2">
                            <Link
                                href="/dashboard/charging"
                                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back to Charging
                            </Link>
                        </div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold">Charging Details</h1>
                            {isSupercharger && (
                                <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-500 border border-red-500/20">
                                    Supercharger
                                </span>
                            )}
                            {!isSupercharger && isDC && (
                                <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-medium text-orange-400 border border-orange-500/20">
                                    DC Fast
                                </span>
                            )}
                        </div>
                        <p className="text-slate-400 mt-1">
                            {address || (!hasCoords ? 'Unknown Location' : 'Loading location...')}
                        </p>
                    </div>

                    {canUseManualCost && (
                        <button
                            onClick={() => {
                                setCostInput((session.cost_user_entered ?? displayCost)?.toString() || '');
                                setCurrencyInput(session.currency || preferredCurrency);
                                setIsEditingCost(true);
                            }}
                            className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 border border-slate-700"
                        >
                            <Banknote className="h-4 w-4" />
                            {session.cost_user_entered != null ? 'Edit Manual Cost' : 'Add Manual Cost'}
                        </button>
                    )}
                </div>

                {/* Map Section */}
                {hasCoords && (
                    <div className="mb-8 overflow-hidden rounded-xl border border-slate-700/50 relative">
                        <TripDetailMap
                            startLat={session.latitude!}
                            startLng={session.longitude!}
                            endLat={session.latitude!}
                            endLng={session.longitude!}
                        />
                    </div>
                )}

                {/* Charging Info Grid */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {/* Time & Date */}
                    <StatBox
                        icon={<Calendar className="h-5 w-5" />}
                        label="Started"
                        value={formatDateTime(session.start_time)}
                        color="blue"
                    />
                    <StatBox
                        icon={<Clock className="h-5 w-5" />}
                        label="Duration"
                        value={formatDuration(session.start_time, session.end_time)}
                        color="green"
                    />
                    {session.end_time && (
                        <StatBox
                            icon={<Calendar className="h-5 w-5" />}
                            label="Ended"
                            value={formatDateTime(session.end_time)}
                            color="purple"
                        />
                    )}

                    {/* Energy & Speed */}
                    <StatBox
                        icon={<Battery className="h-5 w-5" />}
                        label="Energy to Battery"
                        value={batteryEnergy != null ? `+${batteryEnergy.toFixed(2)} kWh` : 'N/A'}
                        color="green"
                    />
                    {isSupercharger && (
                        <StatBox
                            icon={<Zap className="h-5 w-5" />}
                            label="Energy Delivered"
                            value={deliveredEnergy != null
                                ? `${deliveredEnergy.toFixed(2)} kWh`
                                : teslaSyncStatus === 'pending'
                                    ? 'Waiting for Tesla'
                                    : 'Tesla unavailable'
                            }
                            color="yellow"
                            subtext={
                                deliveredEnergy != null
                                    ? 'Tesla charging history'
                                    : teslaSyncMessage || 'No matched Tesla data yet'
                            }
                        />
                    )}
                    <StatBox
                        icon={<Activity className="h-5 w-5" />}
                        label="Max Charge Rate"
                        value={session.charge_rate_kw ? `${session.charge_rate_kw.toFixed(0)} kW` : 'N/A'}
                        color="orange"
                    />

                    {/* Cost Information */}
                    <StatBox
                        icon={<Banknote className="h-5 w-5" />}
                        label="Total Cost"
                        value={
                            displayCost != null
                                ? `${session.currency || preferredCurrency} ${displayCost.toFixed(2)}`
                                : isSupercharger
                                    ? teslaSyncStatus === 'pending'
                                        ? 'Tesla cost pending'
                                        : 'Tesla cost unavailable'
                                    : 'Not entered'
                        }
                        color={displayCost != null ? "green" : "slate"}
                        subtext={
                            displayCost != null
                                ? costSource === 'manual'
                                    ? isSupercharger
                                        ? 'Manual cost because Tesla billing was unavailable'
                                        : 'Manual entry'
                                    : costSource === 'tesla'
                                        ? 'Tesla charging history'
                                        : undefined
                                : isSupercharger
                                    ? (teslaSyncMessage || 'Tesla billing unavailable')
                                    : undefined
                        }
                    />
                    {isSupercharger && (
                        <StatBox
                            icon={<Banknote className="h-5 w-5" />}
                            label="Tesla Rate"
                            value={session.charger_price_per_kwh != null
                                ? `${session.charger_price_per_kwh.toFixed(2)} / kWh`
                                : teslaSyncStatus === 'pending'
                                    ? 'Waiting for Tesla'
                                    : 'Tesla unavailable'
                            }
                            color={session.charger_price_per_kwh != null ? "yellow" : "slate"}
                            subtext={session.charger_price_per_kwh != null
                                ? (
                                    teslaEventId
                                        ? `Tesla event ${teslaEventId}`
                                        : 'Reported by Tesla'
                                )
                                : teslaSyncMessage || 'No matched Tesla billing record yet'
                            }
                        />
                    )}

                    {/* Battery State */}
                    {session.start_battery_pct != null && (
                        <StatBox
                            icon={<Battery className="h-5 w-5" />}
                            label="Battery Start"
                            value={`${session.start_battery_pct.toFixed(2)}%`}
                            color="red"
                        />
                    )}
                    {session.end_battery_pct != null && (
                        <StatBox
                            icon={<Battery className="h-5 w-5" />}
                            label="Battery End"
                            value={`${session.end_battery_pct.toFixed(2)}%`}
                            color="green"
                        />
                    )}

                    {/* Raw Location */}
                    {hasCoords && (
                        <LocationCard
                            title="Station Coordinates"
                            lat={session.latitude}
                            lon={session.longitude}
                            color="blue"
                        />
                    )}
                </div>
            </main>
        </div>
    );
}

function StatBox({
    icon,
    label,
    value,
    color,
    subtext
}: {
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    color: string;
    subtext?: string;
}) {
    const colorClasses = {
        blue: 'text-blue-400 bg-blue-500/10',
        green: 'text-green-400 bg-green-500/10',
        yellow: 'text-yellow-400 bg-yellow-500/10',
        orange: 'text-orange-400 bg-orange-500/10',
        red: 'text-red-400 bg-red-500/10',
        purple: 'text-purple-400 bg-purple-500/10',
        slate: 'text-slate-400 bg-slate-500/10',
    };

    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 flex flex-col justify-center">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${colorClasses[color as keyof typeof colorClasses]?.split(' ')[1]}`}>
                    <div className={colorClasses[color as keyof typeof colorClasses]?.split(' ')[0]}>
                        {icon}
                    </div>
                </div>
                <div>
                    <div className="text-sm text-slate-400">{label}</div>
                    <div className="text-lg font-semibold flex items-baseline gap-2">
                        {value}
                        {subtext && <span className="text-xs font-normal text-slate-500">{subtext}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}

function LocationCard({
    title,
    lat,
    lon,
    color,
}: {
    title: string;
    lat?: number | null;
    lon?: number | null;
    color: string;
}) {
    const colorClasses = {
        blue: 'border-blue-500/30 bg-blue-500/10',
        green: 'border-green-500/30 bg-green-500/10',
        red: 'border-red-500/30 bg-red-500/10',
    };

    return (
        <div className={`rounded-xl border p-6 flex flex-col justify-center ${colorClasses[color as keyof typeof colorClasses]}`}>
            <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-slate-400 mt-0.5" />
                <div className="flex-1">
                    <h3 className="font-semibold text-sm">{title}</h3>
                    <p className="mt-1 text-slate-300 font-mono text-sm tracking-tight break-all">
                        {lat != null && lon != null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : 'Unknown'}
                    </p>
                </div>
            </div>
        </div>
    );
}
