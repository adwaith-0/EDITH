import { HostSummary, RentalAvailability, RentalBooking, RentalDraft, RentalListing, RentalQuote, RentalSearch, RentalUser, RentalVehicle } from '@/types/rental';
import { API_BASE_URL as API_URL } from './apiBase';

export class RentalApiError extends Error {
  constructor(message:string,public status:number,public code?:string){super(message);this.name='RentalApiError';}
}
export async function rentalFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('userToken') : null;
  let response: Response;
  try { response = await fetch(`${API_URL}/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }, cache: 'no-store' }); }
  catch { throw new Error('Cannot reach the EDITH server. Check that the API and PostgreSQL are running, then retry.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new RentalApiError(data.error || `Request failed (${response.status}). Please try again.`,response.status,data.code);
  return data as T;
}
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
export const rentalClient = {
  async search(filters: RentalSearch = {}) { const params = new URLSearchParams(); Object.entries(filters).forEach(([key,value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); }); return (await rentalFetch<{rentals: RentalListing[]}>(`/rentals?${params}`)).rentals; },
  async listing(id: string) { return (await rentalFetch<{rental: RentalListing}>(`/rentals/${id}`)).rental; },
  async ownListings() { return (await rentalFetch<{rentals: RentalListing[]}>('/rentals/mine')).rentals; },
  async saveListing(draft: RentalDraft, id?: string) { return (await rentalFetch<{rental: RentalListing}>(`/rentals${id ? `/${id}` : ''}`, { ...post(draft), method: id ? 'PATCH' : 'POST' })).rental; },
  async vehicles() { return (await rentalFetch<{vehicles: RentalVehicle[]}>('/vehicles')).vehicles; },
  async addVehicle(vehicle: Omit<RentalVehicle, 'id'>) { return (await rentalFetch<{vehicle: RentalVehicle}>('/vehicles', post(vehicle))).vehicle; },
  async quote(stationId: string, vehicleId: string, slotStart: string, durationMinutes: number, vehicleModel?: string,conciergeToken?:string) { return (await rentalFetch<{quote: RentalQuote}>('/bookings/quote', post({ stationId, vehicleId, slotStart, durationMinutes, vehicleModel,...(conciergeToken?{bookingMode:'CONCIERGE',conciergeToken}:{}) }))).quote; },
  async availability(stationId:string,start:string,durationMinutes:number) { return (await rentalFetch<{availability:RentalAvailability}>(`/rentals/${encodeURIComponent(stationId)}/availability?${new URLSearchParams({start,durationMinutes:String(durationMinutes)})}`)).availability; },
  async preparePublic(station: {id:string;name:string;address:string;location:{lat:number;lng:number}}) { return (await rentalFetch<{id:string}>('/rentals/public-demo',post(station))).id; },
  async request(quote: RentalQuote, idempotencyKey: string) { return (await rentalFetch<{booking: RentalBooking}>('/bookings/request', post({ stationId: quote.stationId, vehicleId: quote.vehicleId, slotStart: quote.slotStart, durationMinutes: quote.durationMinutes, idempotencyKey, expectedTotalPaise: quote.totalPaise, expectedHourlyRatePaise: quote.hourlyRatePaise,...(quote.bookingMode==='CONCIERGE'?{bookingMode:quote.bookingMode,conciergeToken:quote.conciergeToken}:{}) }))).booking; },
  async verifyListing(id:string,body:{specificationsConfirmed:boolean;evidence:string;parkingIncluded:boolean;equipmentStatus:string}){return rentalFetch(`/rentals/${encodeURIComponent(id)}/evidence`,post(body));},
  async report(id:string,kind:string,notes:string){return rentalFetch(`/bookings/${encodeURIComponent(id)}/report`,post({kind,notes}));},
  async myBookings() { return (await rentalFetch<{bookings: RentalBooking[]}>('/bookings/mine')).bookings; },
  async booking(id:string) {return (await rentalFetch<{booking:RentalBooking}>(`/bookings/${encodeURIComponent(id)}`)).booking;},
  async hostBookings() { return rentalFetch<{bookings: RentalBooking[]; summary: HostSummary}>('/bookings/host'); },
  async action(id: string, action: string, reason?: string) { return (await rentalFetch<{booking: RentalBooking}>(`/bookings/${id}/action`, post({action, reason}))).booking; },
  async auth(mode: 'login'|'signup', body: {email: string; password: string; name?: string}) { return rentalFetch<{token: string; user: RentalUser}>(`/auth/${mode}`, post(body)); },
};
