'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBookingsStore } from '@/store/bookingsStore';
import { useStationsStore } from '@/store/stationsStore';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import AccessibleButton from '@/components/UI/AccessibleButton';
import { format, addMinutes } from 'date-fns';

import CarSearchInput from '@/components/Booking/CarSearchInput';

export default function BookingBottomSheet({ onClose, onTrackNow }: { onClose: () => void, onTrackNow: () => void }) {
    const { selectedStation } = useStationsStore();
    const { createBooking, confirmBooking } = useBookingsStore();
    const viewport = useVisualViewport();

    const [step, setStep] = useState<'select' | 'processing' | 'confirmed'>('select');
    const [duration, setDuration] = useState(30);
    const [vehicleModel, setVehicleModel] = useState('');

    if (!selectedStation) return null;

    const handleConfirm = async () => {
        if (!vehicleModel) {
            alert('Please select a vehicle model');
            return;
        }

        setStep('processing');
        const booking = await createBooking({
            stationId: selectedStation.id,
            userId: 'user-1',
            slotStart: new Date().toISOString(),
            durationMinutes: duration,
            vehicleModel // Pass for demo consistency
        } as any);

        if (booking) {
            setTimeout(async () => {
                const success = await confirmBooking(booking.id);
                if (success) {
                    setStep('confirmed');
                    useStationsStore.getState().updateStationStatus(selectedStation.id, 'booked');
                } else {
                    setStep('select');
                    alert('Booking failed');
                }
            }, 1500);
        } else {
            setStep('select');
            alert('Failed to create booking');
        }
    };

    // Keyboard avoidance calculation
    // If keyboard is open, viewport height shrinks. We ensure sheet stays visible.
    const bottomOffset = viewport ? (window.innerHeight - viewport.height) : 0;

    return (
        <>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black z-sheet backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Sheet */}
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed left-0 right-0 bottom-0 z-modal bg-white dark:bg-gray-900 rounded-t-2xl shadow-upward safe-area-bottom-margin"
                style={{ marginBottom: bottomOffset > 0 ? bottomOffset : 'env(safe-area-inset-bottom)' }}
                drag="y"
                dragConstraints={{ top: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                    if (info.offset.y > 100) onClose();
                }}
            >
                {/* Drag Handle */}
                <div className="flex justify-center pt-3 pb-4 touch-action-none">
                    <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
                </div>

                <div className="px-6 pb-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {step === 'select' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Book {selectedStation.name}
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Reserve your charging spot
                                </p>
                            </div>

                            <div className="space-y-4">
                                <CarSearchInput
                                    value={vehicleModel}
                                    onChange={setVehicleModel}
                                    className="mb-4"
                                />

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Duration
                                    </label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[15, 30, 45, 60].map(m => (
                                            <AccessibleButton
                                                key={m}
                                                onClick={() => setDuration(m)}
                                                className={`py-2 rounded-lg text-sm font-medium border ${duration === m
                                                    ? 'bg-primary-600 text-white border-primary-600'
                                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border-gray-200 dark:border-gray-700'
                                                    }`}
                                            >
                                                {m}m
                                            </AccessibleButton>
                                        ))}
                                    </div>
                                </div>

                                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl flex justify-between items-center">
                                    <span className="text-gray-600 dark:text-gray-400 font-medium">Total Cost</span>
                                    <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                                        ₹{((duration / 60) * 150).toFixed(0)}
                                    </span>
                                </div>

                                <AccessibleButton
                                    onClick={handleConfirm}
                                    disabled={!vehicleModel}
                                    className={`w-full py-4 text-lg shadow-lg transition-colors ${!vehicleModel ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed' : 'btn-primary'}`}
                                >
                                    Confirm Booking
                                </AccessibleButton>
                            </div>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="animate-spin w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full"></div>
                            <p className="font-medium text-gray-900 dark:text-white">Processing Payment...</p>
                        </div>
                    )}

                    {step === 'confirmed' && (
                        <div className="py-8 text-center space-y-6">
                            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                                <span className="text-4xl">✓</span>
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Confirmed!</h3>
                                <p className="text-gray-500 dark:text-gray-400">Your slot is reserved.</p>
                                {vehicleModel && <p className="text-sm text-gray-400 mt-1">Vehicle: {vehicleModel}</p>}
                            </div>

                            <AccessibleButton
                                onClick={() => { onClose(); onTrackNow(); }}
                                className="w-full btn-primary py-4 text-lg shadow-lg flex items-center justify-center gap-2"
                            >
                                <span>🚀</span> Track Now
                            </AccessibleButton>
                        </div>
                    )}
                </div>
            </motion.div>
        </>
    );
}
