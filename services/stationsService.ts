import { ChargingStation } from '@/types/station';
import { LatLng } from '@/types/map';
import { directionsService } from './directionsService';
import { externalStationsService } from './externalStationsService';
import { API_BASE_URL as API_URL } from './apiBase';

export interface EnrichedStation extends ChargingStation {
    distanceText?: string; durationText?: string; distanceMeters?: number; durationSeconds?: number; polyline?: string;
}

async function enrich(stations: ChargingStation[], origin: LatLng): Promise<EnrichedStation[]> {
    const sorted = stations.map(station => ({ ...station, distance: directionsService.getSphericalDistance(origin, station.location) / 1000 }))
        .sort((first, second) => first.distance - second.distance);
    // Public providers have limited capacity; road information is optional.
    const routes = await Promise.allSettled(sorted.slice(0, 3).map(station => directionsService.getRouteInfo(origin, station.location)));
    return sorted.map((station, index) => {
        const result = routes[index];
        const route = result?.status === 'fulfilled' ? result.value : null;
        return route ? { ...station, distanceText: route.distanceText, durationText: route.durationText,
            distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, polyline: route.polyline }
            : { ...station, distanceText: `${station.distance.toFixed(1)} km straight-line`, durationText: 'Driving ETA unavailable' };
    });
}

export async function fetchNearbyStations(location: LatLng, radiusMeters = 25000): Promise<EnrichedStation[]> {
    const stations = await externalStationsService.fetchNearby(location, radiusMeters);
    return enrich(stations.filter(station => directionsService.getSphericalDistance(location, station.location) <= radiusMeters), location);
}

/** Retained adapter for the old map viewport; discovery itself uses no Google APIs. */
export async function fetchNearbyStationsInBounds(location: LatLng, bounds: google.maps.LatLngBounds): Promise<EnrichedStation[]> {
    return enrich(await externalStationsService.fetchStationsInBounds(bounds, location), location);
}

export async function searchStations(query: string): Promise<ChargingStation[]> {
    const response = await fetch(`${API_URL}/api/stations/search/${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Public fixture search failed.');
    const data = await response.json();
    return data.stations || [];
}
