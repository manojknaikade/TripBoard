'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface VehicleMapProps {
    latitude: number;
    longitude: number;
    heading?: number;
    vehicleName?: string;
}

export default function VehicleMap({ latitude, longitude, heading, vehicleName }: VehicleMapProps) {
    const mapRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Initialize map if not already done
        if (!mapRef.current) {
            mapRef.current = L.map(containerRef.current, {
                center: [latitude, longitude],
                zoom: 15,
                zoomControl: true,
                attributionControl: true,
            });

            // Add OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 19,
            }).addTo(mapRef.current);

            // Custom Tesla marker icon
            const teslaIcon = L.divIcon({
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
            transform: rotate(${heading || 0}deg);
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
            </svg>
          </div>
        `,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
            });

            markerRef.current = L.marker([latitude, longitude], { icon: teslaIcon })
                .addTo(mapRef.current)
                .bindPopup(vehicleName || 'Your Tesla');
        } else {
            // Update marker position
            const newLatLng = L.latLng(latitude, longitude);
            markerRef.current?.setLatLng(newLatLng);
            mapRef.current.panTo(newLatLng);
        }

        return () => {
            // Cleanup on unmount
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
                markerRef.current = null;
            }
        };
    }, [latitude, longitude, heading, vehicleName]);

    return (
        <div
            ref={containerRef}
            className="h-64 w-full overflow-hidden rounded-xl bg-slate-700/30"
            style={{ zIndex: 0 }}
        />
    );
}
