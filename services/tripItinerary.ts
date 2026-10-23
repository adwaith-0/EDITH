import { SavedItinerary } from '@/types/route';
import { RentalBooking } from '@/types/rental';

export const itineraryStart = (value: string) => new Date(`${value}:00+05:30`);

/** Drive time comes only from route legs. Reservation boundaries are never moved by travel. */
export function buildItinerarySchedule(plan: SavedItinerary, bookings: Pick<RentalBooking, 'id' | 'slotStart' | 'slotEnd' | 'status'>[]) {
    const stops: { arrival: number; wait: number; dwell: number; late: boolean }[] = [];
    const legs = plan.route?.legs;
    if (!legs?.length || legs.length !== plan.stops.length + (plan.waypoint.trim() ? 1 : 0) + 1) {
        return { stops, waiting: 0, dwell: 0, arrival: null };
    }
    let time = itineraryStart(plan.departureAt).getTime(); let waiting = 0; let totalDwell = 0;
    const offset = plan.waypoint.trim() ? 1 : 0;
    if (offset) time += legs[0].duration * 1000;
    plan.stops.forEach((stop, index) => {
        time += legs[index + offset].duration * 1000;
        const booking = bookings.find(item => item.id === stop.bookingId);
        const reservation = booking && ['REQUESTED', 'CONFIRMED', 'IN_PROGRESS'].includes(booking.status) ? booking : undefined;
        const start = reservation ? new Date(reservation.slotStart).getTime() : stop.manualStart ? itineraryStart(stop.manualStart).getTime() : null;
        const end = reservation ? new Date(reservation.slotEnd).getTime() : start ? start + stop.durationMinutes * 60000 : null;
        const wait = start ? Math.max(0, (start - time) / 60000) : 0;
        // Arriving late cannot extend a fixed reservation. The driver must review it.
        const dwell = end ? Math.max(0, (end - (time + wait * 60000)) / 60000) : stop.durationMinutes;
        stops.push({ arrival: time, wait, dwell, late: !!start && time > start });
        time += (wait + dwell) * 60000; waiting += wait; totalDwell += dwell;
    });
    time += legs[plan.stops.length + offset].duration * 1000;
    return { stops, waiting, dwell: totalDwell, arrival: time };
}
