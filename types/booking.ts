// Booking types
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'EXPIRED';

export interface Booking {
    id: string;
    stationId: string;
    station?: {
        name: string;
        address: string;
        lat: number;
        lng: number;
    };
    vehicleId: string;
    vehicle?: {
        model: string;
    };
    userId: string;
    status: BookingStatus;
    slotStart: string; // ISO date
    slotEnd: string;   // ISO date
    amountCents: number;
    totalPriceCents: number; // alias for amountCents
    createdAt: string;
    expiresAt?: string; // For pending bookings
}

export interface CreateBookingResponse {
    bookingId: string;
    status: string;
    expiresAt: string;
}

export interface BookingRequest {
    stationId: string;
    userId: string;
    slotStart: string; // ISO date
    durationMinutes: number;
    travelTimeMinutes?: number; // Added for dynamic start time
    vehicleModel?: string; // Sometimes needed if not pre-resolved
    stationData?: any; // For external stations
}

export interface BookingResponse {
    success: boolean;
    booking?: Booking;
    error?: string;
}
