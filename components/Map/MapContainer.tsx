'use client';

import { useEffect, useRef, useState } from 'react';
import { getGoogleMapsLoader } from '@/lib/googleMapsLoader';
import { useMapStore } from '@/store/mapStore';
import { useStationsStore } from '@/store/stationsStore';
import { useRouteStore } from '@/store/routeStore';
import { useGeolocation } from '@/hooks/useGeolocation';
import { placesEVService } from '@/services/placesEVService';
import { directionsService } from '@/services/directionsService';
import MapControls from './MapControlPanel';
import StationMarker from './StationMarker';


import SkeletonMap from './SkeletonMap';

// Map styles
const lightMapStyle = [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

const darkMapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
];

export default function MapContainer() {
    const mapRef = useRef<HTMLDivElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        theme,
        mapInstance,
        setMapInstance,
        setUserMarker,
        setUserLocation,
        setLocationError,
        viewport,
        setViewport
    } = useMapStore();

    const {
        filteredStations,
        selectedStation,
        setSelectedStation,
        setStations,
        loading: stationsLoading,
        setLoading,
        fetchStationsInBounds,
    } = useStationsStore();

    // Debug log for stations
    useEffect(() => {
        console.log(`🗺️ MapContainer: Rendering with ${filteredStations.length} stations`);
    }, [filteredStations]);

    // Geolocation
    const { location, error: geoError, retry, accuracy, startTracking, stopTracking } = useGeolocation();

    // Start tracking on mount
    useEffect(() => {
        startTracking();
        return () => {
            stopTracking();
        };
    }, [startTracking, stopTracking]);

    // Sync location to store
    const locationRef = useRef(location);
    useEffect(() => {
        locationRef.current = location;
        if (location) {
            setUserLocation({
                position: location,
                accuracy: accuracy || 0,
                timestamp: Date.now()
            });
        } else if (geoError) {
            setLocationError(geoError);
        }
    }, [location, accuracy, geoError, setUserLocation, setLocationError]);

    // Debounce timer ref
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Initialize map
    useEffect(() => {
        let map: google.maps.Map | null = null;
        let idleListener: google.maps.MapsEventListener | null = null;
        let isMounted = true;

        const initMap = async () => {
            try {
                // 1. Preload Loader (Effect-based)
                await getGoogleMapsLoader();
                if (!isMounted) return;

                // 2. Singleton Reuse Strategy
                const existingMap = useMapStore.getState().mapInstance;
                const google = window.google;

                if (existingMap) {
                    if (existingMap.getDiv() === mapRef.current) {
                        console.log("♻️  Reusing attached Google Map instance.");
                        map = existingMap;
                    } else {
                        console.warn('⚠️ Map instance exists but attached to other node; skipping re-create to preserve singleton.');
                        map = existingMap;
                    }
                } else if (mapRef.current) {
                    console.log("🆕  Creating NEW Google Map instance.");

                    if (typeof window !== 'undefined') {
                        (window as any).__MAP_CREATE_COUNT = ((window as any).__MAP_CREATE_COUNT || 0) + 1;
                    }

                    map = new google.maps.Map(mapRef.current, {
                        center: viewport.center,
                        zoom: viewport.zoom,
                        styles: theme === 'dark' ? darkMapStyle : lightMapStyle,
                        disableDefaultUI: true,
                        gestureHandling: 'greedy',
                        minZoom: 10,
                        backgroundColor: theme === 'dark' ? '#242f3e' : '#f0f0f0',
                        clickableIcons: false,
                    });
                    setMapInstance(map);
                }

                if (!map) return;

                // Initialize Services with Map Instance (Always)
                placesEVService.initialize(map);
                directionsService.initialize();

                // 3. Setup Listeners
                // Clear previous idle listeners to avoid duplication
                google.maps.event.clearListeners(map, 'idle');

                idleListener = map.addListener('idle', () => {
                    if (debounceTimer.current) clearTimeout(debounceTimer.current);

                    debounceTimer.current = setTimeout(async () => {
                        if (!map || !isMounted) return;

                        // Sync State to Store
                        const center = map.getCenter();
                        const zoom = map.getZoom();
                        if (center && zoom) {
                            setViewport({
                                center: { lat: center.lat(), lng: center.lng() },
                                zoom: zoom
                            });
                        }

                        // Robust Bounds Check
                        const bounds = map.getBounds();
                        if (!bounds) return;

                        const ne = bounds.getNorthEast();
                        const sw = bounds.getSouthWest();

                        // Check for valid, finite coordinates
                        if (!isFinite(ne.lat()) || !isFinite(sw.lat()) ||
                            !isFinite(ne.lng()) || !isFinite(sw.lng())) {
                            return;
                        }

                        // Zoom Check
                        const currentZoom = map.getZoom();
                        if (currentZoom && currentZoom < 12) return;

                        const currentLocation = locationRef.current;

                        console.log('🗺️ Map idle: Fetching live stations (Google Places)...');

                        // increment debug counter for station fetches
                        if (typeof window !== 'undefined') {
                            (window as any).__STATION_FETCH_COUNT = ((window as any).__STATION_FETCH_COUNT || 0) + 1;
                        }

                        // Use Store Action (handles loading state internally and uses Google Places API)
                        if (currentLocation) {
                            await fetchStationsInBounds(
                                { lat: currentLocation.lat, lng: currentLocation.lng },
                                bounds
                            );
                        }
                    }, 500);
                });

                setIsLoaded(true);

            } catch (err) {
                console.error('Error initializing map:', err);
                setError('Failed to load Google Maps.');
            }
        };

        initMap();

        return () => {
            isMounted = false;
            // Safer Cleanup
            if (idleListener) {
                idleListener.remove();
            }
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            // Do NOT destroy map instance (Preserve for persistence)
        };
    }, []); // Only runs once on mount

    // Center map on user location (Strict Source of Truth)
    useEffect(() => {
        const map = useMapStore.getState().mapInstance;
        if (!map || !location) return;

        const userPos = { lat: location.lat, lng: location.lng };
        const existingMarker = useMapStore.getState().userMarker;

        if (!existingMarker) {
            const google = window.google;
            if (!google) return; // Guard

            console.log('📍 Initial user location lock:', userPos);
            map.setCenter(userPos);
            map.setZoom(15);

            const marker = new google.maps.Marker({
                position: userPos,
                map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: '#4285F4',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 3,
                },
                title: 'You are here',
                zIndex: 1000,
            });
            setUserMarker(marker);
        } else {
            existingMarker.setPosition(userPos);
        }
    }, [location]);

    // Apply theme changes to existing map without recreating map
    useEffect(() => {
        const map = useMapStore.getState().mapInstance;
        if (!map) return;

        const styles = theme === 'dark' ? darkMapStyle : lightMapStyle;
        map.setOptions({ styles, backgroundColor: theme === 'dark' ? '#242f3e' : '#f0f0f0' });
    }, [theme]);

    // Route Rendering & Tracking Logic
    const { activeRoute, previewRoute, isNavigating, followMode } = useRouteStore();
    const polylineRef = useRef<google.maps.Polyline | null>(null);

    // Render Route
    useEffect(() => {
        const map = useMapStore.getState().mapInstance;
        const google = window.google;
        if (!map || !google) return;

        if (polylineRef.current) {
            polylineRef.current.setMap(null);
            polylineRef.current = null;
        }

        const routeToRender = isNavigating ? activeRoute : (previewRoute || activeRoute);

        if (routeToRender) {
            try {
                const path = google.maps.geometry.encoding.decodePath(routeToRender.polyline);
                const polyline = new google.maps.Polyline({
                    path,
                    geodesic: true,
                    strokeColor: '#2563EB',
                    strokeOpacity: isNavigating ? 1.0 : 0.7,
                    strokeWeight: 6,
                    map,
                });
                polylineRef.current = polyline;

                if (!isNavigating && routeToRender.bounds) {
                    const bounds = new google.maps.LatLngBounds(
                        routeToRender.bounds.southwest,
                        routeToRender.bounds.northeast
                    );
                    map.fitBounds(bounds, 50);
                }
            } catch (error) {
                console.error('Failed to render route polyline:', error);
            }
        }
    }, [activeRoute, previewRoute, isNavigating]);

    // 1. Error
    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                <p className="text-red-500">Events Map Error: {error}</p>
            </div>
        );
    }

    // 2. Render Map (Immediately)
    return (
        <div className="relative w-full h-full">
            <div ref={mapRef} className="w-full h-full" />

            {/* Locating Overlay */}
            {(!location && !geoError) && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none">
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                        <div className="animate-pulse w-2 h-2 bg-primary-500 rounded-full"></div>
                        <span className="text-sm font-medium">Locating...</span>
                    </div>
                </div>
            )}

            {/* Skeleton / Loading State */}
            {!isLoaded && (
                <div className="absolute inset-0 z-10">
                    <SkeletonMap />
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        <span className="text-sm font-medium">Initializing Map...</span>
                    </div>
                </div>
            )}

            {/* Station Fetching Overlay (Small) */}
            {isLoaded && stationsLoading && (
                <div className="absolute top-24 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg z-10 flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                    <span className="text-xs font-medium">Updating stations...</span>
                </div>
            )}

            {/* Controls & UI */}
            {geoError && (
                <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-20 px-4">
                    <div className="bg-red-100 text-red-700 p-2 rounded text-sm">
                        {geoError} <button onClick={retry} className="underline font-bold">Retry</button>
                    </div>
                </div>
            )}

            <MapControls />



            {mapInstance && filteredStations.map((station) => (
                <StationMarker
                    key={station.id}
                    station={station}
                    map={mapInstance}
                    isSelected={selectedStation?.id === station.id}
                    onClick={() => setSelectedStation(station)}
                />
            ))}

            <ChargingWaypointMarkers />
        </div>
    );
}

