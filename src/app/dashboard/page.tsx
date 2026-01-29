'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Zap,
  Battery,
  MapPin,
  Thermometer,
  Clock,
  Settings,
  LogOut,
  Car,
  Navigation,
  Gauge,
  BarChart3,
  History,
  Loader2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Mock data for development (will be replaced with real Tesla API data)
const mockVehicle = {
  id: '1234567890',
  display_name: 'Model 3',
  vin: '5YJ3E1EA1NF123456',
  state: 'online',
  battery_level: 78,
  battery_range: 245.5,
  charging_state: 'Disconnected',
  odometer: 15234.5,
  inside_temp: 21.5,
  outside_temp: 18.2,
  location: { lat: 52.52, lng: 13.405 },
  last_seen: new Date().toISOString(),
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [vehicle, setVehicle] = useState(mockVehicle);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
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
        {/* Vehicle Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
              <Car className="h-8 w-8 text-slate-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{vehicle.display_name}</h1>
              <p className="text-sm text-slate-400">{vehicle.vin}</p>
            </div>
          </div>
          <StatusBadge status={vehicle.state} />
        </div>

        {/* Stats Grid */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Battery className="h-5 w-5" />}
            label="Battery"
            value={`${vehicle.battery_level}%`}
            subtext={`${vehicle.battery_range.toFixed(0)} mi range`}
            color="green"
          />
          <StatCard
            icon={<Navigation className="h-5 w-5" />}
            label="Odometer"
            value={`${vehicle.odometer.toLocaleString()} mi`}
            subtext="Total distance"
            color="blue"
          />
          <StatCard
            icon={<Thermometer className="h-5 w-5" />}
            label="Temperature"
            value={`${vehicle.inside_temp}°C`}
            subtext={`Outside: ${vehicle.outside_temp}°C`}
            color="orange"
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="Last Seen"
            value="Just now"
            subtext={vehicle.charging_state}
            color="purple"
          />
        </div>

        {/* Two column layout */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Vehicle Status Card */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
              <h2 className="mb-6 text-lg font-semibold">Vehicle Status</h2>
              
              {/* Battery visualization */}
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-slate-400">Battery Level</span>
                  <span className="font-medium">{vehicle.battery_level}%</span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
                    style={{ width: `${vehicle.battery_level}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>0%</span>
                  <span>~{vehicle.battery_range.toFixed(0)} miles remaining</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow label="Charging State" value={vehicle.charging_state} />
                <InfoRow label="Vehicle State" value={vehicle.state} />
                <InfoRow label="Inside Temp" value={`${vehicle.inside_temp}°C`} />
                <InfoRow label="Outside Temp" value={`${vehicle.outside_temp}°C`} />
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
            <h2 className="mb-6 text-lg font-semibold">Quick Actions</h2>
            <div className="space-y-3">
              <QuickAction icon={<MapPin className="h-5 w-5" />} label="View Location" />
              <QuickAction icon={<History className="h-5 w-5" />} label="Recent Trips" />
              <QuickAction icon={<BarChart3 className="h-5 w-5" />} label="Energy Stats" />
              <QuickAction icon={<Settings className="h-5 w-5" />} label="Polling Settings" />
            </div>
          </div>
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
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-red-500/10 text-red-400'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isOnline = status === 'online';
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
        isOnline ? 'bg-green-500/10 text-green-400' : 'bg-slate-700 text-slate-400'
      }`}
    >
      <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-slate-500'}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  color: 'green' | 'blue' | 'orange' | 'purple';
}) {
  const colors = {
    green: 'bg-green-500/10 text-green-400',
    blue: 'bg-blue-500/10 text-blue-400',
    orange: 'bg-orange-500/10 text-orange-400',
    purple: 'bg-purple-500/10 text-purple-400',
  };

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
      <div className={`mb-3 inline-flex rounded-lg p-2 ${colors[color]}`}>{icon}</div>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-slate-500">{subtext}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-700/30 px-4 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function QuickAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-700/30 px-4 py-3 text-left transition-colors hover:border-slate-600 hover:bg-slate-700/50">
      <div className="text-slate-400">{icon}</div>
      <span className="font-medium">{label}</span>
    </button>
  );
}
