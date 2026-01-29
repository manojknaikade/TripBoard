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
    Clock,
    Bell,
    Globe,
    Download,
    Save,
    Loader2,
} from 'lucide-react';

export default function SettingsPage() {
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        pollingDriving: 30,
        pollingCharging: 300,
        pollingParked: 1800,
        pollingSleeping: 3600,
        units: 'imperial',
        notifications: true,
        region: 'eu',
    });

    const handleSave = async () => {
        setSaving(true);
        // Simulate save
        await new Promise((r) => setTimeout(r, 1000));
        setSaving(false);
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
                        <NavLink href="/dashboard/trips" icon={<History className="h-4 w-4" />}>
                            Trips
                        </NavLink>
                        <NavLink href="/dashboard/analytics" icon={<BarChart3 className="h-4 w-4" />}>
                            Analytics
                        </NavLink>
                        <NavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />} active>
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
            <main className="mx-auto max-w-3xl px-6 py-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold">Settings</h1>
                    <p className="text-slate-400">Configure your TripBoard preferences</p>
                </div>

                <div className="space-y-6">
                    {/* Polling Intervals */}
                    <SettingsSection
                        icon={<Clock className="h-5 w-5" />}
                        title="Polling Intervals"
                        description="Control how often TripBoard fetches data from your Tesla"
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <PollingInput
                                label="While Driving"
                                value={settings.pollingDriving}
                                onChange={(v) => setSettings({ ...settings, pollingDriving: v })}
                                min={10}
                                max={60}
                                unit="seconds"
                            />
                            <PollingInput
                                label="While Charging"
                                value={settings.pollingCharging}
                                onChange={(v) => setSettings({ ...settings, pollingCharging: v })}
                                min={60}
                                max={900}
                                unit="seconds"
                            />
                            <PollingInput
                                label="While Parked"
                                value={settings.pollingParked}
                                onChange={(v) => setSettings({ ...settings, pollingParked: v })}
                                min={300}
                                max={3600}
                                unit="seconds"
                            />
                            <PollingInput
                                label="While Sleeping"
                                value={settings.pollingSleeping}
                                onChange={(v) => setSettings({ ...settings, pollingSleeping: v })}
                                min={1800}
                                max={7200}
                                unit="seconds"
                            />
                        </div>
                        <p className="mt-4 text-sm text-slate-500">
                            💡 Longer intervals = lower API costs. Vehicle sleep is never interrupted.
                        </p>
                    </SettingsSection>

                    {/* Region */}
                    <SettingsSection
                        icon={<Globe className="h-5 w-5" />}
                        title="Tesla API Region"
                        description="Select your Tesla Fleet API region"
                    >
                        <div className="flex gap-3">
                            {[
                                { id: 'na', label: 'North America' },
                                { id: 'eu', label: 'Europe' },
                                { id: 'cn', label: 'China' },
                            ].map((region) => (
                                <button
                                    key={region.id}
                                    onClick={() => setSettings({ ...settings, region: region.id })}
                                    className={`rounded-lg px-4 py-2 text-sm transition-colors ${settings.region === region.id
                                            ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30'
                                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    {region.label}
                                </button>
                            ))}
                        </div>
                    </SettingsSection>

                    {/* Units */}
                    <SettingsSection
                        icon={<Gauge className="h-5 w-5" />}
                        title="Display Units"
                        description="Choose your preferred measurement units"
                    >
                        <div className="flex gap-3">
                            {[
                                { id: 'imperial', label: 'Imperial (mi, °F)' },
                                { id: 'metric', label: 'Metric (km, °C)' },
                            ].map((unit) => (
                                <button
                                    key={unit.id}
                                    onClick={() => setSettings({ ...settings, units: unit.id })}
                                    className={`rounded-lg px-4 py-2 text-sm transition-colors ${settings.units === unit.id
                                            ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30'
                                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    {unit.label}
                                </button>
                            ))}
                        </div>
                    </SettingsSection>

                    {/* Notifications */}
                    <SettingsSection
                        icon={<Bell className="h-5 w-5" />}
                        title="Notifications"
                        description="Receive alerts about your vehicle"
                    >
                        <label className="flex cursor-pointer items-center justify-between">
                            <span className="text-slate-300">Enable notifications</span>
                            <button
                                onClick={() => setSettings({ ...settings, notifications: !settings.notifications })}
                                className={`relative h-6 w-11 rounded-full transition-colors ${settings.notifications ? 'bg-red-500' : 'bg-slate-600'
                                    }`}
                            >
                                <span
                                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${settings.notifications ? 'translate-x-5' : ''
                                        }`}
                                />
                            </button>
                        </label>
                    </SettingsSection>

                    {/* Data Export */}
                    <SettingsSection
                        icon={<Download className="h-5 w-5" />}
                        title="Data Export"
                        description="Export your trip history and analytics"
                    >
                        <div className="flex gap-3">
                            <button className="flex items-center gap-2 rounded-lg bg-slate-700/50 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700">
                                <Download className="h-4 w-4" />
                                Export as CSV
                            </button>
                            <button className="flex items-center gap-2 rounded-lg bg-slate-700/50 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700">
                                <Download className="h-4 w-4" />
                                Export as JSON
                            </button>
                        </div>
                    </SettingsSection>

                    {/* Save Button */}
                    <div className="flex justify-end pt-4">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-6 py-3 font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-xl disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="h-5 w-5" />
                                    Save Settings
                                </>
                            )}
                        </button>
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

function SettingsSection({
    icon,
    title,
    description,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
            <div className="mb-4 flex items-center gap-3">
                <div className="text-red-400">{icon}</div>
                <div>
                    <h2 className="font-semibold">{title}</h2>
                    <p className="text-sm text-slate-400">{description}</p>
                </div>
            </div>
            {children}
        </div>
    );
}

function PollingInput({
    label,
    value,
    onChange,
    min,
    max,
    unit,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    unit: string;
}) {
    const formatValue = (v: number) => {
        if (v >= 3600) return `${v / 3600}h`;
        if (v >= 60) return `${v / 60}m`;
        return `${v}s`;
    };

    return (
        <div>
            <div className="mb-2 flex justify-between text-sm">
                <span className="text-slate-400">{label}</span>
                <span className="font-medium">{formatValue(value)}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-red-500"
            />
        </div>
    );
}
