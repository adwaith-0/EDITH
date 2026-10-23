import { create } from 'zustand';

interface MobileUIState {
    activeTab: 'search' | 'stations' | 'trip' | 'profile' | 'bookings';
    isDrawerOpen: boolean;
    isAuthModalOpen: boolean;
    setDrawerOpen: (open: boolean) => void;
    setAuthModalOpen: (open: boolean) => void;
    setActiveTab: (tab: 'search' | 'stations' | 'trip' | 'profile' | 'bookings') => void;
}

export const useMobileUIStore = create<MobileUIState>((set) => ({
    activeTab: 'stations',
    isDrawerOpen: false, // Default closed on mobile
    isAuthModalOpen: false,
    setDrawerOpen: (open) => set({ isDrawerOpen: open }),
    setAuthModalOpen: (open) => set({ isAuthModalOpen: open }),
    setActiveTab: (tab) => set({ activeTab: tab, isDrawerOpen: true }),
}));
