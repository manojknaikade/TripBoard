import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PollingConfig, DEFAULT_POLLING_CONFIG } from '@/lib/utils/polling';

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
    region: Region;
    units: Units;
    currency: Currency;
    dateFormat: DateFormat;
    notifications: boolean;
    dataSource: DataSource;
    homeLocation: HomeLocation;

    // Actions
    setPollingConfig: (config: Partial<PollingConfig>) => void;
    setRegion: (region: Region) => void;
    setUnits: (units: Units) => void;
    setCurrency: (currency: Currency) => void;
    setDateFormat: (format: DateFormat) => void;
    setNotifications: (enabled: boolean) => void;
    setDataSource: (source: DataSource) => void;
    setHomeLocation: (location: HomeLocation) => void;
    loadFromDatabase: () => Promise<void>;
    saveToDatabase: () => Promise<void>;
    resetToDefaults: () => void;
}

const defaultSettings = {
    pollingConfig: DEFAULT_POLLING_CONFIG,
    region: 'eu' as Region,
    units: 'imperial' as Units,
    currency: 'CHF' as Currency,
    dateFormat: 'DD/MM' as DateFormat,
    notifications: true,
    dataSource: 'polling' as DataSource,
    homeLocation: { latitude: null, longitude: null } as HomeLocation,
};

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            ...defaultSettings,

            setPollingConfig: (config) =>
                set((state) => ({
                    pollingConfig: { ...state.pollingConfig, ...config },
                })),

            setRegion: (region) => set({ region }),

            setUnits: (units) => set({ units }),

            setCurrency: (currency) => set({ currency }),

            setDateFormat: (dateFormat) => set({ dateFormat }),

            setNotifications: (notifications) => set({ notifications }),

            setDataSource: (dataSource) => set({ dataSource }),

            setHomeLocation: (homeLocation) => set({ homeLocation }),

            loadFromDatabase: async () => {
                try {
                    const res = await fetch('/api/settings');
                    const data = await res.json();

                    if (data.success && data.settings) {
                        set({
                            pollingConfig: data.settings.pollingConfig,
                            region: data.settings.region,
                            units: data.settings.units,
                            currency: data.settings.currency || 'CHF',
                            dateFormat: data.settings.dateFormat || 'DD/MM',
                            notifications: data.settings.notifications,
                            dataSource: data.settings.dataSource,
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
                            region: state.region,
                            units: state.units,
                            currency: state.currency,
                            dateFormat: state.dateFormat,
                            notifications: state.notifications,
                            dataSource: state.dataSource,
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
