'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ChargeMap, { decodeRoute } from '@/components/Map/ChargeMap';
import { openMapService } from '@/services/openMapService';
import { buildItinerarySchedule, itineraryStart } from '@/services/tripItinerary';
import { directionsService } from '@/services/directionsService';
import { externalStationsService } from '@/services/externalStationsService';
import { useRouteStore } from '@/store/routeStore';
import { ItineraryStop, SavedItinerary } from '@/types/route';
import { LatLng } from '@/types/map';
import { ChargingStation } from '@/types/station';
import { RentalBooking, RentalListing, RentalVehicle } from '@/types/rental';
import { EnergyPlan, EnergyStop, project } from '@/shared/chargingPlanner';
import { discoverRoute, buildChargingPlan, RouteDirectory } from '@/services/routeChargingService';
import { EnergyControls, EnergyResults, energyProfile } from './EnergyPlanning';

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
const buttonClass = 'rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-wait disabled:opacity-50';
const secondaryClass = 'rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50';
const istLocal = (date: Date) => date.toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T').slice(0, 16);
const fromIST = itineraryStart;
const dateTime = (value: string | number) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
const minutes = (value: number) => value >= 60 ? `${Math.floor(value / 60)}h ${Math.round(value % 60)}m` : `${Math.round(value)}m`;
const connectorKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').replace('IEC62196', '').replace('MENNEKES', 'TYPE2');
const statusLabel: Record<string, string> = { REQUESTED: 'Awaiting host', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', DECLINED: 'Declined', CANCELLED: 'Cancelled', EXPIRED: 'Expired' };
const initialItinerary = (): SavedItinerary => ({ origin: '', destination: '', departureAt: istLocal(new Date(Date.now() + 3600000)), waypoint: '', vehicleId: '', batteryPercent: '80', rangeKm: '300', batteryKwh: '50', averageChargeKw: '40', planningModel: 'Custom EV', fillDemoGaps: true, stops: [], route: null, updatedAt: new Date().toISOString() });
const signature = (plan: SavedItinerary) => JSON.stringify([plan.origin, plan.destination, plan.departureAt, plan.waypoint, plan.stops.map(stop => [stop.id, stop.location, stop.durationMinutes, stop.manualStart])]);

export interface TripWorkspaceProps {
    rentals: RentalListing[];
    bookings: RentalBooking[];
    vehicles: RentalVehicle[];
    userId: string;
    onBookPublic: (station: ChargingStation, start?: string, duration?: number, modelName?:string) => void;
    onRequestRental: (listingId: string, suggestedStart?: string, durationMinutes?: number, vehicleId?: string, modelName?:string) => void;
}

function decodePolyline(encoded: string): LatLng[] {
    try { return decodeRoute(encoded).map(([lat, lng]) => ({ lat, lng })); }
    catch { return []; }
}

function distanceToPath(location: LatLng, path: LatLng[]): number | null {
    if (!path.length) return null;
    return project(location,path).crossKm;
}

function RouteMap({ plan }: { plan: SavedItinerary }) {
    return <ChargeMap route={plan.route} stops={plan.stops} className="h-64 w-full overflow-hidden rounded-2xl sm:h-80" />;
}

export function TripWorkspace({ rentals, bookings, vehicles, userId, onRequestRental, onBookPublic }: TripWorkspaceProps) {
    const { itinerary, itineraryUserId, itineraryStorageError, loadItinerary, saveItinerary } = useRouteStore();
    const [fallback] = useState(initialItinerary);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [publicStops, setPublicStops] = useState<ChargingStation[]>([]);
    const [candidateQuery, setCandidateQuery] = useState('');
    const [liveDirectory,setLiveDirectory]=useState(false);
    const [directory,setDirectory] = useState<RouteDirectory|null>(null);
    const [energy,setEnergy] = useState<EnergyPlan|null>(null);
    const [chargingRoute,setChargingRoute] = useState<SavedItinerary['route']>(null);
    const requestVersion=useRef(0);
    const pendingRental = useRef<{ stopId: string; stationId: string; existingIds: Set<string> } | null>(null);
    const plan = itineraryUserId === userId && itinerary ? itinerary : fallback;

    useEffect(() => { requestVersion.current++; setEnergy(null); setDirectory(null); setPublicStops([]); loadItinerary(userId); }, [userId, loadItinerary]);
    const save = (next: SavedItinerary) => saveItinerary({ ...next, updatedAt: new Date().toISOString() });
    const update = (patch: Partial<SavedItinerary>) => {
        requestVersion.current++; setEnergy(null); setChargingRoute(null);
        const next = { ...plan, ...patch };
        if (signature(next) !== signature(plan)) {
            next.route = null;
            next.stops = next.stops.map(stop => ({ ...stop, reviewRequired: stop.reviewRequired || bookings.some(booking => booking.id === stop.bookingId && ['REQUESTED', 'CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) }));
            setPublicStops([]);
        }
        save(next);
    };

    useEffect(() => {
        const pending = pendingRental.current;
        if (!pending || itineraryUserId !== userId || !itinerary) return;
        const booking = bookings.find(item => item.stationId === pending.stationId && !pending.existingIds.has(item.id));
        if (!booking) return;
        saveItinerary({ ...itinerary, stops: itinerary.stops.map(stop => stop.id === pending.stopId ? { ...stop, bookingId: booking.id } : stop), updatedAt: new Date().toISOString() });
        pendingRental.current = null;
    }, [bookings, itinerary, itineraryUserId, userId, saveItinerary]);

    const vehicle = vehicles.find(item => item.id === plan.vehicleId);
    const path = useMemo(() => plan.route ? decodePolyline(plan.route.polyline) : [], [plan.route]);
    const candidates = useMemo(() => rentals.filter(listing => listing.published && !plan.stops.some(stop => stop.stationId === listing.id))
        .map(listing => ({ listing, proximity: distanceToPath({ lat: listing.lat, lng: listing.lng }, path) }))
        .filter(({ listing, proximity }) => (!path.length || (proximity !== null && proximity <= 10)) && `${listing.name} ${listing.address}`.toLowerCase().includes(candidateQuery.toLowerCase()))
        .sort((a, b) => (a.proximity ?? 0) - (b.proximity ?? 0)), [rentals, plan.stops, path, candidateQuery]);

    const schedule = useMemo(() => buildItinerarySchedule(plan, bookings), [plan, bookings]);

    const addPrivate = (listing: RentalListing) => update({ stops: [...plan.stops, {
        id: `stop-${Date.now()}-${listing.id}`, stationId: listing.id, name: listing.name, address: listing.address,
        location: { lat: listing.lat, lng: listing.lng }, kind: 'private', source: 'Host listing', durationMinutes: 60,
    }] });
    const addPublic = (station: ChargingStation) => update({ stops: [...plan.stops, {
        id: `stop-${Date.now()}-${station.id}`, stationId: station.id, name: station.name, address: station.address,
        location: station.location, kind: 'public', source: station.synthetic ? 'Synthetic demo fixture' : station.source || 'External source', durationMinutes: 30,
    }] });
    const editStop = (id: string, patch: Partial<ItineraryStop>) => update({ stops: plan.stops.map(stop => stop.id === id ? { ...stop, ...patch } : stop) });

    const calculate = async () => {
        if (!plan.origin.trim() || !plan.destination.trim()) { setNotice('Enter an origin and destination. Manual itinerary stops can still be added below.'); return; }
        if (!plan.departureAt || !Number.isFinite(fromIST(plan.departureAt).getTime())) { setNotice('Choose a valid departure time in Asia/Kolkata.'); return; }
        if (plan.batteryPercent && (!Number.isFinite(Number(plan.batteryPercent)) || Number(plan.batteryPercent) < 0 || Number(plan.batteryPercent) > 100)) { setNotice('Battery percentage must be between 0 and 100, or left blank.'); return; }
        if (plan.rangeKm && (!Number.isFinite(Number(plan.rangeKm)) || Number(plan.rangeKm) <= 0)) { setNotice('Enter a positive range or leave it blank.'); return; }
        save(plan);
        const version=requestVersion.current;
        setBusy(true); setNotice('');
        try {
            const route = await directionsService.getRouteInfo(plan.origin, plan.destination, 'DRIVING', {
                departureAt: fromIST(plan.departureAt).toISOString(),
                waypoints: [...(plan.waypoint.trim() ? [plan.waypoint] : []), ...plan.stops.map(stop => stop.location)],
            });
            if (!route) { setNotice('Driving directions are unavailable. The itinerary is saved; choose rental slots manually. Retry to calculate the road ETA.'); return; }
            const current = useRouteStore.getState();
            if (current.itineraryUserId !== userId || !current.itinerary || signature(current.itinerary) !== signature(plan)) { setNotice('The itinerary changed while directions were loading. Calculate the updated route when ready.'); return; }
            save({ ...plan, route, calculatedSignature: signature(plan) });
            setNotice('Finding chargers along the entire driving route...');
            const found=await discoverRoute(route,!liveDirectory);
            if(requestVersion.current!==version)return;
            setDirectory(found);setPublicStops(found.stations);
            setNotice('Calculating charging stops and road access...');
            const result=await buildChargingPlan(route,found,energyProfile(plan,vehicles),fromIST(plan.departureAt).toISOString(),plan.origin,plan.destination,plan.waypoint);
            if(requestVersion.current!==version)return;
            setEnergy(result.energy);setChargingRoute(result.route);
            const demoStops=result.energy.stops.filter(s=>s.synthetic).map(s=>({id:s.id,name:s.name,address:s.address,location:s.location,status:'unknown' as const,connectors:[],amenities:{wifi:false,restaurant:false,restroom:false,parking:false,shelter:false},rating:0,reviews:0,operatingHours:'Demo only',operator:'EDITH simulation',speed:'unknown' as const,source:'simulated' as const,synthetic:true}));
            setPublicStops([...found.stations,...demoStops]);
            setNotice(`${found.stations.length} mapped public stations and ${found.rentals.length} private chargers within 10 km of the full route. ${found.warning||'Public availability is unknown. Battery and charge times are estimates.'}`);
        } catch { setNotice('Routing service is unavailable. Your itinerary is saved. Choose rental slots manually; distance and ETA remain unavailable.'); }
        finally { setBusy(false); }
    };

    const requestRental = (stop: ItineraryStop, index: number) => {
        const arrival = schedule.stops[index]?.arrival;
        const proposed = stop.manualStart ? fromIST(stop.manualStart).getTime() : arrival;
        if (proposed && proposed <= Date.now()) { setNotice('Choose a future rental start before requesting this stop.'); return; }
        pendingRental.current = { stopId: stop.id, stationId: stop.stationId, existingIds: new Set(bookings.map(item => item.id)) };
        // Rental forms use whole minutes: round a route ETA up, never before arrival.
        onRequestRental(stop.stationId, proposed ? new Date(Math.ceil(proposed / 60000) * 60000).toISOString() : undefined, stop.durationMinutes, vehicles.some(v=>v.id===plan.vehicleId)?plan.vehicleId:undefined);
    };

    const discoverPublic = async (fixtures = false) => {
        setBusy(true);
        try {
            if (fixtures) {
                setPublicStops(await externalStationsService.fetchDemoFixtures());
                setNotice('Synthetic public discovery fixtures loaded. They are not real stations. EDITH offers simulated booking slots for the MVP.');
                return;
            }
            if (!plan.origin.trim()) { setNotice('Enter an origin to search public stations near it.'); return; }
            const resolved = await openMapService.geocode(plan.origin);
            if (!resolved[0]) { setNotice('Origin could not be resolved. Use a more specific area or coordinates.'); return; }
            setPublicStops(await externalStationsService.fetchNearby(resolved[0], 15000));
            setNotice(`Public discovery near ${resolved[0].label}. These are suggestions around the origin; road access, live availability and reservations are not verified.`);
        } catch { setNotice('Public discovery is unavailable. Your private rental itinerary is still saved.'); }
        finally { setBusy(false); }
    };

    const bookSuggestion=(stop:EnergyStop)=>{
        const start=stop.startAt?new Date(Math.ceil(Date.parse(stop.startAt)/60000)*60000).toISOString():undefined;
        if(stop.kind==='private')onRequestRental(stop.id,start,stop.chargeMinutes||60,vehicle?.id,vehicle?undefined:energyProfile(plan,vehicles).name);
        else {const station=publicStops.find(s=>s.id===stop.id);if(station)onBookPublic(station,start,stop.chargeMinutes||30,energyProfile(plan,vehicles).name);}
    };
    const useSuggestions=()=>{
        if(!energy)return;
        const retained=plan.stops.filter(s=>s.bookingId);
        const generated=energy.stops.filter(s=>!retained.some(r=>r.stationId===s.id)).map(s=>({id:`auto-${s.id}`,stationId:s.id,name:s.name,address:s.address,location:s.location,kind:s.kind,source:s.source||'Route charging plan',durationMinutes:s.chargeMinutes||30}));
        update({stops:[...retained,...generated]});setNotice('Suggested stops added. Recalculate the itinerary to review times. Existing linked bookings were retained.');
    };
    return <div className="space-y-7 text-gray-950">
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h1 className="text-2xl font-bold tracking-tight">Plan a Trip</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Discover charging stops along your EV journey. Adding a stop never creates a booking.</p></div>
            <button className={secondaryClass} onClick={()=>{update(initialItinerary());setNotice('New trip started. Existing reservations remain in My Bookings.');}}>New trip</button>
        </div>
        {itineraryStorageError && <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{itineraryStorageError}</div>}
        <div className="grid gap-6 lg:grid-cols-[350px_minmax(0,1fr)]">
            <form onSubmit={event => { event.preventDefault(); void calculate(); }} className="h-fit space-y-4 rounded-3xl border border-gray-200 bg-white p-5 sm:p-6">
                <div><h2 className="text-lg font-bold">The journey</h2><p className="mt-1 text-xs text-gray-500">OpenStreetMap / OSRM · no API key required.</p></div>
                <Field label="Origin"><input required className={inputClass} placeholder="e.g. Fort Kochi" value={plan.origin} onChange={event => update({ origin: event.target.value })} /></Field>
                <Field label="Destination"><input required className={inputClass} placeholder="Where are you heading?" value={plan.destination} onChange={event => update({ destination: event.target.value })} /></Field>
                <Field label="Intermediate stop (optional)"><input className={inputClass} placeholder="Visited before your charging stops" value={plan.waypoint} onChange={event => update({ waypoint: event.target.value })} /></Field>
                <Field label="Departure · Asia/Kolkata"><input required type="datetime-local" className={inputClass} value={plan.departureAt} onChange={event => update({ departureAt: event.target.value })} /></Field>
                <EnergyControls plan={plan} vehicles={vehicles} onChange={update}/><label className="flex items-start gap-2 text-xs leading-5 text-gray-500"><input type="checkbox" checked={liveDirectory} onChange={e=>setLiveDirectory(e.target.checked)}/>Refresh live directory (slower). Otherwise use the labelled cached OSM snapshot when available.</label>

                <button disabled={busy} className={`${buttonClass} w-full`}>{busy ? 'Calculating route & finding stops…' : 'Plan trip & charging stops →'}</button>
                <p className="text-xs leading-5 text-gray-500">Choose your car, starting battery and range to estimate charging stops. All charging figures use your planning assumptions.</p>
            </form>
            <div className="min-w-0 space-y-5">
                <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white p-5 sm:p-6">
                    {plan.route ? <ChargeMap route={chargingRoute||plan.route} stops={plan.stops} rentals={directory?.rentals||[]} onOpen={id=>onRequestRental(id)} stations={publicStops} onStationSelect={station=>onBookPublic(station)} recommendedIds={energy?.stops.map(s=>s.id)} className="h-80 w-full overflow-hidden rounded-2xl" /> : <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-7 text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl text-emerald-700">↗</div><h3 className="font-bold">Start with your route.</h3><p className="mt-2 max-w-md text-sm leading-6 text-gray-500">Calculate real driving directions and nearby suggestions using OpenStreetMap and OSRM. If the route service is unavailable, your manual itinerary and rental requests still work.</p></div>}
                    <div className="mt-5 grid grid-cols-3 gap-3 border-b border-gray-100 pb-5"><Metric label="Driving" value={(chargingRoute||plan.route) ? minutes(Math.ceil((chargingRoute||plan.route)!.durationSeconds / 60)) : 'Unknown'} detail={(chargingRoute||plan.route)?.distanceText || 'Road distance unavailable'} /><Metric label="Planned stop time" value={energy?energy.totalChargingMinutes===null?'Unknown':minutes(energy.totalChargingMinutes):minutes(plan.stops.reduce((sum, stop, index) => sum + (schedule.stops[index]?.dwell ?? stop.durationMinutes), 0))} detail={energy?'Estimated charging':'Reserved / manual estimate'} /><Metric label="Waiting" value={energy?minutes(energy.stops.reduce((n,s)=>n+s.waitMinutes,0)):plan.route?minutes(schedule.waiting):'Unknown'} detail="Before chosen rental slots" /></div>
                    {(energy?energy.estimatedArrival:schedule.arrival)&&<p className="mt-4 text-sm text-gray-600">Estimated destination arrival <strong className="text-gray-950">{dateTime(energy?.estimatedArrival||schedule.arrival!)} IST</strong>. Driving, waiting and {energy?'suggested charging':'planned stop'} time included. OSRM estimate has no live traffic.</p>}
                    {!!plan.route?.legs?.length && <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-500"><p className="font-semibold text-gray-700">Resolved route locations — check these before travelling</p><p>From: {plan.route.legs[0].startAddress}</p><p>To: {plan.route.legs[plan.route.legs.length - 1].endAddress}</p>{plan.route.legs.length > 1 && <p>Via: {plan.route.legs.slice(0, -1).map(leg => leg.endAddress).join(' → ')}</p>}</div>}
                    <p className="mt-3 text-xs leading-5 text-gray-500">Confirm station access before travelling. Traffic, queues, terrain and charging taper can affect these estimates.</p>
                    {plan.batteryPercent && (plan.rangeKm || vehicle?.rangeKm) && <p className="mt-2 text-xs text-gray-500">Your input implies about {Math.round(Number(plan.batteryPercent) / 100 * Number(plan.rangeKm || vehicle?.rangeKm))} km remaining under your range assumptions; weather, speed and terrain may change it.</p>}
                </div>
                {notice && <div role="status" className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{notice}</div>}
        {energy&&<EnergyResults energy={energy} route={chargingRoute} onBook={stop=>bookSuggestion(stop)} onUse={()=>useSuggestions()}/>}
                <div className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6">
                    <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">Your itinerary</h2><span className="text-xs text-gray-400">{plan.stops.length} charging stops</span></div>
                    <div className="border-l-2 border-emerald-100 pl-5"><p className="text-xs uppercase tracking-wider text-gray-400">Start · {dateTime(fromIST(plan.departureAt).getTime())} IST</p><p className="mt-1 font-semibold">{plan.origin || 'Choose an origin'}</p></div>
                    {plan.waypoint && <div className="my-4 border-l-2 border-gray-100 pl-5"><p className="text-xs text-gray-400">Intermediate stop · driving only, no dwell time entered</p><p className="font-semibold">{plan.waypoint}</p></div>}
                    {plan.stops.length === 0 && <p className="my-5 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-500">Add a private rental or public discovery stop below. A stop is a plan until you submit a request and the host accepts.</p>}
                    <div className="my-5 space-y-4">{plan.stops.map((stop, index) => {
                        const booking = bookings.find(item => item.id === stop.bookingId);
                        const listing = rentals.find(item => item.id === stop.stationId);
                        const interval = schedule.stops[index];
                        const proposedTime = stop.manualStart ? fromIST(stop.manualStart).getTime() : interval?.arrival;
                        const intervalEnd = proposedTime ? proposedTime + stop.durationMinutes * 60000 : null;
                        const open = listing && proposedTime && intervalEnd ? listing.availabilityWindows.some(window => new Date(window.startsAt).getTime() <= proposedTime && new Date(window.endsAt).getTime() >= intervalEnd) : null;
                        const compatible = listing && vehicle ? listing.connectors.some(connector => vehicle.connectorTypes.some(type => connectorKey(type) === connectorKey(connector.connectorType))) : null;
                        const activeBooking = booking && ['REQUESTED', 'CONFIRMED', 'IN_PROGRESS'].includes(booking.status);
                        const matches = bookings.filter(item => item.stationId === stop.stationId);
                        return <article key={stop.id} className="rounded-2xl border border-gray-200 p-4">
                            <div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-950 text-xs font-bold text-white">{index + 1}</span><div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{stop.kind === 'private' ? 'Private rental · host approval' : `Public · ${stop.source} · demo booking`}</p><h3 className="mt-1 text-sm font-bold">{stop.name}</h3><p className="mt-1 text-xs leading-5 text-gray-500">{stop.address}</p></div></div><button type="button" aria-label={`Remove ${stop.name} from itinerary`} className="p-1 text-gray-400 hover:text-gray-950" onClick={() => { update({ stops: plan.stops.filter(item => item.id !== stop.id) }); if (booking) setNotice('Stop removed from this itinerary. Its backend booking was not cancelled or moved. Manage the reservation in My Bookings.'); }}>×</button></div>
                            <div className="mt-4 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${booking?.status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>{booking ? statusLabel[booking.status] : stop.kind === 'private' ? listing?.published === false || open === false ? 'Unavailable for proposed period / vehicle' : 'Booking required' : 'Suggested stop'}</span>{interval && <span className="text-xs text-gray-500">Driving arrival {dateTime(interval.arrival)} IST{interval.wait > 0 ? ` · wait ${minutes(interval.wait)}` : ''}</span>}</div>
                            {booking && <p className="mt-3 text-xs leading-5 text-gray-600">Backend reservation: {dateTime(booking.slotStart)}–{dateTime(booking.slotEnd)} IST · {money(booking.amountPaise)} · #{booking.id.slice(0, 8)}</p>}
                            {(stop.reviewRequired && activeBooking || interval?.late && activeBooking) && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">Review this reservation: the itinerary changed or estimated arrival misses the slot. Its booked time has not changed.<button type="button" className="mt-2 block font-bold underline" onClick={() => save({ ...plan, stops: plan.stops.map(item => item.id === stop.id ? { ...item, reviewRequired: false } : item) })}>Mark reservation reviewed</button></div>}
                            <div className={`mt-4 grid gap-3 ${stop.kind === 'private' ? 'sm:grid-cols-2' : ''}`}><Field label={stop.kind === 'private' ? 'Proposed rental start · IST (optional)' : 'Planned stop minutes'}>{stop.kind === 'private' ? <input type="datetime-local" value={stop.manualStart || ''} className={inputClass} onChange={event => editStop(stop.id, { manualStart: event.target.value })} /> : <input type="number" min="1" max="1440" value={stop.durationMinutes} className={inputClass} onChange={event => editStop(stop.id, { durationMinutes: Math.max(1, Math.min(1440, Number(event.target.value) || 1)) })} />}</Field>{stop.kind === 'private' && <Field label="Planned rental minutes"><input type="number" min="1" max="1440" value={stop.durationMinutes} className={inputClass} onChange={event => editStop(stop.id, { durationMinutes: Math.max(1, Math.min(1440, Number(event.target.value) || 1)) })} /></Field>}</div>
                            {stop.kind === 'private' && <><p className="mt-3 text-xs leading-5 text-gray-500">Demo bookings accept any car and connector. Confirm real compatibility with the host. {open === null ? 'Choose a slot manually or calculate driving arrival.' : open ? 'Proposed period fits a host window; confirmation still required.' : 'Proposed period is outside the listed windows.'}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={listing?.published === false} onClick={() => requestRental(stop, index)}>{activeBooking ? 'Review another rental request' : 'Review quote & request →'}</button><a href={`https://www.openstreetmap.org/directions?to=${stop.location.lat}%2C${stop.location.lng}`} target="_blank" rel="noreferrer" className={secondaryClass}>Directions ↗</a></div><p className="mt-2 text-[11px] leading-5 text-gray-400">Review the actual start, duration and server quote in the rental form. Pending requests do not reserve capacity.</p></>}
                            {matches.length > 0 && <Field label="Link an existing backend booking"><select value={stop.bookingId || ''} className={`${inputClass} mt-2`} onChange={event => save({ ...plan, stops: plan.stops.map(item => item.id === stop.id ? { ...item, bookingId: event.target.value || undefined } : item) })}><option value="">No reservation linked</option>{matches.map(item => <option key={item.id} value={item.id}>{statusLabel[item.status]} · {dateTime(item.slotStart)} · {item.id.slice(0, 8)}</option>)}</select></Field>}
                            {stop.kind === 'public' && <div className="mt-3"><button className={buttonClass} onClick={()=>{const station=publicStops.find(s=>s.id===stop.stationId);if(station)onBookPublic(station,interval?.arrival?new Date(Math.ceil(interval.arrival/60000)*60000).toISOString():undefined,stop.durationMinutes);else setNotice('Recalculate the route to reload this station before booking.');}}>Book demo slot →</button><p className="text-xs leading-5 text-gray-500">Live availability, tariffs and connector compatibility are not verified. Contact the operator. EDITH offers a labelled demo reservation only.</p><a href={`https://www.openstreetmap.org/?mlat=${stop.location.lat}&mlon=${stop.location.lng}#map=16/${stop.location.lat}/${stop.location.lng}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-emerald-700">Open public station in OpenStreetMap ↗</a></div>}
                        </article>;
                    })}</div>
                    <div className="border-l-2 border-gray-200 pl-5"><p className="text-xs uppercase tracking-wider text-gray-400">Destination</p><p className="mt-1 font-semibold">{plan.destination || 'Choose a destination'}</p></div>
                </div>
            </div>
        </div>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-bold">Charging suggestions</h2><p className="mt-1 text-xs text-gray-500">{plan.route ? 'Private listings within approximately 10 km of the route. Proximity is straight-line, not a road detour.' : 'Published private listings. Route proximity is unavailable until driving directions are calculated.'}</p></div><input aria-label="Filter charging suggestions" placeholder="Search area or listing" className={`${inputClass} sm:max-w-xs`} value={candidateQuery} onChange={event => setCandidateQuery(event.target.value)} /></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} className={secondaryClass} onClick={() => void discoverPublic()}>Find public stations near origin</button><button disabled={busy} className={secondaryClass} onClick={() => void discoverPublic(true)}>View synthetic public fixtures</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{candidates.map(({ listing, proximity }) => <article key={listing.id} className="flex flex-col rounded-2xl border border-gray-100 p-5"><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Private rental {listing.synthetic ? '· synthetic demo' : ''}</p><h3 className="mt-2 font-bold">{listing.name}</h3><p className="mt-1 text-xs leading-5 text-gray-500">{listing.address}</p><p className="mt-3 text-xs text-gray-600">{listing.connectors.map(connector => `${connector.connectorType} · ${connector.powerKw ? `${connector.powerKw} kW` : 'power unknown'}`).join(', ') || 'Technical specifications unknown'}</p>{proximity !== null && <p className="mt-1 text-xs text-gray-400">~{proximity.toFixed(1)} km from route · straight-line</p>}<div className="mt-auto flex items-center justify-between gap-3 pt-5"><p className="text-sm font-bold">{money(listing.hourlyRatePaise)}<span className="font-normal text-gray-400"> / hour</span></p><button className={secondaryClass} onClick={() => addPrivate(listing)}>+ Add stop</button></div></article>)}</div>{!candidates.length && <p className="mt-5 rounded-xl bg-gray-50 p-5 text-sm text-gray-500">No matching private suggestions. Change the search or inspect listings in Rent a Charger.</p>}{publicStops.length > 0 && <><h3 className="mb-4 mt-7 text-sm font-bold">Public stations along the route</h3><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{publicStops.filter(station => !plan.stops.some(stop => stop.stationId === station.id)).map(station => <PublicCard key={station.id} station={station} onAdd={() => addPublic(station)} onBook={()=>onBookPublic(station)} />)}</div></>}</section>
    </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block"><span className="mb-2 block text-xs font-semibold text-gray-500">{label}</span>{children}</label>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
    return <div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p><p className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{value}</p><p className="mt-1 text-[10px] leading-4 text-gray-400">{detail}</p></div>;
}
function PublicCard({ station, onAdd, onBook }: { station: ChargingStation; onAdd?: () => void; onBook?:()=>void }) {
    return <article className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">{station.synthetic ? 'Synthetic demo fixture' : station.source || 'Public directory'}</span><span className="text-[10px] font-semibold text-gray-400">{station.unavailable?'Restricted access':'Live availability unknown'}</span></div><h3 className="mt-4 font-bold">{station.name}</h3><p className="mt-2 text-xs leading-5 text-gray-500">{station.address}</p><div className="mt-4 rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-500"><p>{station.operator}</p><p>{station.connectors.length ? station.connectors.map(connector => `${connector.sourceType || connector.type}${connector.power ? ` · ${connector.power} kW` : ' · power unknown'}`).join(', ') : 'Connector and power unknown'}</p><p>{station.operatingHours} · operator tariff unknown</p></div><div className="mt-auto flex flex-wrap items-center gap-3 pt-4">{onBook&&<button className={buttonClass} onClick={onBook}>Book demo slot →</button>}{onAdd&&<button className={secondaryClass} onClick={onAdd}>+ Add stop</button>}<a href={station.sourceUrl||`https://www.openstreetmap.org/?mlat=${station.location.lat}&mlon=${station.location.lng}#map=16/${station.location.lat}/${station.location.lng}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700">Map details ↗</a></div>{onBook&&<p className="mt-3 text-[10px] leading-4 text-gray-400">EDITH simulation · ₹120/hour demo tariff · not sent to operator</p>}</article>;
}

export function PublicStationsWorkspace({onBook}:{onBook:(station:ChargingStation)=>void}) {
    const [place,setPlace]=useState('Kochi, Kerala, India');
    const [radius,setRadius]=useState(50000);
    const [stations,setStations]=useState<ChargingStation[]>([]);
    const [busy,setBusy]=useState(false);
    const [notice,setNotice]=useState('Loading mapped public chargers near Kochi...');
    const [page,setPage]=useState(1);
    const [filter,setFilter]=useState('');
    const [center,setCenter]=useState<LatLng>({lat:9.9816,lng:76.2999});
    const [selectedLocation,setSelectedLocation]=useState<LatLng>();
    const generation=useRef(0),started=useRef(false);
    const search=async(fixtures=false,location?:LatLng,preferCache=true)=>{
        const version=++generation.current;setBusy(true);setNotice('Searching public directories...');setPage(1);
        try{
            let point=fixtures?undefined:location||selectedLocation;
            if(!fixtures&&!point){const found=await openMapService.geocode(place);if(!found[0])throw Error('Place not found. Try an area, city and state.');point=found[0];}
            const data=fixtures?{stations:await externalStationsService.fetchDemoFixtures(),meta:undefined}:await externalStationsService.fetchDirectory(point!,radius,preferCache);
            const result=data.stations;
            if(version!==generation.current)return;
            if(point)setCenter(point);
            setStations(result);
            setNotice(data.meta?.warning?`${result.length} mapped stations within ${radius/1000} km in the cached directory snapshot${data.meta.snapshotAt?' ('+dateTime(data.meta.snapshotAt)+' IST)':''}. ${data.meta.warning} Live availability is unknown.`:fixtures?'Synthetic fixtures loaded for the MVP demonstration. These are not real directory results.':`${result.length} mapped stations within ${radius/1000} km. Every returned station is shown on the map. Directory coverage can be incomplete; live charger availability is unknown.`);
        }catch(e){if(version===generation.current){setStations([]);setNotice(e instanceof Error?e.message:'Public directory is unavailable. Retry shortly.');}}
        finally{if(version===generation.current)setBusy(false);}
    };
    useEffect(()=>{if(!started.current){started.current=true;void search(false,{lat:9.9816,lng:76.2999});}},[]);
    const filtered=stations.filter(s=>`${s.name} ${s.address} ${s.operator}`.toLowerCase().includes(filter.toLowerCase()));
    const locate=()=>navigator.geolocation?.getCurrentPosition(p=>{const point={lat:p.coords.latitude,lng:p.coords.longitude};setSelectedLocation(point);setPlace('My location');void search(false,point);},()=>setNotice('Location could not be determined. Search a city or address.'),{timeout:10000});
    return <div className="space-y-6 text-gray-950"><div><h1 className="text-2xl font-bold tracking-tight">Public Stations</h1><p className="mt-2 text-sm leading-6 text-gray-500">Find nearby chargers, inspect map popups and reserve a demo slot. No Maps API key required.</p></div><form onSubmit={e=>{e.preventDefault();void search();}} className="flex flex-wrap items-end gap-3 rounded-3xl border border-gray-200 bg-white p-5"><div className="min-w-[180px] flex-1"><Field label="City, area or address"><input aria-label="Public station search" required className={inputClass} value={place} onChange={e=>{setPlace(e.target.value);setSelectedLocation(undefined);}} placeholder="Kochi, Kerala"/></Field></div><Field label="Search radius"><select className={inputClass} value={radius} onChange={e=>setRadius(Number(e.target.value))}>{[15000,25000,50000,100000].map(r=><option key={r} value={r}>{r/1000} km</option>)}</select></Field><button disabled={busy} className={buttonClass}>{busy?'Finding stations...':'Find stations →'}</button><button type="button" className={secondaryClass} onClick={locate}>Use my location</button><button type="button" disabled={busy} className={secondaryClass} onClick={()=>void search(false,undefined,false)}>Refresh live directory</button></form><p role="status" className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-600">{notice}</p><ChargeMap stations={stations} onStationSelect={onBook} center={center} className="ed-public-map w-full overflow-hidden rounded-2xl"/><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{filtered.length} charging stations</h2><input aria-label="Filter public stations" className={`${inputClass} sm:max-w-xs`} placeholder="Filter by name or operator" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}/></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.slice(0,page*30).map(station=><PublicCard key={station.id} station={station} onBook={()=>onBook(station)}/>)}</div>{filtered.length>page*30&&<button className={secondaryClass} onClick={()=>setPage(page+1)}>Show 30 more stations ({filtered.length-page*30} remaining)</button>}{!busy&&!stations.length&&<p className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">No mapped results. Try another area or a larger radius.</p>}<button className="text-xs font-semibold text-gray-500 underline" disabled={busy} onClick={()=>void search(true)}>Load labelled synthetic demo fixtures</button></div>;
}
