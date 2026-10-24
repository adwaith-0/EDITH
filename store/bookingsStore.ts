import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { Booking, BookingRequest } from '@/types/booking';
import { API_BASE_URL, REALTIME_ENABLED } from '@/services/apiBase';

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

let bookingPollTimer: ReturnType<typeof setInterval> | null = null;
let bookingSubscription = 0;

export const useBookingsStore = create<BookingsState>((set, get) => ({
    bookings: [],
    activeBooking: null,
    socket: null,
    isConnected: false,
    loading: false,
    error: null,

    initializeSocket: (userId: string) => {
        get().disconnectSocket();
        if (!userId || typeof window === 'undefined') return;
        const token = localStorage.getItem('userToken');
        if (!token) return;
        const subscription = bookingSubscription;
        const socket = REALTIME_ENABLED ? io(API_BASE_URL || undefined, {
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30000,
            timeout: 20000,
        }) : null;
        const refreshBookings = async () => {
            try {
                const { rentalFetch } = await import('@/services/rentalClient');
                const { bookings } = await rentalFetch<{ bookings: Booking[] }>('/bookings/mine');
                if (subscription !== bookingSubscription || get().socket !== socket || localStorage.getItem('userToken') !== token) return;
                const current = get().activeBooking;
                const latest = current ? bookings.find(booking => booking.id === current.id) : null;
                const finished = latest && ['CANCELLED', 'COMPLETED', 'EXPIRED', 'DECLINED'].includes(latest.status);
                set({ bookings, activeBooking: latest && !finished ? latest : null });
            } catch {
                // A temporary realtime or network outage keeps the last saved view.
            }
        };

        socket?.on('connect', () => {
            set({ isConnected: true });
            socket.emit('subscribe:bookings');
            void refreshBookings();
        });

        socket?.on('disconnect', () => {
            set({ isConnected: false });
        });
        socket?.on('connect_error', () => set({ isConnected: false }));

        // Events contain only IDs/status; reload complete authenticated records.
        socket?.on('booking.updated', refreshBookings);
        socket?.on('booking.created', refreshBookings);
        socket?.on('booking.cancelled', refreshBookings);

        set({ socket });
        void refreshBookings();
        bookingPollTimer = setInterval(() => { void refreshBookings(); }, 30000);
    },

    disconnectSocket: () => {
        bookingSubscription++;
        if (bookingPollTimer) clearInterval(bookingPollTimer);
        bookingPollTimer = null;
        const { socket } = get();
        if (socket) {
            socket.removeAllListeners();
            socket.disconnect();
        }
        set({ socket: null, isConnected: false });
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
