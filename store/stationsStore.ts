import { create } from 'zustand';
import { ChargingStation, StationFilters } from '@/types/station';
import { LatLng } from '@/types/map';
import * as stationsService from '@/services/stationsService';

interface StationsState {
    // Stations data
    stations: ChargingStation[];
    filteredStations: ChargingStation[];
    selectedStation: ChargingStation | null;

    // Filters
    filters: StationFilters;

    // Loading state
    loading: boolean;
    error: string | null;
    referenceLocation: LatLng | null;

    // Actions
    setStations: (stations: ChargingStation[]) => void;
    setSelectedStation: (station: ChargingStation | null) => void;
    setFilters: (filters: Partial<StationFilters>) => void;
    clearFilters: () => void;
    applyFilters: () => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    updateStationStatus: (stationId: string, status: any) => void;
    fetchStationsInBounds: (userLocation: LatLng, bounds: google.maps.LatLngBounds) => Promise<void>;

    // Booking Modal State
    isBookingModalOpen: boolean;
    setBookingModalOpen: (open: boolean) => void;
}

const calculateDistance = (point1: LatLng, point2: LatLng): number => {
    const R = 6371; // Radius of the earth in km
    const dLat = (point2.lat - point1.lat) * (Math.PI / 180);
    const dLon = (point2.lng - point1.lng) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(point1.lat * (Math.PI / 180)) * Math.cos(point2.lat * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const useStationsStore = create<StationsState>((set, get) => ({
    // Initial state
    stations: [],
    filteredStations: [],
    selectedStation: null,
    filters: {},
    loading: false,
    error: null,
    referenceLocation: null,
    isBookingModalOpen: false,

    // Actions
    setBookingModalOpen: (open) => set({ isBookingModalOpen: open }),
    setStations: (stations) => {
        set({ stations, filteredStations: stations });
        get().applyFilters();
    },

    setSelectedStation: (station) => set({ selectedStation: station }),

    setFilters: (newFilters) => {
        set((state) => ({
            filters: { ...state.filters, ...newFilters },
        }));
        get().applyFilters();
    },

    clearFilters: () => {
        set({ filters: {} });
        get().applyFilters();
    },

    applyFilters: () => {
        const { stations, filters } = get();

        let filtered = [...stations];
        console.log(`🧠 Store: Filtering ${stations.length} stations with filters:`, filters);

        // Filter by speed
        if (filters.speed && filters.speed.length > 0) {
            filtered = filtered.filter((station) =>
                filters.speed!.includes(station.speed)
            );
        }

        // Filter by connector types
        if (filters.connectorTypes && filters.connectorTypes.length > 0) {
            filtered = filtered.filter((station) =>
                station.connectors.some((connector) =>
                    filters.connectorTypes!.includes(connector.type)
                )
            );
        }

        // Filter by availability
        if (filters.availability) {
            filtered = filtered.filter((station) => station.status === 'available');
        }

        // Filter by max price
        if (filters.maxPrice !== undefined) {
            filtered = filtered.filter((station) =>
                station.connectors.some((connector) => connector.price !== null && connector.price <= filters.maxPrice!)
            );
        }

        // Filter by amenities
        if (filters.amenities && filters.amenities.length > 0) {
            filtered = filtered.filter((station) =>
                filters.amenities!.every((amenity) => station.amenities[amenity])
            );
        }

        // Sort by distance if reference location is set
        const { referenceLocation } = get();
        if (referenceLocation) {
            filtered.sort((a, b) => {
                const distA = calculateDistance(referenceLocation, a.location);
                const distB = calculateDistance(referenceLocation, b.location);
                return distA - distB;
            });
        }

        set({ filteredStations: filtered });
    },

    setLoading: (loading) => set({ loading }),

    setError: (error) => set({ error }),

    updateStationStatus: (stationId, status) => {
        set((state) => ({
            stations: state.stations.map((station) =>
                station.id === stationId ? { ...station, status } : station
            ),
        }));
        get().applyFilters();
    },

    fetchStationsInBounds: async (userLocation: LatLng, bounds: google.maps.LatLngBounds) => {
        set({ loading: true, error: null });
        try {
            const stations = await stationsService.fetchNearbyStationsInBounds(userLocation, bounds);

            set({ stations, filteredStations: stations, loading: false, referenceLocation: userLocation });
            get().applyFilters();
        } catch (error) {
            console.error('Failed to fetch stations in bounds:', error);
            set({ error: 'Failed to update stations', loading: false });
        }
    },
}));
