'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Search, Loader2 } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { fetchReverseGeocode } from '@/lib/client/geocode';
import { getMapTileConfig } from '@/lib/maps/style';

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

interface LocationPickerProps {
    latitude: number | null;
    longitude: number | null;
    address?: string;
    onLocationChange: (lat: number, lon: number, address: string) => void;
}

interface SearchResult {
    lat: string;
    lon: string;
    display_name: string;
}

function LocationMarker({ lat, lon, onDragEnd }: { lat: number; lon: number; onDragEnd: (lat: number, lon: number) => void }) {
    const map = useMap();
    const position = new L.LatLng(lat, lon);
    const markerRef = useRef<L.Marker | null>(null);

    useEffect(() => {
        const container = map.getContainer();

        if (!container || !container.isConnected) {
            return;
        }

        map.setView([lat, lon], map.getZoom(), { animate: false });
    }, [lat, lon, map]);

    const eventHandlers = {
        dragend() {
            const marker = markerRef.current;
            if (marker != null) {
                const newPos = marker.getLatLng();
                onDragEnd(newPos.lat, newPos.lng);
            }
        },
    };

    return (
        <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={position}
            ref={markerRef}
            icon={defaultIcon}
        >
            <Popup>Drag to set home location</Popup>
        </Marker>
    );
}

function MapEvents({ onClick }: { onClick: (lat: number, lon: number) => void }) {
    useMapEvents({
        click(e) {
            onClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

export default function LocationPicker({ latitude, longitude, address, onLocationChange }: LocationPickerProps) {
    const mapStyle = useSettingsStore((state) => state.mapStyle);
    const tileConfig = getMapTileConfig(mapStyle);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const searchAbortRef = useRef<AbortController | null>(null);
    const searchCacheRef = useRef<Map<string, SearchResult[]>>(new Map());

    // Default to a central location if none provided (e.g., Zurich)
    const defaultLat = 47.3769;
    const defaultLon = 8.5417;

    const currentLat = latitude || defaultLat;
    const currentLon = longitude || defaultLon;

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedQuery = searchQuery.trim();
        if (!normalizedQuery) return;

        const cachedResults = searchCacheRef.current.get(normalizedQuery.toLowerCase());
        if (cachedResults) {
            setSearchResults(cachedResults);
            return;
        }

        searchAbortRef.current?.abort();
        const controller = new AbortController();
        searchAbortRef.current = controller;
        setIsSearching(true);
        try {
            const res = await fetch(`/api/geocode?q=${encodeURIComponent(normalizedQuery)}`, {
                signal: controller.signal,
            });
            const payload = await res.json();
            const data: SearchResult[] = Array.isArray(payload.results) ? payload.results : [];
            if (controller.signal.aborted) {
                return;
            }
            searchCacheRef.current.set(normalizedQuery.toLowerCase(), data);
            setSearchResults(data);
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            console.error('Search failed:', error);
        } finally {
            if (searchAbortRef.current === controller) {
                searchAbortRef.current = null;
            }
            if (!controller.signal.aborted) {
                setIsSearching(false);
            }
        }
    };

    useEffect(() => () => {
        searchAbortRef.current?.abort();
    }, []);

    const handleSelectLocation = async (lat: number, lon: number) => {
        // Reverse geocoding
        try {
            const data = await fetchReverseGeocode(lat, lon);
            onLocationChange(lat, lon, data.address || data.fallback || 'Unknown location');
            setSearchResults([]); // Clear search results
            setSearchQuery('');
        } catch (error) {
            console.error('Reverse geocoding failed:', error);
            onLocationChange(lat, lon, 'Unknown location');
        }
    };

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
                <form onSubmit={handleSearch} className="flex gap-2">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search for address..."
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                    />
                    <button
                        type="submit"
                        disabled={isSearching}
                        className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50"
                    >
                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Search
                    </button>
                </form>

                {/* Search Results Dropdown */}
                {searchResults.length > 0 && (
                    <div className="absolute top-full z-[1000] mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
                        {searchResults.map((result, i) => (
                            <button
                                key={i}
                                onClick={() => handleSelectLocation(parseFloat(result.lat), parseFloat(result.lon))}
                                className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
                            >
                                {result.display_name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Map */}
            <div className="relative z-0 h-[400px] w-full overflow-hidden rounded-xl border border-slate-700">
                <MapContainer
                    center={[currentLat, currentLon]}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                    zoomAnimation={false}
                    fadeAnimation={false}
                    markerZoomAnimation={false}
                >
                    <TileLayer
                        attribution={tileConfig.attribution}
                        url={tileConfig.url}
                    />
                    <LocationMarker
                        lat={currentLat}
                        lon={currentLon}
                        onDragEnd={handleSelectLocation}
                    />
                    <MapEvents onClick={handleSelectLocation} />
                </MapContainer>
            </div>

            {/* Selected Address Display */}
            {address && (
                <div className="flex items-start gap-2 rounded-lg bg-slate-800/50 p-3 text-sm text-slate-300">
                    <span className="font-medium text-slate-400">Selected:</span>
                    <span>{address}</span>
                </div>
            )}

            <p className="text-xs text-slate-500">
                Drag the marker or click on the map to fine-tune your home location.
            </p>
        </div>
    );
}
