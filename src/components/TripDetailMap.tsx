'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSettingsStore } from '@/stores/settingsStore';
import { getMapTileConfig } from '@/lib/maps/style';

interface TripDetailMapProps {
    startLat: number;
    startLng: number;
    endLat?: number | null;
    endLng?: number | null;
}

export default function TripDetailMap({ startLat, startLng, endLat, endLng }: TripDetailMapProps) {
    const { mapStyle } = useSettingsStore();
    const tileConfig = getMapTileConfig(mapStyle);
    const mapRef = useRef<L.Map | null>(null);
    const startMarkerRef = useRef<L.Marker | null>(null);
    const endMarkerRef = useRef<L.Marker | null>(null);
    const lineRef = useRef<L.Polyline | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Initialize map if not already done
        if (!mapRef.current) {
            const hasEnd = endLat != null && endLng != null;

            // Calculate center
            const centerLat = hasEnd ? (startLat + endLat) / 2 : startLat;
            const centerLng = hasEnd ? (startLng + endLng) / 2 : startLng;

            mapRef.current = L.map(containerRef.current, {
                center: [centerLat, centerLng],
                zoom: 13,
                zoomControl: true,
                attributionControl: true,
            });

            L.tileLayer(tileConfig.url, {
                attribution: tileConfig.attribution,
                maxZoom: tileConfig.maxZoom,
            }).addTo(mapRef.current);

            // Custom start icon (green)
            const startIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `
                    <div style="
                        background: #22c55e;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        border: 3px solid white;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    "></div>
                `,
                iconSize: [20, 20],
                iconAnchor: [10, 10],
            });

            // Custom end icon (red)
            const endIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `
                    <div style="
                        background: #ef4444;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        border: 3px solid white;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    "></div>
                `,
                iconSize: [20, 20],
                iconAnchor: [10, 10],
            });

            // Add start marker
            startMarkerRef.current = L.marker([startLat, startLng], { icon: startIcon })
                .addTo(mapRef.current)
                .bindPopup(`Start: ${startLat.toFixed(4)}, ${startLng.toFixed(4)}`);

            // Add end marker and line if we have end coordinates and it's not a single point
            const isSinglePoint = hasEnd && startLat === endLat && startLng === endLng;

            if (hasEnd && !isSinglePoint) {
                endMarkerRef.current = L.marker([endLat, endLng], { icon: endIcon })
                    .addTo(mapRef.current)
                    .bindPopup(`End: ${endLat.toFixed(4)}, ${endLng.toFixed(4)}`);

                // Add dashed line between points
                lineRef.current = L.polyline(
                    [[startLat, startLng], [endLat, endLng]],
                    {
                        color: '#3b82f6',
                        weight: 3,
                        opacity: 0.7,
                        dashArray: '10, 10'
                    }
                ).addTo(mapRef.current);

                // Fit bounds to show both markers
                const bounds = L.latLngBounds([
                    [startLat, startLng],
                    [endLat, endLng]
                ]);
                mapRef.current.fitBounds(bounds, { padding: [50, 50] });
            } else if (isSinglePoint) {
                // It's a charging session. Just zoom to 14 around the spot.
                mapRef.current.setZoom(14);
            }
        }

        return () => {
            // Cleanup on unmount
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
                startMarkerRef.current = null;
                endMarkerRef.current = null;
                lineRef.current = null;
            }
        };
    }, [startLat, startLng, endLat, endLng, tileConfig.attribution, tileConfig.maxZoom, tileConfig.url]);

    return (
        <div
            ref={containerRef}
            className="h-96 w-full overflow-hidden rounded-xl border border-slate-700/50 bg-slate-700/30"
            style={{ zIndex: 0 }}
        />
    );
}
