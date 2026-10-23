'use client';



import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import SplashScreen from '@/components/SplashScreen';

export default function SplashProvider({ children }: { children: React.ReactNode }) {
    const [showSplash, setShowSplash] = useState(true);

    useEffect(() => {
        // Always show splash on first mount
        const timer = setTimeout(() => {
            setShowSplash(false);
        }, 6000); // 6 seconds for cinematic splash experience

        return () => clearTimeout(timer);
    }, []);

    return (
        <>
            <AnimatePresence mode="wait">
                {showSplash && (
                    <SplashScreen key="splash" onComplete={() => setShowSplash(false)} />
                )}
            </AnimatePresence>

            {/* App content loads in background */}
            <div className={showSplash ? 'opacity-0 pointer-events-none absolute inset-0' : 'opacity-100 transition-opacity duration-1000'}>
                {children}
            </div>
        </>
    );
}
