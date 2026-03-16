'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSettingsStore } from '@/stores/settingsStore';
import { getMapTileConfig } from '@/lib/maps/style';

interface VehicleMapProps {
    latitude: number;
    longitude: number;
    heading?: number;
    vehicleName?: string;
    className?: string;
}

function buildTeslaIcon(heading = 0) {
    return L.divIcon({
        className: 'tesla-marker',
        html: `
          <div style="
            background: linear-gradient(135deg, #ef4444, #dc2626);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(${heading}deg);
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
            </svg>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
}

export default function VehicleMap({
    latitude,
    longitude,
    heading,
    vehicleName,
    className,
}: VehicleMapProps) {
    const mapStyle = useSettingsStore((state) => state.mapStyle);
    const tileConfig = getMapTileConfig(mapStyle);
    const initialCenterRef = useRef({ latitude, longitude });
    const mapRef = useRef<L.Map | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        mapRef.current = L.map(containerRef.current, {
            center: [initialCenterRef.current.latitude, initialCenterRef.current.longitude],
            zoom: 15,
            zoomControl: true,
            attributionControl: true,
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
                tileLayerRef.current = null;
                markerRef.current = null;
            }
        };
    }, []);

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
        if (!mapRef.current) {
            return;
        }

        const newLatLng = L.latLng(latitude, longitude);
        const icon = buildTeslaIcon(heading || 0);

        if (!markerRef.current) {
            markerRef.current = L.marker(newLatLng, { icon })
                .addTo(mapRef.current)
                .bindPopup(vehicleName || 'Your Tesla');
        } else {
            markerRef.current.setIcon(icon);
            markerRef.current.setLatLng(newLatLng);
            markerRef.current.getPopup()?.setContent(vehicleName || 'Your Tesla');
        }

        mapRef.current.panTo(newLatLng);
    }, [latitude, longitude, heading, vehicleName]);

    return (
        <div
            ref={containerRef}
            className={className ?? 'h-64 w-full overflow-hidden rounded-xl bg-slate-700/30'}
            style={{ zIndex: 0 }}
        />
    );
}
