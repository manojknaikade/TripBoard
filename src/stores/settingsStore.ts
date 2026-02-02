import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PollingConfig, DEFAULT_POLLING_CONFIG } from '@/lib/utils/polling';

type Region = 'na' | 'eu' | 'cn';
type Units = 'imperial' | 'metric';
type DataSource = 'polling' | 'telemetry';

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
    notifications: boolean;
    dataSource: DataSource;
    homeLocation: HomeLocation;

    // Actions
    setPollingConfig: (config: Partial<PollingConfig>) => void;
    setRegion: (region: Region) => void;
    setUnits: (units: Units) => void;
    setNotifications: (enabled: boolean) => void;
    setDataSource: (source: DataSource) => void;
    setHomeLocation: (location: HomeLocation) => void;
    resetToDefaults: () => void;
}

const defaultSettings = {
    pollingConfig: DEFAULT_POLLING_CONFIG,
    region: 'eu' as Region,
    units: 'imperial' as Units,
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

            setNotifications: (notifications) => set({ notifications }),

            setDataSource: (dataSource) => set({ dataSource }),

            setHomeLocation: (homeLocation) => set({ homeLocation }),

            resetToDefaults: () => set(defaultSettings),
        }),
        {
            name: 'tripboard-settings',
        }
    )
);
