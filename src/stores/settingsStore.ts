import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PollingConfig, DEFAULT_POLLING_CONFIG } from '@/lib/utils/polling';

type Region = 'na' | 'eu' | 'cn';
type Units = 'imperial' | 'metric';

interface SettingsStore {
    // Settings
    pollingConfig: PollingConfig;
    region: Region;
    units: Units;
    notifications: boolean;

    // Actions
    setPollingConfig: (config: Partial<PollingConfig>) => void;
    setRegion: (region: Region) => void;
    setUnits: (units: Units) => void;
    setNotifications: (enabled: boolean) => void;
    resetToDefaults: () => void;
}

const defaultSettings = {
    pollingConfig: DEFAULT_POLLING_CONFIG,
    region: 'eu' as Region,
    units: 'imperial' as Units,
    notifications: true,
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

            resetToDefaults: () => set(defaultSettings),
        }),
        {
            name: 'tripboard-settings',
        }
    )
);
