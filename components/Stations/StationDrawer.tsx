'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useStationsStore } from '@/store/stationsStore';
import { useBookingsStore } from '@/store/bookingsStore';
import { useRouteStore } from '@/store/routeStore';
import { useMapStore } from '@/store/mapStore';
import { directionsService } from '@/services/directionsService';
import { useState, useEffect } from 'react';
import { useMobileUIStore } from '@/store/mobileUIStore';
import StationCard from './StationCard';
import BookingModal from '@/components/Booking/BookingModal';
import RoutePanel from '@/components/Directions/RoutePanel';
import TripPlanner from '@/components/Trip/TripPlanner';
import { BookingStatus } from '@/types/booking';

type Tab = 'search' | 'stations' | 'trip' | 'bookings';

export default function StationDrawer() {
    const { selectedStation, setSelectedStation, stations } = useStationsStore();
    const { activeBooking, bookings } = useBookingsStore();

    // Drawer State
    const [activeTab, setActiveTab] = useState<Tab>('stations');
    const [isExpanded, setIsExpanded] = useState(false);
    const [extendingBookingId, setExtendingBookingId] = useState<string | null>(null);

    // Fetch bookings when tab is active
    useEffect(() => {
        if (activeTab === 'bookings') {
            const fetchBookings = async () => {
                const storedUser = localStorage.getItem('userInfo');
                if (storedUser) {
                    try {
                        const user = JSON.parse(storedUser);
                        await useBookingsStore.getState().fetchUserBookings(user.id);
                    } catch (error) {
                        console.error("Failed to fetch bookings:", error);
                    }
                }
            };
            fetchBookings();
        }
    }, [activeTab]);
    // We keep the drawer always open at the bottom (peek)
    const isOpen = true;
    const isHidden = false;

    // Derived state
    const currentBooking = activeBooking;
    const activeBookingStatus = activeBooking?.status;

    // Expand drawer when a station is selected
    useEffect(() => {
        if (selectedStation) {
            setIsExpanded(true);
        }
    }, [selectedStation]);

    const handleClose = () => {
        setIsExpanded(false);
        if (selectedStation) {
            setSelectedStation(null);
        }
    };

    const handleTrackNow = async (stationId?: string) => {
        const targetStation = stationId
            ? stations.find(s => s.id === stationId) || selectedStation
            : selectedStation;

        if (!targetStation) return;

        const userLocation = useMapStore.getState().userLocation;
        if (!userLocation) {
            alert("User location not found, cannot route.");
            return;
        }

        useRouteStore.getState().setDestination(targetStation);
        useRouteStore.getState().setShowModeSelector(true);
        setActiveTab('trip');
        setIsExpanded(true); // Keep expanded to show trip details
    };

    // Check if a booking is currently "active" (happening right now)
    const isBookingActive = (booking: any) => {
        // Logic to determine if booking is physically ongoing
        // For now getting strictly from status 'CONFIRMED'
        return booking.status === 'CONFIRMED';
    };

    return (
        <AnimatePresence>
            {(isOpen && !isHidden) && (
                <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: isExpanded ? "0%" : "calc(100% - 300px)" }} // Peek height approx 300px (tabs + some content)
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={0.05}
                    onDragEnd={(_, info) => {
                        if (info.offset.y > 100) handleClose();
                        if (info.offset.y < -50) setIsExpanded(true);
                    }}
                    className={`fixed bottom-0 left-0 right-0 z-40 md:left-6 md:bottom-6 md:w-[450px] md:h-[calc(100vh-6rem)] 
                    bg-white/95 backdrop-blur-xl md:rounded-3xl shadow-2xl border border-gray-200
                    flex flex-col text-black overflow-hidden
                    ${isExpanded ? 'h-[90vh]' : 'h-[40vh]'} 
                    transition-all duration-300 ease-in-out`}
                >
                    {/* Drag Handle (Mobile) */}
                    <div className="w-full h-6 flex items-center justify-center md:hidden shrink-0 cursor-grab active:cursor-grabbing border-b border-gray-100 bg-white">
                        <div className="w-12 h-1 bg-gray-300 rounded-full" />
                    </div>

                    {/* Navigation Tabs - Premium Minimal Style */}
                    <div className="flex items-center justify-between px-2 pt-2 pb-0 border-b border-gray-100 bg-white sticky top-0 z-10 shrink-0">
                        {['search', 'stations', 'trip', 'bookings'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => {
                                    setActiveTab(tab as Tab);
                                    if (!isExpanded) setIsExpanded(true); // Auto expand on tab click usually
                                }}
                                className={`flex flex-col items-center gap-1 p-3 flex-1 relative group transition-colors duration-200
                                ${activeTab === tab ? 'text-black' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <div className={`p-2 rounded-xl transition-all duration-200 ${activeTab === tab ? 'bg-gray-100' : 'bg-transparent group-hover:bg-gray-50'}`}>
                                    {tab === 'search' && (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    )}
                                    {tab === 'stations' && (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    )}
                                    {tab === 'trip' && (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 17" /></svg>
                                    )}
                                    {tab === 'bookings' && (
                                        <div className="relative">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            {/* Status Dot */}
                                            {currentBooking && activeBookingStatus === 'CONFIRMED' && (
                                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white animate-pulse" />
                                            )}
                                        </div>
                                    )}
                                </div>
                                <span className="text-[10px] font-semibold tracking-wide uppercase">{tab}</span>

                                {/* Active Indicator Bar */}
                                {activeTab === tab && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute bottom-0 w-full h-[2px] bg-black"
                                    />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Content Area - White Background */}
                    <div className="flex-1 overflow-y-auto no-scrollbar bg-gray-50/50 relative">
                        {/* 1. Search Tab */}
                        {activeTab === 'search' && (
                            <div className="p-4 space-y-4">
                                <h2 className="text-xl font-bold tracking-tight text-black px-1">Where to?</h2>
                                <input
                                    type="text"
                                    placeholder="Search destination..."
                                    className="w-full p-4 rounded-xl border border-gray-200 bg-white text-black shadow-sm focus:ring-2 focus:ring-black focus:outline-none"
                                />

                                <div className="mt-6">
                                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Nearby</h3>
                                    <div className="text-center py-8 text-gray-400 text-sm">
                                        Map search functionality coming soon.
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. Stations Tab */}
                        {activeTab === 'stations' && (
                            <div className="p-4 pb-20">
                                <div className="flex items-center justify-between mb-4 px-1">
                                    <h2 className="text-xl font-bold text-black tracking-tight">Charging Stations</h2>
                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{stations.length} found</span>
                                </div>

                                <div className="space-y-3">
                                    {stations.map(station => (
                                        <div key={station.id} onClick={() => setSelectedStation(station)}> {/* Make card clickable to select */}
                                            <StationCard station={station} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 3. Trip Planner Tab */}
                        {activeTab === 'trip' && (
                            <div className="h-full">
                                {useRouteStore.getState().isNavigating ? (
                                    <RoutePanel />
                                ) : (
                                    <TripPlanner />
                                )}
                            </div>
                        )}

                        {/* 4. Bookings Tab */}
                        {activeTab === 'bookings' && (
                            <div className="p-4 space-y-4">
                                <div className="flex items-center justify-between mb-2 px-1">
                                    <h2 className="text-xl font-bold text-black tracking-tight">Your Bookings</h2>
                                </div>

                                {bookings.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-300">
                                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        </div>
                                        <p className="text-gray-500 font-medium">No active bookings</p>
                                        <p className="text-sm text-gray-400 mt-1 max-w-[200px]">Book a slot at a charging station to see it here.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {bookings.map((booking) => (
                                            <div key={booking.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <h3 className="font-bold text-black">{booking.station?.name || 'Unknown Station'}</h3>
                                                        <p className="text-xs text-gray-500 mt-1">{new Date(booking.slotStart).toLocaleDateString()}</p>
                                                    </div>
                                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide
                                                        ${booking.status === 'COMPLETED' ? 'bg-gray-100 text-gray-600' :
                                                            booking.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                                                                'bg-blue-50 text-blue-600'}`}>
                                                        {booking.status}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                                                    <div className="flex items-center gap-1.5">
                                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        {new Date(booking.slotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        <span className="text-gray-300">➜</span>
                                                        {new Date(booking.slotEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 font-bold text-black">
                                                        ₹{((booking.amountCents || (booking as any).totalPriceCents || 0) / 100).toFixed(0)}
                                                    </div>
                                                </div>

                                                {booking.status === 'CONFIRMED' && (
                                                    <div className="space-y-3">
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handleTrackNow(booking.stationId)}
                                                                className="flex-1 py-2.5 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                                                            >
                                                                <span>Track</span>
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setExtendingBookingId(extendingBookingId === booking.id ? null : booking.id);
                                                                }}
                                                                className="px-4 py-2.5 bg-green-50 text-green-700 text-sm font-bold rounded-xl hover:bg-green-100 transition-colors border border-green-100"
                                                            >
                                                                +15m
                                                            </button>
                                                        </div>

                                                        {/* Extension Card */}
                                                        {extendingBookingId === booking.id && (
                                                            <div className="p-3 bg-green-50/50 border border-green-100 rounded-xl animate-in fade-in slide-in-from-top-2">
                                                                <div className="flex justify-between items-center mb-3">
                                                                    <div className="text-sm font-bold text-green-800">
                                                                        Extend Session
                                                                    </div>
                                                                    <div className="text-xs font-bold text-green-700 bg-white px-2 py-1 rounded-lg shadow-sm">
                                                                        +15 mins / ₹37
                                                                    </div>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => setExtendingBookingId(null)}
                                                                        className="flex-1 py-2 text-gray-500 text-xs font-bold rounded-lg hover:bg-white hover:shadow-sm transition-all"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        onClick={async (e) => {
                                                                            e.stopPropagation();
                                                                            const btn = e.currentTarget;
                                                                            if (btn.disabled) return;
                                                                            btn.disabled = true;

                                                                            try {
                                                                                const success = await useBookingsStore.getState().extendBooking(booking.id, 15);
                                                                                if (success) {
                                                                                    // Refresh bookings
                                                                                    const storedUser = localStorage.getItem('userInfo');
                                                                                    if (storedUser) {
                                                                                        const user = JSON.parse(storedUser);
                                                                                        await useBookingsStore.getState().fetchUserBookings(user.id);
                                                                                    }
                                                                                }
                                                                            } catch (err) {
                                                                                console.error("Extension failed", err);
                                                                            } finally {
                                                                                setExtendingBookingId(null);
                                                                                btn.disabled = false;
                                                                            }
                                                                        }}
                                                                        className="flex-1 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 shadow-sm transition-all"
                                                                    >
                                                                        Confirm Pay
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Booking Details Flow (Overlay) */}
                        <AnimatePresence>
                            {selectedStation && (
                                <motion.div
                                    initial={{ y: '100%' }}
                                    animate={{ y: 0 }}
                                    exit={{ y: '100%' }}
                                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                    className="absolute inset-x-0 bottom-0 h-full bg-white z-20 flex flex-col"
                                >
                                    {/* Handle/Close for Overlay */}
                                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
                                        <h3 className="font-bold text-lg text-black">Station Details</h3>
                                        <button onClick={() => setSelectedStation(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4">
                                        {/* We can re-use StationCard here or a dedicated details view */}
                                        <StationCard station={selectedStation} isDetailedView={true} />

                                        {/* Import BookingModal logic here or component */}
                                        {BookingModal && (
                                            <BookingModal
                                                onClose={() => setSelectedStation(null)}
                                                onTrackNow={() => handleTrackNow()}
                                            />
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
