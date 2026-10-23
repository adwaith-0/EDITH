const jwt=require('jsonwebtoken');
const {randomUUID}=require('node:crypto');
const prisma=require('../lib/prisma');
const {JWT_SECRET}=require('../middleware/auth');
const {fail,text,date,price,normaliseConnector}=require('./rentalShared');
const evidence=require('./listingEvidence'),demo=require('./demoMode'),tokens=require('./conciergeTokens');
const maps=require('./mapProvider'),ai=require('./conciergeAI'),booking=require('./bookingService');
const {availability}=require('./rentalAvailability');
const {distance}=require('../../shared/chargingPlanner');
const format=iso=>new Date(iso).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
const money=paise=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(paise/100);
function read(userId,token){
  if(!token)return {needs:{},allowDemo:false,excludeStationIds:[]};
  let claim;try{claim=jwt.verify(token,JWT_SECRET);}catch{fail('This conversation expired. Start a new search; existing bookings are unchanged.',409,'AGENT_SESSION_EXPIRED');}
  if(claim.typ!=='BOOKING_AGENT'||claim.sub!==userId)fail('This conversation belongs to another driver.',403,'FORBIDDEN');
  return claim.data;
}
function reply(userId,state,message,steps=[],extra={}){
  const stateToken=jwt.sign({typ:'BOOKING_AGENT',sub:userId,data:state},JWT_SECRET,{expiresIn:'30m'});
  return {stateToken,message,stage:state.bookingId?'BOOKING':state.draft?'AWAITING_CONFIRMATION':state.options?.length?'OPTIONS':'NEEDS',needs:state.needs,question:state.question||null,options:state.options||[],draft:state.draft?{quote:state.draft.quote,option:state.draft.option}:null,steps,...extra};
}
function bookedReply(userId,state,b,steps=[]){
  state.bookingId=b.id;state.options=[];state.draft=null;state.question=null;
  const instantDemo=b.quoteSnapshot?.bookingMode==='DEMO_AUTOPILOT';
  const message=b.status==='REQUESTED'?`Request ${b.id.slice(0,8).toUpperCase()} was sent to the host. It is awaiting host approval; the charger is not reserved yet.`:b.status==='CONFIRMED'?instantDemo?'Your demo slot is booked in EDITH. No real operator was contacted and no physical charger is reserved.':'Your host has accepted this booking. The reserved interval is confirmed in EDITH.':`Your booking is ${b.status.toLowerCase().replaceAll('_',' ')}.`;
  return reply(userId,state,message+' Demo payment only; no money collected.',steps,{booking:b,instantDemo,vehicleLookup:state.vehicleLookup,defaultsUsed:state.defaultsUsed});
}
async function latestStatus(userId,state){
  const latest=await prisma.booking.findFirst({where:{userId,OR:[{quoteSnapshot:{path:['conciergeContext','constraints','mode'],equals:'LOCAL_BOOKING_AGENT'}},{quoteSnapshot:{path:['bookingMode'],equals:'DEMO_AUTOPILOT'}}]},orderBy:{createdAt:'desc'}});
  if(!latest)return reply(userId,state,'There is no submitted agent booking in your account yet. Finish a proposal and confirm it first.');
  const result=bookedReply(userId,state,await booking.getBooking(latest.id,userId));
  result.message='Your most recent agent booking: '+result.message;return result;
}
async function submit(userId,state){
  if(!state.draft)return reply(userId,state,'I need to prepare and show you a priced slot before you can confirm it. Tell me where and when you want to charge.');
  const {quote,idempotencyKey}=state.draft;
  const b=await booking.request(userId,{stationId:quote.stationId,vehicleId:quote.vehicleId,slotStart:quote.slotStart,durationMinutes:quote.durationMinutes,bookingMode:'CONCIERGE',conciergeToken:quote.conciergeToken,expectedTotalPaise:quote.totalPaise,expectedHourlyRatePaise:quote.hourlyRatePaise,idempotencyKey});
  return bookedReply(userId,state,b,[{tool:'SUBMIT_BOOKING_REQUEST',detail:'Server rechecked evidence, price, compatibility and slot under database locks.'}]);
}
async function prepare(userId,state,option,steps){
  const quote=await booking.quote(userId,{stationId:option.station.id,vehicleId:state.needs.vehicleId,slotStart:option.slotStart,durationMinutes:state.needs.durationMinutes,bookingMode:'CONCIERGE',conciergeToken:option.token});
  state.draft={quote,option,idempotencyKey:randomUUID()};state.question=null;
  return reply(userId,state,`I checked the published calendar and prepared ${option.station.name} for ${option.vehicleModel}, ${format(quote.slotStart)} IST, ${quote.durationMinutes} minutes, total ${money(quote.totalPaise)}.${option.evidence.dataMode==='DEMO'?' This is a synthetic demo listing.':''}${option.delayMinutes?` This is ${option.delayMinutes} minutes after your requested time.`:''} No live charger telemetry is connected. Review the slot and evidence, then say "confirm booking" or use Confirm booking request. Host acceptance is still required; no money is collected.`,[...steps,{tool:'PREPARE_QUOTE',detail:'Fresh server price; no booking or payment created.'}]);
}
async function find(userId,state,vehicle,dependencies){
  const n=state.needs,steps=[{tool:'CHECK_GARAGE',detail:`Using ${vehicle.model}; saved connector confirmed by the driver.`}];
  const all=await prisma.station.findMany({where:{kind:'PRIVATE_RENTAL',published:true,ownerId:{not:userId},id:{notIn:state.excludeStationIds||[]}},include:{connectors:true,availabilityWindows:true},take:100,orderBy:{createdAt:'asc'}});
  const types=vehicle.connectorTypes.map(normaliseConnector);
  const eligible=all.filter(s=>!evidence.eligible(s,state.allowDemo&&demo.enabled())&&types.includes(normaliseConnector(s.connectors[0]?.connectorType)));
  if(!eligible.length){state.options=[];state.draft=null;return reply(userId,state,'No compatible host listings meet the evidence requirements. Hosts must confirm specifications and included parking. You can explicitly include labelled demo listings for an MVP rehearsal.',steps);}
  let origin;try{origin=(await dependencies.maps.geocode(n.area))[0];if(!origin)throw Error();}catch{fail('I could not resolve that area. Try a more specific address. Nothing was booked.',503,'ROUTING_UNAVAILABLE');}
  const candidates=eligible.map(s=>({station:s,km:distance(origin,{lat:s.lat,lng:s.lng})})).filter(x=>x.km<=25).sort((a,b)=>a.station.hourlyRatePaise-b.station.hourlyRatePaise||a.km-b.km).slice(0,6);
  steps.push({tool:'FIND_COMPATIBLE_CHARGERS',detail:`Checked ${eligible.length} eligible listings; ${candidates.length} candidates within 25 km of ${origin.label}.`});
  const options=[];
  for(const {station:s}of candidates){
    if(await prisma.chargerReport.count({where:{stationId:s.id,kind:{in:['ISSUE','SESSION_FAILED']},resolvedAt:null}}))continue;
    const totalPaise=price(s.hourlyRatePaise,n.durationMinutes);if(totalPaise>Math.floor(n.budgetRupees*100))continue;
    let road;try{road=await dependencies.maps.route([origin,{lat:s.lat,lng:s.lng}]);}catch{continue;}
    const earliest=new Date(Math.ceil(Math.max(Date.parse(n.slotStart),Date.now()+road.duration*1000)/60000)*60000).toISOString();
    const calendar=await availability(s.id,earliest,n.durationMinutes);
    const slotStart=calendar.available?earliest:calendar.nextAvailable?.slotStart;
    if(!slotStart||Date.parse(slotStart)-Date.parse(n.slotStart)>2*3600000)continue;
    const facts={...evidence.describe(s),calendarCheckedAt:calendar.checkedAt,hostApprovalRequired:true};
    const context={constraints:{...n,mode:'LOCAL_BOOKING_AGENT',origin:n.area,allowDemo:state.allowDemo,excludeStationIds:state.excludeStationIds},planning:{roadDistanceKm:road.distance/1000,drivingMinutes:road.duration/60,requestedStart:n.slotStart},evidence:facts,listingSnapshot:evidence.snapshot(s)};
    const token=tokens.sign(userId,{stationId:s.id,vehicleId:vehicle.id,slotStart,durationMinutes:n.durationMinutes,budgetPaise:Math.floor(n.budgetRupees*100),allowDemo:state.allowDemo,context});
    options.push({station:{id:s.id,name:s.name,address:s.address,lat:s.lat,lng:s.lng,connectorType:s.connectors[0].connectorType,powerKw:s.connectors[0].powerKw},vehicleId:vehicle.id,vehicleModel:vehicle.model,slotStart,slotEnd:new Date(Date.parse(slotStart)+n.durationMinutes*60000).toISOString(),durationMinutes:n.durationMinutes,totalPaise,roadDistanceKm:road.distance/1000,drivingMinutes:road.duration/60,originLabel:origin.label,delayMinutes:Math.max(0,Math.round((Date.parse(slotStart)-Date.parse(n.slotStart))/60000)),evidence:facts,token});
  }
  options.sort((a,b)=>a.delayMinutes-b.delayMinutes||a.totalPaise-b.totalPaise||a.drivingMinutes-b.drivingMinutes);state.options=options.slice(0,3);state.draft=null;
  steps.push({tool:'CHECK_ROUTES_AND_SLOTS',detail:'Checked OSRM road travel, the full host calendar interval, accepted reservations, issue reports and total rental budget. No live traffic or telemetry.'});
  for(const option of state.options){try{return await prepare(userId,state,option,steps);}catch(e){if(e.status!==409)throw e;}}
  return reply(userId,state,'No checked slot fits your connector, budget and requested time (including alternatives up to two hours later). Try another area, date, duration or budget. Nothing was booked.',steps);
}
async function turn(userId,body,dependencies={maps,ai}){
  const state=read(userId,body.stateToken),message=body.message==null?'':text(body.message,'Message',true,1500);
  const settings=body.settings||{};
  let changed=false;
  if(typeof settings.allowDemo==='boolean'){const allow=settings.allowDemo&&demo.enabled();changed=allow!==state.allowDemo;state.allowDemo=allow;}
  if(settings.vehicleId){const selected=text(settings.vehicleId,'Vehicle',true,100);changed=changed||(!!state.needs.vehicleId&&selected!==state.needs.vehicleId);state.needs.vehicleId=selected;}
  if(changed){state.draft=null;state.options=[];}
  if(body.action==='confirm'||/^(?:yes[, ]+)?confirm (?:the )?booking[.!]?$/i.test(message.trim())){
    if(body.action==='confirm'&&body.confirmed!==true)fail('Explicit driver confirmation is required.',400,'CONFIRMATION_REQUIRED');
    if(state.bookingId)return bookedReply(userId,state,await booking.getBooking(state.bookingId,userId));
    try{return await submit(userId,state);}catch(e){if(e.status!==409)throw e;state.draft=null;state.options=[];return reply(userId,state,'That proposal changed or expired before submission. Nothing new was booked. Ask me to search again for a fresh quote.',[{tool:'RECHECK_BOOKING',detail:e.message}]);}
  }
  if(body.action==='clear'){state.draft=null;state.options=[];state.bookingId=null;return reply(userId,state,'Draft cleared. Existing bookings are unchanged. Tell me your next charging request.');}
  if(state.bookingId){
    if(settings.mvpQuickBook===true&&/\b(?:book|reserve)\b|ബുക്ക്/i.test(message)&&!/^\s*(?:my\s+)?booking\s+status/i.test(message)){
      state.bookingId=null;state.needs={};state.vehicleLookup=null;state.defaultsUsed=null;
    }else return bookedReply(userId,state,await booking.getBooking(state.bookingId,userId));
  }
  // Common read-only commands do not depend on a model choosing a tool.
  if(/^(?:please\s+)?(?:(?:check|show|tell me|what(?:'s| is))\s+)?(?:(?:my|the)\s+)?(?:(?:latest|most recent)\s+)?(?:agent\s+)?booking(?:'s)?\s+status[?.!]*$/i.test(message)||/^status[?.!]*$/i.test(message))return latestStatus(userId,state);
  if(settings.mvpQuickBook===true){
    if(!demo.enabled())fail('Instant demo booking is disabled.',403,'DEMO_DISABLED');
    if(!/\b(?:book|booking|reserve)\b|ബുക്ക്/i.test(message)&&!state.question)return reply(userId,state,'Try “Book me a charger slot for my Tata Nexon EV.” Demo autopilot uses Kalamassery, the next available slot, one hour and a 400 rupee budget.');
    const quick=await require('./mvpBookingAgent').run(userId,message,state,body,{maps:dependencies.maps,ai:dependencies.ai,fetchReference:dependencies.fetchReference||require('./demoVehicleCatalogue').fetchReference});
    if(quick.booking){state.bookingId=quick.booking.id;state.needs=quick.needs;state.vehicleLookup=quick.vehicleLookup;state.defaultsUsed=quick.defaultsUsed;state.draft=null;state.options=[];state.question=null;}
    return reply(userId,state,quick.message,quick.steps,{booking:quick.booking,instantDemo:quick.instantDemo,vehicleLookup:quick.vehicleLookup,defaultsUsed:quick.defaultsUsed,speechText:quick.speechText});
  }
  const vehicles=await prisma.vehicle.findMany({where:{ownerId:userId},orderBy:{createdAt:'asc'}});
  if(body.action==='select'){
    const option=state.options?.find(o=>o.station.id===body.stationId);if(!option)fail('Choose a current option from this conversation.',409,'PROPOSAL_CHANGED');
    return prepare(userId,state,option,[]);
  }
  if(!message)fail('Tell the agent what you need.');
  const parsed=await dependencies.ai.understandBooking(message,state.question||'');
  if(parsed.command==='CANCEL_DRAFT'){state.draft=null;state.options=[];return reply(userId,state,'Unsubmitted draft cleared. No real reservation was cancelled.');}
  if(parsed.command==='STATUS')return latestStatus(userId,state);
  const updates=['area','slotStart','durationMinutes','budgetRupees'].filter(k=>parsed[k]!=null);
  for(const key of updates)state.needs[key]=parsed[key];
  if(parsed.vehicleName){const matches=vehicles.filter(v=>v.model.toLowerCase().includes(parsed.vehicleName.toLowerCase()));if(matches.length===1)state.needs.vehicleId=matches[0].id;else{state.needs.vehicleId=null;state.question='Choose the matching saved vehicle below, or add it in Your garage.';return reply(userId,state,state.question);}}
  if(parsed.optionNumber&&!updates.length){const option=state.options?.[parsed.optionNumber-1];if(!option)fail('That numbered option is not in the current results.',409,'PROPOSAL_CHANGED');return prepare(userId,state,option,[]);}
  state.draft=null;state.options=[];
  let vehicle=vehicles.find(v=>v.id===state.needs.vehicleId);
  if(!state.needs.vehicleId&&vehicles.length===1){vehicle=vehicles[0];state.needs.vehicleId=vehicle.id;}
  if(state.needs.vehicleId&&!vehicle)fail('Choose a saved vehicle from your own account.',403,'VEHICLE_OWNERSHIP');
  if(vehicle&&settings.vehicleId===vehicle.id&&settings.confirmVehicleSpecs===true&&!vehicle.specificationsVerifiedAt){
    if(!vehicle.connectorTypes.length)fail('Add the actual vehicle connector in Your garage before using the booking agent.');
    vehicle=await prisma.vehicle.update({where:{id:vehicle.id},data:{specificationsVerifiedAt:new Date()}});
    await prisma.audit.create({data:{entityType:'Vehicle',entityId:vehicle.id,action:'DRIVER_CONFIRMED_SPECS',data:{actorId:userId,connectorTypes:vehicle.connectorTypes}}});
  }
  const questions=[];
  if(!state.needs.area)questions.push('Which area or address should I find a charger near?');
  if(!state.needs.slotStart)questions.push('What date and time should the rental start? All times are IST.');
  else if(date(state.needs.slotStart,'Start')<=new Date()){state.needs.slotStart=null;questions.push('That start time is past. What future date and time should I use, in IST?');}
  if(!state.needs.durationMinutes)questions.push('How long would you like to reserve the charger, for example one hour?');
  if(!state.needs.budgetRupees)questions.push('What is your maximum total rental budget in rupees?');
  if(!vehicle)questions.push('Choose a saved vehicle below, or add your vehicle in Your garage.');
  else if(!vehicle.connectorTypes.length||!vehicle.specificationsVerifiedAt)questions.push('Confirm your saved vehicle connector below before I check compatible chargers.');
  if(questions.length){state.question=questions[0];return reply(userId,state,state.question,[{tool:'UNDERSTAND_REQUEST',detail:'Kept stated details; asking for missing information.'}],{missing:questions});}
  state.question=null;
  return find(userId,state,vehicle,dependencies);
}
async function recover(userId,bookingId){
  const original=await require('./chargingConcierge').recovery(userId,bookingId),b=await booking.getBooking(bookingId,userId),n=original.needs||{};
  const state={needs:{area:n.area||n.origin||null,vehicleId:b.vehicleId,durationMinutes:b.quoteSnapshot.durationMinutes,budgetRupees:n.budgetRupees||null},allowDemo:n.allowDemo===true&&demo.enabled(),excludeStationIds:original.excludeStationIds,question:'What future date and time should I use for a replacement, in IST?'};
  return reply(userId,state,'I excluded the previous charger and kept your vehicle and rental needs. The original reservation is unchanged. '+state.question);
}
module.exports={turn,recover,read};
