export type MapStyle = 'streets' | 'dark';

type MapTileConfig = {
    url: string;
    attribution: string;
    maxZoom: number;
};

const OPENSTREETMAP_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function getMapTileConfig(mapStyle: MapStyle): MapTileConfig {
    if (mapStyle === 'dark') {
        return {
            url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            attribution: OPENSTREETMAP_ATTRIBUTION,
            maxZoom: 19,
        };
    }

    return {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: OPENSTREETMAP_ATTRIBUTION,
        maxZoom: 19,
    };
}
