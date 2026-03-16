'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Battery,
  Gauge,
  Thermometer,
  MapPin,
  Lock,
  Unlock,
  Moon,
  RefreshCw,
  Car,
  Loader2,
  AlertCircle,
  Power,
  Clock,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useVehicleStore } from '@/stores/vehicleStore';
import Header from '@/components/Header';
import dynamic from 'next/dynamic';
import { fetchCachedJson, readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';
import type { AppSettingsSnapshot } from '@/lib/settings/appSettings';
import type { TeslaVehicleSummary } from '@/lib/tesla/vehicleSummaries';
import { fetchSharedLiveVehicleJson } from '@/lib/vehicle/liveData';

// Dynamic import for map component (client-side only)
const VehicleMap = dynamic(() => import('@/components/VehicleMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl bg-slate-700/30">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
    </div>
  ),
});

interface VehicleData {
  id: number;
  vin: string;
  display_name: string;
  state: string;
  battery_level: number;
  battery_range: number;
  charging_state: string;
  charge_limit_soc: number | null;
  charge_rate: number;
  charger_power: number;
  time_to_full_charge: number;
  charge_energy_added: number;
  inside_temp: number;
  outside_temp: number;
  odometer: number;
  locked: boolean;
  is_climate_on: boolean;
  latitude: number;
  longitude: number;
  sentry_mode: boolean;
  car_version: string;
  power: number;
  // Doors (0 = closed, 1 = open)
  df: number;  // driver front
  pf: number;  // passenger front
  dr: number;  // driver rear
  pr: number;  // passenger rear
  ft: number;  // frunk
  rt: number;  // trunk
  // Tire pressure (bar)
  tpms_pressure_fl: number;
  tpms_pressure_fr: number;
  tpms_pressure_rl: number;
  tpms_pressure_rr: number;
  // Window states (Closed, PartiallyOpen, Opened)
  fd_window?: string;
  fp_window?: string;
  rd_window?: string;
  rp_window?: string;
}

interface CachedData {
  vehicle: VehicleData;
  timestamp: number;
}

type VehicleCacheStore = Record<string, CachedData>;

type Vehicle = TeslaVehicleSummary;

type DashboardClientProps = {
  initialSettings: AppSettingsSnapshot;
  initialVehicles: Vehicle[];
  initialVehiclesError: string | null;
};

const CACHE_KEY = 'tripboard_vehicle_cache_v2';
const MAP_VIEWPORT_ROOT_MARGIN = '240px';
const VEHICLE_LIST_CACHE_TTL_MS = 60_000;
const FOCUS_RING_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900';
const SURFACE_CARD_CLASS = 'rounded-[28px] border border-slate-700/50 bg-slate-800/30';
const SUBCARD_CLASS = 'rounded-2xl border border-slate-700/40 bg-slate-900/18';
const SUBDUED_BADGE_CLASS = 'inline-flex items-center rounded-full border border-slate-700/55 bg-slate-900/28 px-3 py-1 text-xs font-medium text-slate-300';

function buildVehicleCacheKey(vehicleId: number, dataSource: string, region: string) {
  return `${dataSource}:${region}:${vehicleId}`;
}

