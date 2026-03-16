'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSettingsStore } from '@/stores/settingsStore';
import {
    MapPin,
    Clock,
    Battery,
    Navigation,
    TrendingUp,
    History,
    Calendar,
    Car,
    Loader2,
    Thermometer,
} from 'lucide-react';
import Header from '@/components/Header';
import dynamic from 'next/dynamic';
import type { TripRoutePoint } from '@/lib/trips/routePoints';
import { fetchCachedJson, readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';
import VirtualizedList from '@/components/VirtualizedList';
import {
    DashboardStatCard,
    EmptyStateCard,
    LIST_CARD_CLASS,
    PageHero,
    PageShell,
    SectionDateHeader,
    StatusBadge,
    SUBCARD_CLASS,
    TimeframeSelector,
} from '@/components/ui/dashboardPage';

// Dynamic import to avoid SSR issues with Leaflet
const TripMiniMap = dynamic(() => import('@/components/TripMiniMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-700/30 animate-pulse rounded-lg" />
});

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
    avg_outside_temp: number | null;
    status: string;
    route_points?: TripRoutePoint[];
}

interface TripsSummary {
    totalTrips: number;
    totalDistance: number;
    totalEnergy: number;
    avgEfficiency: number;
}

const THUMBNAIL_FETCH_ROOT_MARGIN = '320px';
const TRIPS_AUTOLOAD_ROOT_MARGIN = '640px 0px';
const TRIPS_PAGE_SIZE = 20;
const TRIPS_BOOTSTRAP_CACHE_TTL_MS = 45_000;
const thumbnailRouteCache = new Map<string, TripRoutePoint[]>();
const thumbnailRouteRequestCache = new Map<string, Promise<TripRoutePoint[]>>();
const timeframeOptions = [
    { id: 'week', label: 'This Week' },
    { id: '7days', label: 'Last 7 Days' },
    { id: 'month', label: 'This Month' },
    { id: '30days', label: 'Last 30 Days' },
    { id: '3months', label: 'Last 3 Months' },
    { id: 'year', label: 'This Year' },
    { id: 'alltime', label: 'All Time' },
    { id: 'custom', label: 'Custom' },
];

type TripsListResponse = {
    success?: boolean;
    trips?: Trip[];
    summary?: TripsSummary | null;
    nextOffset?: number | null;
    error?: string;
};

type VirtualTripListItem =
    | { key: string; type: 'header'; label: string }
    | { key: string; type: 'trip'; trip: Trip };

