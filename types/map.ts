// Map-related types
export interface LatLng {
    lat: number;
    lng: number;
}

export interface MapBounds {
    north: number;
    south: number;
    east: number;
    west: number;
}

export interface MapViewport {
    center: LatLng;
    zoom: number;
    bounds?: MapBounds;
}

export type MapTheme = 'light' | 'dark';

export interface UserLocation {
    position: LatLng;
    accuracy: number;
    timestamp: number;
}
