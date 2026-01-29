'use client';

import { useState } from 'react';
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
    ChevronRight,
    Calendar,
    Filter,
} from 'lucide-react';

// Mock trip data
const mockTrips = [
    {
        id: '1',
        start_time: '2024-01-28T14:30:00Z',
        end_time: '2024-01-28T15:15:00Z',
        start_address: 'Home, Berlin',
        end_address: 'Office, Potsdamer Platz',
        distance_miles: 12.5,
        energy_used_kwh: 3.2,
        efficiency_wh_mi: 256,
        start_battery_pct: 85,
        end_battery_pct: 78,
    },
    {
        id: '2',
        start_time: '2024-01-28T08:00:00Z',
        end_time: '2024-01-28T08:45:00Z',
        start_address: 'Supercharger, Alexanderplatz',
        end_address: 'Home, Berlin',
        distance_miles: 8.3,
        energy_used_kwh: 2.1,
        efficiency_wh_mi: 253,
        start_battery_pct: 95,
        end_battery_pct: 90,
    },
    {
        id: '3',
        start_time: '2024-01-27T18:30:00Z',
        end_time: '2024-01-27T19:45:00Z',
        start_address: 'Office, Potsdamer Platz',
        end_address: 'Supercharger, Alexanderplatz',
        distance_miles: 25.8,
        energy_used_kwh: 6.8,
        efficiency_wh_mi: 264,
        start_battery_pct: 45,
        end_battery_pct: 32,
    },
    {
        id: '4',
        start_time: '2024-01-27T09:00:00Z',
        end_time: '2024-01-27T09:30:00Z',
        start_address: 'Home, Berlin',
        end_address: 'Office, Potsdamer Platz',
        distance_miles: 12.5,
        energy_used_kwh: 3.4,
        efficiency_wh_mi: 272,
        start_battery_pct: 72,
        end_battery_pct: 65,
    },
];

export default function TripsPage() {
    const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatDuration = (start: string, end: string) => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const mins = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
        return `${mins} min`;
    };

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
                {/* Page Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Trip History</h1>
                        <p className="text-slate-400">View and analyze your past trips</p>
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-slate-400" />
                        {(['all', 'today', 'week', 'month'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`rounded-lg px-3 py-1.5 text-sm capitalize transition-colors ${filter === f
                                        ? 'bg-red-500/10 text-red-400'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Stats Summary */}
                <div className="mb-8 grid gap-4 sm:grid-cols-4">
                    <SummaryCard
                        label="Total Trips"
                        value={mockTrips.length.toString()}
                        icon={<History className="h-5 w-5" />}
                    />
                    <SummaryCard
                        label="Total Distance"
                        value={`${mockTrips.reduce((acc, t) => acc + t.distance_miles, 0).toFixed(1)} mi`}
                        icon={<Navigation className="h-5 w-5" />}
                    />
                    <SummaryCard
                        label="Energy Used"
                        value={`${mockTrips.reduce((acc, t) => acc + t.energy_used_kwh, 0).toFixed(1)} kWh`}
                        icon={<Battery className="h-5 w-5" />}
                    />
                    <SummaryCard
                        label="Avg Efficiency"
                        value={`${Math.round(mockTrips.reduce((acc, t) => acc + t.efficiency_wh_mi, 0) / mockTrips.length)} Wh/mi`}
                        icon={<Gauge className="h-5 w-5" />}
                    />
                </div>

                {/* Trips List */}
                <div className="space-y-3">
                    {mockTrips.map((trip) => (
                        <Link
                            key={trip.id}
                            href={`/dashboard/trips/${trip.id}`}
                            className="group flex items-center gap-4 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 transition-all hover:border-slate-600 hover:bg-slate-800/50"
                        >
                            {/* Date/Time */}
                            <div className="hidden w-24 flex-shrink-0 sm:block">
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <Calendar className="h-4 w-4" />
                                    <span>{formatDate(trip.start_time).split(',')[0]}</span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">
                                    {formatDate(trip.start_time).split(',')[1]}
                                </p>
                            </div>

                            {/* Route */}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 flex-shrink-0 text-green-400" />
                                    <span className="truncate font-medium">{trip.start_address}</span>
                                </div>
                                <div className="my-1 ml-2 h-4 w-px bg-slate-700" />
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 flex-shrink-0 text-red-400" />
                                    <span className="truncate font-medium">{trip.end_address}</span>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="hidden gap-6 sm:flex">
                                <div className="text-right">
                                    <p className="text-sm text-slate-400">Distance</p>
                                    <p className="font-semibold">{trip.distance_miles.toFixed(1)} mi</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-slate-400">Duration</p>
                                    <p className="font-semibold">{formatDuration(trip.start_time, trip.end_time)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-slate-400">Efficiency</p>
                                    <p className="font-semibold">{trip.efficiency_wh_mi} Wh/mi</p>
                                </div>
                            </div>

                            {/* Arrow */}
                            <ChevronRight className="h-5 w-5 text-slate-500 transition-transform group-hover:translate-x-1" />
                        </Link>
                    ))}
                </div>
            </main>
        </div>
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

function SummaryCard({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
            <div className="mb-2 text-slate-400">{icon}</div>
            <p className="text-sm text-slate-400">{label}</p>
            <p className="text-xl font-bold">{value}</p>
        </div>
    );
}
