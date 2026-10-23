import { Loader } from '@googlemaps/js-api-loader';

// Singleton reference to the Loader instance
let loaderInstance: Loader | null = null;
let loadPromise: Promise<void> | null = null;

const LIBRARIES: ("places" | "geometry" | "drawing" | "visualization")[] = ['places', 'geometry'];

/**
 * Initializes the Google Maps Loader singleton.
 * This function is idempotent: calling it multiple times returns the same promise.
 */
export const getGoogleMapsLoader = (): Promise<void> => {
    // 1. Return existing promise if already loading/loaded
    if (loadPromise) {
        return loadPromise;
    }

    // 2. Validate API Key
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.error("❌ Google Maps API Key is missing in environment variables!");
        return Promise.reject(new Error("Missing Google Maps API Key"));
    }

    // 3. Create new Loader instance
    loaderInstance = new Loader({
        apiKey: apiKey,
        version: "weekly", // Use specific version for stability in production
        libraries: LIBRARIES,
        id: 'google-maps-script', // distinct ID to prevent duplicate tags
        retries: 3,
    });

    // 4. Create and cache the promise
    loadPromise = loaderInstance.load().then(() => {
        if (process.env.NODE_ENV === 'development') {
            console.log("✅ Google Maps API Loaded Successfully (Singleton)");
        }
    }).catch((err) => {
        console.error("❌ Failed to load Google Maps API", err);
        loadPromise = null; // Reset promise to allow retry
        throw err;
    });

    return loadPromise;
};

/**
 * Helper to check if Maps API is ready without awaiting
 */
export const isMapsLoaded = (): boolean => {
    return typeof window !== 'undefined' && !!window.google && !!window.google.maps;
};
