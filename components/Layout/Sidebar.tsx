'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStationsStore } from '@/store/stationsStore';
import { useRouteStore } from '@/store/routeStore';
import { useMapStore } from '@/store/mapStore';
import { tripPlannerService } from '@/services/tripPlannerService';
import { directionsService } from '@/services/directionsService';
import { placesEVService } from '@/services/placesEVService';
import StationCard from '@/components/Stations/StationCard';
import SkeletonStationCard from '@/components/Stations/SkeletonStationCard';

import { useIsMobile } from '@/hooks/useIsMobile';
import { useMobileUIStore } from '@/store/mobileUIStore';

import AuthModal from '@/components/Auth/AuthModal';

export default function Sidebar() {
    const isMobile = useIsMobile();
    const { activeTab: mobileTab, isDrawerOpen, setDrawerOpen, isAuthModalOpen, setAuthModalOpen } = useMobileUIStore();

    // Desktop local state
    const [desktopTab, setDesktopTab] = useState<'search' | 'stations' | 'trip' | 'bookings'>('stations');

    // Auth State
    const [userInfo, setUserInfo] = useState<{ name: string, email: string } | null>(null);

    useEffect(() => {
        // Initial check
        const stored = localStorage.getItem('userInfo');
        if (stored) setUserInfo(JSON.parse(stored));

        // Listen for login/logout
        const handleAuthChange = () => {
            const updated = localStorage.getItem('userInfo');
            setUserInfo(updated ? JSON.parse(updated) : null);
        };
        window.addEventListener('auth-change', handleAuthChange);
        return () => window.removeEventListener('auth-change', handleAuthChange);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('userToken');
        localStorage.removeItem('userInfo');
        localStorage.removeItem('adminToken');
        setUserInfo(null);
        window.dispatchEvent(new Event('auth-change'));
    };

    // effective active tab
    const activeTab = isMobile ? (mobileTab === 'profile' ? null : mobileTab) : desktopTab;
    const setActiveTab = isMobile
        ? (tab: any) => useMobileUIStore.getState().setActiveTab(tab)
        : setDesktopTab;

    const { filteredStations, loading, setSelectedStation, setBookingModalOpen } = useStationsStore();
    const { tripPlan, tripPlanLoading, tripPlanError, setTripPlan, setTripPlanLoading, setTripPlanError, clearTripPlan, setActiveRoute, setFollowMode, isNavigating } = useRouteStore();
    const { userLocation, mapInstance } = useMapStore();

    // Search state - now stores ChargingStation results for EV autocomplete
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<import('@/types/station').ChargingStation[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedStation, setSearchSelectedStation] = useState<import('@/types/station').ChargingStation | null>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Trip Planner form state
    const [startLocation, setStartLocation] = useState('');
    const [destination, setDestination] = useState('');
    const [batteryPercent, setBatteryPercent] = useState(80);
    const [vehicleRange, setVehicleRange] = useState(400);

    // ============ SEARCH TAB LOGIC - Debounced EV Station Search ============
    useEffect(() => {
        // Clear previous timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        // Don't search if query is too short
        if (searchQuery.trim().length < 2) {
            setSearchResults([]);
            setSearchLoading(false);
            return;
        }

        setSearchLoading(true);

        // Debounce search by 400ms
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                // Initialize service if needed
                if (mapInstance) {
                    placesEVService.initialize(mapInstance);
                }

                const location = userLocation ? { lat: userLocation.position.lat, lng: userLocation.position.lng } : undefined;
                const results = await placesEVService.searchChargingStations(searchQuery, location);
                setSearchResults(results);
            } catch (error) {
                console.error('Search failed:', error);
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 400);

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [searchQuery, mapInstance, userLocation]);

    const handleSelectStation = (station: import('@/types/station').ChargingStation) => {
        setSearchSelectedStation(station);
        setSearchResults([]);
        setSearchQuery(station.name);

        // Pan map to station
        if (mapInstance) {
            mapInstance.panTo(station.location);
            mapInstance.setZoom(15);
        }

        // Open station drawer
        setSelectedStation(station);
    };

    // ============ TRIP PLANNER LOGIC ============
    const handlePlanTrip = async () => {
        console.log('🚀 Trip Planner Triggered');
        console.log('Inputs:', { startLocation, destination, batteryPercent, vehicleRange });

        if (!destination.trim()) {
            setTripPlanError('Please enter a destination');
            return;
        }

        setTripPlanLoading(true);
        setTripPlanError(null);
        clearTripPlan();

        // Resolve origin - use coordinates for "Current Location" or empty
        let origin: { lat: number; lng: number } | string | null = null;

        const trimmedStart = startLocation.trim().toLowerCase();
        if (!trimmedStart || trimmedStart === 'current location') {
            // Use actual user coordinates
            if (userLocation) {
                console.log('📍 Using Current Location:', userLocation);
                origin = { lat: userLocation.position.lat, lng: userLocation.position.lng };
            } else {
                console.warn('⚠️ Current location requested but not available');
            }
        } else {
            // Use the entered string for geocoding
            origin = startLocation.trim();
        }

        if (!origin) {
            console.error('❌ No origin available');
            setTripPlanError('Please enter a starting location or enable location services');
            setTripPlanLoading(false);
            return;
        }

        try {
            if (mapInstance) {
                placesEVService.initialize(mapInstance);
            }

            console.log('🛣️ Calling planEVTrip...');
            const result = await tripPlannerService.planEVTrip({
                origin,
                destination,
                batteryPercent,
                vehicleRangeKm: vehicleRange
            });
            console.log('✅ planEVTrip Result:', result);

            setTripPlanLoading(false);

            if (!result.success) {
                setTripPlanError(result.error || 'Failed to plan trip');
                return;
            }

            setTripPlan(result.tripPlan);
            setFollowMode(false); // Stop following user location to show the route

            // Fit map to route
            if (mapInstance && result.tripPlan.route.bounds) {
                const bounds = new google.maps.LatLngBounds(
                    result.tripPlan.route.bounds.southwest,
                    result.tripPlan.route.bounds.northeast
                );
                mapInstance.fitBounds(bounds);
            }
        } catch (error) {
            console.error('💥 Critical Error in handlePlanTrip:', error);
            setTripPlanError('An unexpected error occurred');
            setTripPlanLoading(false);
        }
    };

    const useCurrentLocation = () => {
        if (userLocation) {
            setStartLocation('Current Location');
        }
    };

    const handleBookingTrackNow = async (station: NonNullable<import('@/types/booking').Booking['station']>) => {
        // 1. Set destination (no tab switch - stay on bookings)
        setDestination(`${station.name}, ${station.address}`);

        // 2. Determine Origin
        let origin: string | import('@/types/map').LatLng;
        if (userLocation) {
            origin = { lat: userLocation.position.lat, lng: userLocation.position.lng };
            setStartLocation('Current Location');
        } else {
            // Cannot auto-calc without origin
            setTripPlanError('Please select a starting location');
            return;
        }

        // 3. Auto-calculate Route (Direct Navigation)
        setTripPlanLoading(true);
        setTripPlanError(null);

        try {
            if (mapInstance) {
                placesEVService.initialize(mapInstance);
            }

            console.log('📍 Track Now: Calculating direct route to', station.name);
            // 3. Auto-calculate Route (Direct Navigation)

            const routeInfo = await directionsService.getRouteInfo(
                origin as any,
                { lat: station.lat, lng: station.lng },
                useRouteStore.getState().travelMode || 'DRIVING'
            );

            setTripPlanLoading(false);

            if (!routeInfo) {
                setTripPlanError('Failed to calculate route');
                return;
            }

            // Set Active Route directly
            useRouteStore.getState().setActiveRoute(routeInfo);
            useRouteStore.getState().setDestination(station as any);
            useRouteStore.getState().startNavigation();

            // Fit map
            if (mapInstance && routeInfo.bounds) {
                const bounds = new google.maps.LatLngBounds(
                    routeInfo.bounds.southwest,
                    routeInfo.bounds.northeast
                );
                mapInstance.fitBounds(bounds);
            }
        } catch (error) {
            console.error('💥 Error in Track Now:', error);
            setTripPlanError('Failed to calculate route');
            setTripPlanLoading(false);
        }
    };

    // Mobile Drawer vs Desktop Sidebar props
    const containerClasses = isMobile
        ? `fixed inset-x-0 bottom-16 z-sheet bg-white dark:bg-gray-900 rounded-t-2xl shadow-upward transform transition-transform duration-300 ease-out flex flex-col ${isDrawerOpen ? 'translate-y-0' : 'translate-y-[110%]'}`
        : "absolute top-16 left-6 w-96 max-h-[calc(100vh-8rem)] glass-strong rounded-xl shadow-glass dark:shadow-glass-dark z-30 flex flex-col";

    // If mobile and profile tab chosen (or invalid), don't show "content" unless we handle it. 
    // Profile is handled elsewhere but ensures we don't crash.
    // Also hide if navigating
    if (isMobile && (!activeTab || isNavigating)) return null;

    return (
        <>
            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setAuthModalOpen(false)}
            />

            {/* Mobile Overlay Backdrop */}
            {isMobile && isDrawerOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-20 backdrop-blur-sm transition-opacity"
                    onClick={() => setDrawerOpen(false)}
                />
            )}

            <motion.div
                initial={isMobile ? false : { x: -400 }}
                animate={isMobile ? false : { x: 0 }}
                className={containerClasses}
                style={isMobile ? { maxHeight: '70vh', height: '70vh' } : {}}
            >
                {/* Desktop: Profile / User Info Header */}
                {!isMobile && (
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-black font-bold shadow-gold-glow border border-primary-300">
                                {userInfo ? userInfo.name.charAt(0).toUpperCase() : 'Guest'}
                            </div>
                            <div>
                                <div className="font-semibold text-gray-900 dark:text-white leading-tight">
                                    {userInfo ? userInfo.name : 'Welcome Guest'}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {userInfo ? 'Premium Member' : 'Sign in to access features'}
                                </div>
                            </div>
                        </div>
                        {userInfo ? (
                            <button
                                onClick={handleLogout}
                                className="text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-2 rounded-lg transition-colors"
                            >
                                Logout
                            </button>
                        ) : (
                            <button
                                onClick={() => setAuthModalOpen(true)}
                                className="text-sm font-bold bg-gradient-to-b from-primary-400 to-primary-600 border-t border-primary-300 shadow-3d hover:shadow-3d-hover hover:translate-y-[2px] active:translate-y-[4px] active:shadow-none text-black px-6 py-2 rounded-lg transition-all"
                            >
                                Login
                            </button>
                        )}
                    </div>
                )}

                {/* Mobile Drag Handle */}
                {isMobile && (
                    <div className="w-full flex justify-center pt-3 pb-1" onClick={() => setDrawerOpen(false)}>
                        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
                    </div>
                )}

                {/* Tabs (Hidden on mobile as controlled by BottomBar, shown on Desktop) */}
                {!isMobile && (
                    <div className="flex border-b border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setActiveTab('search')}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'search'
                                ? 'text-primary-600 border-b-2 border-primary-600'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            🔍 Search
                        </button>
                        <button
                            onClick={() => {
                                setActiveTab('stations');
                                clearTripPlan();
                            }}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'stations'
                                ? 'text-primary-600 border-b-2 border-primary-600'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            ⚡ Stations
                        </button>
                        <button
                            onClick={() => setActiveTab('trip')}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'trip'
                                ? 'text-primary-600 border-b-2 border-primary-600'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            🗺️ Trip
                        </button>
                        <button
                            onClick={() => {
                                setActiveTab('bookings');
                                clearTripPlan();
                            }}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'bookings'
                                ? 'text-primary-600 border-b-2 border-primary-600'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            📅 Bookings
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 min-h-0">
                    {/* ============ SEARCH TAB ============ */}
                    {activeTab === 'search' && (
                        <div className="space-y-4">
                            {/* Search Header */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">🔌</span>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Find EV Stations
                                </h2>
                            </div>

                            {/* Search Input - Auto-searches as you type */}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search by location (e.g., Kollam, Kochi...)"
                                    className="input w-full pl-10"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                    🔍
                                </span>
                                {searchLoading && (
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin">
                                        ⏳
                                    </span>
                                )}
                            </div>

                            {/* Search Results - EV Stations */}
                            {searchResults.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider">
                                        {searchResults.length} EV Stations Found
                                    </div>
                                    {searchResults.map((station, idx) => (
                                        <div key={station.id || idx} onClick={() => handleSelectStation(station)}>
                                            <StationCard station={station} />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Empty State */}
                            {!searchResults.length && searchQuery.length < 2 && (
                                <div className="text-center py-8">
                                    <div className="text-4xl mb-3">🗺️</div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Type a location name to find EV charging stations
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        e.g., "Kollam", "Kochi", "Trivandrum"
                                    </p>
                                </div>
                            )}

                            {/* No Results State */}
                            {!searchResults.length && searchQuery.length >= 2 && !searchLoading && (
                                <div className="text-center py-8">
                                    <div className="text-4xl mb-3">🔍</div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        No EV stations found for "{searchQuery}"
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Try a different location name
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ============ STATIONS TAB ============ */}
                    {activeTab === 'stations' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Charging Stations
                                </h2>
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                    {loading && filteredStations.length > 0 ? (
                                        <span className="flex items-center gap-1">
                                            <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse shadow-gold-glow"></span>
                                            {filteredStations.length} found
                                        </span>
                                    ) : (
                                        `${filteredStations.length} found`
                                    )}
                                </span>
                            </div>


                            {loading && filteredStations.length === 0 ? (
                                <div className="space-y-4">
                                    {[...Array(3)].map((_, i) => (
                                        <SkeletonStationCard key={i} />
                                    ))}
                                </div>
                            ) : filteredStations.length > 0 ? (
                                <div className="space-y-4">
                                    {filteredStations.map((station) => (
                                        <StationCard key={station.id} station={station} />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                                    No charging stations found
                                </p>
                            )}
                        </div>
                    )}

                    {/* ============ TRIP PLANNER TAB ============ */}
                    {activeTab === 'trip' && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                🚗 Plan Your EV Trip
                            </h2>

                            {/* Trip Form */}
                            {!tripPlan && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Starting Point
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={startLocation}
                                                onChange={(e) => setStartLocation(e.target.value)}
                                                placeholder="Enter start or use current"
                                                className="input flex-1"
                                            />
                                            <button
                                                onClick={useCurrentLocation}
                                                className="overflow-y-auto h-full p-4 bg-gray-950/90 backdrop-blur-md rounded-lg text-sm"
                                                title="Use current location"
                                            >
                                                📍
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Destination
                                        </label>
                                        <input
                                            type="text"
                                            value={destination}
                                            onChange={(e) => setDestination(e.target.value)}
                                            placeholder="e.g., Goa, Mumbai, Chennai"
                                            className="input"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Battery %
                                            </label>
                                            <input
                                                type="number"
                                                value={batteryPercent}
                                                onChange={(e) => setBatteryPercent(Number(e.target.value))}
                                                min={5}
                                                max={100}
                                                className="input"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Range (km)
                                            </label>
                                            <input
                                                type="number"
                                                value={vehicleRange}
                                                onChange={(e) => setVehicleRange(Number(e.target.value))}
                                                min={50}
                                                className="input"
                                            />
                                        </div>
                                    </div>

                                    {tripPlanError && (
                                        <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                                            ⚠️ {tripPlanError}
                                        </div>
                                    )}

                                    <button
                                        onClick={handlePlanTrip}
                                        disabled={tripPlanLoading}
                                        className="w-full btn-primary flex items-center justify-center gap-2"
                                    >
                                        {tripPlanLoading ? (
                                            <>
                                                <span className="animate-spin">⏳</span>
                                                Calculating...
                                            </>
                                        ) : (
                                            <>
                                                🗺️ Calculate Route
                                            </>
                                        )}
                                    </button>

                                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                        Get optimized charging stops for your EV journey
                                    </p>
                                </>
                            )}

                            {/* Trip Results */}
                            {tripPlan && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-4"
                                >
                                    {/* Summary Card */}
                                    <div className="p-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl text-white">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <div className="text-sm opacity-80">Total Distance</div>
                                                <div className="text-2xl font-bold">{tripPlan.totalDistance.toFixed(0)} km</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm opacity-80">Est. Duration</div>
                                                <div className="text-2xl font-bold">
                                                    {Math.floor(tripPlan.totalDuration / 3600)}h {Math.round((tripPlan.totalDuration % 3600) / 60)}m
                                                </div>
                                            </div>
                                        </div>
                                        {tripPlan.chargingStops.length > 0 && (
                                            <div className="text-sm opacity-90">
                                                ⚡ {tripPlan.chargingStops.length} charging stop{tripPlan.chargingStops.length > 1 ? 's' : ''} •
                                                {tripPlan.totalChargingTime} min charging
                                            </div>
                                        )}
                                    </div>

                                    {/* Warnings */}
                                    {tripPlan.warnings && tripPlan.warnings.length > 0 && (
                                        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
                                            ⚠️ {tripPlan.warnings[0]}
                                        </div>
                                    )}

                                    {/* Charging Stops */}
                                    {tripPlan.chargingStops.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 uppercase tracking-wider">
                                                Charging Stops
                                            </h3>
                                            <div className="space-y-3">
                                                {tripPlan.chargingStops.map((stop, idx) => (
                                                    <motion.div
                                                        key={idx}
                                                        initial={{ opacity: 0, x: -20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: idx * 0.1 }}
                                                        className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <div className="w-8 h-8 bg-gray-900 border border-primary-500/50 rounded-full flex items-center justify-center text-primary-400 font-bold text-sm shadow-inner">
                                                                {idx + 1}
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="font-medium text-gray-900 dark:text-white">
                                                                    {stop.name || `Charging Stop ${idx + 1}`}
                                                                </div>
                                                                {stop.address && (
                                                                    <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                                                                        📍 {stop.address}
                                                                    </div>
                                                                )}
                                                                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                                    {stop.reason}
                                                                </div>
                                                                <div className="flex flex-wrap gap-3 mt-2 text-xs items-center text-gray-500 font-medium">
                                                                    <span className="flex items-center gap-1 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded text-red-600 dark:text-red-400">
                                                                        🔻 {stop.arrivalBattery}%
                                                                    </span>
                                                                    <span className="text-gray-300">➜</span>
                                                                    <span className="flex items-center gap-1 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded text-green-600 dark:text-green-400">
                                                                        ✅ {stop.departureBattery}%
                                                                    </span>
                                                                    <span className="flex items-center gap-1 bg-black border border-primary-500/30 px-2 py-0.5 rounded text-primary-400 ml-auto text-xs">
                                                                        ⏳ {stop.chargingTime} min
                                                                    </span>
                                                                </div>

                                                                {(stop.stationData || stop.stationId) && (
                                                                    <button
                                                                        onClick={() => {
                                                                            const stationToBook = stop.stationData || {
                                                                                id: stop.stationId,
                                                                                name: stop.name || 'Charging Station',
                                                                                location: stop.location,
                                                                                address: stop.address || '',
                                                                                status: 'available',
                                                                                connectors: [{ id: 'def', type: 'Type2', power: 50, price: 0.25, available: true }],
                                                                                amenities: {},
                                                                                rating: 0,
                                                                                reviews: 0,
                                                                                speed: 'fast',
                                                                                operator: 'Unknown',
                                                                                operatingHours: '24/7'
                                                                            } as any;
                                                                            setSelectedStation(stationToBook);
                                                                            setBookingModalOpen(true);
                                                                        }}
                                                                        className="mt-3 w-full py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-black rounded-lg text-xs font-bold shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 uppercase tracking-wide"
                                                                    >
                                                                        Book Slot
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {tripPlan.chargingStops.length === 0 && (
                                        <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-xl text-center">
                                            <span className="text-2xl">✅</span>
                                            <p className="text-green-700 dark:text-green-400 font-medium mt-2">
                                                No charging stops needed!
                                            </p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Your battery is sufficient for this trip.
                                            </p>
                                        </div>
                                    )}

                                    {/* Clear Button */}
                                    <button
                                        onClick={clearTripPlan}
                                        className="w-full py-2 text-gray-600 dark:text-gray-400 text-sm hover:text-gray-900 dark:hover:text-white"
                                    >
                                        ← Plan Another Trip
                                    </button>
                                </motion.div>
                            )}
                        </div>
                    )}

                    {/* ============ BOOKINGS TAB ============ */}
                    {activeTab === 'bookings' && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                📅 Your Bookings
                            </h2>

                            <BookingsList onTrackNow={handleBookingTrackNow} />
                        </div>
                    )}
                </div>
            </motion.div>
        </>
    );
}

// Inner component for Bookings List to handle own state/effects
interface BookingsListProps {
    onTrackNow: (station: NonNullable<import('@/types/booking').Booking['station']>) => void;
}

function BookingsList({ onTrackNow }: BookingsListProps) {
    const [bookings, setBookings] = useState<import('@/types/booking').Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [extendingBookingId, setExtendingBookingId] = useState<string | null>(null);

    // Hooks for interaction
    const { setActiveTab } = useMobileUIStore();


    useEffect(() => {
        const fetchBookings = async () => {
            try {
                const storedUser = localStorage.getItem('userInfo');
                if (!storedUser) {
                    setLoading(false);
                    return;
                }
                const user = JSON.parse(storedUser);
                // Need to import bookingClient dynamically or at top
                const { bookingClient } = await import('@/services/bookingClient');
                const data = await bookingClient.getUserBookings(user.id);
                setBookings(data);
            } catch (err: any) {
                console.error('Failed to fetch bookings', err);
                setError('Failed to load bookings');
            } finally {
                setLoading(false);
            }
        };

        fetchBookings();
    }, []);

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse bg-gray-100 dark:bg-gray-800 h-24 rounded-xl" />
                ))}
            </div>
        );
    }

    if (!localStorage.getItem('userInfo')) {
        return (
            <div className="text-center py-8">
                <div className="text-4xl mb-3">🔒</div>
                <p className="text-gray-600 dark:text-gray-400">Please sign in to view your bookings</p>
            </div>
        );
    }

    if (bookings.length === 0) {
        return (
            <div className="text-center py-8">
                <div className="text-4xl mb-3">🎫</div>
                <p className="text-gray-600 dark:text-gray-400">No bookings found</p>
                <p className="text-xs text-gray-400 mt-1">Book a charging slot to see it here</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {bookings.map((booking) => (
                <div key={booking.id} className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                {booking.station?.name || 'Unknown Station'}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(booking.slotStart).toLocaleDateString()} • {new Date(booking.slotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {(booking.status === 'CONFIRMED' || booking.status === 'PENDING') && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-1">
                                    Ends: {new Date(booking.slotEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            )}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${booking.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                            booking.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                                booking.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                                    'bg-gray-100 text-gray-700'
                            }`}>
                            {booking.status}
                        </span>
                    </div>

                    <div className="flex justify-between items-end mt-2">
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                            {booking.vehicle?.model && (
                                <span className="block text-xs">🚗 {booking.vehicle.model}</span>
                            )}
                            <span className="block text-xs mt-1">Add: {booking.station?.address}</span>
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-bold text-gray-900 dark:text-white">
                                ₹{((booking.amountCents || (booking as any).totalPriceCents || 0) / 100).toFixed(0)}
                            </div>
                        </div>
                    </div>

                    {(booking.status === 'CONFIRMED' || booking.status === 'PENDING') && booking.station && (
                        <>
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => onTrackNow(booking.station!)}
                                    className="flex-1 py-2 bg-gradient-to-b from-primary-400 to-primary-600 border-t border-primary-300 text-black text-sm font-bold rounded-lg shadow-3d hover:translate-y-[1px] hover:shadow-3d-hover active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2"
                                >
                                    📍 Track
                                </button>
                                {booking.status === 'CONFIRMED' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExtendingBookingId(extendingBookingId === booking.id ? null : booking.id);
                                        }}
                                        className="px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 text-sm font-medium rounded-lg transition border border-green-200 dark:border-green-800"
                                    >
                                        +15m
                                    </button>
                                )}
                            </div>

                            {/* Extension Card */}
                            {extendingBookingId === booking.id && (
                                <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                    <div className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">
                                        Extend Charging Time
                                    </div>
                                    <div className="text-xs text-green-700 dark:text-green-300 mb-3">
                                        Add 15 minutes for ₹37
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setExtendingBookingId(null)}
                                            className="flex-1 py-2 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();

                                                // Prevent double-click
                                                if ((e.currentTarget as HTMLButtonElement).disabled) return;
                                                (e.currentTarget as HTMLButtonElement).disabled = true;

                                                const { useBookingsStore } = await import('@/store/bookingsStore');
                                                const success = await useBookingsStore.getState().extendBooking(booking.id, 15);
                                                if (success) {
                                                    // Refresh the bookings list to show updated times
                                                    const storedUser = localStorage.getItem('userInfo');
                                                    if (storedUser) {
                                                        const user = JSON.parse(storedUser);
                                                        const { bookingClient } = await import('@/services/bookingClient');
                                                        const updatedBookings = await bookingClient.getUserBookings(user.id);
                                                        setBookings(updatedBookings);

                                                        // Force refresh activeBooking from API
                                                        const freshBooking = await bookingClient.getBooking(booking.id);
                                                        if (freshBooking) {
                                                            useBookingsStore.getState().setActiveBooking(freshBooking);
                                                        }
                                                    }
                                                }
                                                setExtendingBookingId(null);
                                            }}
                                            className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition"
                                        >
                                            Confirm
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}
