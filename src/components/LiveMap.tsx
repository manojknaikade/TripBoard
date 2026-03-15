'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useSettingsStore } from '@/stores/settingsStore'
import { getMapTileConfig } from '@/lib/maps/style'
import { fetchSharedLiveVehicleJson } from '@/lib/vehicle/liveData'

interface VehicleStatus {
    lat: number;
    lon: number;
    speed?: number | null;
    battery_level?: number | null;
}

type TelemetryVehicleResponse = {
    success?: boolean;
    vehicle?: {
        latitude?: number | null;
        longitude?: number | null;
        speed?: number | null;
        battery_level?: number | null;
    };
};

// Fix for default marker icons in Next.js
const defaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Component to recenter map when position changes
function Recenter({ lat, lon }: { lat: number; lon: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView([lat, lon], map.getZoom());
    }, [lat, lon, map]);
    return null;
}

export default function LiveMap() {
    const mapStyle = useSettingsStore((state) => state.mapStyle);
    const tileConfig = getMapTileConfig(mapStyle);
    const [vehicle, setVehicle] = useState<VehicleStatus | null>(null);

    // Poll for updates
    useEffect(() => {
        const fetchStatus = async () => {
            if (document.visibilityState !== 'visible') {
                return;
            }

            try {
                const data = await fetchSharedLiveVehicleJson<TelemetryVehicleResponse>(
                    'vehicle-live:telemetry',
                    '/api/tesla/telemetry-status'
                );
                const nextVehicle = data.vehicle;

                if (nextVehicle?.latitude != null && nextVehicle?.longitude != null) {
                    setVehicle({
                        lat: nextVehicle.latitude,
                        lon: nextVehicle.longitude,
                        speed: nextVehicle.speed ?? null,
                        battery_level: nextVehicle.battery_level ?? null,
                    });
                }
            } catch (e) {
                console.error("Failed to fetch status", e);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 5000); // 5 seconds
        document.addEventListener('visibilitychange', fetchStatus);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', fetchStatus);
        };
    }, []);

    if (!vehicle) {
        return <div className="h-64 w-full bg-gray-100 flex items-center justify-center">Loading Map...</div>;
    }

    return (
        <MapContainer
            center={[vehicle.lat, vehicle.lon]}
            zoom={15}
            style={{ height: '100%', width: '100%' }}
        >
            <TileLayer
                attribution={tileConfig.attribution}
                url={tileConfig.url}
            />
            <Marker position={[vehicle.lat, vehicle.lon]} icon={defaultIcon}>
                <Popup>
                    <b>Tesla Model 3</b><br />
                    Speed: {vehicle.speed || 0} km/h<br />
                    Battery: {vehicle.battery_level}%
                </Popup>
            </Marker>
            <Recenter lat={vehicle.lat} lon={vehicle.lon} />
        </MapContainer>
    );
}
