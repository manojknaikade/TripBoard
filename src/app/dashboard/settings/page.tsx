'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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
    Check,
    MapPin,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import Header from '@/components/Header';


import dynamic from 'next/dynamic';

const LocationPicker = dynamic(() => import('@/components/settings/LocationPicker'), {
    loading: () => <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-800" />,
    ssr: false
});

export default function SettingsPage() {
    const [saved, setSaved] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [savingHome, setSavingHome] = useState(false);

    const router = useRouter();
    const {
        pollingConfig,
        region,
        units,
        notifications,
        dataSource,
        homeLocation,
        setPollingConfig,
        setRegion,
        setUnits,
        setNotifications,
        setDataSource,
        setHomeLocation,
        loadFromDatabase,
        saveToDatabase,
    } = useSettingsStore();

    // Handle hydration and load all settings from database
    useEffect(() => {
        setMounted(true);

        // Load general settings
        loadFromDatabase();

        // Load home location
        fetch('/api/settings/home-location')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.homeLocation.latitude) {
                    setHomeLocation(data.homeLocation);
                }
            })
            .catch(err => console.error('Failed to fetch home location:', err));
    }, [setHomeLocation, loadFromDatabase]);

    const showSaved = () => {
        setSaved(true);
        // Auto-save to database
        saveToDatabase();
        setTimeout(() => setSaved(false), 2000);
    };

    const handleSignOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/auth/login');
    };

    const saveHomeLocation = async () => {
        setSavingHome(true);
        try {
            const res = await fetch('/api/settings/home-location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(homeLocation),
            });

            if (res.ok) {
                showSaved();
            }
        } catch (err) {
            console.error('Failed to save home location:', err);
        } finally {
            setSavingHome(false);
        }
    };

    // Show loading while hydrating to avoid hydration mismatch
    if (!mounted) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            <Header />

            {/* Saved Toast */}
            {saved && (
                <div className="fixed right-6 top-24 z-50 flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-white shadow-lg">
                    <Check className="h-4 w-4" />
                    Settings saved!
                </div>
            )}

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
                                value={pollingConfig.driving}
                                onChange={(v) => {
                                    setPollingConfig({ driving: v });
                                    showSaved();
                                }}
                                min={10}
                                max={60}
                            />
                            <PollingInput
                                label="While Charging"
                                value={pollingConfig.charging}
                                onChange={(v) => {
                                    setPollingConfig({ charging: v });
                                    showSaved();
                                }}
                                min={60}
                                max={900}
                            />
                            <PollingInput
                                label="While Parked"
                                value={pollingConfig.parked}
                                onChange={(v) => {
                                    setPollingConfig({ parked: v });
                                    showSaved();
                                }}
                                min={300}
                                max={3600}
                            />
                            <PollingInput
                                label="While Sleeping"
                                value={pollingConfig.sleeping}
                                onChange={(v) => {
                                    setPollingConfig({ sleeping: v });
                                    showSaved();
                                }}
                                min={1800}
                                max={7200}
                            />
                        </div>
                        <p className="mt-4 text-sm text-slate-500">
                            💡 Longer intervals = lower API costs. Vehicle sleep is never interrupted.
                        </p>
                    </SettingsSection>

                    {/* Data Source */}
                    <SettingsSection
                        icon={<Download className="h-5 w-5" />}
                        title="Data Source"
                        description="Choose where to get your vehicle data from"
                    >
                        <div className="flex gap-3">
                            {[
                                { id: 'polling', label: 'Tesla API (Polling)', desc: 'Fetches data directly from Tesla' },
                                { id: 'telemetry', label: 'Telemetry (Real-time)', desc: 'Uses your own telemetry server' },
                            ].map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => {
                                        setDataSource(s.id as 'polling' | 'telemetry');
                                        showSaved();
                                    }}
                                    className={`flex-1 rounded-lg p-4 text-left transition-colors ${dataSource === s.id
                                        ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30'
                                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    <div className="font-medium">{s.label}</div>
                                    <div className="mt-1 text-xs opacity-70">{s.desc}</div>
                                </button>
                            ))}
                        </div>
                        <p className="mt-4 text-sm text-slate-500">
                            📡 Telemetry mode requires a running telemetry server on your VM.
                        </p>
                    </SettingsSection>

                    {/* Home Location */}
                    <SettingsSection
                        icon={<MapPin className="h-5 w-5" />}
                        title="Home Location"
                        description="Set your home coordinates for charging analytics"
                    >
                        <LocationPicker
                            latitude={homeLocation.latitude}
                            longitude={homeLocation.longitude}
                            address={homeLocation.address}
                            onLocationChange={(lat: number, lon: number, address: string) => {
                                setHomeLocation({ latitude: lat, longitude: lon, address });
                            }}
                        />
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={saveHomeLocation}
                                disabled={savingHome}
                                className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                            >
                                {savingHome ? 'Saving...' : 'Save Location'}
                            </button>
                        </div>
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
                            ].map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => {
                                        setRegion(r.id as 'na' | 'eu' | 'cn');
                                        showSaved();
                                    }}
                                    className={`rounded-lg px-4 py-2 text-sm transition-colors ${region === r.id
                                        ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30'
                                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    {r.label}
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
                            ].map((u) => (
                                <button
                                    key={u.id}
                                    onClick={() => {
                                        setUnits(u.id as 'imperial' | 'metric');
                                        showSaved();
                                    }}
                                    className={`rounded-lg px-4 py-2 text-sm transition-colors ${units === u.id
                                        ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30'
                                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    {u.label}
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
                                onClick={() => {
                                    setNotifications(!notifications);
                                    showSaved();
                                }}
                                className={`relative h-6 w-11 rounded-full transition-colors ${notifications ? 'bg-red-500' : 'bg-slate-600'
                                    }`}
                            >
                                <span
                                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${notifications ? 'translate-x-5' : ''
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
                </div>
            </main>
        </div>
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
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
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
