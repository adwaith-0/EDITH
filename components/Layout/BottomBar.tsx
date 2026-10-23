'use client';

import { useState, useEffect } from 'react';
import { useMobileUIStore } from '@/store/mobileUIStore';
import AuthModal from '@/components/Auth/AuthModal';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function BottomBar() {
    const { activeTab, setActiveTab, setDrawerOpen, isDrawerOpen, isAuthModalOpen, setAuthModalOpen } = useMobileUIStore();
    const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const isMobile = useIsMobile();

    useEffect(() => {
        const stored = localStorage.getItem('userInfo');
        if (stored) setUserInfo(JSON.parse(stored));

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
        setShowProfileMenu(false);
        window.dispatchEvent(new Event('auth-change'));
    };

    const tabs = [
        { id: 'search', icon: '🔍', label: 'Search' },
        { id: 'stations', icon: '⚡', label: 'Stations' },
        { id: 'trip', icon: '🗺️', label: 'Trip' },
    ] as const;

    return (
        <>
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />

            {/* Profile Menu Popup */}
            {showProfileMenu && (
                <div className="fixed bottom-20 right-4 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 w-64 border border-gray-200 dark:border-gray-700">
                    {userInfo ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-black font-bold shadow-gold-glow">
                                    {userInfo.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div className="font-semibold text-gray-900 dark:text-white">{userInfo.name}</div>
                                    <div className="text-xs text-gray-500">{userInfo.email}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setShowProfileMenu(false);
                                    setActiveTab('bookings');
                                    setDrawerOpen(true);
                                }}
                                className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition flex items-center gap-2"
                            >
                                📅 My Bookings
                            </button>
                            <button
                                onClick={handleLogout}
                                className="w-full py-2 px-4 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition"
                            >
                                Logout
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-gray-600 dark:text-gray-300 text-sm text-center">
                                Sign in to book charging slots
                            </p>
                            <button
                                onClick={() => {
                                    setShowProfileMenu(false);
                                    setAuthModalOpen(true);
                                }}
                                className="w-full py-2 px-4 bg-gradient-to-b from-primary-400 to-primary-600 border-t border-primary-300 text-black font-bold rounded-lg shadow-3d active:shadow-none active:translate-y-[3px] transition-all"
                            >
                                Login / Sign Up
                            </button>
                        </div>
                    )}
                    <button
                        onClick={() => setShowProfileMenu(false)}
                        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Bottom Backdrop for profile menu */}
            {showProfileMenu && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                />
            )}

            {/* Replaced the div with motion.div and updated its content */}
            <motion.div
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                className={`fixed bottom-0 left-0 right-0 z-20 ${isMobile ? 'block' : 'hidden'
                    }`}
            >
                <div className="absolute inset-0 bg-black/80 backdrop-blur-xl border-t border-primary-500/30 shadow-gold-glow"></div>
                <div className="relative flex justify-around items-center h-16 px-2 safe-bottom">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    if (activeTab === tab.id && isDrawerOpen) {
                                        setDrawerOpen(false);
                                    } else {
                                        setActiveTab(tab.id);
                                    }
                                }}
                                className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-300 ${isActive
                                    ? 'text-primary-400 scale-110 drop-shadow-[0_0_8px_rgba(212,175,55,0.6)]'
                                    : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                <span className="text-xl">{tab.icon}</span>
                                <span className="text-[10px] font-medium">{tab.label}</span>
                            </button>
                        );
                    })}

                    {/* Profile Button */}
                    <button
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${showProfileMenu ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                        {userInfo ? (
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-black text-xs font-bold shadow-sm">
                                {userInfo.name.charAt(0).toUpperCase()}
                            </div>
                        ) : (
                            <span className="text-xl">👤</span>
                        )}
                        <span className="text-[10px] font-medium">{userInfo ? 'Account' : 'Login'}</span>
                    </button>
                </div>
            </motion.div>
        </>
    );
}

