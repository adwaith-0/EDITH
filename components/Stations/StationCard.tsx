import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useStationsStore } from '@/store/stationsStore';
import { useRouteStore } from '@/store/routeStore';
import { useMapStore } from '@/store/mapStore';
import { useBookingsStore } from '@/store/bookingsStore';
import { directionsService } from '@/services/directionsService';
import { ChargingStation } from '@/types/station';

import { LatLng } from '@/types/map';

const calculateLocalDistance = (point1: LatLng, point2: LatLng): number => {
    const R = 6371;
    const dLat = (point2.lat - point1.lat) * (Math.PI / 180);
    const dLon = (point2.lng - point1.lng) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(point1.lat * (Math.PI / 180)) * Math.cos(point2.lat * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

interface StationCardProps {
    station: ChargingStation;
    isDetailedView?: boolean;
}

export default function StationCard({ station, isDetailedView = false }: StationCardProps) {
    const { setSelectedStation, setBookingModalOpen } = useStationsStore();
    const { userLocation } = useMapStore();
    const { activeBooking } = useBookingsStore();

    // Check if THIS station is the one currently booked
    const isBooked = activeBooking?.stationId === station.id && activeBooking?.status === 'CONFIRMED';

    // Countdown logic
    const [timeLeft, setTimeLeft] = useState<string>('');

    useEffect(() => {
        if (!isBooked || !activeBooking) {
            setTimeLeft('');
            return;
        }

        // Always show countdown to slotEnd (when charging session ends)
        // This includes arrival time + charging duration, and updates when extended

        const updateTimer = () => {
            const endTime = new Date(activeBooking.slotEnd).getTime();
            const diff = endTime - Date.now();

            if (diff <= 0) {
                setTimeLeft('Completed');
                return;
            }
            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [isBooked, activeBooking, activeBooking?.slotEnd]);

    const handleBookAndTrack = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (station.discoveryOnly || station.source) return;
        setSelectedStation(station);
        setBookingModalOpen(true);
    };

    const handleTrackNow = (e: React.MouseEvent) => {
        e.stopPropagation();
        console.log("🖱️ Track Now clicked for station:", station.name);
        // Do NOT set selectedStation, otherwise the Drawer opens and blocks the map.
        // setSelectedStation(station); 

        if (userLocation) {
            console.log("📍 User location found:", userLocation);
            const { setFollowMode, setIsNavigating, setActiveRoute } = useRouteStore.getState();

            // Optimistic UI update
            setFollowMode(true);
            setIsNavigating(true);

            directionsService.getRouteInfo(userLocation.position, station.location)
                .then(route => {
                    if (route) {
                        setActiveRoute(route);
                    } else {
                        alert("Could not calculate route. Please try again.");
                        setIsNavigating(false);
                    }
                })
                .catch(err => {
                    console.error("Routing failed", err);
                    alert("Routing failed");
                    setIsNavigating(false);
                });
        } else {
            alert("User location not known. Cannot track.");
        }
    };

    // Helper to get speed color
    const getSpeedColor = () => {
        switch (station.speed) {
            case 'ultra-fast': return 'text-purple-600';
            case 'fast': return 'text-primary-600';
            default: return 'text-gray-600';
        }
    };

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.01 }}
                className={`group cursor-pointer p-4 rounded-2xl transition-all duration-300 border 
                ${isBooked
                        ? 'bg-black text-white border-black shadow-xl ring-1 ring-gray-800'
                        : 'bg-white text-black border-gray-100 hover:border-gray-300 hover:shadow-lg'
                    }
                ${isDetailedView ? 'border-none shadow-none p-0 hover:scale-100' : ''}`}
                onClick={() => !isDetailedView && setSelectedStation(station)}
            >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 pr-2">
                        <h3 className={`font-bold text-lg leading-tight mb-1 ${isBooked ? 'text-white' : 'text-black'}`}>
                            {station.name}
                        </h3>
                        <p className={`text-sm font-medium truncate ${isBooked ? 'text-gray-400' : 'text-gray-500'}`}>
                            {station.address}
                        </p>
                    </div>
                    {getStatusBadge(station.status, isBooked)}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg">
                        <span className="text-sm font-bold text-black">{station.reviews > 0 ? `★ ${station.rating}` : 'No rating data'}</span>
                        {station.reviews > 0 && <span className="text-xs text-gray-400">({station.reviews})</span>}
                    </div>

                    {/* Distance and ETA */}
                    <div className={`flex items-center gap-2 text-sm font-medium ${isBooked ? 'text-gray-300' : 'text-gray-600'}`}>
                        <span>
                            {station.distanceText || (userLocation ? `${calculateLocalDistance(userLocation.position, station.location).toFixed(1)} km` : '-')}
                        </span>
                        <span className="text-gray-300">•</span>
                        <span>
                            {station.durationText || (userLocation ? `~${Math.ceil((calculateLocalDistance(userLocation.position, station.location) / 30) * 60)} min` : 'Unknown')}
                        </span>
                    </div>
                </div>

                {/* Amenities */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2">
                        {station.amenities?.wifi && (
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${isBooked ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-500'}`} title="WiFi">
                                📶
                            </span>
                        )}
                        {station.amenities?.restaurant && (
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${isBooked ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-500'}`} title="Restaurant">
                                🍽️
                            </span>
                        )}
                        {station.amenities?.parking && (
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${isBooked ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-500'}`} title="Parking">
                                🅿️
                            </span>
                        )}
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${isBooked ? 'text-purple-400' : getSpeedColor()}`}>
                        {station.speed === 'unknown' ? 'Power unknown' : station.speed === 'ultra-fast' ? '⚡ Ultra Fast' : station.speed === 'fast' ? '⚡ Fast' : '⚡ Slow'}
                    </span>
                </div>

                {/* Action Area */}
                <div className="mt-2 flex gap-2">
                    {isBooked ? (
                        <div className="flex-1">
                            <div className="flex items-center justify-between bg-gray-900 rounded-xl p-3 border border-gray-800 mb-3">
                                <div>
                                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Time Remaining</div>
                                    <div className="text-xl font-mono font-bold text-white">{timeLeft}</div>
                                </div>
                                <div className="animate-pulse w-2 h-2 rounded-full bg-green-500"></div>
                            </div>

                            <button
                                onClick={handleTrackNow}
                                className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                            >
                                <span>Navigate</span>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleBookAndTrack}
                            disabled={station.discoveryOnly || !!station.source || station.status !== 'available'}
                            className={`w-full py-3 rounded-xl font-bold transition-all transform active:scale-[0.98] ${station.status === 'available'
                                ? 'bg-black text-white hover:bg-gray-800 shadow-lg'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            {station.discoveryOnly || station.source ? 'Public station · discovery only' : station.status === 'available' ? 'Book & Charge' : station.status === 'unknown' ? 'Availability unknown' : 'Unavailable'}
                        </button>
                    )}
                </div>
            </motion.div>
        </>
    );
}

function getStatusBadge(status: string, isBooked: boolean) {
    if (isBooked) {
        return (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-white/10 text-white border-white/20">
                ACTIVE
            </span>
        );
    }

    const styles: any = {
        available: 'bg-green-50 text-green-700 border-green-100',
        busy: 'bg-orange-50 text-orange-700 border-orange-100',
        booked: 'bg-gray-50 text-gray-600 border-gray-100',
        offline: 'bg-gray-50 text-gray-400 border-gray-100'
    };

    const labels: any = {
        available: 'Available',
        busy: 'Busy',
        booked: 'In Use',
        offline: 'Offline'
    };

    return (
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide ${styles[status] || styles.offline}`}>
            {status === 'available' && <span className="mr-1 inline-block w-1.5 h-1.5 rounded-full bg-green-500"></span>}
            {labels[status] || 'Unknown'}
        </span>
    );
}

function getSpeedColor(speed: string) {
    if (speed === 'ultra-fast') return 'text-purple-600';
    return 'text-gray-500';
}
