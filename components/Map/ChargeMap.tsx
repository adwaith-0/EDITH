'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup, LatLngBounds } from 'leaflet';
import { RentalListing } from '@/types/rental';
import { RouteInfo } from '@/types/route';
import { LatLng } from '@/types/map';
import { ChargingStation } from '@/types/station';

type Stop = { id: string; name: string; location: LatLng };
const emptyRentals: RentalListing[] = [];
const emptyStops: Stop[] = [];
const emptyStations: ChargingStation[] = [];
function fitToVisibleMap(instance: LeafletMap, bounds: LatLngBounds, canvas: HTMLDivElement | null) {
  if (!canvas || !bounds.isValid()) return;
  const overlay = !!canvas.closest('.ed-map-background');
  instance.fitBounds(bounds, {
    paddingTopLeft: [overlay && canvas.clientWidth > 600 ? 485 : 45, 45],
    paddingBottomRight: [45, overlay && canvas.clientWidth <= 600 ? Math.round(canvas.clientHeight * .6) : 45],
    maxZoom: 14,
  });
}
export interface ChargeMapProps {
  rentals?: RentalListing[]; onOpen?: (id: string) => void; route?: RouteInfo | null;
  stops?: Stop[]; className?: string; center?: LatLng; onLocationPick?: (point: LatLng) => void;
  stations?: ChargingStation[]; onStationSelect?: (station: ChargingStation) => void; recommendedIds?: string[];
}
export function decodeRoute(encoded: string): [number, number][] {
  const result: [number, number][] = []; let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    const read = () => { let n = 0, shift = 0, byte = 0; do {
      if (index >= encoded.length || shift > 30) throw new Error('Invalid route geometry');
      byte = encoded.charCodeAt(index++) - 63; n |= (byte & 31) << shift; shift += 5;
    } while (byte >= 32); return n & 1 ? ~(n >> 1) : n >> 1; };
    lat += read(); lng += read(); result.push([lat / 1e5, lng / 1e5]);
  }
  return result;
}

