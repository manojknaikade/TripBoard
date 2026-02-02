'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

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
    const [vehicle, setVehicle] = useState<any>(null);

    // Poll for updates
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch('/api/vehicle/status');
                const data = await res.json();
                if (data.lat && data.lon) {
                    setVehicle(data);
                }
            } catch (e) {
                console.error("Failed to fetch status", e);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 5000); // 5 seconds
        return () => clearInterval(interval);
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
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
