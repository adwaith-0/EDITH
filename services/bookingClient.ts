import axios from 'axios';
import { Booking, BookingRequest, BookingResponse } from '@/types/booking';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const bookingClient = {
    async createBooking(request: BookingRequest): Promise<Booking | null> {
        const response = await axios.post(`${API_URL}/api/bookings/create`, request);
        return response.data.booking || null;
    },

    async confirmBooking(bookingId: string): Promise<boolean> {
        const response = await axios.post(`${API_URL}/api/bookings/confirm`, { bookingId });
        return response.data.success;
    },

    async extendBooking(bookingId: string, extraMinutes: number): Promise<Booking | null> {
        const response = await axios.post(`${API_URL}/api/bookings/extend`, { bookingId, extraMinutes });
        return response.data.booking || null;
    },

    async getUserBookings(userId: string): Promise<Booking[]> {
        const response = await axios.get(`${API_URL}/api/bookings/user/${userId}`);
        return response.data;
    },

    async getBooking(bookingId: string): Promise<Booking | null> {
        const response = await axios.get(`${API_URL}/api/bookings/${bookingId}`);
        return response.data;
    },

    async cancelBooking(bookingId: string): Promise<void> {
        await axios.post(`${API_URL}/api/bookings/cancel`, { bookingId });
    }
};
