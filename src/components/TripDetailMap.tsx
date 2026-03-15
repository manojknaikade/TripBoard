'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSettingsStore } from '@/stores/settingsStore';
import { getMapTileConfig } from '@/lib/maps/style';
import type { TripRoutePoint } from '@/lib/trips/routePoints';

interface TripDetailMapProps {
    startLat: number;
    startLng: number;
    endLat?: number | null;
    endLng?: number | null;
    routePoints?: TripRoutePoint[];
}

function buildMarkerIcon(color: string) {
    return L.divIcon({
        className: 'custom-div-icon',
        html: `
            <div style="
                background: ${color};
                width: 18px;
                height: 18px;
                border-radius: 9999px;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(15, 23, 42, 0.35);
            "></div>
        `,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
    });
}

export default function TripDetailMap({
    startLat,
    startLng,
    endLat,
    endLng,
    routePoints = [],
}: TripDetailMapProps) {
    const mapStyle = useSettingsStore((state) => state.mapStyle);
    const tileConfig = getMapTileConfig(mapStyle);
    const mapRef = useRef<L.Map | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const routeLayerRef = useRef<L.LayerGroup | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) {
            return;
        }

        mapRef.current = L.map(containerRef.current, {
            center: [startLat, startLng],
            zoom: 13,
            zoomControl: true,
            attributionControl: true,
        });

        routeLayerRef.current = L.layerGroup().addTo(mapRef.current);

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }

            tileLayerRef.current = null;
            routeLayerRef.current = null;
        };
    }, [startLat, startLng]);

    useEffect(() => {
        if (!mapRef.current) {
            return;
        }

        if (tileLayerRef.current) {
            tileLayerRef.current.remove();
        }

        tileLayerRef.current = L.tileLayer(tileConfig.url, {
            attribution: tileConfig.attribution,
            maxZoom: tileConfig.maxZoom,
        }).addTo(mapRef.current);
    }, [tileConfig.attribution, tileConfig.maxZoom, tileConfig.url]);

    useEffect(() => {
        const map = mapRef.current;
        const routeLayer = routeLayerRef.current;

        if (!map || !routeLayer) {
            return;
        }

        routeLayer.clearLayers();

        const startPoint: L.LatLngTuple = [startLat, startLng];
        const routeLinePoints = routePoints
            .map((point) => [point.latitude, point.longitude] as L.LatLngTuple);
        const fallbackEndPoint =
            endLat != null && endLng != null
                ? ([endLat, endLng] as L.LatLngTuple)
                : routeLinePoints.length > 0
                    ? routeLinePoints[routeLinePoints.length - 1]
                    : null;

        const isSinglePoint = fallbackEndPoint
            ? startPoint[0] === fallbackEndPoint[0] && startPoint[1] === fallbackEndPoint[1]
            : true;

        const startMarker = L.marker(startPoint, { icon: buildMarkerIcon('#22c55e') })
            .bindPopup(`Start: ${startLat.toFixed(4)}, ${startLng.toFixed(4)}`);
        routeLayer.addLayer(startMarker);

        if (routeLinePoints.length >= 2) {
            const routeLine = L.polyline(routeLinePoints, {
                color: '#38bdf8',
                weight: 4,
                opacity: 0.85,
                lineJoin: 'round',
            });
            routeLayer.addLayer(routeLine);

            const routeBounds = L.latLngBounds(routeLinePoints);
            map.fitBounds(routeBounds, { padding: [36, 36] });
        } else if (fallbackEndPoint && !isSinglePoint) {
            const fallbackLine = L.polyline([startPoint, fallbackEndPoint], {
                color: '#60a5fa',
                weight: 3,
                opacity: 0.75,
                dashArray: '10, 10',
            });
            routeLayer.addLayer(fallbackLine);

            map.fitBounds(L.latLngBounds([startPoint, fallbackEndPoint]), { padding: [36, 36] });
        } else {
            map.setView(startPoint, 14);
        }

        if (fallbackEndPoint && !isSinglePoint) {
            const endMarker = L.marker(fallbackEndPoint, { icon: buildMarkerIcon('#ef4444') })
                .bindPopup(`End: ${fallbackEndPoint[0].toFixed(4)}, ${fallbackEndPoint[1].toFixed(4)}`);
            routeLayer.addLayer(endMarker);
        }
    }, [startLat, startLng, endLat, endLng, routePoints]);

    return (
        <div
            ref={containerRef}
            className="h-96 w-full overflow-hidden rounded-xl border border-slate-700/50 bg-slate-700/30"
            style={{ zIndex: 0 }}
        />
    );
}
