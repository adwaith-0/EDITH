'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CarSearchInputProps {
    value: string;
    onChange: (vehicle: string) => void;
    className?: string;
}

interface VehicleModel {
    Make_Name: string;
    Model_Name: string;
}

export default function CarSearchInput({ value, onChange, className = '' }: CarSearchInputProps) {
    const [query, setQuery] = useState(value);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Debounce ref
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Sync external value updates
    useEffect(() => {
        setQuery(value);
    }, [value]);

    // Handle outside click to close suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSearch = (input: string) => {
        setQuery(input);
        onChange(input); // Allow custom input

        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        if (input.length < 2) {
            setSuggestions([]);
            return;
        }

        setLoading(true);
        setShowSuggestions(true);

        timeoutRef.current = setTimeout(async () => {
            try {
                // Curated list of popular Electric Vehicles available in India
                const indianEVModels = [
                    'Tata Nexon EV',
                    'Tata Nexon EV Max',
                    'Tata Punch EV',
                    'Tata Tiago EV',
                    'Tata Tigor EV',
                    'Tata Curvv EV',
                    'Mahindra XUV400 EV',
                    'Mahindra BE 6e',
                    'Mahindra XEV 9e',
                    'MG ZS EV',
                    'MG Comet EV',
                    'MG Windsor EV',
                    'Hyundai Ioniq 5',
                    'Hyundai Kona Electric',
                    'Kia EV6',
                    'BYD Atto 3',
                    'BYD Seal',
                    'BYD e6',
                    'Mercedes EQS',
                    'Mercedes EQB',
                    'Mercedes EQE',
                    'BMW iX',
                    'BMW i4',
                    'BMW i5',
                    'BMW i7',
                    'Audi e-tron',
                    'Audi Q8 e-tron',
                    'Audi e-tron GT',
                    'Volvo XC40 Recharge',
                    'Volvo C40 Recharge',
                    'Porsche Taycan',
                    'Jaguar I-Pace',
                    'Citroen eC3',
                    'Mini Cooper SE',
                    'Ola S1 Pro',
                    'Ola S1 Air',
                    'Ola S1 X',
                    'Ather 450X',
                    'Ather 450S',
                    'Ather Rizta',
                    'TVS iQube',
                    'Bajaj Chetak',
                    'Hero Vida V1',
                    'Revolt RV400',
                    'Okinawa Praise Pro',
                    'Tesla Model 3',
                    'Tesla Model Y',
                    'Tesla Model S',
                    'Tesla Model X',
                ];

                // Filter based on user input
                const filtered = indianEVModels
                    .filter(model => model.toLowerCase().includes(input.toLowerCase()))
                    .slice(0, 8);

                setSuggestions(filtered);
            } catch (error) {
                console.error('Failed to filter EV models', error);
                setSuggestions([]);
            } finally {
                setLoading(false);
            }
        }, 300); // 300ms debounce for local filtering
    };

    const handleSelect = (suggestion: string) => {
        setQuery(suggestion);
        onChange(suggestion);
        setShowSuggestions(false);
        setSuggestions([]);
    };

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Vehicle Model
            </label>
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => query.length >= 2 && setShowSuggestions(true)}
                    placeholder="e.g. Tesla Model 3"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white pr-10"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    {loading ? (
                        <div className="animate-spin h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full" />
                    ) : (
                        '🚗'
                    )}
                </div>
            </div>

            {/* Suggestions Dropdown */}
            <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 max-h-48 overflow-y-auto"
                    >
                        {suggestions.map((suggestion, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSelect(suggestion)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-50 dark:border-gray-700 last:border-0"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