export default function ChargeMap({ rentals = emptyRentals, onOpen, route, stops = emptyStops, className = '', center, onLocationPick, stations = emptyStations, onStationSelect, recommendedIds }: ChargeMapProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const library = useRef<typeof import('leaflet') | null>(null);
  const markers = useRef<LayerGroup | null>(null);
  const resultBounds = useRef<LatLngBounds | null>(null);
  const callbacks = useRef({ onOpen, onLocationPick, onStationSelect });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [routeError, setRouteError] = useState('');
  const [tileError, setTileError] = useState(false);
  useEffect(() => { callbacks.current = { onOpen, onLocationPick, onStationSelect }; }, [onOpen, onLocationPick, onStationSelect]);

  useEffect(() => {
    let cancelled = false;
    import('leaflet').then(L => {
      if (cancelled || !canvas.current) return;
      library.current = L;
      const initial = center || { lat: 9.9816, lng: 76.2999 };
      const instance = L.map(canvas.current, { zoomControl: false, scrollWheelZoom: true }).setView([initial.lat, initial.lng], 12);
      map.current = instance;
      L.control.zoom({ position: 'topright' }).addTo(instance);
      const positionAttribution = () => instance.attributionControl.setPosition(
        canvas.current?.closest('.ed-map-background') && window.innerWidth <= 600 ? 'topright' : 'bottomright'
      );
      positionAttribution();
      L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        // Browser HTTP cache remains enabled. No offline/bulk/prefetch feature.
      }).on('tileerror', () => setTileError(true)).on('tileload', () => setTileError(false)).addTo(instance);
      markers.current = L.layerGroup().addTo(instance);
      instance.on('click', event => callbacks.current.onLocationPick?.({ lat: event.latlng.lat, lng: event.latlng.lng }));
      setReady(true);
      const resize = new ResizeObserver(() => {
        instance.invalidateSize({ pan: false }); positionAttribution();
        if (resultBounds.current) fitToVisibleMap(instance, resultBounds.current, canvas.current);
      });
      resize.observe(canvas.current);
      (instance as LeafletMap & { edithResize?: ResizeObserver }).edithResize = resize;
    }).catch(() => { if (!cancelled) setError('The interactive map could not load. Charger addresses and rentals remain available.'); });
    return () => {
      cancelled = true;
      if (map.current) { (map.current as LeafletMap & { edithResize?: ResizeObserver }).edithResize?.disconnect(); map.current.remove(); map.current = null; }
    };
    // Map is created once. Center changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = library.current, instance = map.current, layer = markers.current;
    if (!ready || !L || !instance || !layer) return;
    setRouteError('');
    layer.clearLayers();
    const bounds = L.latLngBounds([]);
    stations.forEach(station => {
      const point: [number,number] = [station.location.lat,station.location.lng]; bounds.extend(point);
      const selected = recommendedIds?.includes(station.id);
      const icon = L.divIcon({className:'edith-public-marker',iconSize:[30,30],iconAnchor:[15,15],html:`<span style="display:block;border:2px solid white;border-radius:50%;background:${selected?'#191c1a':station.synthetic?'#b58127':station.unavailable?'#92958f':'#19765b'};color:white;text-align:center;font:bold 17px Arial;line-height:26px;box-shadow:0 2px 8px #0004">⚡</span>`});
      const popup=document.createElement('div');popup.style.maxWidth='250px';
      const title=document.createElement('strong');title.textContent=station.name;popup.append(title);
      const details=document.createElement('p');details.textContent=station.connectors.length?station.connectors.map(c=>`${c.sourceType||c.type} · ${c.power?`${c.power} kW`:'power unknown'}`).join(', '):'Connector and power unknown';popup.append(details);
      const status=document.createElement('p');status.textContent=station.unavailable?'Access restricted or unavailable in directory':'Live availability unknown · demo reservations only';popup.append(status);
      if(onStationSelect){const button=document.createElement('button');button.textContent='Book demo slot →';button.style.cssText='background:#191c1a;color:white;padding:9px 12px;border:0;border-radius:9px;cursor:pointer';button.addEventListener('click',()=>callbacks.current.onStationSelect?.(station));popup.append(button);}
      L.marker(point,{icon,title:station.name,keyboard:true}).bindPopup(popup).addTo(layer);
    });
    rentals.forEach(rental => {
      const point: [number, number] = [rental.lat, rental.lng];
      bounds.extend(point);
      const price = Math.round(rental.hourlyRatePaise / 100);
      const icon = L.divIcon({ className: 'edith-map-marker', iconSize: [72, 36], iconAnchor: [36, 18],
        html: `<span style="display:block;background:${rental.isOpenForRequest === false ? '#716d65' : '#191c1a'};color:white;font:700 13px Inter,Arial,sans-serif;text-align:center;padding:9px 8px;border:2px solid white;border-radius:20px;box-shadow:0 3px 12px #0003">⚡ ₹${price}</span>`,
      });
      const tooltip = document.createElement('span'); tooltip.textContent = rental.name;
      L.marker(point, { icon, keyboard: true, title: rental.name }).bindTooltip(tooltip)
        .on('click', () => callbacks.current.onOpen?.(rental.id)).addTo(layer);
    });
    stops.forEach((stop, index) => {
      const tooltip = document.createElement('span'); tooltip.textContent = stop.name;
      L.marker([stop.location.lat, stop.location.lng], { title: stop.name,
        icon: L.divIcon({ className: 'edith-map-stop', iconSize: [30, 30], iconAnchor: [15, 15],
          html: `<span style="display:block;background:#23775e;border:2px solid white;border-radius:50%;color:white;text-align:center;line-height:26px;font:bold 13px Arial">${index + 1}</span>` }),
      }).bindTooltip(tooltip).addTo(layer);
      bounds.extend([stop.location.lat, stop.location.lng]);
    });
    if (route?.polyline) {
      try { const path = decodeRoute(route.polyline); L.polyline(path, { color: '#17785c', weight: 5, opacity: .9 }).addTo(layer); path.forEach(point => bounds.extend(point)); }
      catch { setRouteError('Route geometry is unavailable. Use the itinerary details.'); }
    }
    resultBounds.current = bounds;
    fitToVisibleMap(instance, bounds, canvas.current);
  }, [ready, rentals, route, stops, stations, recommendedIds]);

  useEffect(() => {
    if (ready && center && map.current && !stations.length && !rentals.length && !stops.length && !route) map.current.setView([center.lat, center.lng], 13);
  }, [ready, center, stations.length, rentals.length, stops.length, route]);

  return <div className={`relative w-full ${className || 'h-full'}`} style={{ minHeight: 220 }}>
    <div ref={canvas} className="h-full w-full" style={{ minHeight: 'inherit', background: '#e7ebe5' }} aria-label="OpenStreetMap charger map" role="region"/>
    {!ready && !error && <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-sm text-gray-600">Loading map…</div>}
    {(error || routeError || tileError) && <div role="status" className="absolute bottom-8 right-3 z-[500] max-w-xs rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600 shadow-sm">{error || routeError || 'Map tiles are temporarily unavailable. Addresses and rental requests still work.'}</div>}
  </div>;
}
