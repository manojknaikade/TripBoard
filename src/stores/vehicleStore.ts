import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Vehicle {
    id: string;
    vin: string;
    display_name: string;
    state: 'online' | 'asleep' | 'offline';
    battery_level?: number;
    battery_range?: number;
    charging_state?: string;
    odometer?: number;
    inside_temp?: number;
    outside_temp?: number;
    latitude?: number;
    longitude?: number;
    last_updated?: string;
}

interface VehicleStore {
    // State
    vehicles: Vehicle[];
    selectedVehicleId: string | null;
    isLoading: boolean;
    error: string | null;
    lastFetch: string | null;

    // Actions
    setVehicles: (vehicles: Vehicle[]) => void;
    selectVehicle: (id: string) => void;
    updateVehicle: (id: string, data: Partial<Vehicle>) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    getSelectedVehicle: () => Vehicle | null;
}

export const useVehicleStore = create<VehicleStore>()(
    persist(
        (set, get) => ({
            // Initial state
            vehicles: [],
            selectedVehicleId: null,
            isLoading: false,
            error: null,
            lastFetch: null,

            // Actions
            setVehicles: (vehicles) =>
                set({
                    vehicles,
                    lastFetch: new Date().toISOString(),
                    error: null,
                }),

            selectVehicle: (id) =>
                set({
                    selectedVehicleId: id,
                }),

            updateVehicle: (id, data) =>
                set((state) => ({
                    vehicles: state.vehicles.map((v) =>
                        v.id === id ? { ...v, ...data, last_updated: new Date().toISOString() } : v
                    ),
                })),

            setLoading: (isLoading) => set({ isLoading }),

            setError: (error) => set({ error }),

            getSelectedVehicle: () => {
                const state = get();
                return state.vehicles.find((v) => v.id === state.selectedVehicleId) || null;
            },
        }),
        {
            name: 'tripboard-vehicles',
            partialize: (state) => ({
                selectedVehicleId: state.selectedVehicleId,
            }),
        }
    )
);
