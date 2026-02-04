'use client'

import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Custom icons for start/end points
const startIcon = L.divIcon({
    className: 'custom-div-icon',
    html: '<div style="background: #22c55e; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
});

const endIcon = L.divIcon({
    className: 'custom-div-icon',
    html: '<div style="background: #ef4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
});

interface TripMiniMapProps {
    startLat: number;
    startLon: number;
    endLat?: number | null;
    endLon?: number | null;
}

export default function TripMiniMap({ startLat, startLon, endLat, endLon }: TripMiniMapProps) {
    // Calculate center and bounds
    const hasEnd = endLat != null && endLon != null;
    const centerLat = hasEnd ? (startLat + endLat) / 2 : startLat;
    const centerLon = hasEnd ? (startLon + endLon) / 2 : startLon;

    // Determine zoom level based on distance
    let zoom = 12; // Reduced from 14 to show more context
    if (hasEnd) {
        const latDiff = Math.abs(startLat - endLat);
        const lonDiff = Math.abs(startLon - endLon);
        const maxDiff = Math.max(latDiff, lonDiff);
        if (maxDiff > 0.1) zoom = 10;  // Reduced from 11
        else if (maxDiff > 0.05) zoom = 11; // Reduced from 12
        else if (maxDiff > 0.02) zoom = 12; // Reduced from 13
        else zoom = 13; // New: for very close start/end points
    }

    return (
        <div className="h-full w-full rounded-lg overflow-hidden">
            <MapContainer
                center={[centerLat, centerLon]}
                zoom={zoom}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                dragging={false}
                scrollWheelZoom={false}
                doubleClickZoom={false}
                touchZoom={false}
                attributionControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                {/* Start marker */}
                <Marker position={[startLat, startLon]} icon={startIcon} />

                {/* End marker and line */}
                {hasEnd && (
                    <>
                        <Marker position={[endLat, endLon]} icon={endIcon} />
                        <Polyline
                            positions={[[startLat, startLon], [endLat, endLon]]}
                            pathOptions={{ color: '#3b82f6', weight: 2, opacity: 0.7, dashArray: '5, 5' }}
                        />
                    </>
                )}
            </MapContainer>
        </div>
    );
}