async function getTripThumbnailRoutePoints(tripId: string): Promise<TripRoutePoint[]> {
    if (thumbnailRouteCache.has(tripId)) {
        return thumbnailRouteCache.get(tripId) || [];
    }

    let pendingRequest = thumbnailRouteRequestCache.get(tripId);

    if (!pendingRequest) {
        pendingRequest = fetch(`/api/trips/${tripId}?thumbnail=1`)
            .then(async (response) => {
                if (!response.ok) {
                    return [];
                }

                const data = await response.json();
                return Array.isArray(data.route_points) ? data.route_points : [];
            })
            .catch(() => [])
            .then((routePoints) => {
                thumbnailRouteCache.set(tripId, routePoints);
                return routePoints;
            })
            .finally(() => {
                thumbnailRouteRequestCache.delete(tripId);
            });

        thumbnailRouteRequestCache.set(tripId, pendingRequest);
    }

    return pendingRequest;
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

function milesToKm(miles: number): number {
    return miles * 1.60934;
}

export default function TripsPage() {
    const units = useSettingsStore((state) => state.units);
    const autoLoadTriggerRef = useRef<HTMLDivElement | null>(null);
    const autoLoadOffsetRef = useRef<number | null>(null);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [summary, setSummary] = useState<TripsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nextOffset, setNextOffset] = useState<number | null>(0);
    const [timeframe, setTimeframe] = useState('7days');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const hasCompleteDateRange = timeframe !== 'custom' || (!!customStart && !!customEnd);

    // Calculate date range based on timeframe
    const getDateRange = useCallback(() => {
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
                case '7days':
                    fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
                    break;
                case '30days':
                    fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                case '3months':
                    fromDate = new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);
                    break;
                case 'year':
                    fromDate = new Date(toDate.getFullYear(), 0, 1);
                    fromDate.setHours(0, 0, 0, 0);
                    break;
                case 'alltime':
                    fromDate = new Date(0);
                    fromDate.setHours(0, 0, 0, 0);
                    break;
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
    }, [timeframe, customStart, customEnd]);

    const getTripsRequestParams = useCallback((offset: number, includeSummary: boolean) => {
        const { fromDate, toDate } = getDateRange();

        return new URLSearchParams({
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            limit: String(TRIPS_PAGE_SIZE),
            offset: String(offset),
            includeSummary: includeSummary ? '1' : '0',
        });
    }, [getDateRange]);

    const fetchTrips = useCallback(async ({ reset, offset }: { reset: boolean; offset: number }) => {
        let hydratedFromCache = false;
        let requestCacheKey = '';

        if (reset) {
            setError(null);
            setSummary(null);
            autoLoadOffsetRef.current = null;
        } else {
            setLoadingMore(true);
        }

        try {
            const params = getTripsRequestParams(offset, reset);

            requestCacheKey = `trips:list:${params.toString()}`;

            if (reset) {
                const cached = readCachedJson<TripsListResponse>(requestCacheKey);

                if (cached?.success) {
                    setTrips(Array.isArray(cached.trips) ? cached.trips : []);
                    setNextOffset(typeof cached.nextOffset === 'number' ? cached.nextOffset : null);
                    setSummary(cached.summary || null);
                    setLoading(false);
                    hydratedFromCache = true;
                } else {
                    setLoading(true);
                }
            }

            const data = !reset
                ? await fetchCachedJson<TripsListResponse>(
                    requestCacheKey,
                    async () => {
                        const response = await fetch(`/api/trips?${params}`, {
                            cache: 'no-store',
                        });

                        return response.json();
                    },
                    TRIPS_BOOTSTRAP_CACHE_TTL_MS
                )
                : await fetch(`/api/trips?${params}`, {
                    cache: 'no-store',
                }).then((response) => response.json());

            if (data.success) {
                if (reset) {
                    writeCachedJson(requestCacheKey, data, TRIPS_BOOTSTRAP_CACHE_TTL_MS);
                }

                const incomingTrips = Array.isArray(data.trips) ? data.trips : [];

                setTrips((currentTrips) => {
                    if (reset) {
                        return incomingTrips;
                    }

                    const mergedTrips = [...currentTrips];
                    const seenTripIds = new Set(currentTrips.map((trip) => trip.id));

                    for (const trip of incomingTrips) {
                        if (!seenTripIds.has(trip.id)) {
                            mergedTrips.push(trip);
                            seenTripIds.add(trip.id);
                        }
                    }

                    return mergedTrips;
                });
                setNextOffset(typeof data.nextOffset === 'number' ? data.nextOffset : null);
                if (reset) {
                    setSummary(data.summary || null);
                }
            } else {
                if (!hydratedFromCache) {
                    setError(data.error || 'Failed to load trips');
                }
            }
        } catch {
            if (!hydratedFromCache) {
                setError('Failed to load trips');
            }
        } finally {
            if (reset) {
                if (!hydratedFromCache) {
                    setLoading(false);
                }
            } else {
                setLoadingMore(false);
            }
        }
    }, [getTripsRequestParams]);

    // Re-fetch when timeframe or custom dates change
    useEffect(() => {
        if (!hasCompleteDateRange) {
            autoLoadOffsetRef.current = null;
            setNextOffset(null);
            return;
        }

        void fetchTrips({ reset: true, offset: 0 });
    }, [fetchTrips, hasCompleteDateRange]);

    useEffect(() => {
        if (!hasCompleteDateRange || loading || loadingMore || nextOffset === null || !autoLoadTriggerRef.current) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) {
                        if (autoLoadOffsetRef.current === nextOffset) {
                            autoLoadOffsetRef.current = null;
                        }
                        continue;
                    }

                    if (autoLoadOffsetRef.current === nextOffset) {
                        continue;
                    }

                    autoLoadOffsetRef.current = nextOffset;
                    void fetchTrips({ reset: false, offset: nextOffset });
                }
            },
            { rootMargin: TRIPS_AUTOLOAD_ROOT_MARGIN }
        );

        observer.observe(autoLoadTriggerRef.current);

        return () => observer.disconnect();
    }, [fetchTrips, hasCompleteDateRange, loading, loadingMore, nextOffset]);

    useEffect(() => {
        if (!hasCompleteDateRange || loading || nextOffset === null) {
            return;
        }

        const params = getTripsRequestParams(nextOffset, false);
        const requestCacheKey = `trips:list:${params.toString()}`;

        void fetchCachedJson<TripsListResponse>(
            requestCacheKey,
            async () => {
                const response = await fetch(`/api/trips?${params}`, {
                    cache: 'no-store',
                });

                return response.json();
            },
            TRIPS_BOOTSTRAP_CACHE_TTL_MS
        ).catch(() => {
            // Ignore prefetch failures; the visible fetch path handles retries and errors.
        });
    }, [getTripsRequestParams, hasCompleteDateRange, loading, nextOffset]);

    // Trips are already filtered server-side
    const filteredTrips = trips;

    const displayedTrips = filteredTrips;

    const virtualTripListItems = useMemo(() => {
        const items: VirtualTripListItem[] = [];
        let currentDateLabel: string | null = null;

        for (const trip of displayedTrips) {
            const nextDateLabel = formatDate(trip.started_at);

            if (nextDateLabel !== currentDateLabel) {
                currentDateLabel = nextDateLabel;
                items.push({
                    key: `header:${nextDateLabel}`,
                    type: 'header',
                    label: nextDateLabel,
                });
            }

            items.push({
                key: `trip:${trip.id}`,
                type: 'trip',
                trip,
            });
        }

        return items;
    }, [displayedTrips]);

    const totalTrips = summary?.totalTrips ?? displayedTrips.length;
    const totalMiles = summary?.totalDistance ?? displayedTrips.reduce((sum, t) => sum + (t.distance_miles || 0), 0);
    const totalEnergy = summary?.totalEnergy ?? displayedTrips.reduce((sum, t) => sum + (t.energy_used_kwh || 0), 0);
    const avgEfficiency = summary?.avgEfficiency ?? (totalMiles > 0 ? (totalEnergy * 1000) / totalMiles : 0);

    // Convert to user's preferred units
    const displayDistance = units === 'metric' ? milesToKm(totalMiles) : totalMiles;
    const displayDistanceUnit = units === 'metric' ? 'km' : 'mi';
    const displayEfficiency = units === 'metric' && totalMiles > 0
        ? (totalEnergy * 1000) / milesToKm(totalMiles)
        : avgEfficiency;
    const efficiencyUnit = units === 'metric' ? 'Wh/km' : 'Wh/mi';

    return (
        <div className="min-h-screen">
            <Header />

            <PageShell>
                <PageHero
                    title="Trip History"
                    description="Driving records, distance, energy use, and efficiency across the selected period."
                    actions={
                        <TimeframeSelector
                            options={timeframeOptions}
                            selected={timeframe}
                            onSelect={setTimeframe}
                            customStart={customStart}
                            customEnd={customEnd}
                            onCustomStartChange={setCustomStart}
                            onCustomEndChange={setCustomEnd}
                            showCustomPicker={showCustomPicker}
                            onToggleCustomPicker={() => setShowCustomPicker(!showCustomPicker)}
                        />
                    }
                />

                <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <DashboardStatCard
                        icon={<Car className="h-5 w-5" />}
                        label="Total Trips"
                        value={totalTrips.toString()}
                        helper="Completed and in-progress trips in the active period."
                        tone="brand"
                    />
                    <DashboardStatCard
                        icon={<Navigation className="h-5 w-5" />}
                        label="Total Distance"
                        value={`${displayDistance.toFixed(1)} ${displayDistanceUnit}`}
                        helper="Combined distance across all visible trips."
                        tone="live"
                    />
                    <DashboardStatCard
                        icon={<Battery className="h-5 w-5" />}
                        label="Energy Used"
                        value={`${totalEnergy.toFixed(1)} kWh`}
                        helper="Battery energy consumed during the selected timeframe."
                        tone="warning"
                    />
                    <DashboardStatCard
                        icon={<TrendingUp className="h-5 w-5" />}
                        label="Avg Efficiency"
                        value={avgEfficiency > 0 ? `${Math.round(displayEfficiency)} ${efficiencyUnit}` : '--'}
                        helper="Average consumption efficiency across completed trips."
                        tone="quiet"
                    />
                </div>

                {loading && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                    </div>
                )}

                {error && (
                    <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-300">
                        {error}
                    </div>
                )}

                {!loading && !error && trips.length === 0 && (
                    <EmptyStateCard
                        icon={<History className="h-7 w-7" />}
                        title="No trips yet"
                        description="Once you start driving with telemetry enabled, your trips will appear here."
                        secondary="Make sure to pair your virtual key and enable telemetry streaming."
                    />
                )}

                {!loading && trips.length > 0 && (
                    <>
                        <VirtualizedList
                            key={`trips:${virtualTripListItems[0]?.key || 'empty'}:${virtualTripListItems[virtualTripListItems.length - 1]?.key || 'empty'}:${virtualTripListItems.length}`}
                            items={virtualTripListItems}
                            getItemKey={(item) => item.key}
                            estimateHeight={(item) => item.type === 'header' ? 40 : 188}
                            overscanPx={1000}
                            renderItem={(item) => (
                                item.type === 'header' ? (
                                    <SectionDateHeader>
                                        <Calendar className="h-4 w-4" />
                                        {item.label}
                                    </SectionDateHeader>
                                ) : (
                                    <div className="pb-4">
                                        <TripCard trip={item.trip} units={units} />
                                    </div>
                                )
                            )}
                        />

                        {nextOffset !== null && (
                            <div ref={autoLoadTriggerRef} className="mt-6 flex justify-center py-4">
                                {loadingMore ? (
                                    <div className="flex items-center gap-2 text-sm text-slate-400">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading more trips...
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500">
                                        Scroll for more trips
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </PageShell>
        </div>
    );
}

function getTripName(trip: Trip, units: 'imperial' | 'metric'): string {
    // If we have addresses, use them
    if (trip.start_address && trip.end_address) {
        // Extract city/area names from addresses
        const startParts = trip.start_address.split(',');
        const endParts = trip.end_address.split(',');
        const startName = startParts[0]?.trim() || trip.start_address;
        const endName = endParts[0]?.trim() || trip.end_address;

        if (startName === endName) {
            return `${startName} (Round trip)`;
        }
        return `${startName} → ${endName}`;
    }

    // If only start address
    if (trip.start_address) {
        const parts = trip.start_address.split(',');
        return parts[0]?.trim() || trip.start_address;
    }

    // Improved fallback: use time-based name instead of coordinates
    const time = new Date(trip.started_at);
    const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    if (!trip.distance_miles) {
        return `Trip at ${timeStr}`;
    }

    const distanceStr = units === 'metric'
        ? `(${(trip.distance_miles * 1.60934).toFixed(1)} km)`
        : `(${trip.distance_miles.toFixed(1)} mi)`;

    return `Trip at ${timeStr} ${distanceStr}`;
}

function TripCard({ trip, units }: { trip: Trip; units: 'imperial' | 'metric' }) {
    const isInProgress = trip.status === 'in_progress';
    const hasCoords = trip.start_latitude != null && trip.start_longitude != null;
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [isNearViewport, setIsNearViewport] = useState(false);
    const [fetchedRoutePoints, setFetchedRoutePoints] = useState<TripRoutePoint[] | null>(() => {
        if (thumbnailRouteCache.has(trip.id)) {
            return thumbnailRouteCache.get(trip.id) || [];
        }

        return null;
    });
    const routePoints = trip.route_points && trip.route_points.length > 0
        ? trip.route_points
        : fetchedRoutePoints || [];
    const shouldFetchExactRoute =
        hasCoords
        && !isInProgress
        && trip.end_latitude != null
        && trip.end_longitude != null
        && routePoints.length < 2;
    const isAwaitingExactRoute =
        isNearViewport
        && shouldFetchExactRoute
        && fetchedRoutePoints === null;

    useEffect(() => {
        if (isNearViewport || !cardRef.current || !hasCoords) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setIsNearViewport(true);
                        observer.disconnect();
                        break;
                    }
                }
            },
            { rootMargin: THUMBNAIL_FETCH_ROOT_MARGIN }
        );

        observer.observe(cardRef.current);

        return () => observer.disconnect();
    }, [hasCoords, isNearViewport]);

    useEffect(() => {
        if (!isNearViewport || !shouldFetchExactRoute || fetchedRoutePoints !== null) {
            return;
        }

        let cancelled = false;

        void getTripThumbnailRoutePoints(trip.id)
            .then((points) => {
                if (!cancelled) {
                    setFetchedRoutePoints(points);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [fetchedRoutePoints, isNearViewport, shouldFetchExactRoute, trip.id]);

    return (
        <div ref={cardRef}>
            <Link
                href={`/dashboard/trips/${trip.id}`}
                className={LIST_CARD_CLASS}
            >
                <div className="flex items-stretch gap-5">
                    {hasCoords && (
                        <div className={`relative hidden h-28 w-36 flex-shrink-0 overflow-hidden sm:block ${SUBCARD_CLASS}`}>
                            {isAwaitingExactRoute ? (
                                <div className="h-full w-full animate-pulse bg-slate-700/30" />
                            ) : (
                                <TripMiniMap
                                    key={`${trip.id}-${routePoints.length}-${trip.start_latitude}-${trip.start_longitude}-${trip.end_latitude ?? 'open'}-${trip.end_longitude ?? 'open'}`}
                                    startLat={trip.start_latitude}
                                    startLon={trip.start_longitude}
                                    endLat={trip.end_latitude}
                                    endLon={trip.end_longitude}
                                    routePoints={routePoints}
                                />
                            )}
                        </div>
                    )}

                    <div className="flex flex-1 items-center justify-between">
                        <div className="flex items-center gap-4">
                            {!hasCoords && (
                                <div
                                    className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${
                                        isInProgress
                                            ? 'border-green-500/20 bg-green-500/10 text-green-300'
                                            : 'border-slate-700/60 bg-slate-900/25 text-slate-300'
                                    }`}
                                >
                                    <Car className="h-5 w-5" />
                                </div>
                            )}

                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-base font-semibold text-white">
                                        {getTripName(trip, units)}
                                    </span>
                                    {isInProgress && (
                                        <StatusBadge tone="live" className="py-1 text-xs">
                                            In Progress
                                        </StatusBadge>
                                    )}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {formatTime(trip.started_at)}
                                    </span>
                                    {trip.duration_seconds && (
                                        <span>{formatDuration(trip.duration_seconds)}</span>
                                    )}
                                    {trip.distance_miles && (
                                        <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {units === 'metric'
                                                ? `${milesToKm(trip.distance_miles).toFixed(1)} km`
                                                : `${trip.distance_miles.toFixed(1)} mi`
                                            }
                                        </span>
                                    )}
                                    {trip.energy_used_kwh && (
                                        <span className="flex items-center gap-1">
                                            <Battery className="h-3 w-3" />
                                            {trip.energy_used_kwh.toFixed(1)} kWh
                                        </span>
                                    )}
                                    {trip.efficiency_wh_mi && (
                                        <span className="flex items-center gap-1">
                                            <TrendingUp className="h-3 w-3" />
                                            {units === 'metric'
                                                ? `${Math.round(trip.efficiency_wh_mi / 1.60934)} Wh/km`
                                                : `${Math.round(trip.efficiency_wh_mi)} Wh/mi`
                                            }
                                        </span>
                                    )}
                                    {trip.avg_outside_temp != null && (
                                        <span className="flex items-center gap-1">
                                            <Thermometer className="h-3 w-3" />
                                            {Math.round(trip.avg_outside_temp)}°C
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {trip.start_battery_level != null && (
                    <div className="mt-5 border-t border-slate-700/50 pt-4">
                        <div className="flex flex-1 items-center gap-3">
                            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Battery</div>
                            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-700">
                                {trip.end_battery_level != null && (
                                    <div
                                        className="absolute left-0 top-0 h-full bg-green-500"
                                        style={{ width: `${trip.end_battery_level}%` }}
                                    />
                                )}
                                {trip.end_battery_level != null && trip.end_battery_level < trip.start_battery_level && (
                                    <div
                                        className="absolute top-0 h-full bg-red-500/60"
                                        style={{
                                            left: `${trip.end_battery_level}%`,
                                            width: `${trip.start_battery_level - trip.end_battery_level}%`
                                        }}
                                    />
                                )}
                            </div>
                            <div className="whitespace-nowrap text-sm font-medium text-slate-300">
                                {trip.start_battery_level.toFixed(2)}%
                                {trip.end_battery_level != null && (
                                    <span> → {trip.end_battery_level.toFixed(2)}%</span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </Link>
        </div>
    );
}
