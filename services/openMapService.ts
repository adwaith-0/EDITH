import { LatLng } from '@/types/map';
import { RouteInfo, RouteLeg } from '@/types/route';
import { API_BASE_URL as api } from './apiBase';

export interface MapPlace extends LatLng { label: string }
export interface OpenRouteOptions { waypoints?: (LatLng | string)[]; departureAt?: string }
async function mapFetch(path: string, body?: unknown) {
  const response = await fetch(`${api}/api/maps${path}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Map service unavailable.');
  return data;
}
function coordinates(value: string): MapPlace | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, label: `${lat}, ${lng}` } : null;
}
const durationText = (seconds: number) => { const m = Math.ceil(seconds / 60); return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`; };

export const openMapService = {
  async geocode(query: string): Promise<MapPlace[]> {
    const point = coordinates(query);
    if (point) return [point];
    return (await mapFetch(`/search?q=${encodeURIComponent(query)}`)).results;
  },
  async getRouteInfo(origin: LatLng | string, destination: LatLng | string, options: OpenRouteOptions = {}): Promise<RouteInfo | null> {
    try {
      const points: MapPlace[] = [];
      // Resolve named waypoints only on an explicit route request, never as autocomplete.
      for (const point of [origin, ...(options.waypoints || []), destination]) {
        if (typeof point === 'string') {
          const found = await this.geocode(point);
          if (!found.length) return null;
          points.push(found[0]);
        } else points.push({ ...point, label: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` });
      }
      const { route } = await mapFetch('/route', { points: points.map(({ lat, lng }) => ({ lat, lng })) });
      const legs: RouteLeg[] = route.legs.map((leg: any, index: number) => ({
        distance: leg.distance, duration: leg.duration,
        distanceText: `${(leg.distance / 1000).toFixed(1)} km`, durationText: durationText(leg.duration),
        startAddress: points[index].label, endAddress: points[index + 1].label,
        steps: (leg.steps || []).map((step: any) => ({
          instruction: [step.maneuver?.type, step.maneuver?.modifier, step.name ? `onto ${step.name}` : ''].filter(Boolean).join(' '),
          distance: step.distance, duration: step.duration,
          startLocation: { lat: step.maneuver.location[1], lng: step.maneuver.location[0] },
          endLocation: { lat: step.maneuver.location[1], lng: step.maneuver.location[0] },
          maneuver: step.maneuver.type,
        })),
      }));
      return { distanceMeters: route.distance, durationSeconds: route.duration,
        distanceText: `${(route.distance / 1000).toFixed(1)} km`, durationText: durationText(route.duration),
        polyline: route.geometry, legs, travelMode: 'DRIVING',
        summary: 'OSRM driving estimate · no live traffic · OpenStreetMap',
      };
    } catch (error) { console.warn('Open map route unavailable:', error instanceof Error ? error.message : 'Unknown provider error'); return null; }
  },
};
