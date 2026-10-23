import { LatLng } from '@/types/map';
import { RouteInfo } from '@/types/route';
import { openMapService } from './openMapService';

export type TravelMode = 'DRIVING' | 'TWO_WHEELER' | 'WALKING';
export interface RouteOptions { waypoints?: (LatLng | string)[]; departureAt?: string }

/** Shared no-key routing boundary. OSRM supplies driving estimates, never live traffic. */
class DirectionsService {
    initialize() { /* Retained for old map callers; no provider key is required. */ }

    async getRouteInfo(origin: LatLng | string, destination: LatLng | string, mode: TravelMode = 'DRIVING', options: RouteOptions = {}): Promise<RouteInfo | null> {
        // A walking route cannot truthfully be supplied by the driving profile.
        if (mode === 'WALKING') return null;
        return openMapService.getRouteInfo(origin, destination, options);
    }

    /** Straight-line distance, never a driving distance or ETA. */
    getSphericalDistance(origin: LatLng, destination: LatLng): number {
        const radians = (value: number) => value * Math.PI / 180;
        const a = Math.sin(radians(destination.lat - origin.lat) / 2) ** 2
            + Math.cos(radians(origin.lat)) * Math.cos(radians(destination.lat))
            * Math.sin(radians(destination.lng - origin.lng) / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
export const directionsService = new DirectionsService();
