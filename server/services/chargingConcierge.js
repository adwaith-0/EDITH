const prisma=require('../lib/prisma');
const maps=require('./mapProvider');
const evidence=require('./listingEvidence');
const {availability}=require('./rentalAvailability');
const {fail,text,date,price,normaliseConnector}=require('./rentalShared');
const {decodePolyline,simplify,project}=require('../../shared/chargingPlanner');
const tokens=require('./conciergeTokens');
const demo=require('./demoMode');
function positive(value,name,min,max){const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)fail(`${name} must be between ${min} and ${max}.`);return n;}
function constraints(body){
  return {origin:text(body.origin,'Origin',true,200),destination:text(body.destination,'Destination',true,200),vehicleId:text(body.vehicleId,'Saved vehicle',true,100),batteryPercent:positive(body.batteryPercent,'Battery percentage',1,100),budgetRupees:positive(body.budgetRupees,'Budget in INR',1,100000),rangeKm:positive(body.rangeKm,'Full-charge range',10,3000),batteryKwh:positive(body.batteryKwh,'Battery capacity',1,1000),averageChargeKw:positive(body.averageChargeKw,'Average charging power',.5,500),reservePercent:positive(body.reservePercent??15,'Arrival reserve',10,40),maxDetourMinutes:positive(body.maxDetourMinutes??30,'Maximum detour minutes',0,180),departureAt:date(body.departureAt,'Departure').toISOString(),allowDemo:body.allowDemo===true,excludeStationIds:Array.isArray(body.excludeStationIds)?body.excludeStationIds.filter(s=>typeof s==='string').slice(0,20):[]};
}
function estimate(profile,station,road){
  const range=profile.rangeKm*.8,leg=road.legs[0],remaining=road.legs[1];
  const arrivalPercent=profile.batteryPercent-leg.distance/1000/range*100;
  const destinationNeed=remaining.distance/1000/range*100+profile.reservePercent+5;
  const targetPercent=Math.max(arrivalPercent,Math.min(85,destinationNeed));
  const effectiveKw=Math.min(station.connectors[0].powerKw,profile.averageChargeKw)*.85;
  const energyKwh=Math.max(0,profile.batteryKwh*(targetPercent-arrivalPercent)/100);
  const chargingMinutes=Math.max(10,Math.ceil(energyKwh/effectiveKw*60)+10);
  return {arrivalPercent,targetPercent,energyKwh,chargingMinutes,effectiveKw,requiresMoreStops:destinationNeed>85,rangeBufferPercent:20};
}
async function search(userId,body,dependencies={maps}){
  const needs=constraints(body);if(Date.parse(needs.departureAt)<=Date.now())fail('Choose a future departure time.');
  needs.allowDemo=needs.allowDemo&&demo.enabled();
  const vehicle=await prisma.vehicle.findUnique({where:{id:needs.vehicleId}});
  if(!vehicle||vehicle.ownerId!==userId)fail('Choose a vehicle from your own garage.',403,'VEHICLE_OWNERSHIP');
  if(!vehicle.connectorTypes.length)fail('This vehicle has no recorded connector. Add its actual connector in Your garage.',400,'UNKNOWN_COMPATIBILITY');
  if(!vehicle.specificationsVerifiedAt){
    if(body.confirmVehicleSpecs!==true)fail('Confirm your saved connector details against the vehicle manual before searching.',409,'VEHICLE_SPECS_UNCONFIRMED');
    await prisma.vehicle.update({where:{id:vehicle.id},data:{specificationsVerifiedAt:new Date()}});
    await prisma.audit.create({data:{entityType:'Vehicle',entityId:vehicle.id,action:'DRIVER_CONFIRMED_SPECS',data:{actorId:userId,connectorTypes:vehicle.connectorTypes}}});
  }
  const all=await prisma.station.findMany({where:{kind:'PRIVATE_RENTAL',published:true,ownerId:{not:userId},id:{notIn:needs.excludeStationIds}},include:{connectors:true,availabilityWindows:true}});
  const excluded={unverified:0,incompatible:0,route:0,budget:0,reserve:0,calendar:0};
  const usable=all.filter(s=>{
    if(evidence.eligible(s,needs.allowDemo)){excluded.unverified++;return false;}
    if(!vehicle.connectorTypes.map(normaliseConnector).includes(normaliseConnector(s.connectors[0]?.connectorType))){excluded.incompatible++;return false;}
    return true;
  });
  const warnings=['Estimates use a 20% range buffer, your chosen arrival reserve, 15% charging loss and 10 minutes to plug in. Traffic, terrain, weather, queues and battery taper can change the result.','No live charger telemetry is connected. Host reports and calendar checks do not guarantee working equipment.','Payment is a preview only. No payment gateway or money collection is enabled.'];
  if(!usable.length)return {needs,options:[],excluded,warnings,summary:'No compatible listings meet the evidence requirements. Ask hosts to confirm their specifications and included parking, or explicitly view labelled demo listings.',route:null};
  if(needs.batteryPercent<=needs.reservePercent)return {needs,options:[],excluded,warnings,summary:'Starting battery is at or below your reserve. Arrange charging at your starting location; this planner cannot establish a reachable charger.',route:null};
  let origin,destination,baseline;
  try{origin=(await dependencies.maps.geocode(needs.origin))[0];destination=(await dependencies.maps.geocode(needs.destination))[0];if(!origin||!destination)throw Error();baseline=await dependencies.maps.route([origin,destination]);}catch{fail('Road routing could not be verified. Refine your locations or retry; no reachable-charger claim has been made.',503,'ROUTING_UNAVAILABLE');}
  const path=simplify(decodePolyline(baseline.geometry),.15);
  const candidates=usable.map(s=>({station:s,position:project({lat:s.lat,lng:s.lng},path)})).filter(c=>c.position.crossKm<=10).sort((a,b)=>a.position.alongKm-b.position.alongKm).slice(0,4);
  const options=[];
  for(const {station}of candidates){
    let road;try{road=await dependencies.maps.route([origin,{lat:station.lat,lng:station.lng},destination]);}catch{excluded.route++;continue;}
    const detourMinutes=Math.max(0,(road.duration-baseline.duration)/60),detourKm=Math.max(0,(road.distance-baseline.distance)/1000);
    if(detourMinutes>needs.maxDetourMinutes){excluded.route++;continue;}
    const charging=estimate(needs,station,road);
    if(charging.arrivalPercent<needs.reservePercent||charging.chargingMinutes>1440){excluded.reserve++;continue;}
    const totalPaise=price(station.hourlyRatePaise,charging.chargingMinutes);
    if(totalPaise>Math.floor(needs.budgetRupees*100)){excluded.budget++;continue;}
    const arrivalAt=new Date(Math.ceil((Date.parse(needs.departureAt)+road.legs[0].duration*1000)/60000)*60000).toISOString();
    const calendar=await availability(station.id,arrivalAt,charging.chargingMinutes);
    const slot=calendar.available?{slotStart:arrivalAt,slotEnd:new Date(Date.parse(arrivalAt)+charging.chargingMinutes*60000).toISOString()}:calendar.nextAvailable;
    if(!slot||Date.parse(slot.slotStart)-Date.parse(arrivalAt)>3600000){excluded.calendar++;continue;}
    const history=await prisma.booking.groupBy({by:['status'],where:{stationId:station.id,createdAt:{gte:new Date(Date.now()-30*86400000)}},_count:true});
    const unresolvedIssues=await prisma.chargerReport.count({where:{stationId:station.id,kind:{in:['ISSUE','SESSION_FAILED']},resolvedAt:null}});
    if(unresolvedIssues){excluded.unverified++;continue;}
    const facts={...evidence.describe(station),calendarCheckedAt:calendar.checkedAt,hostApprovalRequired:true,history:history.map(h=>({status:h.status,count:h._count})),unresolvedIssues};
    const planning={...charging,detourKm,detourMinutes,arrivalAt,waitMinutes:(Date.parse(slot.slotStart)-Date.parse(arrivalAt))/60000,drivingToChargerMinutes:road.legs[0].duration/60,estimatedDestinationArrival:charging.requiresMoreStops?null:new Date(Date.parse(slot.slotEnd)+road.legs[1].duration*1000).toISOString()};
    const context={constraints:needs,planning,evidence:facts,listingSnapshot:evidence.snapshot(station)};
    const token=tokens.sign(userId,{stationId:station.id,vehicleId:vehicle.id,slotStart:slot.slotStart,durationMinutes:charging.chargingMinutes,budgetPaise:Math.floor(needs.budgetRupees*100),allowDemo:needs.allowDemo,context});
    options.push({station:{id:station.id,name:station.name,address:station.address,lat:station.lat,lng:station.lng,connectorType:station.connectors[0].connectorType,powerKw:station.connectors[0].powerKw,hourlyRatePaise:station.hourlyRatePaise},vehicleId:vehicle.id,slotStart:slot.slotStart,slotEnd:slot.slotEnd,durationMinutes:charging.chargingMinutes,totalPaise,planning,evidence:facts,token});
  }
  options.sort((a,b)=>a.totalPaise-b.totalPaise||a.planning.detourMinutes-b.planning.detourMinutes);
  return {needs,options,excluded,warnings,summary:options.length?`${options.length} compatible charging option${options.length===1?'':'s'} within your rental budget. Review the estimates and evidence before requesting.`:'No checked option fits your budget, reserve, route and calendar. Adjust the needs or arrange charging before departure.',route:{distanceKm:baseline.distance/1000,durationMinutes:baseline.duration/60,origin:origin.label,destination:destination.label,polyline:baseline.geometry}};
}
async function recovery(userId,bookingId){
  const b=await require('./bookingService').getBooking(bookingId,userId);if(b.userId!==userId)fail('Only the driver can plan a replacement.',403,'FORBIDDEN');
  const issues=await prisma.chargerReport.count({where:{bookingId,kind:{in:['ISSUE','SESSION_FAILED']}}});
  if(!issues&&!['CANCELLED','DECLINED','EXPIRED'].includes(b.status))fail('This booking has no cancellation or equipment report requiring recovery.',409,'RECOVERY_NOT_NEEDED');
  return {vehicleId:b.vehicleId,needs:b.quoteSnapshot?.conciergeContext?.constraints||null,excludeStationIds:[b.stationId],notice:'The original reservation is unchanged. Review your starting location and departure, then search for a replacement. Each replacement needs a new quote and driver submission.'};
}
module.exports={search,recovery,constraints,estimate};
