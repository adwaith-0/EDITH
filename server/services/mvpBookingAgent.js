const {createHash}=require('node:crypto');
const prisma=require('../lib/prisma'),demo=require('./demoMode'),catalogue=require('./demoVehicleCatalogue');
const {fail,date,price,normaliseConnector}=require('./rentalShared');
const {availability}=require('./rentalAvailability');
const booking=require('./bookingService'),maps=require('./mapProvider'),ai=require('./conciergeAI');
const DEFAULTS={area:'Kalamassery, Kochi',durationMinutes:60,budgetRupees:400};
function fallbackName(message){const match=message.match(/(?:for\s+(?:my\s+)?|my\s+)(.+?)(?=\s+(?:near|in|at|tomorrow|today|under)\b|[.!?]|$)/i);return match?.[1]?.trim();}
const format=value=>new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(value/100);
async function demoStation(area,location,connectorType){
  const owner=await prisma.user.upsert({where:{email:'agent-simulation@edith.invalid'},update:{},create:{name:'EDITH instant demo operator',email:'agent-simulation@edith.invalid',passwordHash:'LOGIN_DISABLED'}});
  const hash=createHash('sha256').update(`${location.lat.toFixed(3)},${location.lng.toFixed(3)}|${connectorType}`).digest('hex').slice(0,24),id='agent-demo-'+hash;
  const station=await prisma.station.upsert({where:{id},update:{},create:{id,ownerId:owner.id,name:'EDITH Demo Hub · '+area.slice(0,70),address:'Synthetic demo charging bay near '+area,lat:location.lat,lng:location.lng,kind:'PUBLIC',source:'PUBLIC_DEMO',published:true,hourlyRatePaise:12000,parking:'One simulated charging bay included. No physical parking is reserved.',accessInstructions:'EDITH simulation only. Do not travel to this invented charger.',terms:'Instant MVP simulation; not sent to a real operator. No physical charger reserved. No money collected.',connectors:{create:{connectorType,currentType:'AC',powerKw:7.2,slotCount:1}}},include:{connectors:true}});
  const windowId=id+'-calendar';await prisma.availabilityWindow.upsert({where:{id:windowId},update:{endsAt:new Date(Date.now()+30*86400000)},create:{id:windowId,stationId:id,startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()+30*86400000)}});
  return station;
}
async function run(userId,message,state,body,dependencies={maps,ai,fetchReference:catalogue.fetchReference}){
  if(!demo.enabled())fail('Instant demo booking is disabled.',403,'DEMO_DISABLED');
  if(/\b(?:do not|don't|dont|never|cancel|not now)\b/i.test(message))return {message:'No new demo booking was made. Start a new search when you want a slot.',steps:[]};
  let parsed={};try{parsed=await dependencies.ai.understandBooking(message,state.question||'');}catch(e){
    if(!['INVALID_AI_OUTPUT','AI_UNAVAILABLE','AI_NOT_CONFIGURED'].includes(e.code))throw e;
    // A known model-only request can safely use the displayed demo defaults.
    // Never silently discard a stated budget, place or time when parsing fails.
    if(/\b(?:near|in|at|today|tomorrow|under|below|budget|rupees?|minutes?|hours?)\b|₹|\d\s*(?:am|pm|rs)\b/i.test(message))fail('I could not reliably read the requested location, time or budget. Nothing was booked. Retry your request, or use the simple vehicle-only demo example with its displayed defaults.',503,'AI_CONSTRAINTS_UNRESOLVED');
  }
  const direct=catalogue.match(message),name=parsed.vehicleName||fallbackName(message);
  let preset=direct||(name?catalogue.requirePreset(name):null);
  if(!preset&&state.needs?.vehicleId){const selected=await prisma.vehicle.findFirst({where:{id:state.needs.vehicleId,ownerId:userId}});preset=catalogue.match(selected?.model);}
  preset=preset||(body.settings?.demoVehicleId?catalogue.requirePreset(body.settings.demoVehicleId):catalogue.catalogue[0]);
  const [reference,vehicle]=await Promise.all([dependencies.fetchReference(preset),catalogue.vehicleFor(userId,preset)]);
  const area=parsed.area||state.needs?.area||DEFAULTS.area;
  const durationMinutes=parsed.durationMinutes||state.needs?.durationMinutes||DEFAULTS.durationMinutes,budgetRupees=parsed.budgetRupees||state.needs?.budgetRupees||DEFAULTS.budgetRupees;
  const explicitStart=parsed.slotStart||state.needs?.slotStart;
  const slotStart=explicitStart?date(explicitStart,'Requested start').toISOString():new Date((Math.floor(Date.now()/900000)+2)*900000).toISOString();
  if(Date.parse(slotStart)<=Date.now())fail('That time is past. Use a future time or start a new demo search.',400,'START_IN_PAST');
  const defaultsUsed={area:!parsed.area&&!state.needs?.area,start:!explicitStart,duration:!parsed.durationMinutes&&!state.needs?.durationMinutes,budget:!parsed.budgetRupees&&!state.needs?.budgetRupees,variant:true};
  const needs={area,vehicleId:vehicle.id,durationMinutes,budgetRupees,slotStart};
  const key='instant-demo-'+createHash('sha256').update(JSON.stringify([userId,preset.id,area.toLowerCase().replace(/\s/g,''),slotStart,durationMinutes,budgetRupees])).digest('hex').slice(0,38);
  const records=await prisma.booking.findMany({where:{userId,idempotencyKey:{startsWith:key}},orderBy:{createdAt:'desc'}});
  const existing=records.find(b=>['CONFIRMED','REQUESTED','IN_PROGRESS'].includes(b.status));
  const requestKey=records.length?key+'-'+records.length:key;
  const racedBooking=()=>prisma.booking.findUnique({where:{userId_idempotencyKey:{userId,idempotencyKey:requestKey}}});
  const vehicleLookup={...preset,reference,searchedFor:name||message,assumedVariant:true,realVehicleVerified:false};
  const steps=[{tool:'LOOK_UP_VEHICLE',detail:`Selected ${preset.name}: ${preset.connectorTypes.join(' / ')} from a manufacturer-referenced demo preset.`},{tool:'FETCH_MANUFACTURER_REFERENCE',detail:reference.status==='LIVE_REFERENCE_FETCHED'?`Fetched ${reference.sourceTitle}.`:'Manufacturer unavailable; used the reviewed preset and retained its source link.'},{tool:'APPLY_DEMO_DEFAULTS',detail:`${area}; ${durationMinutes} minutes; budget ${money(budgetRupees*100)}; next available demo slot unless a time was stated.`}];
  if(existing&&['CONFIRMED','REQUESTED','IN_PROGRESS'].includes(existing.status))return result(await booking.getBooking(existing.id,userId),needs,vehicleLookup,defaultsUsed,steps,true);
  let location;try{location=(await dependencies.maps.geocode(area))[0];if(!location)throw Error();}catch{if(area===DEFAULTS.area)location={lat:10.0553,lng:76.3239,label:'Kalamassery demo centre'};else fail('I could not locate that area. Please provide a city or address so I do not book the wrong demo location.',503,'LOCATION_UNRESOLVED');}
  const connectorType=preset.connectorTypes.find(t=>normaliseConnector(t)==='Type 2')||preset.connectorTypes[0];
  const station=await demoStation(area,location,connectorType);
  const total=price(station.hourlyRatePaise,durationMinutes);if(total>Math.floor(budgetRupees*100))fail(`This demo slot costs ${money(total)}, above your ${money(budgetRupees*100)} limit. Try a shorter duration or a larger budget.`,409,'BUDGET_EXCEEDED');
  let start=slotStart;
  for(let attempt=0;attempt<3;attempt++){
    const raced=await racedBooking();if(raced&&['CONFIRMED','REQUESTED','IN_PROGRESS'].includes(raced.status))return result(await booking.getBooking(raced.id,userId),needs,vehicleLookup,defaultsUsed,steps,true);
    const calendar=await availability(station.id,start,durationMinutes);if(!calendar.available){if(!calendar.nextAvailable)fail('No demo slot fits that interval. Try another time.',409,'NO_DEMO_SLOT');start=calendar.nextAvailable.slotStart;}
    try{
      const quote=await booking.quote(userId,{stationId:station.id,vehicleId:vehicle.id,slotStart:start,durationMinutes,bookingMode:'DEMO_AUTOPILOT'});
      const b=await booking.request(userId,{stationId:station.id,vehicleId:vehicle.id,slotStart:start,durationMinutes,bookingMode:'DEMO_AUTOPILOT',expectedTotalPaise:quote.totalPaise,expectedHourlyRatePaise:quote.hourlyRatePaise,idempotencyKey:requestKey});
      return result(b,needs,vehicleLookup,defaultsUsed,[...steps,{tool:'CHECK_AND_RESERVE_DEMO_SLOT',detail:'Saved a confirmed EDITH-only simulation after calendar, budget, connector and conflict checks.'}],false);
    }catch(e){
      if(!['BOOKING_CONFLICT','IDEMPOTENCY_CONFLICT'].includes(e.code))throw e;
      const saved=await racedBooking();if(saved&&['CONFIRMED','REQUESTED','IN_PROGRESS'].includes(saved.status))return result(await booking.getBooking(saved.id,userId),needs,vehicleLookup,defaultsUsed,steps,true);
      start=new Date(Date.parse(start)+60000).toISOString();
    }
  }
  fail('The demo slot changed while reserving. Retry the same request; duplicate submissions are protected.',409,'BOOKING_CONFLICT');
}
function result(b,needs,vehicleLookup,defaultsUsed,steps,reused){
  return {booking:b,needs,vehicleLookup,defaultsUsed,steps,instantDemo:true,message:`${reused?'Your existing demo slot is booked':'Demo slot booked'} for ${vehicleLookup.name}. ${b.station.name}, ${format(b.slotStart)} to ${format(b.slotEnd)} IST. ${Math.round((new Date(b.slotEnd)-new Date(b.slotStart))/60000)} minutes, total ${money(b.amountPaise)}. Type 2 charging. This is an EDITH simulation, not a real operator reservation. No money collected.`,speechText:`${reused?'Your existing demo slot is ready':'Your demo slot is booked'} for ${vehicleLookup.name}. ${format(b.slotStart)} India time, for ${needs.durationMinutes} minutes. Total ${b.amountPaise/100} rupees. This is a demo reservation only. No money was collected.`};
}
module.exports={run,DEFAULTS,demoStation};