function parseVehicleCache(raw: string | null): VehicleCacheStore {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, CachedData] => {
        const value = entry[1];
        return (
          !!value &&
          typeof value === 'object' &&
          'vehicle' in value &&
          'timestamp' in value
        );
      })
    );
  } catch {
    return {};
  }
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return mins === 1 ? '1 min ago' : `${mins} mins ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  const days = Math.floor(seconds / 86400);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function getStatusToneClasses(tone: 'live' | 'warning' | 'quiet' | 'danger') {
  switch (tone) {
    case 'live':
      return 'border-green-500/20 bg-green-500/10 text-green-300';
    case 'warning':
      return 'border-yellow-500/20 bg-yellow-500/10 text-yellow-300';
    case 'danger':
      return 'border-red-500/20 bg-red-500/10 text-red-300';
    default:
      return 'border-slate-700/70 bg-slate-800/80 text-slate-300';
  }
}

function getChargingStateLabel(chargingState: string) {
  if (chargingState === 'Disconnected') {
    return 'Not charging';
  }

  return chargingState;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatVehicleStateLabel(state: string) {
  const normalized = state.trim().toLowerCase();

  switch (normalized) {
    case 'charging':
      return { label: 'Charging', tone: 'live' as const };
    case 'driving':
      return { label: 'Driving', tone: 'live' as const };
    case 'parked':
      return { label: 'Parked', tone: 'quiet' as const };
    case 'online':
      return { label: 'Online', tone: 'live' as const };
    case 'offline':
      return { label: 'Offline', tone: 'danger' as const };
    case 'asleep':
    case 'sleeping':
      return { label: 'Sleeping', tone: 'quiet' as const };
    default:
      return {
        label: state
          .replace(/[_-]+/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase()),
        tone: 'quiet' as const,
      };
  }
}

export default function DashboardClient({
  initialSettings,
  initialVehicles,
  initialVehiclesError,
}: DashboardClientProps) {
  const applySnapshot = useSettingsStore((state) => state.applySnapshot);
  const setVehicleStoreVehicles = useVehicleStore((state) => state.setVehicles);
  const selectedVehicleId = useVehicleStore((state) => state.selectedVehicleId);
  const selectVehicleInStore = useVehicleStore((state) => state.selectVehicle);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(initialVehicles[0] || null);
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null);
  const [vehicleCache, setVehicleCache] = useState<VehicleCacheStore>({});
  const [loading, setLoading] = useState(initialVehicles.length === 0 && !initialVehiclesError);
  const [dataLoading, setDataLoading] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAsleep, setIsAsleep] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [streetAddress, setStreetAddress] = useState<string | null>(null);
  const [isLocationCardNearViewport, setIsLocationCardNearViewport] = useState(false);
  const locationCardRef = useRef<HTMLElement | null>(null);
  const geocodeCacheRef = useRef<Map<string, string>>(new Map());
  const vehicleFetchIdRef = useRef(0);

  const units = useSettingsStore((state) => state.units);
  const region = useSettingsStore((state) => state.region);
  const dataSource = useSettingsStore((state) => state.dataSource);
  const activeUnits = settingsHydrated ? units : initialSettings.units;
  const activeRegion = settingsHydrated ? region : initialSettings.region;
  const activeDataSource = settingsHydrated ? dataSource : initialSettings.dataSource;

  useEffect(() => {
    applySnapshot(initialSettings);
    setSettingsHydrated(true);
  }, [applySnapshot, initialSettings]);

  useEffect(() => {
    if (vehicles.length === 0) {
      return;
    }

    setVehicleStoreVehicles(
      vehicles.map((vehicle) => ({
        id: vehicle.id.toString(),
        vin: vehicle.vin,
        display_name: vehicle.display_name,
        state: (vehicle.state as 'online' | 'asleep' | 'offline'),
      }))
    );
  }, [vehicles, setVehicleStoreVehicles]);

  useEffect(() => {
    if (vehicles.length === 0) {
      return;
    }

    const preferredVehicle = selectedVehicleId
      ? vehicles.find((vehicle) => vehicle.id.toString() === selectedVehicleId)
      : null;
    const fallbackVehicle = selectedVehicle
      ? vehicles.find((vehicle) => vehicle.id === selectedVehicle.id) || vehicles[0]
      : vehicles[0];
    const nextVehicle = preferredVehicle || fallbackVehicle;

    if (!selectedVehicle || selectedVehicle.id !== nextVehicle.id) {
      setSelectedVehicle(nextVehicle);
    }

    if (selectedVehicleId !== nextVehicle.id.toString()) {
      selectVehicleInStore(nextVehicle.id.toString());
    }
  }, [vehicles, selectedVehicle, selectedVehicleId, selectVehicleInStore]);

  // Load cached data on mount
  useEffect(() => {
    setVehicleCache(parseVehicleCache(localStorage.getItem(CACHE_KEY)));
  }, []);

  const persistVehicleCache = useCallback((cacheKey: string, cacheEntry: CachedData) => {
    setVehicleCache((currentCache) => {
      const nextCache = {
        ...currentCache,
        [cacheKey]: cacheEntry,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(nextCache));
      return nextCache;
    });
  }, []);

  // Fetch vehicles list on mount
  const fetchVehicles = useCallback(async () => {
    const requestUrl = `/api/tesla/vehicles?summary=1&region=${activeRegion}`;
    const requestCacheKey = `dashboard:vehicles:${activeRegion}`;
    const cached = readCachedJson<{ success: boolean; vehicles: Vehicle[]; error?: string }>(requestCacheKey);

    if (cached?.success && cached.vehicles.length > 0) {
      setVehicles(cached.vehicles);
      setSelectedVehicle((currentVehicle) => {
        if (!currentVehicle) {
          return cached.vehicles[0];
        }

        return cached.vehicles.find((vehicle) => vehicle.id === currentVehicle.id) || cached.vehicles[0];
      });
      setLoading(false);
    }

    try {
      const data = await fetchCachedJson<{ success: boolean; vehicles: Vehicle[]; error?: string }>(
        requestCacheKey,
        async () => {
          const response = await fetch(requestUrl, {
            cache: 'no-store',
          });
          return response.json();
        },
        VEHICLE_LIST_CACHE_TTL_MS
      );

      if (data.success && data.vehicles.length > 0) {
        setVehicles(data.vehicles);
        setSelectedVehicle((currentVehicle) => (
          currentVehicle
            ? (data.vehicles.find((vehicle) => vehicle.id === currentVehicle.id) || data.vehicles[0])
            : data.vehicles[0]
        ));
      } else if (!data.success) {
        setError(data.error || 'Failed to fetch vehicles');
      }
    } catch {
      setError('Failed to connect to Tesla');
    } finally {
      setLoading(false);
    }
  }, [activeRegion]);

  useEffect(() => {
    void fetchVehicles();
  }, [fetchVehicles]);

  useEffect(() => {
    if (initialVehicles.length === 0) {
      return;
    }

    writeCachedJson(
      `dashboard:vehicles:${initialSettings.region}`,
      {
        success: true,
        vehicles: initialVehicles,
      },
      VEHICLE_LIST_CACHE_TTL_MS
    );
  }, [initialSettings.region, initialVehicles]);

  useEffect(() => {
    if (initialVehiclesError) {
      setError(initialVehiclesError);
      setLoading(false);
    }
  }, [initialVehiclesError]);

  // Fetch vehicle data when selected vehicle changes
  const fetchVehicleData = useCallback(async (vehicleId: number) => {
    const requestId = ++vehicleFetchIdRef.current;
    const cacheKey = buildVehicleCacheKey(vehicleId, activeDataSource, activeRegion);

    setDataLoading(true);
    setIsAsleep(false);
    setError(null);

    try {
      const endpoint = activeDataSource === 'telemetry'
        ? '/api/tesla/telemetry-status'
        : `/api/tesla/vehicle-data?id=${vehicleId}&region=${activeRegion}`;
      const liveCacheKey = activeDataSource === 'telemetry'
        ? 'vehicle-live:telemetry'
        : `vehicle-live:polling:${activeRegion}:${vehicleId}`;
      const data = await fetchSharedLiveVehicleJson<{
        success?: boolean;
        state?: string;
        timestamp?: number;
        vehicle?: VehicleData;
        status?: string;
        error?: string;
      }>(liveCacheKey, endpoint);

      if (requestId !== vehicleFetchIdRef.current) {
        return;
      }

      if (data.success && data.vehicle) {
        if (data.state === 'asleep') {
          setIsAsleep(true);
          setVehicleData(null);
          // Keep using cached data but don't update it
        } else {
          setVehicleData(data.vehicle);
          // Use timestamp from API response (properly formatted in telemetry endpoint)
          const timestamp = data.timestamp || Date.now();
          setLastUpdated(timestamp);
          setIsAsleep(false);
          persistVehicleCache(cacheKey, {
            vehicle: data.vehicle,
            timestamp,
          });
        }
      } else if (data.status === 'waiting_for_telemetry') {
        // No telemetry data yet
        setError('No telemetry data received yet. Make sure your ingester is running.');
      } else {
        setError(data.error || 'Failed to fetch vehicle data');
      }
    } catch {
      setError('Failed to fetch vehicle data');
    } finally {
      if (requestId === vehicleFetchIdRef.current) {
        setDataLoading(false);
      }
    }
  }, [activeDataSource, activeRegion, persistVehicleCache]);

  useEffect(() => {
    if (selectedVehicle) {
      setVehicleData(null);
      setLastUpdated(null);
      setWaking(false);
      setIsLocationCardNearViewport(false);
      void fetchVehicleData(selectedVehicle.id);
    }
  }, [selectedVehicle, fetchVehicleData]);

  const handleWakeAndRefresh = async () => {
    if (!selectedVehicle) return;

    const wakeRequestId = ++vehicleFetchIdRef.current;
    const wakeVehicleId = selectedVehicle.id;
    const wakeCacheKey = buildVehicleCacheKey(wakeVehicleId, activeDataSource, activeRegion);

    setWaking(true);
    setError(null);

    try {
      const wakeResponse = await fetch(`/api/tesla/wake?region=${activeRegion}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: wakeVehicleId }),
      });
      const wakeData = await wakeResponse.json();

      if (!wakeData.success) {
        setError(wakeData.error || 'Failed to wake vehicle');
        setWaking(false);
        return;
      }

      let attempts = 0;
      const maxAttempts = 15;

      const pollForData = async () => {
        attempts++;
        const data = await fetchSharedLiveVehicleJson<{
          success?: boolean;
          state?: string;
          timestamp?: number;
          vehicle?: VehicleData;
        }>(
          `vehicle-live:polling:${activeRegion}:${wakeVehicleId}`,
          `/api/tesla/vehicle-data?id=${wakeVehicleId}&region=${activeRegion}`
        );

        if (wakeRequestId !== vehicleFetchIdRef.current) {
          return;
        }

        if (data.success && data.vehicle && data.state !== 'asleep') {
          const timestamp = data.timestamp || Date.now();
          setVehicleData(data.vehicle);
          setLastUpdated(timestamp);
          setIsAsleep(false);
          setWaking(false);
          persistVehicleCache(wakeCacheKey, {
            vehicle: data.vehicle,
            timestamp,
          });
        } else if (attempts < maxAttempts) {
          setTimeout(pollForData, 2000);
        } else {
          setError('Vehicle is taking too long to wake up. Please try again.');
          setWaking(false);
        }
      };

      setTimeout(pollForData, 3000);
    } catch {
      setError('Failed to wake vehicle');
      setWaking(false);
    }
  };

  const handleRefresh = () => {
    if (selectedVehicle) {
      void fetchVehicleData(selectedVehicle.id);
    }
  };

  // Unit conversion helpers
  const formatDistance = (miles: number) => {
    if (activeUnits === 'metric') {
      return `${Math.round(miles * 1.60934).toLocaleString()} km`;
    }
    return `${Math.round(miles).toLocaleString()} mi`;
  };

  const formatTemp = (celsius: number) => {
    if (activeUnits === 'imperial') {
      return `${Math.round(celsius * 9 / 5 + 32)}°F`;
    }
    return `${Math.round(celsius)}°C`;
  };

  const cachedData = selectedVehicle
    ? vehicleCache[buildVehicleCacheKey(selectedVehicle.id, activeDataSource, activeRegion)] ?? null
    : null;

  // Data to display (current or cached)
  const displayData = vehicleData || cachedData?.vehicle || null;
  const displayTimestamp = vehicleData ? lastUpdated : cachedData?.timestamp;
  const isShowingCachedSnapshot = !vehicleData && !!cachedData;
  const cachedSnapshotAgeLabel = cachedData ? formatTimeAgo(cachedData.timestamp) : null;
  const snapshotAgeMs = displayTimestamp ? Date.now() - displayTimestamp : null;
  const isSnapshotStale = snapshotAgeMs !== null && snapshotAgeMs > 6 * 60 * 60 * 1000;

  const vehicleStatusMeta = (() => {
    if (waking) {
      return {
        label: 'Waking',
        tone: 'warning' as const,
        message: 'Sending a wake request and waiting for fresh vehicle data.',
      };
    }

    if (error && !displayData) {
      return {
        label: 'Disconnected',
        tone: 'danger' as const,
        message: error,
      };
    }

    if (isAsleep && cachedSnapshotAgeLabel) {
      return {
        label: 'Sleeping',
        tone: 'quiet' as const,
        message: `Vehicle is asleep. Showing the last known snapshot from ${cachedSnapshotAgeLabel}.`,
      };
    }

    if (isShowingCachedSnapshot && cachedSnapshotAgeLabel) {
      return {
        label: 'Cached',
        tone: isSnapshotStale ? 'warning' as const : 'quiet' as const,
        message: `Showing a cached snapshot from ${cachedSnapshotAgeLabel} while live data refreshes.`,
      };
    }

    if (isSnapshotStale && displayTimestamp) {
      return {
        label: 'Stale',
        tone: 'warning' as const,
        message: `Latest available data is ${formatTimeAgo(displayTimestamp)} old. Refresh to request a newer snapshot.`,
      };
    }

    if (displayTimestamp) {
      return {
        label: dataLoading ? 'Refreshing' : 'Live',
        tone: 'live' as const,
        message: `Latest vehicle snapshot updated ${formatTimeAgo(displayTimestamp)}.`,
      };
    }

    return {
      label: 'Waiting',
      tone: 'quiet' as const,
      message: 'Waiting for vehicle data.',
    };
  })();

  const titleStatusMeta = displayData?.state
    ? formatVehicleStateLabel(displayData.state)
    : {
      label: vehicleStatusMeta.label,
      tone: vehicleStatusMeta.tone,
    };

  const doorStatuses = displayData ? [
    { label: 'Driver Front', isOpen: displayData.df === 1, windowState: displayData.fd_window },
    { label: 'Pass. Front', isOpen: displayData.pf === 1, windowState: displayData.fp_window },
    { label: 'Driver Rear', isOpen: displayData.dr === 1, windowState: displayData.rd_window },
    { label: 'Pass. Rear', isOpen: displayData.pr === 1, windowState: displayData.rp_window },
    { label: 'Frunk', isOpen: displayData.ft === 1 },
    { label: 'Trunk', isOpen: displayData.rt === 1 },
  ] : [];
  const openingsNeedingAttention = doorStatuses.filter((entry) => entry.isOpen || (entry.windowState && entry.windowState !== 'Closed'));
  const openingsSummary = openingsNeedingAttention.length === 0
    ? 'All openings closed'
    : `${openingsNeedingAttention.length} opening${openingsNeedingAttention.length === 1 ? '' : 's'} need attention`;
  const doorEntries = doorStatuses.filter((entry) => !['Frunk', 'Trunk'].includes(entry.label));
  const cargoEntries = doorStatuses.filter((entry) => ['Frunk', 'Trunk'].includes(entry.label));
  const windowEntries = doorStatuses
    .filter((entry) => entry.windowState !== undefined)
    .map((entry) => ({
      label: entry.label,
      isOpen: entry.windowState !== 'Closed',
    }));

  const batteryLevelPercent = displayData ? clampPercent(displayData.battery_level) : 0;
  const chargeLimitPercent = displayData?.charge_limit_soc;
  const hasChargeLimit = typeof chargeLimitPercent === 'number' && Number.isFinite(chargeLimitPercent);
  const clampedChargeLimitPercent = hasChargeLimit ? clampPercent(chargeLimitPercent) : null;
  const chargeLimitDeltaPercent = clampedChargeLimitPercent === null
    ? 0
    : Math.max(0, clampedChargeLimitPercent - batteryLevelPercent);

  useEffect(() => {
    if (
      isLocationCardNearViewport ||
      !locationCardRef.current ||
      !displayData?.latitude ||
      !displayData?.longitude
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsLocationCardNearViewport(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: MAP_VIEWPORT_ROOT_MARGIN }
    );

    observer.observe(locationCardRef.current);

    return () => observer.disconnect();
  }, [displayData?.latitude, displayData?.longitude, isLocationCardNearViewport]);

  // Reverse geocode via the shared API route so address formatting stays
  // consistent across dashboard, trips, and charging views.
  useEffect(() => {
    if (
      !isLocationCardNearViewport ||
      !displayData?.latitude ||
      !displayData?.longitude
    ) {
      setStreetAddress(null);
      return;
    }
    const lat = displayData.latitude;
    const lon = displayData.longitude;
    const cacheKey = `${lat},${lon}`;
    const cachedAddress = geocodeCacheRef.current.get(cacheKey);

    if (cachedAddress) {
      setStreetAddress(cachedAddress);
      return;
    }

    const controller = new AbortController();

    fetch(`/api/geocode?lat=${lat}&lng=${lon}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        const nextAddress = data?.success && data?.address
          ? data.address
          : data?.fallback || null;

        if (nextAddress) {
          geocodeCacheRef.current.set(cacheKey, nextAddress);
        }

        setStreetAddress(nextAddress);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setStreetAddress(null);
      });

    return () => controller.abort();
  }, [displayData?.latitude, displayData?.longitude, isLocationCardNearViewport]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (error && vehicles.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-lg text-slate-400">{error}</p>
        <Link
          href="/auth/login"
          className="rounded-xl bg-red-500 px-6 py-3 font-semibold text-white"
        >
          Connect Tesla
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 pb-20 pt-6 md:pb-8">
        <section className={`mb-6 px-6 py-5 shadow-[0_18px_56px_-44px_rgba(15,23,42,0.85)] ${SURFACE_CARD_CLASS}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {selectedVehicle?.display_name ?? 'Vehicle overview'}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${getStatusToneClasses(titleStatusMeta.tone)}`}
                >
                  {titleStatusMeta.label}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap gap-3 lg:justify-end">
              {displayTimestamp && (
                <span className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/30 px-4 text-sm text-slate-100">
                  <Clock className="h-3.5 w-3.5 text-slate-300" />
                  Updated {formatTimeAgo(displayTimestamp)}
                </span>
              )}
              {isAsleep && !waking && (
                <button
                  onClick={handleWakeAndRefresh}
                  className={`flex h-11 items-center gap-2 rounded-2xl bg-red-500 px-5 text-sm font-medium text-white transition-colors hover:bg-red-600 ${FOCUS_RING_CLASS}`}
                >
                  <Power className="h-4 w-4" />
                  Wake & Refresh
                </button>
              )}
              <button
                onClick={handleRefresh}
                disabled={dataLoading || waking}
                className={`flex h-11 items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-800/80 px-5 text-sm font-medium text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-700/80 disabled:opacity-50 ${FOCUS_RING_CLASS}`}
              >
                <RefreshCw className={`h-4 w-4 ${dataLoading ? 'animate-spin' : ''}`} />
                Refresh data
              </button>
            </div>
            </div>
          </div>
        </section>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
            <p>{error}</p>
          </div>
        )}

        {/* Waking State */}
        {waking && (
          <div className="mb-8 flex flex-col items-center justify-center rounded-2xl border border-yellow-500/30 bg-yellow-500/10 py-16">
            <Loader2 className="mb-4 h-12 w-12 animate-spin text-yellow-400" />
            <h2 className="text-xl font-semibold text-yellow-400">Waking Vehicle...</h2>
            <p className="mt-2 text-slate-400">
              This may take up to 30 seconds
            </p>
          </div>
        )}

        {/* Asleep State with Cached Data */}
        {isAsleep && !waking && !cachedData && (
          <div className="mb-8 flex flex-col items-center justify-center rounded-2xl border border-slate-700/50 bg-slate-800/30 py-16">
            <Moon className="mb-4 h-12 w-12 text-slate-500" />
            <h2 className="text-xl font-semibold text-slate-400">Vehicle is Sleeping</h2>
            <p className="mt-2 text-slate-500">
              Click &quot;Wake &amp; Refresh&quot; to get live data
            </p>
          </div>
        )}

        {/* Vehicle Data (live or cached) */}
        {displayData && !waking && (
          <>
            <div className="mb-6 grid gap-5 xl:grid-cols-2">
              <section className={`flex h-full flex-col p-6 ${SURFACE_CARD_CLASS}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Car className="h-6 w-6 text-slate-200" />
                    <h2 className="text-lg font-semibold text-white">Vehicle details</h2>
                  </div>
                  <div className="flex min-w-[12rem] flex-col items-start gap-2 text-sm sm:items-end">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-2 text-lg font-semibold text-slate-300">
                        <Thermometer className="h-4 w-4 text-slate-400" />
                        Ext: {formatTemp(displayData.outside_temp)}
                      </span>
                      <span className="inline-flex items-center gap-2 text-lg font-semibold text-green-300">
                        <Thermometer className="h-4 w-4" />
                        Int: {formatTemp(displayData.inside_temp)}
                      </span>
                    </div>
                    <span className="text-slate-300">
                      Cabin conditioning is <span className={displayData.is_climate_on ? 'text-green-300' : 'text-slate-100'}>
                        {displayData.is_climate_on ? 'ON' : 'OFF'}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="mt-7 flex flex-1 flex-col justify-center">
                  <div className="space-y-[1.125rem]">
                    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
                      <div className="flex items-end gap-4">
                        <Battery className="mb-2 h-10 w-10 -rotate-90 text-green-400" />
                        <p className="text-6xl font-semibold tracking-tight text-white">
                          {batteryLevelPercent}%
                        </p>
                      </div>
                      <p className="pb-1 text-5xl font-medium tracking-tight text-slate-100">
                        {formatDistance(displayData.battery_range)}
                      </p>
                    </div>

                    <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-700/75">
                      {clampedChargeLimitPercent !== null && (
                        <div
                          className="absolute left-0 top-0 h-full rounded-full bg-slate-500/55"
                          style={{ width: `${clampedChargeLimitPercent}%` }}
                        />
                      )}
                      <div
                        className={`h-full rounded-full transition-all ${Math.round(displayData.battery_level) > 20 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${batteryLevelPercent}%` }}
                      />
                      {clampedChargeLimitPercent !== null && chargeLimitDeltaPercent > 0 && (
                        <div
                          className="absolute top-0 h-full bg-slate-500/55"
                          style={{
                            left: `${batteryLevelPercent}%`,
                            width: `${chargeLimitDeltaPercent}%`,
                          }}
                        />
                      )}
                      {clampedChargeLimitPercent !== null && (
                        <div
                          className="absolute inset-y-[-2px] z-10 w-px bg-slate-100/80"
                          style={{ left: `${clampedChargeLimitPercent}%` }}
                        />
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
                      <span className={displayData.charging_state === 'Charging'
                        ? `inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getStatusToneClasses('live')}`
                        : SUBDUED_BADGE_CLASS}
                      >
                        {displayData.charging_state === 'Charging' ? 'Charging' : getChargingStateLabel(displayData.charging_state)}
                      </span>
                      <span className={SUBDUED_BADGE_CLASS}>
                        {clampedChargeLimitPercent !== null
                          ? `Charge limit ${clampedChargeLimitPercent}%`
                          : 'Charge limit unavailable'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 border-t border-slate-700/40 pt-4 sm:grid-cols-3">
                    <div className="text-center">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Odometer</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                        {formatDistance(displayData.odometer)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Security</p>
                      <p className={`mt-2 text-lg font-semibold ${displayData.locked ? 'text-green-300' : 'text-red-400'}`}>
                        {displayData.locked ? 'Locked' : 'Unlocked'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sentry mode</p>
                      <p className={`mt-2 text-lg font-semibold ${displayData.sentry_mode ? 'text-green-300' : 'text-slate-200'}`}>
                        {displayData.sentry_mode ? 'Enabled' : 'Off'}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {displayData.latitude && displayData.longitude && (
                <section
                  ref={locationCardRef}
                  className={`flex h-full flex-col p-6 ${SURFACE_CARD_CLASS}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <MapPin className="h-5 w-5 text-red-400" />
                        <h2 className="text-lg font-semibold text-white">Vehicle Location</h2>
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${displayData.latitude},${displayData.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`text-sm leading-6 text-slate-300 underline-offset-4 transition-colors hover:text-white hover:underline ${FOCUS_RING_CLASS}`}
                      >
                        {streetAddress
                          ? streetAddress
                          : `${displayData.latitude.toFixed(4)}, ${displayData.longitude.toFixed(4)}`}
                      </a>
                    </div>
                    {isAsleep && (
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getStatusToneClasses('quiet')}`}>
                        Last known
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-1">
                    {isLocationCardNearViewport ? (
                      <VehicleMap
                        latitude={displayData.latitude}
                        longitude={displayData.longitude}
                        vehicleName={displayData.display_name}
                        className="h-full min-h-[15.5rem] w-full overflow-hidden rounded-2xl bg-slate-700/30"
                      />
                    ) : (
                      <div className={`h-full min-h-[15.5rem] w-full animate-pulse ${SUBCARD_CLASS}`} />
                    )}
                  </div>

                </section>
              )}
            </div>

            {isShowingCachedSnapshot && (
              <div className="mb-5 flex items-center gap-2 rounded-2xl border border-yellow-500/15 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                <Moon className="h-4 w-4 text-yellow-300" />
                <span>
                  {isAsleep
                    ? `Vehicle is sleeping. Showing the last known snapshot from ${cachedSnapshotAgeLabel}.`
                    : `Live refresh is in progress. Showing a cached snapshot from ${cachedSnapshotAgeLabel}.`}
                </span>
              </div>
            )}

            <div className="mb-6 space-y-5">
              <DoorsOpeningsCard
                openingsSummary={openingsSummary}
                openingsNeedAttention={openingsNeedingAttention.length > 0}
                doorEntries={doorEntries}
                cargoEntries={cargoEntries}
                windowEntries={windowEntries}
              />
              <TirePressureOverviewCard
                frontLeft={displayData.tpms_pressure_fl}
                frontRight={displayData.tpms_pressure_fr}
                rearLeft={displayData.tpms_pressure_rl}
                rearRight={displayData.tpms_pressure_rr}
              />
            </div>
          </>
        )}

        {/* Loading State */}
        {dataLoading && !displayData && !isAsleep && !waking && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-red-500" />
          </div>
        )}
      </main>
    </div>
  );
}

function TirePressureOverviewCard({
  frontLeft,
  frontRight,
  rearLeft,
  rearRight,
}: {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
}) {
  const tires = [
    { label: 'Front Left', pressure: frontLeft },
    { label: 'Front Right', pressure: frontRight },
    { label: 'Rear Left', pressure: rearLeft },
    { label: 'Rear Right', pressure: rearRight },
  ];

  const hasPressureData = tires.some((tire) => tire.pressure);

  return (
    <div className={`flex h-full flex-col p-6 ${SURFACE_CARD_CLASS}`}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-3">
          <Gauge className="h-6 w-6 text-orange-300" />
          <h2 className="text-lg font-semibold text-white">Tire pressure</h2>
        </div>
      </div>
      {hasPressureData ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {tires.map((tire) => (
            <div key={tire.label} className={`relative flex min-h-[7.25rem] flex-col justify-center p-4 ${SUBCARD_CLASS}`}>
              <span
                className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${tire.pressure
                  ? Math.round(tire.pressure * 14.5) < 35
                    ? 'bg-red-400'
                    : 'bg-green-400'
                  : 'bg-slate-500'}`}
              />
              <p className="text-center text-xs font-medium text-slate-400">{tire.label}</p>
              <div className="mt-2.5 flex items-end justify-center gap-x-2.5 gap-y-1">
                <p className="text-[2.2rem] font-semibold leading-none tracking-tight text-white">
                  {tire.pressure ? Math.round(tire.pressure * 14.5) : '--'}
                </p>
                <p className="pb-0.5 text-base font-medium text-slate-100">PSI</p>
              </div>
              <p className="mt-1 text-center text-sm text-slate-400">
                {tire.pressure ? `${tire.pressure.toFixed(2)} bar` : '-- bar'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">
          Tire pressure data requires expanded telemetry subscription.
        </p>
      )}
    </div>
  );
}

function DoorsOpeningsCard({
  openingsSummary,
  openingsNeedAttention,
  doorEntries,
  cargoEntries,
  windowEntries,
}: {
  openingsSummary: string;
  openingsNeedAttention: boolean;
  doorEntries: Array<{ label: string; isOpen: boolean }>;
  cargoEntries: Array<{ label: string; isOpen: boolean }>;
  windowEntries: Array<{ label: string; isOpen: boolean }>;
}) {
  const windowStatusByLabel = new Map(windowEntries.map((entry) => [entry.label, entry.isOpen]));
  const tiles = [
    ...doorEntries.map((entry) => ({
      label: entry.label,
      isOpen: entry.isOpen,
      windowIsOpen: windowStatusByLabel.get(entry.label) ?? null,
    })),
    ...cargoEntries.map((entry) => ({
      label: entry.label,
      isOpen: entry.isOpen,
      windowIsOpen: null,
    })),
  ];

  return (
    <div className={`flex h-full flex-col p-6 ${SURFACE_CARD_CLASS}`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Car className="h-6 w-6 text-red-400" />
            <h2 className="text-lg font-semibold text-white">Doors &amp; openings</h2>
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${openingsNeedAttention
            ? getStatusToneClasses('warning')
            : getStatusToneClasses('live')}`}
        >
          {openingsSummary}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {tiles.map((entry) => (
          <OpeningTile
            key={entry.label}
            label={entry.label}
            isOpen={entry.isOpen}
            windowIsOpen={entry.windowIsOpen}
          />
        ))}
      </div>
    </div>
  );
}

function OpeningTile({
  label,
  isOpen,
  windowIsOpen,
}: {
  label: string;
  isOpen: boolean;
  windowIsOpen: boolean | null;
}) {
  const hasWindowIssue = windowIsOpen === true;
  const iconClasses = isOpen
    ? 'bg-red-500/20 text-red-400'
    : hasWindowIssue
      ? 'bg-orange-500/20 text-orange-300'
      : 'bg-green-500/20 text-green-400';
  const statusClasses = isOpen ? 'text-red-400' : 'text-green-300';
  const primaryStatus = isOpen ? 'Open' : 'Closed';

  return (
    <div className={`flex min-h-[7.75rem] flex-col items-center rounded-2xl border border-slate-700/40 bg-slate-900/18 p-4 text-center`}>
      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${iconClasses}`}>
        {isOpen ? (
          <Unlock className="h-4 w-4" />
        ) : hasWindowIssue ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
      </div>
      <p className="mt-3 text-sm text-slate-100">{label}</p>
      <p className={`mt-2 text-sm font-medium ${statusClasses}`}>
        {primaryStatus}
      </p>
      {windowIsOpen !== null && (
        <p className={`mt-1 text-xs ${hasWindowIssue ? 'text-orange-300' : 'text-slate-400'}`}>
          Window {windowIsOpen ? 'open' : 'closed'}
        </p>
      )}
    </div>
  );
}
