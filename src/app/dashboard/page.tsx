'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { handleSignOut } from '@/lib/utils/auth';
import {
  Zap,
  Battery,
  Gauge,
  Thermometer,
  MapPin,
  Lock,
  Unlock,
  Sun,
  Moon,
  History,
  BarChart3,
  Settings,
  LogOut,
  RefreshCw,
  Car,
  Loader2,
  AlertCircle,
  Power,
  Clock,
  Cpu,
  BatteryCharging,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import dynamic from 'next/dynamic';

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
  charge_limit_soc: number;
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

interface Vehicle {
  id: number;
  display_name: string;
  vin: string;
  state: string;
}

const CACHE_KEY = 'tripboard_vehicle_cache';

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null);
  const [cachedData, setCachedData] = useState<CachedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAsleep, setIsAsleep] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [streetAddress, setStreetAddress] = useState<string | null>(null);

  const { units, region, dataSource } = useSettingsStore();

  // Load cached data on mount
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        setCachedData(JSON.parse(cached));
      } catch { /* ignore */ }
    }
  }, []);

  // Fetch vehicles list on mount
  useEffect(() => {
    fetchVehicles();
  }, []);

  // Fetch vehicle data when selected vehicle changes
  useEffect(() => {
    if (selectedVehicle) {
      fetchVehicleData(selectedVehicle.id);
    }
  }, [selectedVehicle]);

  const fetchVehicles = async () => {
    try {
      const response = await fetch('/api/tesla/test');
      const data = await response.json();

      if (data.success && data.vehicles.length > 0) {
        setVehicles(data.vehicles);
        setSelectedVehicle(data.vehicles[0]);
      } else if (!data.success) {
        setError(data.error || 'Failed to fetch vehicles');
      }
    } catch {
      setError('Failed to connect to Tesla');
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicleData = useCallback(async (vehicleId: number) => {
    setDataLoading(true);
    setIsAsleep(false);

    try {
      // Use telemetry endpoint if dataSource is 'telemetry'
      const endpoint = dataSource === 'telemetry'
        ? '/api/tesla/telemetry-status'
        : `/api/tesla/vehicle-data?id=${vehicleId}&region=${region}`;

      const response = await fetch(endpoint);
      const data = await response.json();

      if (data.success) {
        if (data.state === 'asleep') {
          setIsAsleep(true);
          setVehicleData(null);
          // Keep using cached data but don't update it
        } else {
          setVehicleData(data.vehicle);
          // Use timestamp from API response (properly formatted in telemetry endpoint)
          setLastUpdated(data.timestamp || Date.now());
          setIsAsleep(false);
          // Cache the data
          const cacheEntry: CachedData = {
            vehicle: data.vehicle,
            timestamp: data.timestamp || Date.now(),
          };
          setCachedData(cacheEntry);
          localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
        }
      } else if (data.status === 'waiting_for_telemetry') {
        // No telemetry data yet
        setError('No telemetry data received yet. Make sure your ingester is running.');
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to fetch vehicle data');
    } finally {
      setDataLoading(false);
    }
  }, [region, dataSource]);

  const handleWakeAndRefresh = async () => {
    if (!selectedVehicle) return;

    setWaking(true);
    setError(null);

    try {
      const wakeResponse = await fetch(`/api/tesla/wake?region=${region}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: selectedVehicle.id }),
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
        const response = await fetch(`/api/tesla/vehicle-data?id=${selectedVehicle.id}&region=${region}`);
        const data = await response.json();

        if (data.success && data.state !== 'asleep') {
          setVehicleData(data.vehicle);
          setLastUpdated(data.timestamp || Date.now());
          setIsAsleep(false);
          setWaking(false);
          // Cache the data
          const cacheEntry: CachedData = {
            vehicle: data.vehicle,
            timestamp: data.timestamp || Date.now(),
          };
          setCachedData(cacheEntry);
          localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
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
      fetchVehicleData(selectedVehicle.id);
    }
  };

  // Unit conversion helpers
  const formatDistance = (miles: number) => {
    if (units === 'metric') {
      return `${Math.round(miles * 1.60934).toLocaleString()} km`;
    }
    return `${Math.round(miles).toLocaleString()} mi`;
  };

  const formatTemp = (celsius: number) => {
    if (units === 'imperial') {
      return `${Math.round(celsius * 9 / 5 + 32)}°F`;
    }
    return `${Math.round(celsius)}°C`;
  };

  // Data to display (current or cached)
  const displayData = vehicleData || (isAsleep && cachedData?.vehicle) || null;
  const displayTimestamp = vehicleData ? lastUpdated : cachedData?.timestamp;

  // Reverse geocode to get street address
  useEffect(() => {
    if (!displayData?.latitude || !displayData?.longitude) {
      setStreetAddress(null);
      return;
    }
    const lat = displayData.latitude;
    const lon = displayData.longitude;

    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
      .then(res => res.json())
      .then(data => {
        if (data?.display_name) {
          // Shorten the address: take first 2-3 parts
          const parts = data.display_name.split(', ');
          const short = parts.slice(0, 3).join(', ');
          setStreetAddress(short);
        }
      })
      .catch(() => setStreetAddress(null));
  }, [displayData?.latitude, displayData?.longitude]);

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
            <NavLink href="/dashboard" icon={<Gauge className="h-4 w-4" />} active>
              Dashboard
            </NavLink>
            <NavLink href="/dashboard/trips" icon={<History className="h-4 w-4" />}>
              Trips
            </NavLink>
            <NavLink href="/dashboard/analytics" icon={<BarChart3 className="h-4 w-4" />}>
              Analytics
            </NavLink>
            <NavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />}>
              Settings
            </NavLink>
          </nav>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Vehicle Selector & Refresh */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Car className="h-6 w-6 text-red-400" />
            <select
              value={selectedVehicle?.id || ''}
              onChange={(e) => {
                const v = vehicles.find((v) => v.id === Number(e.target.value));
                if (v) setSelectedVehicle(v);
              }}
              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-white"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.display_name}
                </option>
              ))}
            </select>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${waking
                ? 'bg-yellow-500/20 text-yellow-400'
                : isAsleep
                  ? 'bg-slate-700 text-slate-400'
                  : 'bg-green-500/20 text-green-400'
                }`}
            >
              {waking ? 'Waking...' : isAsleep ? 'Asleep' : 'Online'}
            </span>
            {displayTimestamp && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3 w-3" />
                {formatTimeAgo(displayTimestamp)}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {isAsleep && !waking && (
              <button
                onClick={handleWakeAndRefresh}
                className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                <Power className="h-4 w-4" />
                Wake & Refresh
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={dataLoading || waking}
              className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${dataLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-xl bg-red-500/10 p-4 text-red-400">
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
            {/* Cached Data Banner */}
            {isAsleep && cachedData && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-slate-700/50 px-4 py-2 text-sm text-slate-400">
                <Moon className="h-4 w-4" />
                <span>Vehicle is sleeping. Showing last known data from {formatTimeAgo(cachedData.timestamp)}</span>
              </div>
            )}

            {/* Battery Card */}
            <div className="mb-8 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Battery className="h-6 w-6 text-green-400" />
                  <h2 className="text-lg font-semibold">Battery</h2>
                </div>
                <span className="text-sm text-slate-400">
                  {displayData.charging_state === 'Charging' ? '⚡ Charging' : displayData.charging_state}
                </span>
              </div>

              {/* Battery Visualization */}
              <div className="mb-4">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-400">Charge Level</span>
                  <span className="font-semibold">{Math.round(displayData.battery_level)}%</span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all ${Math.round(displayData.battery_level) > 20 ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    style={{ width: `${Math.round(displayData.battery_level)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>Limit: {displayData.charge_limit_soc}%</span>
                  <span>~{formatDistance(displayData.battery_range)} range</span>
                </div>
              </div>

              {/* Charging Info */}
              {displayData.charging_state === 'Charging' && (
                <div className="mt-4 grid grid-cols-3 gap-4 rounded-xl bg-green-500/10 p-4">
                  <div className="text-center">
                    <p className="text-xs text-slate-400">Time to Full</p>
                    <p className="text-lg font-semibold text-green-400">
                      {displayData.time_to_full_charge ? `${displayData.time_to_full_charge.toFixed(1)}h` : '-'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400">Power</p>
                    <p className="text-lg font-semibold text-green-400">
                      {displayData.charger_power ? `${displayData.charger_power} kW` : '-'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400">Energy Added</p>
                    <p className="text-lg font-semibold text-green-400">
                      {displayData.charge_energy_added ? `${displayData.charge_energy_added.toFixed(1)} kWh` : '-'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Stats Grid - Single Row with 5 cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard
                icon={<Gauge className="h-5 w-5" />}
                label="Odometer"
                value={formatDistance(displayData.odometer)}
                color="blue"
              />
              <StatCard
                icon={<Thermometer className="h-5 w-5" />}
                label="Temperature"
                value={`${formatTemp(displayData.inside_temp)} inside`}
                subvalue={`${formatTemp(displayData.outside_temp)} outside`}
                color="orange"
              />
              <StatCard
                icon={displayData.locked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                label="Security"
                value={displayData.locked ? 'Locked' : 'Unlocked'}
                subvalue={displayData.sentry_mode ? 'Sentry On' : 'Sentry Off'}
                color={displayData.locked ? 'green' : 'red'}
              />
              <StatCard
                icon={displayData.is_climate_on ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                label="Climate"
                value={displayData.is_climate_on ? 'On' : 'Off'}
                color="purple"
              />
              <StatCard
                icon={<BatteryCharging className="h-5 w-5" />}
                label="Range"
                value={formatDistance(displayData.battery_range)}
                subvalue={`${Math.round(displayData.battery_level)}% charged`}
                color="green"
              />
            </div>

            {/* Location Map - Right after stats */}
            {displayData.latitude && displayData.longitude && (
              <div className="mt-6 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-red-400" />
                    <span className="font-medium">Vehicle Location</span>
                    {isAsleep && (
                      <span className="text-xs text-slate-500">(last known)</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">
                    {displayData.latitude.toFixed(5)}, {displayData.longitude.toFixed(5)}
                  </span>
                </div>
                {streetAddress && (
                  <p className="mb-4 text-slate-300">{streetAddress}</p>
                )}
                <VehicleMap
                  latitude={displayData.latitude}
                  longitude={displayData.longitude}
                  vehicleName={displayData.display_name}
                />
              </div>
            )}

            {/* Doors & Openings - Show in both modes */}
            <div className="mt-6 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
              <div className="mb-4 flex items-center gap-3">
                <Car className="h-5 w-5 text-blue-400" />
                <span className="font-medium">Doors & Openings</span>
              </div>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                <DoorStatus label="Driver Front" isOpen={displayData.df === 1} windowState={displayData.fd_window} />
                <DoorStatus label="Pass. Front" isOpen={displayData.pf === 1} windowState={displayData.fp_window} />
                <DoorStatus label="Driver Rear" isOpen={displayData.dr === 1} windowState={displayData.rd_window} />
                <DoorStatus label="Pass. Rear" isOpen={displayData.pr === 1} windowState={displayData.rp_window} />
                <DoorStatus label="Frunk" isOpen={displayData.ft === 1} />
                <DoorStatus label="Trunk" isOpen={displayData.rt === 1} />
              </div>
            </div>

            {/* Tire Pressure - Show in both modes */}
            <div className="mt-6 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
              <div className="mb-4 flex items-center gap-3">
                <Gauge className="h-5 w-5 text-orange-400" />
                <span className="font-medium">Tire Pressure</span>
              </div>
              {displayData.tpms_pressure_fl ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <TirePressure label="Front Left" pressure={displayData.tpms_pressure_fl} />
                  <TirePressure label="Front Right" pressure={displayData.tpms_pressure_fr} />
                  <TirePressure label="Rear Left" pressure={displayData.tpms_pressure_rl} />
                  <TirePressure label="Rear Right" pressure={displayData.tpms_pressure_rr} />
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Tire pressure data requires expanded telemetry subscription.
                </p>
              )}
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
  subvalue,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subvalue?: string;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red';
}) {
  const colors = {
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-green-500/10 text-green-400',
    purple: 'bg-purple-500/10 text-purple-400',
    orange: 'bg-orange-500/10 text-orange-400',
    red: 'bg-red-500/10 text-red-400',
  };

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
      <div className={`mb-3 inline-flex rounded-lg p-2 ${colors[color]}`}>{icon}</div>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {subvalue && <p className="text-sm text-slate-500">{subvalue}</p>}
    </div>
  );
}

function DoorStatus({ label, isOpen, windowState }: { label: string; isOpen: boolean; windowState?: string }) {
  const windowOpen = windowState && windowState !== 'Closed';
  const hasIssue = isOpen || windowOpen;

  return (
    <div className="text-center">
      <div
        className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full ${hasIssue ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
          }`}
      >
        {isOpen ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      </div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-sm font-medium ${isOpen ? 'text-red-400' : 'text-green-400'}`}>
        {isOpen ? 'Open' : 'Closed'}
      </p>
      {windowState && (
        <p className={`text-xs mt-0.5 ${windowOpen ? 'text-orange-400' : 'text-slate-500'}`}>
          🪟 {windowOpen ? 'Open' : 'Closed'}
        </p>
      )}
    </div>
  );
}

function TirePressure({ label, pressure }: { label: string; pressure: number }) {
  // Convert bar to PSI for display if needed (1 bar ≈ 14.5 PSI)
  const psi = pressure ? Math.round(pressure * 14.5) : null;
  const isLow = psi !== null && psi < 35;

  return (
    <div className="text-center rounded-lg bg-slate-700/30 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${isLow ? 'text-orange-400' : 'text-slate-200'}`}>
        {psi !== null ? `${psi} PSI` : '--'}
      </p>
      <p className="text-xs text-slate-500">
        {pressure ? `${pressure.toFixed(2)} bar` : '--'}
      </p>
    </div>
  );
}
