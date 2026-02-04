'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSettingsStore } from '@/stores/settingsStore';
import {
    Zap,
    ArrowLeft,
    Clock,
    MapPin,
    Battery,
    Gauge,
    Navigation,
    TrendingUp,
    Calendar,
} from 'lucide-react';
import dynamic from 'next/dynamic';

const TripDetailMap = dynamic(() => import('@/components/TripDetailMap'), {
    loading: () => <div className="h-96 w-full animate-pulse rounded-xl bg-slate-800" />,
    ssr: false
});

interface Trip {
    id: string;
    vehicle_id: string;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
    start_latitude: number | null;
    start_longitude: number | null;
    start_address: string | null;
    end_latitude: number | null;
    end_longitude: number | null;
    end_address: string | null;
    distance_miles: number | null;
    energy_used_kwh: number | null;
    efficiency_wh_mi: number | null;
    start_battery_level: number | null;
    end_battery_level: number | null;
    max_speed: number | null;
    avg_speed: number | null;
    status: string;
}

// Utility functions
function milesToKm(miles: number): number {
    return miles * 1.60934;
}

function formatDistance(miles: number | null, units: 'imperial' | 'metric'): string {
    if (miles === null || miles === undefined) return 'N/A';
    if (units === 'metric') {
        return `${milesToKm(miles).toFixed(1)} km`;
    }
    return `${miles.toFixed(1)} mi`;
}

