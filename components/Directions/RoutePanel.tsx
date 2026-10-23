import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouteStore, TravelMode } from '@/store/routeStore';
import { useMapStore } from '@/store/mapStore';
import { useStationsStore } from '@/store/stationsStore';
import { directionsService } from '@/services/directionsService';
import { useMobileUIStore } from '@/store/mobileUIStore';
import { useIsMobile } from '@/hooks/useIsMobile';

const TRAVEL_MODES: { mode: TravelMode; icon: string; label: string }[] = [
    { mode: 'DRIVING', icon: '🚗', label: 'Car' },
    { mode: 'TWO_WHEELER', icon: '🛵', label: 'Bike' },
    { mode: 'WALKING', icon: '🚶', label: 'Walk' },
];

export default function RoutePanel() {
    const {
        activeRoute,
        previewRoute,
        isNavigating,
        showModeSelector,
        travelMode,
        destination,
        navigationStartTime,
        clearRoute,
        setTravelMode,
        setPreviewRoute,
        startNavigation,
        setShowModeSelector
    } = useRouteStore();

    const { setDrawerOpen } = useMobileUIStore();
    const { setSelectedStation } = useStationsStore();
    const isMobile = useIsMobile();
    const { userLocation } = useMapStore();
    const [elapsed, setElapsed] = useState(0);
    const [loadingMode, setLoadingMode] = useState<TravelMode | null>(null);

    // Elapsed time counter during navigation
    useEffect(() => {
        if (isNavigating && navigationStartTime) {
            // Close mobile drawer when navigation starts to prevent overlap
            setDrawerOpen(false);
            // Close station details drawer
            setSelectedStation(null);

            const timer = setInterval(() => {
                setElapsed(Math.floor((Date.now() - navigationStartTime) / 1000));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [isNavigating, navigationStartTime, setDrawerOpen, setSelectedStation]);

    // Fetch route when travel mode changes in mode selector
    const handleModeChange = async (mode: TravelMode) => {
        if (!destination || !userLocation) return;

        setLoadingMode(mode);
        setTravelMode(mode);

        const route = await directionsService.getRouteInfo(
            { lat: userLocation.position.lat, lng: userLocation.position.lng },
            destination.location,
            mode
        );

        if (route) {
            setPreviewRoute(route);
        }
        setLoadingMode(null);
    };

    const handleStartNavigation = () => {
        if (previewRoute) {
            useRouteStore.getState().setActiveRoute(previewRoute);
            startNavigation();
        }
    };

    const formatDistance = (meters: number) => {
        return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
    };

    const formatDuration = (seconds: number, addBuffer = false) => {
        // Add 5 minutes buffer (300 seconds) if requested
        const totalSeconds = addBuffer ? seconds + 300 : seconds;
        const mins = Math.floor(totalSeconds / 60);
        return mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
    };

    const formatElapsed = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const routeToShow = isNavigating ? activeRoute : previewRoute;
    // Calculate buffered duration for display
    const bufferedDurationSeconds = routeToShow ? routeToShow.durationSeconds + 300 : 0;

    // Travel mode selector view
    if (showModeSelector && destination) {
        return (
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                className="w-full"
            >
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="font-bold text-black text-lg">Navigate to</h3>
                            <p className="text-gray-500 text-sm">{destination.name}</p>
                        </div>
                        <button
                            onClick={() => {
                                setShowModeSelector(false);
                                clearRoute();
                            }}
                            className="text-gray-400 hover:text-black transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Travel Mode Selector */}
                    <div className="flex gap-2 mb-6">
                        {TRAVEL_MODES.map(({ mode, icon, label }) => (
                            <button
                                key={mode}
                                onClick={() => handleModeChange(mode)}
                                className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all flex flex-col items-center gap-1 border ${travelMode === mode
                                    ? 'bg-black text-white border-black shadow-md'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <span className="text-xl">{loadingMode === mode ? '⏳' : icon}</span>
                                <span className="text-xs">{label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Route Preview */}
                    {previewRoute ? (
                        <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-3xl font-black text-black tracking-tight">
                                        {formatDuration(previewRoute.durationSeconds, true)}
                                    </div>
                                    <div className="text-sm font-medium text-gray-400 flex items-center gap-1">
                                        <span>{formatDistance(previewRoute.distanceMeters)}</span>
                                        <span>•</span>
                                        <span className="text-green-600 font-bold">Fastest Route</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Arrival</div>
                                    <div className="font-bold text-lg text-black">
                                        {new Date(Date.now() + (previewRoute.durationSeconds + 300) * 1000).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gray-50 rounded-xl p-8 mb-4 text-center border border-gray-100">
                            <div className="animate-spin w-6 h-6 border-2 border-black border-t-transparent rounded-full mx-auto mb-2"></div>
                            <div className="text-sm font-bold text-gray-400">Loading route...</div>
                        </div>
                    )}

                    <button
                        onClick={handleStartNavigation}
                        disabled={!previewRoute}
                        className="w-full py-4 bg-black text-white font-bold rounded-xl shadow-lg hover:bg-gray-800 transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                    >
                        <span>🚀</span> Start Navigation
                    </button>
                </div>
            </motion.div>
        );
    }

    // Active navigation view - embedded in drawer usually, but we returned null before
    if (!activeRoute || !isNavigating) return null;

    const getModeIcon = () => {
        switch (activeRoute.travelMode) {
            case 'TWO_WHEELER': return '🛵';
            case 'WALKING': return '🚶';
            default: return '🚗';
        }
    };

    return (
        <div className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            {/* Navigation Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">{getModeIcon()}</span>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-black text-black text-xl">Navigating</h3>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded-full animate-pulse">Live</span>
                        </div>
                        <p className="text-sm text-gray-500">To {destination?.name}</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Elapsed</div>
                    <div className="font-mono font-bold text-black text-lg">{formatElapsed(elapsed)}</div>
                </div>
            </div>

            <div className="bg-black text-white p-5 rounded-2xl shadow-lg mb-4">
                <div className="flex items-baseline justify-between mb-1">
                    <span className="text-4xl font-black tracking-tight">{formatDuration(activeRoute.durationSeconds, true)}</span>
                    <span className="text-lg font-medium text-gray-400">{formatDistance(activeRoute.distanceMeters)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
                    <span>Arrival by</span>
                    <span className="text-white font-bold">
                        {new Date(Date.now() + (activeRoute.durationSeconds + 300) * 1000).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </span>
                </div>
            </div>

            <button
                onClick={clearRoute}
                className="w-full py-3 bg-gray-100 text-red-500 font-bold rounded-xl hover:bg-gray-200 transition flex items-center justify-center gap-2"
            >
                End Navigation
            </button>
        </div>
    );
}
