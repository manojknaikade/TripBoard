'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';

interface VehicleData {
  id: number;
  vin: string;
  display_name: string;
  state: string;
  battery_level: number;
  battery_range: number;
  charging_state: string;
  charge_limit_soc: number;
  inside_temp: number;
  outside_temp: number;
  odometer: number;
  locked: boolean;
  is_climate_on: boolean;
  latitude: number;
  longitude: number;
  sentry_mode: boolean;
}

interface Vehicle {
  id: number;
  display_name: string;
  vin: string;
  state: string;
}

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAsleep, setIsAsleep] = useState(false);

  const { units, region } = useSettingsStore();

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

  const fetchVehicleData = async (vehicleId: number) => {
    setDataLoading(true);
    setIsAsleep(false);

    try {
      const response = await fetch(`/api/tesla/vehicle-data?id=${vehicleId}&region=${region}`);
      const data = await response.json();

      if (data.success) {
        if (data.state === 'asleep') {
          setIsAsleep(true);
          setVehicleData(null);
        } else {
          setVehicleData(data.vehicle);
          setIsAsleep(false);
        }
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to fetch vehicle data');
    } finally {
      setDataLoading(false);
    }
  };

  const handleWakeAndRefresh = async () => {
    if (!selectedVehicle) return;

    setWaking(true);
    setError(null);

    try {
      // Send wake command
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

      // Wait for vehicle to wake up (poll every 2 seconds for up to 30 seconds)
      let attempts = 0;
      const maxAttempts = 15;

      const pollForData = async () => {
        attempts++;
        const response = await fetch(`/api/tesla/vehicle-data?id=${selectedVehicle.id}&region=${region}`);
        const data = await response.json();

        if (data.success && data.state !== 'asleep') {
          setVehicleData(data.vehicle);
          setIsAsleep(false);
          setWaking(false);
        } else if (attempts < maxAttempts) {
          setTimeout(pollForData, 2000);
        } else {
          setError('Vehicle is taking too long to wake up. Please try again.');
          setWaking(false);
        }
      };

      // Start polling after a short delay
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

          <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
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

        {/* Asleep State */}
        {isAsleep && !waking && (
          <div className="mb-8 flex flex-col items-center justify-center rounded-2xl border border-slate-700/50 bg-slate-800/30 py-16">
            <Moon className="mb-4 h-12 w-12 text-slate-500" />
            <h2 className="text-xl font-semibold text-slate-400">Vehicle is Sleeping</h2>
            <p className="mt-2 text-slate-500">
              Click &quot;Wake &amp; Refresh&quot; to get live data
            </p>
          </div>
        )}

        {/* Vehicle Data */}
        {vehicleData && !isAsleep && !waking && (
          <>
            {/* Battery Card */}
            <div className="mb-8 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Battery className="h-6 w-6 text-green-400" />
                  <h2 className="text-lg font-semibold">Battery</h2>
                </div>
                <span className="text-sm text-slate-400">
                  {vehicleData.charging_state === 'Charging' ? '⚡ Charging' : vehicleData.charging_state}
                </span>
              </div>

              {/* Battery Visualization */}
              <div className="mb-4">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-400">Charge Level</span>
                  <span className="font-semibold">{vehicleData.battery_level}%</span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all ${vehicleData.battery_level > 20 ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    style={{ width: `${vehicleData.battery_level}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>Limit: {vehicleData.charge_limit_soc}%</span>
                  <span>~{formatDistance(vehicleData.battery_range)} range</span>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Gauge className="h-5 w-5" />}
                label="Odometer"
                value={formatDistance(vehicleData.odometer)}
                color="blue"
              />
              <StatCard
                icon={<Thermometer className="h-5 w-5" />}
                label="Temperature"
                value={`${formatTemp(vehicleData.inside_temp)} inside`}
                subvalue={`${formatTemp(vehicleData.outside_temp)} outside`}
                color="orange"
              />
              <StatCard
                icon={vehicleData.locked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                label="Security"
                value={vehicleData.locked ? 'Locked' : 'Unlocked'}
                subvalue={vehicleData.sentry_mode ? 'Sentry On' : 'Sentry Off'}
                color={vehicleData.locked ? 'green' : 'red'}
              />
              <StatCard
                icon={vehicleData.is_climate_on ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                label="Climate"
                value={vehicleData.is_climate_on ? 'On' : 'Off'}
                color="purple"
              />
            </div>

            {/* Location */}
            {vehicleData.latitude && vehicleData.longitude && (
              <div className="mt-6 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-red-400" />
                  <span className="text-slate-400">Location</span>
                  <span className="text-sm">
                    {vehicleData.latitude.toFixed(4)}, {vehicleData.longitude.toFixed(4)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Loading State */}
        {dataLoading && !vehicleData && !isAsleep && !waking && (
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
