import { TripPlanRequest, TripPlanResult } from '@/types/route';
import { directionsService } from './directionsService';

/** Routing and energy confidence are separate. A road route is not a verified EV reachability plan. */
export class TripPlannerService {
    async planEVTrip(request: TripPlanRequest): Promise<TripPlanResult> {
        if (request.batteryPercent !== undefined && (!Number.isFinite(request.batteryPercent) || request.batteryPercent < 0 || request.batteryPercent > 100)) {
            return { success: false, error: 'Battery percentage must be between 0 and 100, or left blank.' };
        }
        if (request.vehicleRangeKm !== undefined && (!Number.isFinite(request.vehicleRangeKm) || request.vehicleRangeKm <= 0)) {
            return { success: false, error: 'Enter a positive range or leave it blank.' };
        }
        const route = await directionsService.getRouteInfo(request.origin, request.destination, 'DRIVING', {
            departureAt: request.departureAt,
            waypoints: request.waypoint ? [request.waypoint] : [],
        });
        if (!route) return { success: false, error: 'Driving directions are unavailable. Keep a manual itinerary and choose rental slots yourself; no driving ETA has been estimated.' };
        const warnings = [
            'EV reachability is unverified. Road distance and battery percentage alone cannot guarantee this journey.',
            'Add and inspect charging stops, verify connector compatibility and request private rentals separately.',
            'Charging duration is unavailable without verified vehicle capacity and charger power. No universal battery or charger assumptions are used.',
        ];
        if (request.batteryPercent !== undefined && request.vehicleRangeKm !== undefined) {
            const userEstimate = request.vehicleRangeKm * request.batteryPercent / 100;
            warnings.push(`Your stated range and battery imply approximately ${Math.round(userEstimate)} km before charging under your assumptions. This is not a reachability guarantee.`);
            if (userEstimate < route.distanceMeters / 1000) warnings.push('This route exceeds your stated remaining range. The charging plan is incomplete.');
        }
        return { success: true, tripPlan: {
            route, chargingStops: [], totalDistance: route.distanceMeters / 1000,
            totalDuration: route.durationSeconds, totalChargingTime: 0,
            feasible: false, warnings,
        } };
    }
}
export const tripPlannerService = new TripPlannerService();
