'use client';

import { useMapStore } from '@/store/mapStore';
import { useMobileUIStore } from '@/store/mobileUIStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import AccessibleButton from '@/components/UI/AccessibleButton';
import { motion } from 'framer-motion';

export default function MapControls() {
    const { mapInstance, userLocation, isTracking, setIsTracking, theme, setTheme } = useMapStore();
    const isMobile = useIsMobile();
    const { isDrawerOpen } = useMobileUIStore();

    const handleZoomIn = () => {
        if (mapInstance) {
            mapInstance.setZoom((mapInstance.getZoom() || 15) + 1);
        }
    };

    const handleZoomOut = () => {
        if (mapInstance) {
            mapInstance.setZoom((mapInstance.getZoom() || 15) - 1);
        }
    };

    const handleLocationClick = () => {
        if (!mapInstance || !userLocation) return;

        mapInstance.panTo({
            lat: userLocation.position.lat,
            lng: userLocation.position.lng
        });
        mapInstance.setZoom(17);
        setIsTracking(true);
    };

    const handleThemeToggle = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    // Mobile specific positioning: Above bottom bar (approx 60px + safe area)
    // Desktop: Bottom right, standard
    // When drawer is open on mobile, we might want to hide controls or move them? 
    // Let's keep them fixed but ensure z-index is below modal but above map.
    const positionClass = isMobile
        ? `fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-map-controls flex flex-col gap-3 transition-all duration-300 ${isDrawerOpen ? 'translate-y-[-10px]' : ''}`
        : "absolute right-4 bottom-8 z-map-controls flex flex-col gap-2";

    return (
        <div className={positionClass}>
            {/* Location Button */}
            <AccessibleButton
                onClick={handleLocationClick}
                className={`p-3 rounded-xl shadow-lg border transition-colors ${isTracking
                        ? 'bg-primary-500 text-white border-primary-600'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-100 dark:border-gray-700'
                    }`}
                label="My Location"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            </AccessibleButton>

            {/* Theme Toggle */}
            <AccessibleButton
                onClick={handleThemeToggle}
                className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200"
                label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
                {theme === 'light' ? '🌙' : '☀️'}
            </AccessibleButton>

            {/* Zoom Controls */}
            <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                <AccessibleButton
                    onClick={handleZoomIn}
                    className="p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-white"
                    label="Zoom In"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </AccessibleButton>
                <AccessibleButton
                    onClick={handleZoomOut}
                    className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-white"
                    label="Zoom Out"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                </AccessibleButton>
            </div>
        </div>
    );
}
