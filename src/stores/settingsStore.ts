import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PollingConfig, DEFAULT_POLLING_CONFIG } from '@/lib/utils/polling';
import type { MapStyle } from '@/lib/maps/style';
import type { AppSettingsSnapshot, HomeLocationSnapshot } from '@/lib/settings/appSettings';

type Region = 'na' | 'eu' | 'cn';
type Units = 'imperial' | 'metric';
type DataSource = 'polling' | 'telemetry';
type Currency = 'CHF' | 'USD' | 'EUR' | 'GBP' | string;
type DateFormat = 'DD/MM' | 'MM/DD';

interface HomeLocation {
    latitude: number | null;
    longitude: number | null;
    address?: string;
}

interface SettingsStore {
    // Settings
    pollingConfig: PollingConfig;
    minimumTripDistanceMiles: number;
    region: Region;
    units: Units;
    currency: Currency;
    dateFormat: DateFormat;
    notifications: boolean;
    dataSource: DataSource;
    mapStyle: MapStyle;
    homeLocation: HomeLocation;

    // Actions
    setPollingConfig: (config: Partial<PollingConfig>) => void;
    setMinimumTripDistanceMiles: (distanceMiles: number) => void;
    setRegion: (region: Region) => void;
    setUnits: (units: Units) => void;
    setCurrency: (currency: Currency) => void;
    setDateFormat: (format: DateFormat) => void;
    setNotifications: (enabled: boolean) => void;
    setDataSource: (source: DataSource) => void;
    setMapStyle: (style: MapStyle) => void;
    setHomeLocation: (location: HomeLocation) => void;
    applySnapshot: (snapshot: AppSettingsSnapshot, homeLocation?: HomeLocationSnapshot) => void;
    loadFromDatabase: () => Promise<void>;
    saveToDatabase: () => Promise<void>;
    resetToDefaults: () => void;
}

const defaultSettings = {
    pollingConfig: DEFAULT_POLLING_CONFIG,
    minimumTripDistanceMiles: 0.3,
    region: 'eu' as Region,
    units: 'imperial' as Units,
    currency: 'CHF' as Currency,
    dateFormat: 'DD/MM' as DateFormat,
    notifications: true,
    dataSource: 'polling' as DataSource,
    mapStyle: 'streets' as MapStyle,
    homeLocation: { latitude: null, longitude: null } as HomeLocation,
};

function arePollingConfigsEqual(left: PollingConfig, right: PollingConfig) {
    return (
        left.driving === right.driving
        && left.charging === right.charging
        && left.parked === right.parked
        && left.sleeping === right.sleeping
    );
}

function areHomeLocationsEqual(left: HomeLocation, right: HomeLocation) {
    return (
        left.latitude === right.latitude
        && left.longitude === right.longitude
        && left.address === right.address
    );
}

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            ...defaultSettings,

            setPollingConfig: (config) =>
                set((state) => ({
                    pollingConfig: { ...state.pollingConfig, ...config },
                })),

            setMinimumTripDistanceMiles: (minimumTripDistanceMiles) =>
                set((state) => (
                    state.minimumTripDistanceMiles === minimumTripDistanceMiles
                        ? state
                        : { minimumTripDistanceMiles }
                )),

            setRegion: (region) => set({ region }),

            setUnits: (units) => set({ units }),

            setCurrency: (currency) => set({ currency }),

            setDateFormat: (dateFormat) => set({ dateFormat }),

            setNotifications: (notifications) => set({ notifications }),

            setDataSource: (dataSource) => set({ dataSource }),

            setMapStyle: (mapStyle) => set({ mapStyle }),

            setHomeLocation: (homeLocation) => set({ homeLocation }),

            applySnapshot: (snapshot, homeLocation) =>
                set((state) => {
                    const nextState = {
                        pollingConfig: snapshot.pollingConfig,
                        minimumTripDistanceMiles: snapshot.minimumTripDistanceMiles,
                        region: snapshot.region,
                        units: snapshot.units,
                        currency: snapshot.currency || 'CHF',
                        dateFormat: snapshot.dateFormat || 'DD/MM',
                        notifications: snapshot.notifications,
                        dataSource: snapshot.dataSource,
                        mapStyle: snapshot.mapStyle || 'streets',
                        homeLocation: homeLocation ? {
                            latitude: homeLocation.latitude,
                            longitude: homeLocation.longitude,
                            address: homeLocation.address,
                        } : state.homeLocation,
                    };

                    const didChange = !arePollingConfigsEqual(state.pollingConfig, nextState.pollingConfig)
                        || state.minimumTripDistanceMiles !== nextState.minimumTripDistanceMiles
                        || state.region !== nextState.region
                        || state.units !== nextState.units
                        || state.currency !== nextState.currency
                        || state.dateFormat !== nextState.dateFormat
                        || state.notifications !== nextState.notifications
                        || state.dataSource !== nextState.dataSource
                        || state.mapStyle !== nextState.mapStyle
                        || !areHomeLocationsEqual(state.homeLocation, nextState.homeLocation);

                    return didChange ? nextState : state;
                }),

            loadFromDatabase: async () => {
                try {
                    const res = await fetch('/api/settings');
                    const data = await res.json();

                    if (data.success && data.settings) {
                        set({
                            pollingConfig: data.settings.pollingConfig,
                            minimumTripDistanceMiles: data.settings.minimumTripDistanceMiles ?? 0.3,
                            region: data.settings.region,
                            units: data.settings.units,
                            currency: data.settings.currency || 'CHF',
                            dateFormat: data.settings.dateFormat || 'DD/MM',
                            notifications: data.settings.notifications,
                            dataSource: data.settings.dataSource,
                            mapStyle: data.settings.mapStyle || 'streets',
                        });
                    }
                } catch (err) {
                    console.error('Failed to load settings from database:', err);
                }
            },

            saveToDatabase: async () => {
                try {
                    const state = useSettingsStore.getState();
                    await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pollingConfig: state.pollingConfig,
                            minimumTripDistanceMiles: state.minimumTripDistanceMiles,
                            region: state.region,
                            units: state.units,
                            currency: state.currency,
                            dateFormat: state.dateFormat,
                            notifications: state.notifications,
                            dataSource: state.dataSource,
                            mapStyle: state.mapStyle,
                        }),
                    });
                } catch (err) {
                    console.error('Failed to save settings to database:', err);
                }
            },

            resetToDefaults: () => set(defaultSettings),
        }),
        {
            name: 'tripboard-settings',
        }
    )
);
