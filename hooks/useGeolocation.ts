import { useState, useEffect, useCallback, useRef } from 'react';

interface GeolocationState {
    location: { lat: number; lng: number } | null;
    error: string | null;
    isTracking: boolean;
    accuracy: number | null;
}

export function useGeolocation() {
    const [state, setState] = useState<GeolocationState>({
        location: null,
        error: null,
        isTracking: false,
        accuracy: null,
    });

    const watchIdRef = useRef<number | null>(null);
    const lastUpdateRef = useRef<number>(0);

    const handleSuccess = useCallback((position: GeolocationPosition) => {
        const now = Date.now();
        // Debounce updates to 300ms
        if (now - lastUpdateRef.current < 300) return;

        setState((prev) => ({
            ...prev,
            location: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            },
            accuracy: position.coords.accuracy,
            error: null,
        }));
        lastUpdateRef.current = now;
    }, []);

    const handleError = useCallback((error: GeolocationPositionError) => {
        let errorMessage = 'Location permission required to show nearby stations';

        switch (error.code) {
            case error.PERMISSION_DENIED:
                errorMessage = 'Location permission denied. Please enable location access to see nearby charging stations.';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMessage = 'Location information unavailable. Please check your device settings.';
                break;
            case error.TIMEOUT:
                errorMessage = 'Location request timed out. Please try again.';
                break;
        }

        setState((prev) => ({
            ...prev,
            error: errorMessage,
            location: null,
        }));
    }, []);

    const requestLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setState((prev) => ({
                ...prev,
                error: 'Geolocation is not supported by your browser',
            }));
            return;
        }

        setState((prev) => ({ ...prev, error: null }));

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                // If browser accuracy is poor (>50km), try Google API fallback
                // if (position.coords.accuracy > 50000) {
                //     try {
                //         const response = await fetch('http://localhost:3001/api/geolocation');
                //         if (response.ok) {
                //             const data = await response.json();
                //             handleSuccess({
                //                 coords: {
                //                     latitude: data.lat,
                //                     longitude: data.lng,
                //                     accuracy: data.accuracy,
                //                     altitude: null,
                //                     altitudeAccuracy: null,
                //                     heading: null,
                //                     speed: null
                //                 },
                //                 timestamp: Date.now()
                //             } as GeolocationPosition);
                //             return;
                //         }
                //     } catch (err) {
                //         console.warn('Google Geolocation API fallback failed:', err);
                //     }
                // }
                // Use browser location if accuracy is good or fallback failed
                handleSuccess(position);
            },
            handleError,
            {
                // Prioritize cached high-accuracy positions (e.g., from recent WiFi scans)
                enableHighAccuracy: true,
                maximumAge: Infinity, // Use any cached position regardless of age if available
                timeout: 15000,
            }
        );
    }, [handleSuccess, handleError]);

    const startTracking = useCallback(() => {
        if (!navigator.geolocation) return;

        // Clear existing watch if any
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }

        setState((prev) => ({ ...prev, isTracking: true, error: null }));

        const id = navigator.geolocation.watchPosition(handleSuccess, handleError, {
            // Prioritize cached high-accuracy positions
            enableHighAccuracy: true,
            maximumAge: Infinity,
            timeout: 15000,
        });

        watchIdRef.current = id;
    }, [handleSuccess, handleError]);

    const stopTracking = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setState((prev) => ({ ...prev, isTracking: false }));
    }, []);

    // Request location on mount
    useEffect(() => {
        requestLocation();

        // Cleanup tracking on unmount
        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, [requestLocation]);

    return {
        location: state.location,
        error: state.error,
        isTracking: state.isTracking,
        accuracy: state.accuracy,
        startTracking,
        stopTracking,
        retry: requestLocation,
    };
}
