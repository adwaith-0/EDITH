import { useState, useEffect } from 'react';

export function useIsMobile(breakpoint: number = 768) {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // Initial check
        const checkMobile = () => {
            setIsMobile(window.innerWidth < breakpoint);
        };

        // Check on mount
        checkMobile();

        // Listen for resize
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, [breakpoint]);

    return isMobile;
}
