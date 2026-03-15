'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSettingsStore } from '@/stores/settingsStore';
import {
    ArrowLeft,
    Clock,
    MapPin,
    Battery,
    Gauge,
    Navigation,
    TrendingUp,
    Calendar,
    Thermometer,
} from 'lucide-react';
import Header from '@/components/Header';
import dynamic from 'next/dynamic';
import ViewportGate from '@/components/ViewportGate';
import type { TripRoutePoint } from '@/lib/trips/routePoints';
import { readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';

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
    min_outside_temp: number | null;
    max_outside_temp: number | null;
    avg_outside_temp: number | null;
    status: string;
}

type TripDetailResponse = {
    success?: boolean;
    trip?: Trip | null;
    route_points?: TripRoutePoint[];
    error?: string;
};

const TRIP_DETAIL_CACHE_TTL_MS = 45_000;
const TRIP_ROUTE_CACHE_TTL_MS = 45_000;

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
    return `${pct.toFixed(2)}%`;
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

function getTripSubtitle(
    trip: Trip,
    startAddress: string,
    endAddress: string
): string {
    const resolvedStart = startAddress || trip.start_address || '';
    const resolvedEnd = endAddress || trip.end_address || '';

    if (resolvedStart && resolvedEnd) {
        return `${resolvedStart} to ${resolvedEnd}`;
    }

    if (resolvedStart) {
        return `Started from ${resolvedStart}`;
    }

    if (resolvedEnd) {
        return `Ended at ${resolvedEnd}`;
    }

    return formatDateTime(trip.started_at);
}

