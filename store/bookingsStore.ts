import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { Booking, BookingRequest } from '@/types/booking';

interface BookingsState {
    bookings: Booking[];
    activeBooking: Booking | null;
    socket: Socket | null;
    isConnected: boolean;
    loading: boolean;
    error: string | null;

    initializeSocket: (userId: string) => void;
    disconnectSocket: () => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;

    // Actions
    fetchUserBookings: (userId: string) => Promise<void>;
    createBooking: (request: BookingRequest) => Promise<Booking | null>;
    confirmBooking: (bookingId: string) => Promise<boolean>;
    extendBooking: (bookingId: string, extraMinutes: number) => Promise<boolean>;
    cancelBooking: (bookingId: string) => Promise<void>;
    setActiveBooking: (booking: Booking | null) => void;
    syncActiveBooking: () => Promise<void>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const useBookingsStore = create<BookingsState>((set, get) => ({
    bookings: [],
    activeBooking: null,
    socket: null,
    isConnected: false,
    loading: false,
    error: null,

    initializeSocket: (userId: string) => {
        const socket = io(API_URL, {
            query: { userId },
            transports: ['websocket']
        });

        socket.on('connect', () => {
            console.log('Socket connected:', socket.id);
            set({ isConnected: true });
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected');
            set({ isConnected: false });
        });

        socket.on('booking.updated', (updatedBooking: Booking) => {
            const { activeBooking, bookings } = get();

            // Update active booking if matched
            if (activeBooking && activeBooking.id === updatedBooking.id) {
                set({ activeBooking: updatedBooking });
            }

            // Update list
            const updatedBookings = bookings.map(b =>
                b.id === updatedBooking.id ? updatedBooking : b
            );
            set({ bookings: updatedBookings });
        });

        set({ socket });
    },

    disconnectSocket: () => {
        const { socket } = get();
        if (socket) {
            socket.disconnect();
            set({ socket: null, isConnected: false });
        }
    },

    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    fetchUserBookings: async (userId) => {
        set({ loading: true });
        try {
            const { bookingClient } = await import('@/services/bookingClient');
            const bookings = await bookingClient.getUserBookings(userId);
            set({ bookings, loading: false });
        } catch (error: any) {
            console.error('Fetch bookings failed:', error);
            set({ error: error.message, loading: false });
        }
    },

    createBooking: async (request) => {
        set({ loading: true, error: null });
        try {
            const { bookingClient } = await import('@/services/bookingClient');
            const booking = await bookingClient.createBooking(request);
            if (booking) {
                set({ activeBooking: booking, loading: false });
            }
            return booking;
        } catch (error: any) {
            set({ error: error.message, loading: false });
            return null;
        }
    },

    confirmBooking: async (bookingId) => {
        set({ loading: true, error: null });
        try {
            const { bookingClient } = await import('@/services/bookingClient');
            const success = await bookingClient.confirmBooking(bookingId);
            if (success) {
                const updated = await bookingClient.getBooking(bookingId);
                if (updated) set({ activeBooking: updated, loading: false });
            }
            return success;
        } catch (error: any) {
            set({ error: error.message, loading: false });
            return false;
        }
    },

    cancelBooking: async (bookingId) => {
        set({ loading: true });
        try {
            const { bookingClient } = await import('@/services/bookingClient');
            await bookingClient.cancelBooking(bookingId);
            set({ activeBooking: null, loading: false });
        } catch (error: any) {
            set({ error: error.message, loading: false });
        }
    },

    setActiveBooking: (booking) => set({ activeBooking: booking }),

    extendBooking: async (bookingId, extraMinutes) => {
        set({ loading: true });
        try {
            const { bookingClient } = await import('@/services/bookingClient');
            const updated = await bookingClient.extendBooking(bookingId, extraMinutes);
            if (updated) {
                set((state) => ({
                    activeBooking: state.activeBooking?.id === bookingId ? updated : state.activeBooking,
                    bookings: state.bookings.map(b => b.id === bookingId ? updated : b)
                }));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Extend booking error:', error);
            return false;
        } finally {
            set({ loading: false });
        }
    },

    syncActiveBooking: async () => {
        const { activeBooking } = get();
        if (!activeBooking) return;
        try {
            const { bookingClient } = await import('@/services/bookingClient');
            const latest = await bookingClient.getBooking(activeBooking.id);
            if (latest) {
                if (latest.status === 'CANCELLED' || latest.status === 'COMPLETED') {
                    // Keep historical record but clear active
                    set({ activeBooking: null });
                } else {
                    set({ activeBooking: latest });
                }
            }
        } catch (e) {
            console.error("Sync failed", e);
        }
    }
}));
