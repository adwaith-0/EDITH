import { LatLng } from './map';

export type Step = RouteStep;

export interface RouteInfo {
    distanceMeters: number;
    durationSeconds: number;
    polyline: string;
    legs?: RouteLeg[];
    bounds?: {
        northeast: LatLng;
        southwest: LatLng;
    };
    summary?: string;
    distanceText?: string;
    durationText?: string;
    travelMode?: 'DRIVING' | 'TWO_WHEELER' | 'WALKING';
}


// Route and directions types
export interface RouteWaypoint {
    location: LatLng;
    stopover: boolean;
    name?: string;
}

export interface RouteLeg {
    distance: number; // in meters
    duration: number; // in seconds
    distanceText?: string;
    durationText?: string;
    startAddress: string;
    endAddress: string;
    steps: RouteStep[];
}

export interface RouteStep {
    instruction: string;
    distance: number;
    duration: number;
    startLocation: LatLng;
    endLocation: LatLng;
    maneuver?: string;
}

export interface Route {
    id: string;
    summary: string;
    legs: RouteLeg[];
    distance: number; // total in meters
    duration: number; // total in seconds
    polyline: string; // encoded polyline
    bounds: any;
}

export interface DirectionsRequest {
    origin: LatLng;
    destination: LatLng;
    waypoints?: RouteWaypoint[];
    travelMode?: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';
}



// Trip planner types
export interface TripPlanRequest {
    origin: LatLng | string;
    destination: LatLng | string;
    batteryPercent?: number;
    vehicleRangeKm?: number; // user-provided range, not a reachability guarantee
    currentConsumption?: number; // kWh per 100km
    departureAt?: string;
    waypoint?: LatLng | string;
}

import { ChargingStation } from './station';

export interface ChargingStop {
    stationId: string;
    name: string;
    address?: string;
    location: LatLng;
    arrivalBattery?: number;
    departureBattery?: number;
    chargingTime?: number; // unavailable without verified vehicle and charger data
    reason: string;
    stationData?: ChargingStation;
}

/** Itinerary data is local to the signed-in user. Booking status is never persisted here. */
export interface ItineraryStop {
    id: string;
    stationId: string;
    name: string;
    address: string;
    location: LatLng;
    kind: 'private' | 'public';
    source: string;
    durationMinutes: number;
    manualStart?: string; // datetime-local expressed explicitly in Asia/Kolkata
    bookingId?: string;
    reviewRequired?: boolean;
}

export interface SavedItinerary {
    planningModel?: string; batteryKwh?: string; averageChargeKw?: string; reservePercent?: string; targetPercent?: string; allowUnknown?: boolean; fillDemoGaps?: boolean;
    origin: string;
    destination: string;
    departureAt: string;
    waypoint: string;
    vehicleId: string;
    batteryPercent: string;
    rangeKm: string;
    stops: ItineraryStop[];
    route: RouteInfo | null;
    calculatedSignature?: string;
    updatedAt: string;
}

export interface TripPlan {
    route: RouteInfo;
    chargingStops: ChargingStop[];
    totalDistance: number;
    totalDuration: number;
    totalChargingTime: number;
    feasible: boolean;
    warnings?: string[];
}

export type TripPlanResult =
    | { success: true; tripPlan: TripPlan }
    | { success: false; error: string };
