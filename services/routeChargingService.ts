import { decodePolyline, simplify, PlannerStation, EnergyPlan, EnergyProfile, planCharging, refinePlan, demoGapStations } from '@/shared/chargingPlanner';
import { rentalFetch } from './rentalClient';
import { externalStationsService } from './externalStationsService';
import { openMapService } from './openMapService';
import { ChargingStation } from '@/types/station';
import { RentalListing } from '@/types/rental';
import { RouteInfo } from '@/types/route';

export interface RouteDirectory { stations:ChargingStation[]; rentals:RentalListing[]; planning:PlannerStation[]; queryComplete:boolean; warning:string }
export async function discoverRoute(route:RouteInfo,preferCache=true):Promise<RouteDirectory> {
  let points=simplify(decodePolyline(route.polyline),.3),tolerance=.3;
  while(points.length>1400){tolerance*=1.5;points=simplify(decodePolyline(route.polyline),tolerance);}
  const data=await rentalFetch<{stations:any[];rentals:(RentalListing & {reservedWindows:any[]})[];queryComplete:boolean;warning:string}>('/trips/chargers',{method:'POST',body:JSON.stringify({points,corridorKm:10,preferCache})});
  const stations=data.stations.map(s=>externalStationsService.convertToInternalFormat(s));
  const planning:PlannerStation[]=[...data.stations.map(s=>({...s,kind:'public' as const})),...data.rentals.map(s=>({id:s.id,name:s.name,address:s.address,location:{lat:s.lat,lng:s.lng},kind:'private' as const,connectors:s.connectors.map(c=>({type:c.connectorType,powerKW:c.powerKw})),availabilityWindows:s.availabilityWindows,reservedWindows:s.reservedWindows}))];
  return {...data,stations,planning};
}
export async function buildChargingPlan(route:RouteInfo,directory:RouteDirectory,profile:EnergyProfile,departureAt:string,origin:string,destination:string,waypoint=''):Promise<{energy:EnergyPlan;route:RouteInfo}> {
  const demo=profile.fillDemoGaps?demoGapStations(route,directory.planning,profile,departureAt):[];
  let energy=planCharging({route,stations:[...directory.planning,...demo],profile,departureAt});
  if(demo.length)energy={...energy,warnings:[...energy.warnings,`${demo.length} synthetic demo charging points fill directory gaps. These are invented locations, not verified stations.`]};
  if(energy.status==='needs-input')return {energy,route};
  if(energy.stops.length>22&&waypoint) return {energy:{...energy,status:'incomplete',warnings:[...energy.warnings,'Split this journey into shorter sections to verify road access.']},route};
  const road=energy.stops.length?await openMapService.getRouteInfo(origin,destination,{waypoints:[...(waypoint?[waypoint]:[]),...energy.stops.map(s=>s.location)],departureAt}):route;
  if(road)energy=refinePlan(energy,road,profile,departureAt,waypoint?1:0);
  else energy={...energy,status:'incomplete',roadVerified:false,estimatedArrival:null,warnings:[...energy.warnings,'Road access through suggested chargers could not be calculated. Retry before using this plan.']};
  if(!directory.queryComplete)energy={...energy,status:profile.fillDemoGaps?energy.status:'incomplete',warnings:[...energy.warnings,directory.warning]};
  return {energy,route:road||route};
}