export default function TripDetailPage() {
    const params = useParams();
    const tripId = params.id as string;
    const [trip, setTrip] = useState<Trip | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [startAddress, setStartAddress] = useState<string>('');
    const [endAddress, setEndAddress] = useState<string>('');
    const [routePoints, setRoutePoints] = useState<TripRoutePoint[]>([]);
    const [loadingRoutePoints, setLoadingRoutePoints] = useState(false);
    const [loadingAddresses, setLoadingAddresses] = useState(false);
    const geocodeCacheRef = useRef<Map<string, string>>(new Map());
    const routePointsRequestedRef = useRef(false);
    const routePointsAbortRef = useRef<AbortController | null>(null);
    const units = useSettingsStore((state) => state.units);

    useEffect(() => {
        routePointsRequestedRef.current = false;
        routePointsAbortRef.current?.abort();
        routePointsAbortRef.current = null;
        setRoutePoints([]);
        setLoadingRoutePoints(false);

        return () => {
            routePointsAbortRef.current?.abort();
            routePointsAbortRef.current = null;
        };
    }, [tripId]);

    const fetchTripDetails = useCallback(async (signal?: AbortSignal) => {
        const cacheKey = `trip:detail:${tripId}`;
        const cached = readCachedJson<TripDetailResponse>(cacheKey);

        try {
            setError(null);
            if (cached?.success && cached.trip) {
                setTrip(cached.trip);
                setRoutePoints(Array.isArray(cached.route_points) ? cached.route_points : []);
                setLoading(false);
            } else {
                setLoading(true);
            }
            const res = await fetch(`/api/trips/${tripId}`, {
                cache: 'no-store',
                signal,
            });
            const data = await res.json();

            if (signal?.aborted) {
                return;
            }

            if (!res.ok) {
                setTrip(null);
                setRoutePoints([]);
                setError(data.error || 'Trip not found');
                return;
            }

            if (data.success && data.trip) {
                writeCachedJson(cacheKey, data, TRIP_DETAIL_CACHE_TTL_MS);
                setTrip(data.trip);
                setRoutePoints(Array.isArray(data.route_points) ? data.route_points : []);
            } else {
                setTrip(null);
                setRoutePoints([]);
                setError('Trip not found');
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                return;
            }
            console.error('Failed to fetch trip:', err);
            if (!(cached?.success && cached.trip)) {
                setRoutePoints([]);
                setError('Failed to load trip details');
            }
        } finally {
            if (!signal?.aborted) {
                if (!(cached?.success && cached.trip)) {
                    setLoading(false);
                }
            }
        }
    }, [tripId]);

    // Fetch addresses for start and end coordinates
    useEffect(() => {
        const controller = new AbortController();
        void fetchTripDetails(controller.signal);

        return () => controller.abort();
    }, [fetchTripDetails]);

    const fetchRoutePoints = useCallback(async () => {
        if (routePointsRequestedRef.current || loadingRoutePoints) {
            return;
        }

        const cacheKey = `trip:route:${tripId}`;
        const cached = readCachedJson<TripRoutePoint[]>(cacheKey);

        routePointsRequestedRef.current = true;
        routePointsAbortRef.current?.abort();
        const controller = new AbortController();
        routePointsAbortRef.current = controller;

        if (cached) {
            setRoutePoints(cached);
            setLoadingRoutePoints(false);
        } else {
            setLoadingRoutePoints(true);
        }

        try {
            const res = await fetch(`/api/trips/${tripId}?includeRoute=1`, {
                cache: 'no-store',
                signal: controller.signal,
            });
            const data = await res.json();

            if (controller.signal.aborted) {
                return;
            }

            if (!res.ok) {
                return;
            }

            const nextRoutePoints = Array.isArray(data.route_points) ? data.route_points : [];
            writeCachedJson(cacheKey, nextRoutePoints, TRIP_ROUTE_CACHE_TTL_MS);
            setRoutePoints(nextRoutePoints);
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                return;
            }
            console.error('Failed to fetch trip route points:', err);
        } finally {
            if (routePointsAbortRef.current === controller) {
                routePointsAbortRef.current = null;
            }

            if (!controller.signal.aborted) {
                if (!cached) {
                    setLoadingRoutePoints(false);
                }
            }
        }
    }, [loadingRoutePoints, tripId]);

    const resolveAddress = useCallback(async (latitude: number, longitude: number, signal?: AbortSignal) => {
        const cacheKey = `${latitude},${longitude}`;
        const cachedAddress = geocodeCacheRef.current.get(cacheKey);
        const fallbackAddress = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

        if (cachedAddress) {
            return cachedAddress;
        }

        try {
            const res = await fetch(`/api/geocode?lat=${latitude}&lng=${longitude}`, {
                signal,
            });
            const data = await res.json();
            const resolvedAddress = data?.success && data?.address
                ? data.address
                : data?.fallback || fallbackAddress;

            geocodeCacheRef.current.set(cacheKey, resolvedAddress);
            return resolvedAddress;
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw error;
            }
            return fallbackAddress;
        }
    }, []);

    const fetchAddresses = useCallback(async (signal?: AbortSignal) => {
        if (!trip) return;

        setLoadingAddresses(true);
        setStartAddress(trip.start_address || '');
        setEndAddress(trip.end_address || '');

        const startPromise = trip.start_address || trip.start_latitude == null || trip.start_longitude == null
            ? Promise.resolve(trip.start_address || '')
            : resolveAddress(trip.start_latitude, trip.start_longitude, signal);
        const endPromise = trip.end_address || trip.end_latitude == null || trip.end_longitude == null
            ? Promise.resolve(trip.end_address || '')
            : resolveAddress(trip.end_latitude, trip.end_longitude, signal);

        try {
            const [resolvedStartAddress, resolvedEndAddress] = await Promise.all([startPromise, endPromise]);

            if (signal?.aborted) {
                return;
            }

            setStartAddress(resolvedStartAddress);
            setEndAddress(resolvedEndAddress);
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
        } finally {
            if (!signal?.aborted) {
                setLoadingAddresses(false);
            }
        }
    }, [resolveAddress, trip]);

    // Fetch addresses when trip loads
    useEffect(() => {
        if (trip) {
            const controller = new AbortController();
            void fetchAddresses(controller.signal);

            return () => controller.abort();
        }
    }, [trip, fetchAddresses]);

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

    const hasCoords = trip.start_latitude != null && trip.start_longitude != null;
    const isInProgress = trip.status === 'in_progress';

    return (
        <div className="min-h-screen">
            <Header />

            {/* Main Content */}
            <main className="mx-auto max-w-7xl px-6 pb-24 pt-8 md:pb-8">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="mb-2">
                            <Link
                                href="/dashboard/trips"
                                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back to Trips
                            </Link>
                        </div>
                        <h1 className="text-2xl font-bold">Trip Details</h1>
                        <p className="text-slate-400">
                            {getTripSubtitle(trip, startAddress, endAddress)}
                        </p>
                    </div>
                </div>

                {/* Map Section */}
                {hasCoords && (
                    <div className="mb-8">
                        <ViewportGate
                            className="h-96 w-full"
                            onVisible={() => {
                                void fetchRoutePoints();
                            }}
                            placeholder={<div className="h-96 w-full animate-pulse rounded-xl bg-slate-800" />}
                        >
                            {loadingRoutePoints ? (
                                <div className="h-96 w-full animate-pulse rounded-xl bg-slate-800" />
                            ) : (
                                <TripDetailMap
                                    startLat={trip.start_latitude!}
                                    startLng={trip.start_longitude!}
                                    endLat={trip.end_latitude}
                                    endLng={trip.end_longitude}
                                    routePoints={routePoints}
                                />
                            )}
                        </ViewportGate>
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
                    {trip.avg_speed && (
                        <StatBox
                            icon={<Gauge className="h-5 w-5" />}
                            label="Avg Speed"
                            value={units === 'metric'
                                ? `${Math.round(trip.avg_speed * 1.60934)} km/h`
                                : `${Math.round(trip.avg_speed)} mph`}
                            color="blue"
                        />
                    )}

                    {/* Temperature */}
                    {trip.avg_outside_temp != null && (
                        <StatBox
                            icon={<Thermometer className="h-5 w-5" />}
                            label="Avg Temperature"
                            value={`${Math.round(trip.avg_outside_temp)}°C`}
                            color="blue"
                        />
                    )}
                    {trip.min_outside_temp != null && (
                        <StatBox
                            icon={<Thermometer className="h-5 w-5" />}
                            label="Min Temperature"
                            value={`${Math.round(trip.min_outside_temp)}°C`}
                            color="blue"
                        />
                    )}
                    {trip.max_outside_temp != null && (
                        <StatBox
                            icon={<Thermometer className="h-5 w-5" />}
                            label="Max Temperature"
                            value={`${Math.round(trip.max_outside_temp)}°C`}
                            color="orange"
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
    value: React.ReactNode;
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
    address?: string | null;
    lat?: number | null;
    lon?: number | null;
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
