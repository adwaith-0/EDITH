import { useState, useEffect } from 'react';

interface VisualViewportDimensions {
    width: number;
    height: number;
    offsetLeft: number;
    offsetTop: number;
    pageLeft: number;
    pageTop: number;
    scale: number;
}

export function useVisualViewport() {
    const [viewport, setViewport] = useState<VisualViewportDimensions | null>(null);

    useEffect(() => {
        // Only run on client
        if (typeof window === 'undefined' || !window.visualViewport) return;

        const updateViewport = () => {
            const vv = window.visualViewport;
            if (vv) {
                setViewport({
                    width: vv.width,
                    height: vv.height,
                    offsetLeft: vv.offsetLeft,
                    offsetTop: vv.offsetTop,
                    pageLeft: vv.pageLeft,
                    pageTop: vv.pageTop,
                    scale: vv.scale,
                });
            }
        };

        // Initial update
        updateViewport();

        // Listeners
        window.visualViewport.addEventListener('resize', updateViewport);
        window.visualViewport.addEventListener('scroll', updateViewport);

        return () => {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', updateViewport);
                window.visualViewport.removeEventListener('scroll', updateViewport);
            }
        };
    }, []);

    return viewport;
}
