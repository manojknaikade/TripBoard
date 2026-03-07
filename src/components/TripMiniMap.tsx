'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
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

// Component to fit bounds after map is initialized
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
    const map = useMap();

    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
        }
    }, [bounds, map]);

    return null;
}

export default function TripMiniMap({ startLat, startLon, endLat, endLon }: TripMiniMapProps) {
    const hasEnd = endLat != null && endLon != null;
    const isSinglePoint = !hasEnd || (startLat === endLat && startLon === endLon);

    // Calculate center and bounds
    const centerLat = hasEnd ? (startLat + endLat) / 2 : startLat;
    const centerLon = hasEnd ? (startLon + endLon) / 2 : startLon;

    // Create bounds for fitBounds. If it's a single point (like a charging session), box it out nicely to zoom out more
    const bounds = isSinglePoint
        ? L.latLngBounds([
            [startLat - 0.02, startLon - 0.02],
            [startLat + 0.02, startLon + 0.02]
        ])
        : L.latLngBounds([
            [startLat, startLon],
            [endLat!, endLon!]
        ]);

    return (
        <div className="h-full w-full rounded-lg overflow-hidden">
            <MapContainer
                center={[centerLat, centerLon]}
                zoom={12}
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

                {/* Fit bounds to show both markers */}
                <FitBounds bounds={bounds} />

                {/* Start marker */}
                <Marker position={[startLat, startLon]} icon={startIcon} />

                {/* End marker and line (only if it's an actual trip with distance) */}
                {hasEnd && !isSinglePoint && (
                    <>
                        <Marker position={[endLat!, endLon!]} icon={endIcon} />
                        <Polyline
                            positions={[[startLat, startLon], [endLat, endLon!]]}
                            pathOptions={{ color: '#3b82f6', weight: 2, opacity: 0.7, dashArray: '5, 5' }}
                        />
                    </>
                )}
            </MapContainer>
        </div>
    );
}
