import { RouteInfo } from '../types/route';
import { LatLng } from '../types/map';
export interface PlannerStation { id:string; name:string; address:string; location:LatLng; connectors:{type:string;powerKW:number|null}[]; kind:'public'|'private'; source?:string; synthetic?:boolean; unavailable?:boolean; availabilityWindows?:{startsAt:string;endsAt:string}[]; reservedWindows?:{startsAt:string;endsAt:string}[] }
export interface EnergyProfile { name:string;rangeKm:number;startPercent:number;reservePercent:number;targetPercent:number;batteryKwh:number;averageChargeKw:number;connectorTypes:string[];allowUnknown:boolean;fillDemoGaps?:boolean }
export interface EnergyStop extends PlannerStation { progressKm:number;crossKm:number;compatibility:string;arrivalPercent:number;departurePercent:number;energyKwh:number|null;chargeMinutes:number|null;waitMinutes:number;arrivalAt:string|null;startAt:string|null;endAt:string|null;legDistanceKm:number;estimatedPowerKw:number|null;ratedPowerKw:number|null }
export interface EnergyPlan { status:'needs-input'|'incomplete'|'complete';stops:EnergyStop[];warnings:string[];distanceKm:number;estimatedArrival:string|null;totalChargingMinutes:number|null;arrivalPercent?:number|null;provisional?:boolean;model?:string;gap?:{fromKm:number;toKm:number;reachableKm:number;nextKnownKm?:number|null}|null;roadVerified?:boolean }
export function distance(a:LatLng,b:LatLng):number;
export function decodePolyline(value:string):LatLng[];
export function project(point:LatLng,path:LatLng[]):{crossKm:number;alongKm:number;totalKm:number};
export function simplify(path:LatLng[],toleranceKm?:number):LatLng[];
export function connectorKey(value:string):string;
export function planCharging(input:{route:RouteInfo;stations:PlannerStation[];profile:EnergyProfile;departureAt:string;corridorKm?:number}):EnergyPlan;
export function refinePlan(plan:EnergyPlan,route:RouteInfo,profile:EnergyProfile,departureAt:string,offsetLegs?:number):EnergyPlan;
export function demoGapStations(route:RouteInfo,stations:PlannerStation[],profile:EnergyProfile,departureAt:string):PlannerStation[];
