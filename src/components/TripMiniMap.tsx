'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useSettingsStore } from '@/stores/settingsStore'
import { getMapTileConfig } from '@/lib/maps/style'
import type { TripRoutePoint } from '@/lib/trips/routePoints'

const MAP_VIEWPORT_ROOT_MARGIN = '240px';

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
    routePoints?: TripRoutePoint[];
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

export default function TripMiniMap({
    startLat,
    startLon,
    endLat,
    endLon,
    routePoints = [],
}: TripMiniMapProps) {
    const mapStyle = useSettingsStore((state) => state.mapStyle);
    const tileConfig = getMapTileConfig(mapStyle);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isNearViewport, setIsNearViewport] = useState(false);
    const hasEnd = endLat != null && endLon != null;
    const routeLinePoints = routePoints.map(
        (point) => [point.latitude, point.longitude] as L.LatLngTuple
    );
    const fallbackEndPoint =
        hasEnd
            ? ([endLat!, endLon!] as [number, number])
            : routeLinePoints.length > 0
                ? routeLinePoints[routeLinePoints.length - 1]
                : null;
    const isSinglePoint = fallbackEndPoint == null
        || (startLat === fallbackEndPoint[0] && startLon === fallbackEndPoint[1]);

    // Calculate center and bounds
    const centerLat = fallbackEndPoint ? (startLat + fallbackEndPoint[0]) / 2 : startLat;
    const centerLon = fallbackEndPoint ? (startLon + fallbackEndPoint[1]) / 2 : startLon;

    // Create bounds for fitBounds. If it's a single point (like a charging session), box it out nicely to zoom out more
    const boundsPoints: L.LatLngTuple[] = routeLinePoints.length >= 2
        ? routeLinePoints
        : fallbackEndPoint
            ? [[startLat, startLon], fallbackEndPoint]
            : [[startLat, startLon]];

    const bounds = isSinglePoint
        ? L.latLngBounds([
            [startLat - 0.02, startLon - 0.02],
            [startLat + 0.02, startLon + 0.02]
        ])
        : L.latLngBounds(boundsPoints);

    useEffect(() => {
        if (isNearViewport || !containerRef.current) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setIsNearViewport(true);
                        observer.disconnect();
                        break;
                    }
                }
            },
            { rootMargin: MAP_VIEWPORT_ROOT_MARGIN }
        );

        observer.observe(containerRef.current);

        return () => observer.disconnect();
    }, [isNearViewport]);

    return (
        <div ref={containerRef} className="relative z-0 isolate h-full w-full overflow-hidden rounded-lg bg-slate-700/30">
            {isNearViewport ? (
                <MapContainer
                    center={[centerLat, centerLon]}
                    zoom={12}
                    className="z-0"
                    style={{ height: '100%', width: '100%', zIndex: 0 }}
                    zoomControl={false}
                    dragging={false}
                    scrollWheelZoom={false}
                    doubleClickZoom={false}
                    touchZoom={false}
                    attributionControl={false}
                    preferCanvas
                >
                    <TileLayer
                        attribution={tileConfig.attribution}
                        url={tileConfig.url}
                    />

                    {/* Fit bounds to show both markers */}
                    <FitBounds bounds={bounds} />

                    {/* Start marker */}
                    <Marker position={[startLat, startLon]} icon={startIcon} />

                    {/* End marker and line (only if it's an actual trip with distance) */}
                    {!isSinglePoint && fallbackEndPoint && (
                        <>
                            <Marker position={fallbackEndPoint} icon={endIcon} />
                            {routeLinePoints.length >= 2 ? (
                                <Polyline
                                    positions={routeLinePoints}
                                    pathOptions={{ color: '#38bdf8', weight: 2.5, opacity: 0.85 }}
                                />
                            ) : (
                                <Polyline
                                    positions={[[startLat, startLon], fallbackEndPoint]}
                                    pathOptions={{ color: '#3b82f6', weight: 2, opacity: 0.7, dashArray: '5, 5' }}
                                />
                            )}
                        </>
                    )}
                </MapContainer>
            ) : (
                <div className="h-full w-full animate-pulse bg-slate-700/30" />
            )}
        </div>
    );
}
