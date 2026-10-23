'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useIsMobile } from '@/hooks/useIsMobile';
import AuthModal from '@/components/Auth/AuthModal';

export default function Navbar() {
    const isMobile = useIsMobile();
    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const [userInfo, setUserInfo] = useState<{ name: string; email: string; role?: string } | null>(null);

    // Initial check and event listener for auth changes
    useEffect(() => {
        const checkAuth = () => {
            const stored = localStorage.getItem('userInfo');
            if (stored) {
                try {
                    setUserInfo(JSON.parse(stored));
                } catch (e) {
                    console.error('Failed to parse user info', e);
                    setUserInfo(null);
                }
            } else {
                setUserInfo(null);
            }
        };

        // Check on mount
        checkAuth();

        // Listen for login/logout events from AuthModal or other components
        window.addEventListener('auth-change', checkAuth);
        return () => window.removeEventListener('auth-change', checkAuth);
    }, []);

    const isLoggedIn = !!userInfo;

    const handleLogout = () => {
        localStorage.removeItem('userToken');
        localStorage.removeItem('userInfo');
        localStorage.removeItem('adminToken');
        window.dispatchEvent(new Event('auth-change'));
        // Optional: Redirect to home if needed, but staying on page is fine
    };

    return (
        <>
            <motion.nav
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                // Premium White Theme with Black Text (Google Style)
                className={`fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm transition-all duration-300 ${isMobile ? 'h-16 px-4 pt-safe' : 'h-18 px-8'
                    }`}
            >
                <div className={`flex items-center justify-between h-full w-full max-w-7xl mx-auto`}>
                    {/* Brand Section */}
                    <div className="flex items-center gap-4 group cursor-pointer">
                        {/* Minimal Logo Container */}
                        <div className="relative w-10 h-10 flex items-center justify-center">
                            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                                <span className="text-white font-black text-lg tracking-tighter">TQ</span>
                            </div>
                        </div>

                        {/* Premium Text Branding */}
                        <div className="flex flex-col">
                            <h1 className="text-xl font-bold text-black tracking-tight leading-none group-hover:text-gray-700 transition-colors">
                                TORQ
                            </h1>
                            {!isMobile && (
                                <span className="text-[10px] font-medium text-gray-500 tracking-[0.2em] uppercase mt-0.5">
                                    Premium EV Network
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Navigation Links (Desktop) */}
                    {!isMobile && (
                        <div className="hidden md:flex items-center gap-8">
                            {['Explore', 'Map', 'Trip Planner', 'Premium'].map((item) => (
                                <button
                                    key={item}
                                    className="text-sm font-medium text-gray-600 hover:text-black transition-colors relative group"
                                >
                                    {item}
                                    <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-black transition-all group-hover:w-full opacity-0 group-hover:opacity-100" />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* User Actions */}
                    <div className="flex items-center gap-4">
                        {!isMobile && (
                            <button className="p-2 text-gray-400 hover:text-black transition-colors rounded-full hover:bg-gray-100">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </button>
                        )}

                        {/* Profile Button - Triggers Auth if not logged in, or Logout if logged in (for now) */}
                        {isLoggedIn ? (
                            <div className="flex items-center gap-3">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all bg-white group"
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-black to-gray-700 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white group-hover:ring-gray-100 overflow-hidden">
                                        <span>{userInfo?.name?.charAt(0).toUpperCase()}</span>
                                    </div>

                                    <div className="hidden md:flex flex-col items-start">
                                        <span className="text-xs font-bold text-black leading-none">
                                            {userInfo?.name}
                                        </span>
                                        <span className="text-[10px] text-gray-500 font-medium leading-none mt-0.5">
                                            Premium Member
                                        </span>
                                    </div>
                                </motion.button>

                                {/* Logout Button (Small) */}
                                <button
                                    onClick={handleLogout}
                                    className="text-xs text-red-500 font-medium hover:text-red-700 underline"
                                >
                                    Logout
                                </button>
                            </div>
                        ) : (
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setIsAuthOpen(true)}
                                className="flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all bg-white group"
                            >
                                <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold ring-2 ring-white group-hover:ring-gray-100 overflow-hidden">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>

                                <div className="hidden md:flex flex-col items-start">
                                    <span className="text-xs font-bold text-black leading-none">
                                        Sign In
                                    </span>
                                    <span className="text-[10px] text-gray-500 font-medium leading-none mt-0.5">
                                        Guest Account
                                    </span>
                                </div>
                            </motion.button>
                        )}

                        {/* Mobile Menu Toggle */}
                        {isMobile && (
                            <button className="p-2 -mr-2 text-black">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            </motion.nav>

            {/* Auth Modal Integration */}
            <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
        </>
    );
}
