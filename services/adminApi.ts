/**
 * Admin API Client Service
 * Frontend service for calling admin API endpoints
 */

import { API_BASE_URL } from './apiBase';

const API_BASE = `${API_BASE_URL}/api`;

function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
    const token = getToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const res = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });

    if (res.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        window.location.href = '/admin/login';
        throw new Error('Session expired');
    }

    if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || 'Request failed');
    }

    return res.json();
}

export const adminApi = {
    // Auth
    async login(email: string, password: string) {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        return data;
    },

    // Dashboard
    async getDashboard() {
        return fetchWithAuth(`${API_BASE}/admin/dashboard`);
    },

    // Bookings
    async getCurrentBookings(limit = 50) {
        return fetchWithAuth(`${API_BASE}/admin/current-bookings?limit=${limit}`);
    },

    async getBookings(filters: {
        startDate?: string;
        endDate?: string;
        stationId?: string;
        vehicleType?: string;
        status?: string;
        page?: number;
        size?: number;
    } = {}) {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) params.append(key, String(value));
        });
        return fetchWithAuth(`${API_BASE}/admin/bookings?${params}`);
    },

    async forceCancel(bookingId: string) {
        return fetchWithAuth(`${API_BASE}/admin/booking/force-cancel`, {
            method: 'POST',
            body: JSON.stringify({ bookingId }),
        });
    },

    // Slots
    async getAvailableSlots() {
        return fetchWithAuth(`${API_BASE}/admin/available-slots`);
    },

    // Payments
    async getPayments(range: 'today' | 'week' | 'month' = 'today') {
        return fetchWithAuth(`${API_BASE}/admin/payments?range=${range}`);
    },

    // Electricity
    async getElectricity(range: 'today' | 'week' | 'month' = 'today') {
        return fetchWithAuth(`${API_BASE}/admin/electricity?range=${range}`);
    },

    // Vehicles
    async getVehicleUsage(range: 'week' | 'month' = 'month') {
        return fetchWithAuth(`${API_BASE}/admin/vehicles/usage?range=${range}`);
    },

    async searchVehicles(query: string) {
        return fetchWithAuth(`${API_BASE}/admin/vehicle-search?q=${encodeURIComponent(query)}`);
    },
};

export default adminApi;