function ChargingWaypointMarkers() {
    const { chargingStops } = useRouteStore();
    const { mapInstance } = useMapStore();
    const markersRef = useRef<google.maps.Marker[]>([]);

    useEffect(() => {
        // Clear old markers
        markersRef.current.forEach(m => {
            try { m.setMap(null); } catch (e) { /* ignore */ }
        });
        markersRef.current = [];

        const google = (typeof window !== 'undefined') ? (window as any).google : undefined;
        if (!mapInstance || !google || chargingStops.length === 0) return;

        chargingStops.forEach((stop, index) => {
            const marker = new google.maps.Marker({
                position: stop.location,
                map: mapInstance,
                label: {
                    text: `${index + 1}`,
                    color: '#ffffff',
                    fontWeight: 'bold'
                },
                title: stop.name || `Charging Stop ${index + 1}`,
                zIndex: 1000 + index,
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `<div style="padding:8px;"><strong>${stop.name || `Stop ${index + 1}`}</strong>${stop.address ? `<div style="font-size:12px;color:#666">${stop.address}</div>` : ''}</div>`
            });

            marker.addListener('click', () => infoWindow.open(mapInstance, marker));
            markersRef.current.push(marker);
        });

        return () => {
            markersRef.current.forEach(m => {
                try { m.setMap(null); } catch (e) { /* ignore */ }
            });
            markersRef.current = [];
        };
    }, [chargingStops, mapInstance]);

    return null;
}
