import React, { useState } from 'react';
import { useBookingsStore } from '@/store/bookingsStore';
import { useStationsStore } from '@/store/stationsStore';
import { format, addMinutes } from 'date-fns';
import { useIsMobile } from '@/hooks/useIsMobile';
import BookingBottomSheet from '@/components/Booking/BookingBottomSheet';
import CarSearchInput from '@/components/Booking/CarSearchInput';
import { AnimatePresence } from 'framer-motion';


export default function BookingModal({ onClose, onTrackNow }: { onClose: () => void, onTrackNow: () => void }) {
    const { selectedStation, isBookingModalOpen, setBookingModalOpen } = useStationsStore();
    const { createBooking, confirmBooking, loading, activeBooking } = useBookingsStore();
    const isMobile = useIsMobile();
    const [step, setStep] = useState<'select' | 'processing' | 'confirmed'>('select');
    const [duration, setDuration] = useState(30);
    const [slotStart, setSlotStart] = useState(new Date().toISOString());
    const [vehicleModel, setVehicleModel] = useState('');

    if (!selectedStation) return null;

    const handleConfirm = async () => {
        if (!vehicleModel) {
            alert('Please select a vehicle model');
            return;
        }

        setStep('processing');

        // 1. Get User ID
        const storedUser = localStorage.getItem('userInfo');
        const user = storedUser ? JSON.parse(storedUser) : null;

        if (!user || !user.id) {
            alert('Please login to book a slot');
            setStep('select');
            return;
        }

        const booking = await createBooking({
            stationId: selectedStation.id,
            userId: user.id,
            slotStart,
            durationMinutes: duration,
            vehicleModel,
            stationData: {
                name: selectedStation.name,
                location: selectedStation.location,
                address: selectedStation.address,
            }
        } as any);

        if (booking) {
            // Simulate Payment Delay
            setTimeout(async () => {
                // 2. Confirm Booking
                const success = await confirmBooking(booking.id);
                if (success) {
                    setStep('confirmed');
                    useStationsStore.getState().updateStationStatus(selectedStation.id, 'booked');
                } else {
                    setStep('select');
                    alert('Booking failed to confirm');
                }
            }, 2000);
        } else {
            setStep('select');
            alert('Failed to create booking');
        }
    };

    if (isMobile) {
        return (
            <AnimatePresence>
                {isBookingModalOpen && (
                    <BookingBottomSheet onClose={onClose} onTrackNow={onTrackNow} />
                )}
            </AnimatePresence>
        );
    }
    // Desktop Modal below

    // Classic Desktop Modal
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">

            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                {step === 'select' && (
                    <div className="p-6">
                        <h2 className="text-xl font-bold mb-4">Book {selectedStation.name}</h2>

                        {/* Vehicle Selection */}
                        <div className="mb-4">
                            <CarSearchInput
                                value={vehicleModel}
                                onChange={setVehicleModel}
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                            <select
                                className="w-full border rounded-lg p-2"
                                value={slotStart}
                                onChange={(e) => setSlotStart(e.target.value)}
                            >
                                <option value={new Date().toISOString()}>Now</option>
                                <option value={addMinutes(new Date(), 15).toISOString()}>In 15 mins</option>
                                <option value={addMinutes(new Date(), 30).toISOString()}>In 30 mins</option>
                            </select>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                            <div className="flex gap-2">
                                {[15, 30, 45, 60].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setDuration(m)}
                                        className={`flex-1 py-2 rounded-lg border ${duration === m ? 'bg-primary-600 text-white border-primary-600' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                                    >
                                        {m}m
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg mb-6">
                            <div className="flex flex-col">
                                <span className="text-gray-600 text-sm">Total Cost</span>
                                <span className="text-xs text-gray-400">Based on ₹{((duration / 60) * 150 / duration * 60).toFixed(0)}/hr rate</span>
                            </div>
                            <span className="text-xl font-bold">₹{((duration / 60) * 150).toFixed(0)}</span>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={onClose} className="flex-1 py-3 text-gray-600 font-medium">Cancel</button>
                            <button
                                onClick={handleConfirm}
                                disabled={!vehicleModel}
                                className={`flex-1 py-3 font-bold rounded-lg shadow-lg transition ${!vehicleModel ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
                            >
                                Confirm Booking
                            </button>
                        </div>
                    </div>
                )}

                {step === 'processing' && (
                    <div className="p-12 text-center">
                        <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <h3 className="text-lg font-bold text-gray-800">Processing Payment...</h3>
                        <p className="text-gray-500">Securing your slot</p>
                    </div>
                )}

                {step === 'confirmed' && (
                    <div className="p-8 text-center bg-green-50">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
                        <p className="text-gray-600 mb-2">Your slot is reserved for {duration} mins.</p>
                        {vehicleModel && <p className="text-sm text-gray-500 mb-6">Vehicle: {vehicleModel}</p>}

                        <button
                            onClick={() => { onClose(); onTrackNow(); }}
                            className="w-full py-3 bg-primary-600 text-white font-bold rounded-lg shadow-lg hover:bg-primary-700 flex items-center justify-center gap-2"
                        >
                            <span>🚀</span> Track Now
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
