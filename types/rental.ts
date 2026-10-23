export interface RentalUser { id: string; name: string; email?: string; role?: string }
export interface RentalWindow { id?: string; startsAt: string; endsAt: string }
export interface RentalConnector { id: string; connectorType: string; currentType?: string; powerKw: number | null }
export interface RentalListing {
  evidence?:ListingEvidence; specificationsVerifiedAt?:string|null; specificationEvidence?:string|null; parkingIncluded?:boolean|null; equipmentStatus?:string; statusReportedAt?:string|null;
  kind?: string; bookingCapability?: string;
  id: string; name: string; address: string; lat: number; lng: number;
  hourlyRatePaise: number; parking?: string | null; accessInstructions?: string | null;
  restrictedAccessInstructions?: string | null; terms?: string | null; imageUrl?: string | null;
  published: boolean; ownerId?: string; owner?: RentalUser; connectors: RentalConnector[];
  availabilityWindows: RentalWindow[]; isOpenForRequest?: boolean | null; availabilityReason?: string;
  distanceKm?: number; synthetic?: boolean; source?: string; approximateDistanceKm?: number | null;
}
export interface RentalVehicle {
  specificationsVerifiedAt?:string|null;
  id: string; model: string; vehicleType: string; connectorTypes: string[];
  batteryCapacityKwh?: number | null; rangeKm?: number | null;
  metadata?: { connectorTypes?: string[]; batteryCapacityKwh?: number; rangeKm?: number };
}
export type RentalStatus = 'REQUESTED'|'CONFIRMED'|'IN_PROGRESS'|'COMPLETED'|'DECLINED'|'CANCELLED'|'EXPIRED';
export interface RentalQuote {
  bookingMode?:'CONCIERGE'|'DEMO_AUTOPILOT';conciergeToken?:string;allowDemo?:boolean;
  paymentPreview?:{mode:string;amountPaise:number;currency:string;requiresDriverConfirmation:boolean};
  publicSimulation?: boolean; compatibilityMode?: string;
  stationId: string; vehicleId: string; slotStart: string; slotEnd: string; durationMinutes: number;
  hourlyRatePaise: number; subtotalPaise: number; feePaise: number; totalPaise: number; currency: string;
  paymentLabel?: string; cancellationSummary?: string;
}
export interface RentalAvailability {
  available:boolean;code:string;message:string;slotStart:string;slotEnd:string;checkedAt:string;
  nextAvailable:{slotStart:string;slotEnd:string;durationMinutes:number}|null;
}
export interface RentalBooking {
  reports?:{id:string;kind:string;notes:string|null;createdAt:string;resolvedAt:string|null}[];
  createdAt?: string;
  id: string; userId: string; stationId: string; vehicleId: string; status: RentalStatus;
  slotStart: string; slotEnd: string; expiresAt: string; amountPaise: number; quoteSnapshot: RentalQuote;
  station: RentalListing; connector?: RentalConnector; vehicle: RentalVehicle; user: RentalUser;
  responseReason?: string | null; cancellationReason?: string | null; hostResponse?: string | null;
  startedAt?: string | null; completedAt?: string | null; sessionStartedAt?: string | null; sessionCompletedAt?: string | null;
  restrictedAccessInstructions?: string | null; paymentStatus?: string;
}
export interface ListingEvidence {dataMode:string;specificationsVerifiedAt?:string|null;verificationSource:string;specificationEvidence?:string|null;parkingIncluded?:boolean|null;equipmentStatus:string;statusReportedAt?:string|null;statusFresh:boolean;liveTelemetry:boolean;calendarCheckedAt?:string;hostApprovalRequired?:boolean;history?:{status:string;count:number}[];unresolvedIssues?:number}
export interface HostSummary { pendingRequests: number; upcomingBookings: number; activeSessions: number; ownedListings: number; demoBookingValuePaise: number }
export interface RentalSearch { location?: string; connectorType?: string; start?: string; durationMinutes?: number; maxRatePaise?: number; lat?: number; lng?: number }
export interface RentalDraft {
  name: string; address: string; lat: number; lng: number; connectorType: string; currentType: string;
  powerKw: number | null; hourlyRatePaise: number; parking: string; accessInstructions: string;
  restrictedAccessInstructions: string; terms: string; imageUrl: string; published: boolean; availabilityWindows: RentalWindow[];
}
