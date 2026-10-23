import { create } from 'zustand';
import { LatLng, MapViewport, MapTheme, UserLocation } from '@/types/map';

interface MapState {
    // Map viewport
    viewport: MapViewport;
    theme: MapTheme;

    // User location
    userLocation: UserLocation | null;
    locationError: string | null;
    isTracking: boolean;

    // Selected location
    selectedLocation: LatLng | null;

    // Map instance
    mapInstance: google.maps.Map | null;
    userMarker: google.maps.Marker | null;

    // Actions
    setViewport: (viewport: Partial<MapViewport>) => void;
    setTheme: (theme: MapTheme) => void;
    setUserLocation: (location: UserLocation | null) => void;
    setLocationError: (error: string | null) => void;
    setSelectedLocation: (location: LatLng | null) => void;
    setMapInstance: (map: google.maps.Map | null) => void;
    setUserMarker: (marker: google.maps.Marker | null) => void;
    setIsTracking: (isTracking: boolean) => void;
    centerOnLocation: (location: LatLng, zoom?: number) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
    // Initial state
    viewport: {
        center: { lat: 28.6139, lng: 77.2090 }, // Default to Delhi
        zoom: 12,
    },
    theme: 'light',
    userLocation: null,
    locationError: null,
    isTracking: false,
    selectedLocation: null,
    mapInstance: null,
    userMarker: null,

    // Actions
    setViewport: (viewport) =>
        set((state) => ({
            viewport: { ...state.viewport, ...viewport },
        })),

    setTheme: (theme) => set({ theme }),

    setUserLocation: (location) =>
        set({
            userLocation: location,
            locationError: null,
        }),

    setLocationError: (error) =>
        set({
            locationError: error,
            userLocation: null,
        }),

    setSelectedLocation: (location) => set({ selectedLocation: location }),

    setMapInstance: (map) => set({ mapInstance: map }),

    setUserMarker: (marker) => set({ userMarker: marker }),

    setIsTracking: (isTracking) => set({ isTracking }),

    centerOnLocation: (location, zoom) => {
        const { mapInstance } = get();
        if (mapInstance) {
            mapInstance.panTo(location);
            if (zoom !== undefined) {
                mapInstance.setZoom(zoom);
            }
        }
        set((state) => ({
            viewport: {
                ...state.viewport,
                center: location,
                ...(zoom !== undefined && { zoom }),
            },
        }));
    },
}));
