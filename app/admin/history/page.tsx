'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/services/apiBase';

interface Booking {
    id: string;
    user: { name: string; email: string };
    station: { name: string; address?: string };
    vehicle: { vehicleType: string; model: string };
    status: string;
    slotStart: string;
    slotEnd: string;
    amountCents: number;
    createdAt: string;
}

interface Pagination {
    page: number;
    size: number;
    total: number;
    totalPages: number;
}

export default function BookingHistoryPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [user, setUser] = useState<any>(null);

    const fetchBookings = useCallback(async (token: string, page: number, status: string) => {
        try {
            setLoading(true);
            let url = `${API_BASE_URL}/api/admin/bookings?page=${page}&size=20`;
            if (status !== 'ALL') {
                url += `&status=${status}`;
            }

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to fetch bookings');
            const data = await res.json();
            setBookings(data.bookings);
            setPagination(data.pagination);
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('adminToken');
        const userStr = localStorage.getItem('adminUser');

        if (!token || !userStr) {
            router.push('/admin/login');
            return;
        }

        try {
            setUser(JSON.parse(userStr));
        } catch {
            router.push('/admin/login');
            return;
        }

        fetchBookings(token, currentPage, filterStatus);
    }, [router, currentPage, filterStatus, fetchBookings]);

    const handleLogout = () => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        router.push('/admin/login');
    };

    const handleForceCancel = async (bookingId: string) => {
        if (!confirm('Are you sure you want to force cancel this booking? This action cannot be undone.')) return;

        const token = localStorage.getItem('adminToken');
        if (!token) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/booking/force-cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ bookingId }),
            });

            if (!res.ok) throw new Error('Failed to cancel');
            // Refresh current view
            fetchBookings(token, currentPage, filterStatus);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const formatCurrency = (cents: number) => {
        return `₹${(cents / 100).toLocaleString('en-IN')}`;
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="min-h-screen bg-gray-50 text-black font-sans">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-black">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-black tracking-tight">Booking History</h1>
                            <p className="text-sm text-gray-500 font-medium">Manage all system bookings</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-gray-500 text-sm font-medium hidden sm:block">Admin: {user?.name}</span>
                        <button
                            onClick={handleLogout}
                            className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-black font-bold text-sm rounded-xl transition-all shadow-sm"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 mb-8">
                    {['ALL', 'REQUESTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED'].map((status) => (
                        <button
                            key={status}
                            onClick={() => {
                                setFilterStatus(status);
                                setCurrentPage(1); // Reset to page 1 on filter change
                            }}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${filterStatus === status
                                ? 'bg-black text-white shadow-md transform scale-105'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-black'
                                }`}
                        >
                            {status === 'ALL' ? 'All Bookings' : status.charAt(0) + status.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50/50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">User</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Station</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Vehicle</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center">
                                            <div className="flex justify-center items-center">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : bookings.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500 font-medium">
                                            No bookings found matching your criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    bookings.map((booking) => (
                                        <tr key={booking.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="px-6 py-4 text-gray-900 text-sm font-medium">
                                                {formatDate(booking.createdAt)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-black font-bold text-sm">{booking.user.name}</div>
                                                <div className="text-gray-500 text-xs">{booking.user.email}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-gray-900 font-medium text-sm">{booking.station.name}</div>
                                                {booking.station.address && (
                                                    <div className="text-gray-400 text-xs truncate max-w-[180px]" title={booking.station.address}>
                                                        📍 {booking.station.address}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${booking.vehicle.vehicleType === 'CAR' ? 'bg-blue-50 text-blue-700' :
                                                    booking.vehicle.vehicleType === 'SCOOTER' ? 'bg-green-50 text-green-700' :
                                                        'bg-purple-50 text-purple-700'
                                                    }`}>
                                                    {booking.vehicle.vehicleType}
                                                </span>
                                                <div className="text-gray-500 text-xs mt-1 font-medium">{booking.vehicle.model}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${booking.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' :
                                                    booking.status === 'REQUESTED' ? 'bg-yellow-100 text-yellow-800' :
                                                        booking.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                                                            'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {booking.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-black font-bold text-sm">
                                                {formatCurrency(booking.amountCents)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {(booking.status === 'CONFIRMED' || booking.status === 'REQUESTED') && (
                                                    <button
                                                        onClick={() => handleForceCancel(booking.id)}
                                                        className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors border border-red-100"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-200 pt-6">
                        <div className="text-sm text-gray-500 font-medium">
                            Showing page <span className="text-black font-bold">{pagination.page}</span> of <span className="text-black font-bold">{pagination.totalPages}</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 bg-white border border-gray-200 text-black font-medium rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                                disabled={currentPage === pagination.totalPages}
                                className="px-4 py-2 bg-white border border-gray-200 text-black font-medium rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
