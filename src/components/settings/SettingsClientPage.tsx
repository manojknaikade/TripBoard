'use client';

import { useEffect, useState } from 'react';
import {
    Clock,
    Bell,
    Globe,
    Download,
    Check,
    Gauge,
    MapPin,
    Banknote,
    Map,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import Header from '@/components/Header';
import ViewportGate from '@/components/ViewportGate';
import { fetchCachedJson, invalidateCachedJson, readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';
import type { AppSettingsSnapshot, HomeLocationSnapshot } from '@/lib/settings/appSettings';
import {
    FOCUS_RING_CLASS,
    INPUT_CLASS,
    PageHero,
    PageShell,
    SUBCARD_CLASS,
    SURFACE_CARD_CLASS,
} from '@/components/ui/dashboardPage';


import dynamic from 'next/dynamic';

const LocationPicker = dynamic(() => import('@/components/settings/LocationPicker'), {
    loading: () => <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-800" />,
    ssr: false
});

const SETTINGS_CACHE_TTL_MS = 60_000;

interface VehicleSummary {
    id: number;
    display_name: string;
    vin: string;
    state: string;
}

type SettingsClientPageProps = {
    initialSettings: AppSettingsSnapshot;
    initialHomeLocation: HomeLocationSnapshot;
    initialVehicles: VehicleSummary[];
};

export default function SettingsClientPage({
    initialSettings,
    initialHomeLocation,
    initialVehicles,
}: SettingsClientPageProps) {
    const [saved, setSaved] = useState(false);
    const [settingsHydrated, setSettingsHydrated] = useState(false);
    const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
    const [savingHome, setSavingHome] = useState(false);
    const [vehicles, setVehicles] = useState<VehicleSummary[]>(initialVehicles);
    const [loadingVehicles, setLoadingVehicles] = useState(false);
    const [vehicleFetchAttempted, setVehicleFetchAttempted] = useState(initialVehicles.length > 0);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>(initialVehicles[0]?.id?.toString() || '');
    const [pushingConfig, setPushingConfig] = useState(false);
    const [configStatus, setConfigStatus] = useState<{ success: boolean; message: string } | null>(null);

    const applySnapshot = useSettingsStore((state) => state.applySnapshot);
    const pollingConfig = useSettingsStore((state) => state.pollingConfig);
    const region = useSettingsStore((state) => state.region);
    const units = useSettingsStore((state) => state.units);
    const currency = useSettingsStore((state) => state.currency);
    const dateFormat = useSettingsStore((state) => state.dateFormat);
    const notifications = useSettingsStore((state) => state.notifications);
    const dataSource = useSettingsStore((state) => state.dataSource);
    const mapStyle = useSettingsStore((state) => state.mapStyle);
    const homeLocation = useSettingsStore((state) => state.homeLocation);
    const setPollingConfig = useSettingsStore((state) => state.setPollingConfig);
    const setRegion = useSettingsStore((state) => state.setRegion);
    const setUnits = useSettingsStore((state) => state.setUnits);
    const setCurrency = useSettingsStore((state) => state.setCurrency);
    const setDateFormat = useSettingsStore((state) => state.setDateFormat);
    const setNotifications = useSettingsStore((state) => state.setNotifications);
    const setDataSource = useSettingsStore((state) => state.setDataSource);
    const setMapStyle = useSettingsStore((state) => state.setMapStyle);
    const setHomeLocation = useSettingsStore((state) => state.setHomeLocation);
    const saveToDatabase = useSettingsStore((state) => state.saveToDatabase);
    const activePollingConfig = settingsHydrated ? pollingConfig : initialSettings.pollingConfig;
    const activeRegion = settingsHydrated ? region : initialSettings.region;
    const activeUnits = settingsHydrated ? units : initialSettings.units;
    const activeCurrency = settingsHydrated ? currency : initialSettings.currency;
    const activeDateFormat = settingsHydrated ? dateFormat : initialSettings.dateFormat;
    const activeNotifications = settingsHydrated ? notifications : initialSettings.notifications;
    const activeDataSource = settingsHydrated ? dataSource : initialSettings.dataSource;
    const activeMapStyle = settingsHydrated ? mapStyle : initialSettings.mapStyle;
    const activeHomeLocation = settingsHydrated ? homeLocation : initialHomeLocation;

    useEffect(() => {
        applySnapshot(initialSettings, initialHomeLocation);
        setSettingsHydrated(true);
        writeCachedJson('settings:home-location', {
            success: true,
            homeLocation: initialHomeLocation,
        }, SETTINGS_CACHE_TTL_MS);
        if (initialVehicles.length > 0) {
            writeCachedJson(`settings:vehicles:${initialSettings.region}`, {
                success: true,
                vehicles: initialVehicles,
            }, SETTINGS_CACHE_TTL_MS);
        }
        fetchCachedJson(
            'settings:home-location',
            async () => {
                const res = await fetch('/api/settings/home-location');
                return res.json();
            },
            SETTINGS_CACHE_TTL_MS
        )
            .then(data => {
                if (data.success && data.homeLocation.latitude) {
                    setHomeLocation(data.homeLocation);
                }
            })
            .catch(err => console.error('Failed to fetch home location:', err));
    }, [applySnapshot, initialHomeLocation, initialSettings, initialVehicles, setHomeLocation]);

    useEffect(() => {
        if (activeDataSource !== 'telemetry') {
            setVehicles([]);
            setSelectedVehicleId('');
            setVehicleFetchAttempted(false);
            return;
        }
    }, [activeDataSource]);

    useEffect(() => {
        setVehicles([]);
        setSelectedVehicleId('');
        setVehicleFetchAttempted(false);
    }, [activeRegion]);

    useEffect(() => {
        if (vehicles.length > 0 || loadingVehicles || vehicleFetchAttempted) {
            return;
        }

        let cancelled = false;

        setVehicleFetchAttempted(true);
        setLoadingVehicles(true);

        const cacheKey = `settings:vehicles:${activeRegion}`;
        const cachedVehicles = readCachedJson<{ success: boolean; vehicles: VehicleSummary[] }>(cacheKey);

        if (cachedVehicles?.success && cachedVehicles.vehicles.length > 0) {
            setVehicles(cachedVehicles.vehicles);
            setSelectedVehicleId((currentId) => currentId || cachedVehicles.vehicles[0].id.toString());
            setLoadingVehicles(false);
            return;
        }

        fetchCachedJson(
            cacheKey,
            async () => {
                const res = await fetch(`/api/tesla/vehicles?summary=1&region=${activeRegion}`, {
                    cache: 'no-store',
                });
                return res.json();
            },
            SETTINGS_CACHE_TTL_MS
        )
            .then((data) => {
                if (cancelled || !data.success || data.vehicles.length === 0) {
                    return;
                }

                setVehicles(data.vehicles);
                setSelectedVehicleId((currentId) => currentId || data.vehicles[0].id.toString());
            })
            .catch((err) => console.error('Failed to fetch vehicles:', err))
            .finally(() => {
                if (!cancelled) {
                    setLoadingVehicles(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeDataSource, activeRegion, loadingVehicles, vehicleFetchAttempted, vehicles.length]);

    const showSaved = () => {
        setSaved(true);
        // Auto-save to database
        saveToDatabase();
        setTimeout(() => setSaved(false), 2000);
    };

    const saveHomeLocation = async () => {
        setSavingHome(true);
        try {
            const res = await fetch('/api/settings/home-location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(activeHomeLocation),
            });

            if (res.ok) {
                invalidateCachedJson('settings:home-location');
                showSaved();
            }
        } catch (err) {
            console.error('Failed to save home location:', err);
        } finally {
            setSavingHome(false);
        }
    };

    const handleExport = async (format: 'csv' | 'json') => {
        setExporting(format);
        try {
            const res = await fetch(`/api/trips/export?format=${format}`);
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
                || `tripboard_export.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export error:', err);
        } finally {
            setExporting(null);
        }
    };

    const handlePushConfig = async () => {
        if (!selectedVehicleId) return;
        setPushingConfig(true);
        setConfigStatus(null);

        try {
            const res = await fetch('/api/tesla/telemetry-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: selectedVehicleId,
                    region: activeRegion
                }),
            });
            const data = await res.json();

            if (data.success) {
                setConfigStatus({ success: true, message: 'Telemetry configuration pushed successfully!' });
            } else {
                setConfigStatus({ success: false, message: data.error || 'Failed to push configuration' });
            }
        } catch {
            setConfigStatus({ success: false, message: 'Network error pushing configuration' });
        } finally {
            setPushingConfig(false);
        }
    };

    return (
        <div className="min-h-screen">
            <Header />

            {/* Saved Toast */}
            {saved && (
                <div className="fixed right-6 top-24 z-50 flex items-center gap-2 rounded-2xl border border-green-500/20 bg-green-500 px-4 py-2 text-white shadow-lg">
                    <Check className="h-4 w-4" />
                    Settings saved!
                </div>
            )}

            <PageShell>
                <div className="mx-auto max-w-5xl">
                    <PageHero
                        title="Settings"
                        description="Configure polling behavior, display preferences, telemetry source settings, and export options."
                    />

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
                                value={activePollingConfig.driving}
                                onChange={(v) => {
                                    setPollingConfig({ driving: v });
                                    showSaved();
                                }}
                                min={10}
                                max={60}
                            />
                            <PollingInput
                                label="While Charging"
                                value={activePollingConfig.charging}
                                onChange={(v) => {
                                    setPollingConfig({ charging: v });
                                    showSaved();
                                }}
                                min={60}
                                max={900}
                            />
                            <PollingInput
                                label="While Parked"
                                value={activePollingConfig.parked}
                                onChange={(v) => {
                                    setPollingConfig({ parked: v });
                                    showSaved();
                                }}
                                min={300}
                                max={3600}
                            />
                            <PollingInput
                                label="While Sleeping"
                                value={activePollingConfig.sleeping}
                                onChange={(v) => {
                                    setPollingConfig({ sleeping: v });
                                    showSaved();
                                }}
                                min={1800}
                                max={7200}
                            />
                        </div>
                        <p className="mt-4 text-sm text-slate-500">
                            Longer intervals reduce API cost. Vehicle sleep is never interrupted.
                        </p>
                    </SettingsSection>

                    {/* Data Source */}
                    <SettingsSection
                        icon={<Download className="h-5 w-5" />}
                        title="Data Source"
                        description="Choose where to get your vehicle data from"
                    >
                        <div className="grid gap-3 sm:grid-cols-2">
                            {[
                                { id: 'polling', label: 'Tesla API (Polling)', desc: 'Fetches data directly from Tesla' },
                                { id: 'telemetry', label: 'Telemetry (Real-time)', desc: 'Uses your own telemetry server' },
                            ].map((s) => (
                                <ChoiceButton
                                    key={s.id}
                                    active={activeDataSource === s.id}
                                    label={s.label}
                                    description={s.desc}
                                    onClick={() => {
                                        setDataSource(s.id as 'polling' | 'telemetry');
                                        showSaved();
                                    }}
                                />
                            ))}
                        </div>
                        <p className="mt-4 text-sm text-slate-500">
                            Telemetry mode requires a running telemetry server on your VM.
                        </p>

                        {activeDataSource === 'telemetry' && (
                            <div className="mt-6 border-t border-slate-700/50 pt-6">
                                <h3 className="mb-2 text-sm font-medium text-slate-300">Push Configuration</h3>
                                <p className="mb-4 text-xs text-slate-500">
                                    Send latest field definitions (charge limit, DetailedChargeState, TPMS, Doors) to your car.
                                </p>
                                {loadingVehicles ? (
                                    <p className="text-xs text-slate-500">Loading Tesla vehicles...</p>
                                ) : vehicles.length > 0 ? (
                                    <>
                                        <div className="flex flex-col gap-3 sm:flex-row">
                                            <select
                                                value={selectedVehicleId}
                                                onChange={(e) => setSelectedVehicleId(e.target.value)}
                                                className={`min-w-0 ${INPUT_CLASS}`}
                                            >
                                                {vehicles.map(v => (
                                                    <option key={v.id} value={v.id}>{v.display_name} ({v.vin.slice(-6)})</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={handlePushConfig}
                                                disabled={pushingConfig}
                                                className={`rounded-2xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50 ${FOCUS_RING_CLASS}`}
                                            >
                                                {pushingConfig ? 'Pushing...' : 'Update Car Config'}
                                            </button>
                                        </div>
                                        {configStatus && (
                                            <p className={`mt-3 text-xs ${configStatus.success ? 'text-green-400' : 'text-red-400'}`}>
                                                {configStatus.success ? '✓' : '✗'} {configStatus.message}
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-xs text-slate-500">No Tesla vehicles available for telemetry configuration.</p>
                                )}
                            </div>
                        )}
                    </SettingsSection>

                    {/* Home Location */}
                    <SettingsSection
                        icon={<MapPin className="h-5 w-5" />}
                        title="Home Location"
                        description="Set your home coordinates for charging analytics"
                    >
                        <ViewportGate
                            className="min-h-[400px]"
                            placeholder={<div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-800" />}
                        >
                            <LocationPicker
                                latitude={activeHomeLocation.latitude}
                                longitude={activeHomeLocation.longitude}
                                address={activeHomeLocation.address}
                                onLocationChange={(lat: number, lon: number, address: string) => {
                                    setHomeLocation({ latitude: lat, longitude: lon, address });
                                }}
                            />
                        </ViewportGate>
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={saveHomeLocation}
                                disabled={savingHome}
                                className={`flex items-center gap-2 rounded-2xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50 ${FOCUS_RING_CLASS}`}
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
                        <div className="flex flex-wrap gap-3">
                            {[
                                { id: 'na', label: 'North America' },
                                { id: 'eu', label: 'Europe' },
                                { id: 'cn', label: 'China' },
                            ].map((r) => (
                                <ChoiceButton
                                    key={r.id}
                                    active={activeRegion === r.id}
                                    compact
                                    label={r.label}
                                    onClick={() => {
                                        setRegion(r.id as 'na' | 'eu' | 'cn');
                                        showSaved();
                                    }}
                                />
                            ))}
                        </div>
                    </SettingsSection>

                    {/* Units */}
                    <SettingsSection
                        icon={<Gauge className="h-5 w-5" />}
                        title="Display Units"
                        description="Choose your preferred measurement units"
                    >
                        <div className="flex flex-wrap gap-3">
                            {[
                                { id: 'imperial', label: 'Imperial (mi, °F)' },
                                { id: 'metric', label: 'Metric (km, °C)' },
                            ].map((u) => (
                                <ChoiceButton
                                    key={u.id}
                                    active={activeUnits === u.id}
                                    compact
                                    label={u.label}
                                    onClick={() => {
                                        setUnits(u.id as 'imperial' | 'metric');
                                        showSaved();
                                    }}
                                />
                            ))}
                        </div>
                    </SettingsSection>

                    {/* Map Style */}
                    <SettingsSection
                        icon={<Map className="h-5 w-5" />}
                        title="Map Style"
                        description="Choose the basemap style used across dashboard, trips, charging, and pickers"
                    >
                        <div className="flex flex-wrap gap-3">
                            {[
                                { id: 'streets', label: 'Streets' },
                                { id: 'dark', label: 'Dark' },
                            ].map((style) => (
                                <ChoiceButton
                                    key={style.id}
                                    active={activeMapStyle === style.id}
                                    compact
                                    label={style.label}
                                    onClick={() => {
                                        setMapStyle(style.id as 'streets' | 'dark');
                                        showSaved();
                                    }}
                                />
                            ))}
                        </div>
                    </SettingsSection>

                    {/* Date Format */}
                    <SettingsSection
                        icon={<Clock className="h-5 w-5" />}
                        title="Date Format"
                        description="Choose how dates are displayed in graphs and lists"
                    >
                        <div className="flex flex-wrap gap-3">
                            {[
                                { id: 'DD/MM', label: 'Day / Month' },
                                { id: 'MM/DD', label: 'Month / Day' },
                            ].map((d) => (
                                <ChoiceButton
                                    key={d.id}
                                    active={activeDateFormat === d.id}
                                    compact
                                    label={d.label}
                                    onClick={() => {
                                        setDateFormat(d.id as 'DD/MM' | 'MM/DD');
                                        showSaved();
                                    }}
                                />
                            ))}
                        </div>
                    </SettingsSection>

                    {/* Currency */}
                    <SettingsSection
                        icon={<Banknote className="h-5 w-5" />}
                        title="Currency"
                        description="Choose your preferred currency for charging costs"
                    >
                        <div className="flex flex-wrap gap-3">
                            {[
                                { id: 'CHF', label: 'CHF (₣)' },
                                { id: 'USD', label: 'USD ($)' },
                                { id: 'EUR', label: 'EUR (€)' },
                                { id: 'GBP', label: 'GBP (£)' },
                            ].map((c) => (
                                <ChoiceButton
                                    key={c.id}
                                    active={activeCurrency === c.id}
                                    compact
                                    label={c.label}
                                    onClick={() => {
                                        setCurrency(c.id);
                                        showSaved();
                                    }}
                                />
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
                                    setNotifications(!activeNotifications);
                                    showSaved();
                                }}
                                className={`relative h-6 w-11 rounded-full transition-colors ${activeNotifications ? 'bg-red-500' : 'bg-slate-600'
                                    }`}
                            >
                                <span
                                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${activeNotifications ? 'translate-x-5' : ''
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
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={() => handleExport('csv')}
                                disabled={exporting !== null}
                                className={`flex items-center gap-2 rounded-2xl border border-slate-700/50 bg-slate-900/25 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/50 disabled:opacity-50 ${FOCUS_RING_CLASS}`}
                            >
                                {exporting === 'csv' ? (
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                                ) : (
                                    <Download className="h-4 w-4" />
                                )}
                                {exporting === 'csv' ? 'Exporting…' : 'Export as CSV'}
                            </button>
                            <button
                                onClick={() => handleExport('json')}
                                disabled={exporting !== null}
                                className={`flex items-center gap-2 rounded-2xl border border-slate-700/50 bg-slate-900/25 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/50 disabled:opacity-50 ${FOCUS_RING_CLASS}`}
                            >
                                {exporting === 'json' ? (
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                                ) : (
                                    <Download className="h-4 w-4" />
                                )}
                                {exporting === 'json' ? 'Exporting…' : 'Export as JSON'}
                            </button>
                        </div>
                    </SettingsSection>
                    </div>
                </div>
            </PageShell>
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
        <section className={`p-6 ${SURFACE_CARD_CLASS}`}>
            <div className="mb-4 flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center ${SUBCARD_CLASS} text-red-300`}>
                    {icon}
                </div>
                <div>
                    <h2 className="font-semibold text-white">{title}</h2>
                    <p className="text-sm leading-6 text-slate-400">{description}</p>
                </div>
            </div>
            {children}
        </section>
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
        <div className={`p-4 ${SUBCARD_CLASS}`}>
            <div className="mb-2 flex justify-between text-sm">
                <span className="text-slate-400">{label}</span>
                <span className="font-medium text-white">{formatValue(value)}</span>
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

function ChoiceButton({
    active,
    label,
    description,
    onClick,
    compact = false,
}: {
    active: boolean;
    label: string;
    description?: string;
    onClick: () => void;
    compact?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`text-left transition-colors ${
                compact ? 'px-4 py-2 text-sm' : 'px-4 py-4'
            } rounded-2xl border ${
                active
                    ? 'border-red-500/30 bg-red-500/12 text-red-100'
                    : 'border-slate-700/50 bg-slate-900/18 text-slate-300 hover:border-slate-600 hover:bg-slate-800/45'
            } ${FOCUS_RING_CLASS}`}
        >
            <div className="font-medium">{label}</div>
            {description ? (
                <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
            ) : null}
        </button>
    );
}
