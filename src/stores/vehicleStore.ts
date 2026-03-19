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

function areVehiclesEqual(currentVehicles: Vehicle[], nextVehicles: Vehicle[]) {
    if (currentVehicles.length !== nextVehicles.length) {
        return false;
    }

    return currentVehicles.every((currentVehicle, index) => {
        const nextVehicle = nextVehicles[index];

        return (
            currentVehicle.id === nextVehicle.id
            && currentVehicle.vin === nextVehicle.vin
            && currentVehicle.display_name === nextVehicle.display_name
            && currentVehicle.state === nextVehicle.state
            && currentVehicle.battery_level === nextVehicle.battery_level
            && currentVehicle.battery_range === nextVehicle.battery_range
            && currentVehicle.charging_state === nextVehicle.charging_state
            && currentVehicle.odometer === nextVehicle.odometer
            && currentVehicle.inside_temp === nextVehicle.inside_temp
            && currentVehicle.outside_temp === nextVehicle.outside_temp
            && currentVehicle.latitude === nextVehicle.latitude
            && currentVehicle.longitude === nextVehicle.longitude
        );
    });
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
                set((state) => {
                    if (areVehiclesEqual(state.vehicles, vehicles) && state.error === null) {
                        return state;
                    }

                    return {
                        vehicles,
                        lastFetch: new Date().toISOString(),
                        error: null,
                    };
                }),

            selectVehicle: (id) =>
                set((state) => (
                    state.selectedVehicleId === id
                        ? state
                        : {
                            selectedVehicleId: id,
                        }
                )),

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
