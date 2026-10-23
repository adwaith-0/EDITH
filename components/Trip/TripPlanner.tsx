'use client';

import { useState } from 'react';
import { useRouteStore } from '@/store/routeStore';
import { tripPlannerService } from '@/services/tripPlannerService';


/** Retained for the legacy map drawer; the integrated rental journey uses TripWorkspace. */
export default function TripPlanner() {
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [battery, setBattery] = useState('');
    const [range, setRange] = useState('');
    const { tripPlan, tripPlanLoading, tripPlanError, setTripPlan, setTripPlanLoading, setTripPlanError } = useRouteStore();
    const calculate = async () => {
        if (!origin.trim() || !destination.trim()) { setTripPlanError('Enter an origin and destination.'); return; }
        setTripPlanLoading(true); setTripPlanError(null);
        try {

            const result = await tripPlannerService.planEVTrip({ origin, destination,
                batteryPercent: battery ? Number(battery) : undefined,
                vehicleRangeKm: range ? Number(range) : undefined });
            if (result.success) setTripPlan(result.tripPlan);
            else setTripPlanError(result.error);
        } catch { setTripPlanError('Driving directions are unavailable. Use Plan a Trip in EDITH for a saved manual itinerary and rental requests.'); }
        finally { setTripPlanLoading(false); }
    };
    return <div className="space-y-4 p-4 text-gray-950">
        <h2 className="text-xl font-bold">Plan your EV journey</h2>
        <p className="text-sm text-gray-500">Battery details are optional. A driving route does not establish EV reachability.</p>
        <label className="block text-xs font-bold">Origin<input className="mt-2 w-full rounded-xl border p-3 text-sm font-normal" value={origin} onChange={event => setOrigin(event.target.value)} placeholder="Starting point" /></label>
        <label className="block text-xs font-bold">Destination<input className="mt-2 w-full rounded-xl border p-3 text-sm font-normal" value={destination} onChange={event => setDestination(event.target.value)} placeholder="Destination" /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Battery % (optional)<input type="number" min="0" max="100" className="mt-2 w-full rounded-xl border p-3 font-normal" value={battery} onChange={event => setBattery(event.target.value)} /></label><label className="text-xs font-bold">Full-charge range km<input type="number" min="1" className="mt-2 w-full rounded-xl border p-3 font-normal" value={range} onChange={event => setRange(event.target.value)} /></label></div>
        <button disabled={tripPlanLoading} onClick={() => void calculate()} className="w-full rounded-xl bg-gray-950 p-3 font-bold text-white disabled:opacity-50">{tripPlanLoading ? 'Calculating…' : 'Calculate driving route'}</button>
        {tripPlanError && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{tripPlanError}</p>}
        {tripPlan && <div className="space-y-3 rounded-xl border p-4"><p className="font-bold">{tripPlan.route.distanceText} · {tripPlan.route.durationText} driving</p><p className="text-sm text-amber-800">Charging plan incomplete — no verified charging stops or reservations.</p>{tripPlan.warnings?.map(warning => <p key={warning} className="text-xs leading-5 text-gray-500">{warning}</p>)}<p className="text-sm">Open the integrated Plan a Trip screen to add private rentals and request the same server-calculated quote used in Explore. Public stations support discovery and navigation only.</p></div>}
    </div>;
}
