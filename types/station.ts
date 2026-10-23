import { LatLng } from './map';

// Charging station types
export type StationStatus = 'available' | 'busy' | 'booked' | 'offline' | 'unknown';
export type ConnectorType = 'CCS' | 'CHAdeMO' | 'Type2' | 'Tesla' | 'Unknown';
export type ChargingSpeed = 'slow' | 'fast' | 'ultra-fast' | 'unknown';

export interface Connector {
    id: string;
    type: ConnectorType;
    power: number | null; // in kW; null means the source does not provide it
    available: boolean | null; // opening hours are not live connector telemetry
    price: number | null; // per kWh; null means unknown
    sourceType?: string; // preserve the provider's connector description
}

export interface StationAmenities {
    restroom: boolean;
    restaurant: boolean;
    wifi: boolean;
    parking: boolean;
    shelter: boolean;
}

export interface ChargingStation {
    id: string;
    name: string;
    location: LatLng;
    address: string;
    status: StationStatus;
    connectors: Connector[];
    amenities: StationAmenities;
    rating: number;
    reviews: number;
    distance?: number; // in km
    operatingHours: string;
    operator: string;
    speed: ChargingSpeed;

    // Enriched fields from DirectionsService
    distanceText?: string;
    durationText?: string;
    distanceMeters?: number;
    durationSeconds?: number;
    polyline?: string;

    // Data Source
    source?: 'google' | 'openchargemap' | 'osm' | 'simulated';
    discoveryOnly?: boolean;
    synthetic?: boolean;
    unavailable?: boolean;
    sourceUrl?: string;
}

export interface StationFilters {
    speed?: ChargingSpeed[];
    connectorTypes?: ConnectorType[];
    availability?: boolean;
    maxPrice?: number;
    amenities?: (keyof StationAmenities)[];
}
