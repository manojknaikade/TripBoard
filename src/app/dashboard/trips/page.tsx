'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Zap,
    Gauge,
    History,
    BarChart3,
    Settings,
    LogOut,
    MapPin,
    Clock,
    Battery,
    Navigation,
    TrendingUp,
    Calendar,
    ChevronRight,
    Car,
    Loader2,
} from 'lucide-react';

interface Trip {
    id: string;
    vehicle_id: string;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
    start_latitude: number;
    start_longitude: number;
    start_address: string | null;
    end_latitude: number | null;
    end_longitude: number | null;
    end_address: string | null;
    distance_miles: number | null;
    energy_used_kwh: number | null;
    efficiency_wh_mi: number | null;
    start_battery_level: number;
    end_battery_level: number | null;
    status: string;
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        });
    }
}

function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    });
}

export default function TripsPage() {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchTrips();
    }, []);

    const fetchTrips = async () => {
        try {
            const response = await fetch('/api/trips?limit=50');
            const data = await response.json();

            if (data.success) {
                setTrips(data.trips || []);
            } else {
                setError(data.error || 'Failed to load trips');
            }
        } catch {
            setError('Failed to load trips');
        } finally {
            setLoading(false);
        }
    };

    // Group trips by date
    const tripsByDate = trips.reduce((acc, trip) => {
        const date = formatDate(trip.started_at);
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(trip);
        return acc;
    }, {} as Record<string, Trip[]>);

    // Calculate stats
    const totalTrips = trips.length;
    const totalMiles = trips.reduce((sum, t) => sum + (t.distance_miles || 0), 0);
    const totalEnergy = trips.reduce((sum, t) => sum + (t.energy_used_kwh || 0), 0);
    const avgEfficiency = totalMiles > 0 ? (totalEnergy * 1000) / totalMiles : 0;

    return (
        <div className="min-h-screen">
            {/* Header */}
            <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600">
                            <Zap className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-xl font-bold">TripBoard</span>
                    </div>

                    <nav className="flex items-center gap-2">
                        <NavLink href="/dashboard" icon={<Gauge className="h-4 w-4" />}>
                            Dashboard
                        </NavLink>
                        <NavLink href="/dashboard/trips" icon={<History className="h-4 w-4" />} active>
                            Trips
                        </NavLink>
                        <NavLink href="/dashboard/analytics" icon={<BarChart3 className="h-4 w-4" />}>
                            Analytics
                        </NavLink>
                        <NavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />}>
                            Settings
                        </NavLink>
                    </nav>

                    <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
                        <LogOut className="h-4 w-4" />
                        Sign Out
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="mx-auto max-w-7xl px-6 py-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold">Trip History</h1>
                    <p className="text-slate-400">View and analyze your driving trips</p>
                </div>

                {/* Stats Cards */}
                <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        icon={<Car className="h-5 w-5" />}
                        label="Total Trips"
                        value={totalTrips.toString()}
                        color="blue"
                    />
                    <StatCard
                        icon={<Navigation className="h-5 w-5" />}
                        label="Total Distance"
                        value={`${Math.round(totalMiles)} mi`}
                        color="green"
                    />
                    <StatCard
                        icon={<Battery className="h-5 w-5" />}
                        label="Energy Used"
                        value={`${totalEnergy.toFixed(1)} kWh`}
                        color="purple"
                    />
                    <StatCard
                        icon={<TrendingUp className="h-5 w-5" />}
                        label="Avg Efficiency"
                        value={avgEfficiency > 0 ? `${Math.round(avgEfficiency)} Wh/mi` : '--'}
                        color="orange"
                    />
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="rounded-xl bg-red-500/10 p-6 text-center text-red-400">
                        <p>{error}</p>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !error && trips.length === 0 && (
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-12 text-center">
                        <History className="mx-auto mb-4 h-12 w-12 text-slate-500" />
                        <h2 className="mb-2 text-xl font-semibold">No trips yet</h2>
                        <p className="text-slate-400">
                            Once you start driving with telemetry enabled, your trips will appear here.
                        </p>
                        <p className="mt-4 text-sm text-slate-500">
                            Make sure to pair your virtual key and enable telemetry streaming.
                        </p>
                    </div>
                )}

                {/* Trips List */}
                {!loading && trips.length > 0 && (
                    <div className="space-y-6">
                        {Object.entries(tripsByDate).map(([date, dateTrips]) => (
                            <div key={date}>
                                <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                                    <Calendar className="h-4 w-4" />
                                    {date}
                                </div>
                                <div className="space-y-3">
                                    {dateTrips.map((trip) => (
                                        <TripCard key={trip.id} trip={trip} />
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

function TripCard({ trip }: { trip: Trip }) {
    const isInProgress = trip.status === 'in_progress';

    return (
        <Link
            href={`/dashboard/trips/${trip.id}`}
            className="block rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 transition-all hover:border-slate-600 hover:bg-slate-800/50"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* Status indicator */}
                    <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full ${isInProgress ? 'bg-green-500/20' : 'bg-slate-700/50'
                            }`}
                    >
                        <Car
                            className={`h-5 w-5 ${isInProgress ? 'text-green-400' : 'text-slate-400'}`}
                        />
                    </div>

                    {/* Trip info */}
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-medium">
                                {trip.start_address || `${trip.start_latitude?.toFixed(3)}, ${trip.start_longitude?.toFixed(3)}`}
                            </span>
                            {!isInProgress && trip.end_address && (
                                <>
                                    <span className="text-slate-500">→</span>
                                    <span className="font-medium">{trip.end_address}</span>
                                </>
                            )}
                            {isInProgress && (
                                <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                                    In Progress
                                </span>
                            )}
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-sm text-slate-400">
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(trip.started_at)}
                                {trip.duration_seconds && ` • ${formatDuration(trip.duration_seconds)}`}
                            </span>
                            {trip.distance_miles && (
                                <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {trip.distance_miles.toFixed(1)} mi
                                </span>
                            )}
                            {trip.energy_used_kwh && (
                                <span className="flex items-center gap-1">
                                    <Battery className="h-3 w-3" />
                                    {trip.energy_used_kwh.toFixed(1)} kWh
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Battery change */}
                <div className="flex items-center gap-4">
                    {trip.start_battery_level && (
                        <div className="text-right">
                            <div className="text-sm text-slate-400">Battery</div>
                            <div className="font-medium">
                                {trip.start_battery_level}%
                                {trip.end_battery_level && (
                                    <span className="text-slate-500"> → {trip.end_battery_level}%</span>
                                )}
                            </div>
                        </div>
                    )}
                    <ChevronRight className="h-5 w-5 text-slate-500" />
                </div>
            </div>
        </Link>
    );
}

function NavLink({
    href,
    icon,
    children,
    active,
}: {
    href: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    active?: boolean;
}) {
    return (
        <Link
            href={href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active
                    ? 'bg-red-500/10 text-red-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
        >
            {icon}
            {children}
        </Link>
    );
}

function StatCard({
    icon,
    label,
    value,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
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
            <p className="text-xl font-bold">{value}</p>
        </div>
    );
}
