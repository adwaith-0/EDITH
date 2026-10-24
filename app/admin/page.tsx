'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { io } from 'socket.io-client';
import { API_BASE_URL, REALTIME_ENABLED } from '@/services/apiBase';

interface DashboardData {
    activeBookingsCount: number;
    totalAvailableSlots: number;
    todayRevenueCents: number;
    weekRevenueCents: number;
    monthRevenueCents: number;
    todayEnergyKwh: number | null;
    recentBookings: any[];
}

interface Booking {
    id: string;
    user: { name: string; email: string };
    station: { name: string; address?: string; lat?: number; lng?: number };
    vehicle: { vehicleType: string; model: string };
    status: string;
    slotStart: string;
    slotEnd: string;
    remainingSeconds: number;
    amountCents: number;
    energyKwh: number;
}

export default function AdminDashboardPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [realtimeConnected, setRealtimeConnected] = useState(false);
    const [user, setUser] = useState<any>(null);

    const fetchDashboard = useCallback(async (token: string) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/dashboard`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to fetch dashboard');
            const data = await res.json();
            setDashboard(data);
        } catch (err: any) {
            setError(err.message);
        }
    }, []);

    const fetchBookings = useCallback(async (token: string) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/current-bookings`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to fetch bookings');
            const data = await res.json();
            setBookings(data.bookings);
        } catch (err: any) {
            console.error('Bookings error:', err);
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

        // Fetch initial data
        Promise.all([fetchDashboard(token), fetchBookings(token)]).finally(() => {
            setLoading(false);
        });

        // Setup socket connection
        const newSocket = REALTIME_ENABLED ? io(API_BASE_URL || undefined, {
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30000,
            timeout: 20000,
        }) : null;

        newSocket?.on('connect', () => {
            setRealtimeConnected(true);
            fetchDashboard(token);
            fetchBookings(token);
        });

        newSocket?.on('disconnect', () => setRealtimeConnected(false));
        newSocket?.on('connect_error', () => setRealtimeConnected(false));

        newSocket?.on('booking.created', () => {
            fetchDashboard(token);
            fetchBookings(token);
        });

        newSocket?.on('booking.cancelled', () => {
            fetchDashboard(token);
            fetchBookings(token);
        });

        newSocket?.on('booking.updated', () => {
            fetchDashboard(token);
            fetchBookings(token);
        });

        // Refresh data every 30 seconds
        const interval = setInterval(() => {
            fetchDashboard(token);
            fetchBookings(token);
        }, 30000);

        return () => {
            newSocket?.disconnect();
            clearInterval(interval);
        };
    }, [router, fetchDashboard, fetchBookings]);

    const handleLogout = () => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        router.push('/admin/login');
    };

    const handleForceCancel = async (bookingId: string) => {
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
            fetchDashboard(token);
            fetchBookings(token);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const formatCurrency = (cents: number) => {
        return `₹${(cents / 100).toLocaleString('en-IN')}`;
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
                    <p className="text-gray-500 mt-4 font-medium">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-500 text-xl font-bold mb-2">{error}</p>
                    <button onClick={() => router.push('/admin/login')} className="mt-4 text-black hover:underline font-medium">
                        Back to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 text-black font-sans">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center shadow-lg">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-black tracking-tight">Admin Dashboard</h1>
                            <p className="text-sm text-gray-500 font-medium">Welcome, {user?.name}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-black font-bold text-sm rounded-xl transition-all shadow-sm"
                    >
                        Logout
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <StatCard
                        title="Active Bookings"
                        value={dashboard?.activeBookingsCount || 0}
                        icon="⚡"
                        color="black"
                    />
                    <StatCard
                        title="Calendar openings now"
                        value={dashboard?.totalAvailableSlots || 0}
                        icon="🔌"
                        color="green"
                    />
                    <StatCard
                        title="Demo booking value today"
                        value={formatCurrency(dashboard?.todayRevenueCents || 0)}
                        icon="💰"
                        color="black"
                    />
                    <StatCard
                        title="Measured energy"
                        value={dashboard?.todayEnergyKwh == null ? 'Unknown' : `${dashboard.todayEnergyKwh.toFixed(1)} kWh`}
                        icon="🔋"
                        color="blue"
                    />
                </div>

                {/* Quick Actions */}
                <div className="flex justify-end mb-6">
                    <Link
                        href="/admin/history"
                        className="px-5 py-2.5 bg-black hover:bg-gray-800 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                        <span>View Full Booking History</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </Link>
                </div>

                {/* Revenue Summary */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Demo value this week</h3>
                        <p className="text-3xl font-black text-black">{formatCurrency(dashboard?.weekRevenueCents || 0)}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Demo value this month</h3>
                        <p className="text-3xl font-black text-black">{formatCurrency(dashboard?.monthRevenueCents || 0)}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex items-center justify-between">
                        <div>
                            <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Booking updates</h3>
                            <p className="text-lg font-bold text-black flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${realtimeConnected ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                                {realtimeConnected ? 'Live updates' : 'Refreshes every 30s'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Recent Bookings Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100">
                        <h2 className="text-lg font-bold text-black">Recent Bookings</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50/50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">User</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Station</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Vehicle</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Remaining</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {bookings.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500 font-medium">
                                            No recent bookings found
                                        </td>
                                    </tr>
                                ) : (
                                    bookings.map((booking) => (
                                        <tr key={booking.id} className="hover:bg-gray-50/80 transition-colors">
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
                                            <td className="px-6 py-4 text-black font-mono text-sm font-medium">
                                                {formatTime(booking.remainingSeconds)}
                                            </td>
                                            <td className="px-6 py-4 text-black font-bold text-sm">{formatCurrency(booking.amountCents)}</td>
                                            <td className="px-6 py-4">
                                                <button
                                                    disabled={!['REQUESTED', 'CONFIRMED'].includes(booking.status) || new Date(booking.slotStart) <= new Date()}
                                                    onClick={() => handleForceCancel(booking.id)}
                                                    className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors border border-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    Cancel
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}

function StatCard({ title, value, icon, color }: { title: string; value: string | number; icon: string; color: string }) {
    const colorClasses = {
        black: 'bg-black text-white',
        green: 'bg-green-600 text-white',
        purple: 'bg-purple-600 text-white',
        blue: 'bg-blue-600 text-white',
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                    <p className="text-2xl font-black text-black mt-1">{value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl ${colorClasses[color as keyof typeof colorClasses]} flex items-center justify-center text-xl shadow-lg`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}
