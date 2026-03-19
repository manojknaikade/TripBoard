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
import dynamic from 'next/dynamic';
import ViewportGate from '@/components/ViewportGate';
import type { TripRoutePoint } from '@/lib/trips/routePoints';
import { readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';
import {
    PageHero,
    PageShell,
    StatusBadge,
    SUBCARD_CLASS,
    SURFACE_CARD_CLASS,
} from '@/components/ui/dashboardPage';
import { fetchReverseGeocode, formatCoordinateFallback } from '@/lib/client/geocode';

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

function formatSpeed(speedMph: number | null, units: 'imperial' | 'metric'): string {
    if (speedMph == null) {
        return 'N/A';
    }

    if (units === 'metric') {
        return `${Math.round(speedMph * 1.60934)} km/h`;
    }

    return `${Math.round(speedMph)} mph`;
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
        const fallbackAddress = formatCoordinateFallback(latitude, longitude);

        try {
            const data = await fetchReverseGeocode(latitude, longitude);
            if (signal?.aborted) {
                throw new DOMException('The operation was aborted.', 'AbortError');
            }
            const resolvedAddress = data?.success && data?.address
                ? data.address
                : data?.fallback || fallbackAddress;
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
            <div className="min-h-screen">
                <PageShell>
                    <Link
                        href="/dashboard/trips"
                        className="inline-flex items-center gap-2 text-slate-400 transition-colors hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Trips
                    </Link>
                    <div className={`mt-8 p-8 text-center ${SURFACE_CARD_CLASS}`}>
                        <p className="text-slate-400">{error || 'Trip not found'}</p>
                    </div>
                </PageShell>
            </div>
        );
    }

    const hasCoords = trip.start_latitude != null && trip.start_longitude != null;
    const isInProgress = trip.status === 'in_progress';

    return (
        <div className="min-h-screen">
            <PageShell>
                <PageHero
                    title="Trip Details"
                    description={getTripSubtitle(trip, startAddress, endAddress)}
                    badge={isInProgress ? <StatusBadge tone="live">In Progress</StatusBadge> : undefined}
                    meta={
                        <Link
                            href="/dashboard/trips"
                            className="inline-flex items-center gap-2 text-sm font-medium text-red-300 transition-colors hover:text-red-200"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to Trips
                        </Link>
                    }
                />

                {hasCoords && (
                    <section className={`mb-6 overflow-hidden p-4 ${SURFACE_CARD_CLASS}`}>
                        <ViewportGate
                            className="h-96 w-full"
                            onVisible={() => {
                                void fetchRoutePoints();
                            }}
                            placeholder={<div className={`h-96 w-full animate-pulse ${SUBCARD_CLASS}`} />}
                        >
                            {loadingRoutePoints ? (
                                <div className={`h-96 w-full animate-pulse ${SUBCARD_CLASS}`} />
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
                    </section>
                )}

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                    <StatBox
                        icon={<Gauge className="h-5 w-5" />}
                        label="Max Speed"
                        value={formatSpeed(trip.max_speed, units)}
                        color="red"
                    />
                    {trip.avg_speed && (
                        <StatBox
                            icon={<Gauge className="h-5 w-5" />}
                            label="Avg Speed"
                            value={formatSpeed(trip.avg_speed, units)}
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
                    {(trip.min_outside_temp != null || trip.max_outside_temp != null) && (
                        <StatBox
                            icon={<Thermometer className="h-5 w-5" />}
                            label="Temperature Range"
                            value={
                                trip.min_outside_temp != null && trip.max_outside_temp != null
                                    ? `${Math.round(trip.min_outside_temp)}°C to ${Math.round(trip.max_outside_temp)}°C`
                                    : trip.min_outside_temp != null
                                        ? `${Math.round(trip.min_outside_temp)}°C`
                                        : `${Math.round(trip.max_outside_temp!)}°C`
                            }
                            color="orange"
                        />
                    )}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
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
            </PageShell>
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
        blue: 'text-slate-300',
        green: 'text-green-300',
        yellow: 'text-amber-300',
        orange: 'text-amber-300',
        red: 'text-red-300',
        purple: 'text-slate-300',
    };

    return (
        <div className={`p-4 ${SURFACE_CARD_CLASS}`}>
            <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center ${SUBCARD_CLASS} ${colorClasses[color as keyof typeof colorClasses]}`}>
                    {icon}
                </div>
                <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{label}</div>
                    <div className="mt-1.5 text-xl font-semibold tracking-tight text-white">{value}</div>
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
    const toneMap = {
        green: 'live' as const,
        red: 'brand' as const,
    };
    const resolvedAddress = address || (lat != null && lon != null ? `${lat.toFixed(3)}, ${lon.toFixed(3)}` : 'Unknown');
    const googleMapsUrl = lat != null && lon != null
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`
        : null;

    return (
        <div className={`p-6 ${SURFACE_CARD_CLASS}`}>
            <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 items-center justify-center ${SUBCARD_CLASS}`}>
                    <MapPin className="h-5 w-5 text-slate-300" />
                </div>
                <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">{title}</h3>
                        <StatusBadge tone={toneMap[color as keyof typeof toneMap]}>Location</StatusBadge>
                    </div>
                    {googleMapsUrl ? (
                        <div className="mt-2">
                            <a
                                href={googleMapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-sm leading-6 text-slate-300 transition-colors hover:text-white"
                            >
                                {resolvedAddress}
                            </a>
                        </div>
                    ) : (
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                            {resolvedAddress}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