function formatBattery(pct: number | null): string {
    if (pct === null || pct === undefined) return 'N/A';
    return `${pct.toFixed(1)}%`;
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
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

export default function TripDetailPage() {
    const params = useParams();
    const router = useRouter();
    const tripId = params.id as string;
    const [trip, setTrip] = useState<Trip | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [startAddress, setStartAddress] = useState<string>('');
    const [endAddress, setEndAddress] = useState<string>('');
    const [loadingAddresses, setLoadingAddresses] = useState(false);
    const { units } = useSettingsStore();

    useEffect(() => {
        fetchTripDetails();
    }, [tripId]);

    const fetchTripDetails = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/trips');
            const data = await res.json();

            if (data.success && data.trips) {
                const foundTrip = data.trips.find((t: Trip) => t.id === tripId);
                if (foundTrip) {
                    setTrip(foundTrip);
                } else {
                    setError('Trip not found');
                }
            }
        } catch (err) {
            console.error('Failed to fetch trip:', err);
            setError('Failed to load trip details');
        } finally {
            setLoading(false);
        }
    };

    // Fetch addresses for start and end coordinates
    const fetchAddresses = async () => {
        if (!trip) return;

        setLoadingAddresses(true);

        // Use trip addresses if available, otherwise geocode
        if (trip.start_address) {
            setStartAddress(trip.start_address);
        } else if (trip.start_latitude && trip.start_longitude) {
            try {
                const res = await fetch(`/api/geocode?lat=${trip.start_latitude}&lng=${trip.start_longitude}`);
                const data = await res.json();
                if (data.success) {
                    setStartAddress(data.address);
                } else {
                    setStartAddress(`${trip.start_latitude.toFixed(4)}, ${trip.start_longitude.toFixed(4)}`);
                }
            } catch {
                setStartAddress(`${trip.start_latitude.toFixed(4)}, ${trip.start_longitude.toFixed(4)}`);
            }
        }

        if (trip.end_address) {
            setEndAddress(trip.end_address);
        } else if (trip.end_latitude && trip.end_longitude) {
            try {
                const res = await fetch(`/api/geocode?lat=${trip.end_latitude}&lng=${trip.end_longitude}`);
                const data = await res.json();
                if (data.success) {
                    setEndAddress(data.address);
                } else {
                    setEndAddress(`${trip.end_latitude.toFixed(4)}, ${trip.end_longitude.toFixed(4)}`);
                }
            } catch {
                setEndAddress(`${trip.end_latitude.toFixed(4)}, ${trip.end_longitude.toFixed(4)}`);
            }
        }

        setLoadingAddresses(false);
    };

    // Fetch addresses when trip loads
    useEffect(() => {
        if (trip) {
            fetchAddresses();
        }
    }, [trip]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
            </div>
        );
    }

    if (error || !trip) {
        return (
            <div className="min-h-screen p-8">
                <div className="mx-auto max-w-4xl">
                    <Link
                        href="/dashboard/trips"
                        className="inline-flex items-center gap-2 text-slate-400 hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Trips
                    </Link>
                    <div className="mt-8 rounded-xl border border-slate-700/50 bg-slate-800/30 p-8 text-center">
                        <p className="text-slate-400">{error || 'Trip not found'}</p>
                    </div>
                </div>
            </div>
        );
    }

    const hasCoords = trip.start_latitude && trip.start_longitude;
    const isInProgress = trip.status === 'in_progress';

    return (
        <div className="min-h-screen">
            {/* Header */}
            <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
                    <Link
                        href="/dashboard/trips"
                        className="flex items-center gap-2 text-slate-400 hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600">
                            <Zap className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Trip Details</h1>
                            <p className="text-sm text-slate-400">
                                {trip.start_address || 'Trip Details'}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="mx-auto max-w-7xl px-6 py-8">
                {/* Map Section */}
                {hasCoords && (
                    <div className="mb-8">
                        <TripDetailMap
                            startLat={trip.start_latitude!}
                            startLng={trip.start_longitude!}
                            endLat={trip.end_latitude}
                            endLng={trip.end_longitude}
                        />
                    </div>
                )}

                {/* Trip Info Grid */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {/* Time & Date */}
                    <StatBox
                        icon={<Calendar className="h-5 w-5" />}
                        label="Started"
                        value={formatDateTime(trip.started_at)}
                        color="blue"
                    />
                    {trip.ended_at && (
                        <StatBox
                            icon={<Clock className="h-5 w-5" />}
                            label="Duration"
                            value={trip.duration_seconds ? formatDuration(trip.duration_seconds) : 'N/A'}
                            color="green"
                        />
                    )}
                    {!isInProgress && trip.ended_at && (
                        <StatBox
                            icon={<Calendar className="h-5 w-5" />}
                            label="Ended"
                            value={formatDateTime(trip.ended_at)}
                            color="purple"
                        />
                    )}

                    {/* Distance & Energy */}
                    <StatBox
                        icon={<Navigation className="h-5 w-5" />}
                        label="Distance"
                        value={formatDistance(trip.distance_miles, units)}
                        color="green"
                    />
                    <StatBox
                        icon={<Battery className="h-5 w-5" />}
                        label="Energy Used"
                        value={trip.energy_used_kwh ? `${trip.energy_used_kwh.toFixed(1)} kWh` : 'N/A'}
                        color="yellow"
                    />
                    <StatBox
                        icon={<TrendingUp className="h-5 w-5" />}
                        label="Efficiency"
                        value={trip.efficiency_wh_mi
                            ? (units === 'metric'
                                ? `${Math.round(trip.efficiency_wh_mi / 1.60934)} Wh/km`
                                : `${Math.round(trip.efficiency_wh_mi)} Wh/mi`)
                            : 'N/A'}
                        color="orange"
                    />

                    {/* Battery */}
                    <StatBox
                        icon={<Battery className="h-5 w-5" />}
                        label="Battery Start"
                        value={formatBattery(trip.start_battery_level)}
                        color="green"
                    />
                    {trip.end_battery_level !== null && (
                        <StatBox
                            icon={<Battery className="h-5 w-5" />}
                            label="Battery End"
                            value={formatBattery(trip.end_battery_level)}
                            color="yellow"
                        />
                    )}

                    {/* Speed */}
                    {trip.max_speed && (
                        <StatBox
                            icon={<Gauge className="h-5 w-5" />}
                            label="Max Speed"
                            value={units === 'metric'
                                ? `${Math.round(trip.max_speed * 1.60934)} km/h`
                                : `${Math.round(trip.max_speed)} mph`}
                            color="red"
                        />
                    )}
                </div>

                {/* Locations */}
                <div className="mt-8 grid gap-4 md:grid-cols-2">
                    <LocationCard
                        title="Start Location"
                        address={startAddress || (loadingAddresses ? 'Loading address...' : undefined) || trip.start_address}
                        lat={trip.start_latitude}
                        lon={trip.start_longitude}
                        color="green"
                    />
                    {trip.end_latitude && trip.end_longitude && (
                        <LocationCard
                            title="End Location"
                            address={endAddress || (loadingAddresses ? 'Loading address...' : undefined) || trip.end_address}
                            lat={trip.end_latitude}
                            lon={trip.end_longitude}
                            color="red"
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
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    color: string;
}) {
    const colorClasses = {
        blue: 'text-blue-400',
        green: 'text-green-400',
        yellow: 'text-yellow-400',
        orange: 'text-orange-400',
        red: 'text-red-400',
        purple: 'text-purple-400',
    };

    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
            <div className="flex items-center gap-3">
                <div className={colorClasses[color as keyof typeof colorClasses]}>
                    {icon}
                </div>
                <div>
                    <div className="text-sm text-slate-400">{label}</div>
                    <div className="text-lg font-semibold">{value}</div>
                </div>
            </div>
        </div>
    );
}

function LocationCard({
    title,
    address,
    lat,
    lon,
    color,
}: {
    title: string;
    address: string | null;
    lat: number | null;
    lon: number | null;
    color: string;
}) {
    const colorClasses = {
        green: 'border-green-500/30 bg-green-500/10',
        red: 'border-red-500/30 bg-red-500/10',
    };

    return (
        <div className={`rounded-xl border p-6 ${colorClasses[color as keyof typeof colorClasses]}`}>
            <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-slate-400" />
                <div className="flex-1">
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-slate-400">
                        {address || (lat && lon ? `${lat.toFixed(3)}, ${lon.toFixed(3)}` : 'Unknown')}
                    </p>
                </div>
            </div>
        </div>
    );
}
