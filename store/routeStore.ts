import { create } from 'zustand';
import { RouteInfo, TripPlan, ChargingStop, SavedItinerary } from '@/types/route';
import { ChargingStation } from '@/types/station';

export type TravelMode = 'DRIVING' | 'TWO_WHEELER' | 'WALKING';

interface RouteState {
    itineraryUserId: string | null;
    itinerary: SavedItinerary | null;
    itineraryStorageError: string | null;
    loadItinerary: (userId: string) => void;
    saveItinerary: (itinerary: SavedItinerary) => void;
    // Navigation state
    activeRoute: RouteInfo | null;
    previewRoute: RouteInfo | null;
    isNavigating: boolean;
    followMode: boolean;
    travelMode: TravelMode;
    destination: ChargingStation | null;
    showModeSelector: boolean;
    navigationStartTime: number | null;

    // Trip Planner state
    tripPlan: TripPlan | null;
    tripPlanLoading: boolean;
    tripPlanError: string | null;
    chargingStops: ChargingStop[];

    // Navigation actions
    setActiveRoute: (route: RouteInfo | null) => void;
    setPreviewRoute: (route: RouteInfo | null) => void;
    setIsNavigating: (isNavigating: boolean) => void;
    setFollowMode: (follow: boolean) => void;
    setTravelMode: (mode: TravelMode) => void;
    setDestination: (station: ChargingStation | null) => void;
    setShowModeSelector: (show: boolean) => void;
    startNavigation: () => void;
    clearRoute: () => void;

    // Trip Planner actions
    setTripPlan: (plan: TripPlan | null) => void;
    setTripPlanLoading: (loading: boolean) => void;
    setTripPlanError: (error: string | null) => void;
    setChargingStops: (stops: ChargingStop[]) => void;
    clearTripPlan: () => void;
}

export const useRouteStore = create<RouteState>((set, get) => ({
    itineraryUserId: null,
    itinerary: null,
    itineraryStorageError: null,
    loadItinerary: (userId) => {
        let itinerary: SavedItinerary | null = null;
        try {
            const raw = typeof window !== 'undefined' ? localStorage.getItem(`edith-itinerary-v1:${encodeURIComponent(userId)}`) : null;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (typeof parsed.origin === 'string' && typeof parsed.destination === 'string' && Array.isArray(parsed.stops)) itinerary = parsed;
            }
            set({ itineraryUserId: userId, itinerary, itineraryStorageError: null, activeRoute: itinerary?.route || null });
        } catch {
            set({ itineraryUserId: userId, itinerary: null, itineraryStorageError: 'Local itinerary storage is unavailable. Booking records still come from the server.' });
        }
    },
    saveItinerary: (itinerary) => {
        const userId = get().itineraryUserId;
        set({ itinerary, activeRoute: itinerary.route });
        if (!userId || typeof window === 'undefined') return;
        try {
            localStorage.setItem(`edith-itinerary-v1:${encodeURIComponent(userId)}`, JSON.stringify(itinerary));
            set({ itineraryStorageError: null });
        } catch {
            set({ itineraryStorageError: 'This browser could not save the itinerary. Server booking records are unaffected.' });
        }
    },
    // Navigation initial state
    activeRoute: null,
    previewRoute: null,
    isNavigating: false,
    followMode: false,
    travelMode: 'DRIVING',
    destination: null,
    showModeSelector: false,
    navigationStartTime: null,

    // Trip Planner initial state
    tripPlan: null,
    tripPlanLoading: false,
    tripPlanError: null,
    chargingStops: [],

    // Navigation actions
    setActiveRoute: (route) => set({ activeRoute: route }),
    setPreviewRoute: (route) => set({ previewRoute: route }),
    setIsNavigating: (isNavigating) => set({ isNavigating }),
    setFollowMode: (follow) => set({ followMode: follow }),
    setTravelMode: (mode) => set({ travelMode: mode }),
    setDestination: (station) => set({ destination: station }),
    setShowModeSelector: (show) => set({ showModeSelector: show }),
    startNavigation: () => set({
        isNavigating: true,
        followMode: true,
        showModeSelector: false,
        navigationStartTime: Date.now()
    }),
    clearRoute: () => set({
        activeRoute: null,
        previewRoute: null,
        isNavigating: false,
        followMode: false,
        destination: null,
        showModeSelector: false,
        navigationStartTime: null
    }),

    // Trip Planner actions
    setTripPlan: (plan) => set({
        tripPlan: plan,
        chargingStops: plan?.chargingStops || [],
        activeRoute: plan?.route || null
    }),
    setTripPlanLoading: (loading) => set({ tripPlanLoading: loading }),
    setTripPlanError: (error) => set({ tripPlanError: error }),
    setChargingStops: (stops) => set({ chargingStops: stops }),
    clearTripPlan: () => set({
        tripPlan: null,
        tripPlanLoading: false,
        tripPlanError: null,
        chargingStops: [],
        activeRoute: null
    })
}));
