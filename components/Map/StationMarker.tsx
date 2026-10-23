'use client';

import { useEffect, useState } from 'react';
import { ChargingStation } from '@/types/station';

interface StationMarkerProps {
    station: ChargingStation;
    map: google.maps.Map;
    isSelected?: boolean;
    onClick?: () => void;
}

export default function StationMarker({ station, map, isSelected, onClick }: StationMarkerProps) {
    const [marker, setMarker] = useState<google.maps.Marker | null>(null);

    // Lightning Bolt Path
    const LIGHTNING_PATH = "M7 2v11h3v9l7-12h-4l4-8z";

    // Initial creation
    useEffect(() => {
        if (!map) return;

        // User requested "Red Lightning". keeping status logic for stroke/secondary cues if needed,
        // but main color will be red as requested.
        // Actually, let's make it a Red Lightning Bolt icon.
        const fillColor = '#ef4444'; // Red

        // Create marker
        const newMarker = new google.maps.Marker({
            position: station.location,
            map,
            icon: {
                path: LIGHTNING_PATH,
                scale: isSelected ? 2 : 1.5, // Path coords often need smaller scale than circle
                fillColor: fillColor,
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                anchor: new google.maps.Point(11, 11), // Center roughly (width ~20, height ~22)
            },
            title: station.name,
            zIndex: isSelected ? 1000 : 1, // Selected on top
        });

        // Add click listener
        if (onClick) {
            newMarker.addListener('click', onClick);
        }

        // Create info window for hover
        const infoWindow = new google.maps.InfoWindow({
            content: `
        <div style="padding: 8px; min-width: 200px;">
          <h3 style="font-weight: 600; margin: 0 0 4px 0;">${station.name}</h3>
          <p style="margin: 0; font-size: 12px; color: #666;">
            ${station.distanceText || 'Distance unavailable'} • ${station.durationText || 'ETA unavailable'}
          </p>
          <p style="margin: 4px 0 0 0; font-size: 12px;">
            <span style="color: ${station.status === 'available' ? '#22c55e' : '#f59e0b'}; font-weight: 600;">●</span> ${station.status.toUpperCase()}
          </p>
        </div>
      `,
        });

        // Show info window on hover
        newMarker.addListener('mouseover', () => {
            infoWindow.open(map, newMarker);
        });

        newMarker.addListener('mouseout', () => {
            infoWindow.close();
        });

        setMarker(newMarker);

        // Cleanup
        return () => {
            newMarker.setMap(null);
        };
    }, [station, map, onClick]);

    // Update style when selection/status changes
    useEffect(() => {
        if (!marker) return;

        const fillColor = '#ef4444'; // Always red lightning as requested

        marker.setIcon({
            path: LIGHTNING_PATH,
            scale: isSelected ? 2 : 1.5,
            fillColor,
            fillOpacity: 1,
            strokeColor: isSelected ? '#3b82f6' : '#ffffff',
            strokeWeight: isSelected ? 3 : 2,
            anchor: new google.maps.Point(11, 11),
        });
        marker.setZIndex(isSelected ? 1000 : 1);
    }, [station.status, isSelected, marker]);

    return null;
}
