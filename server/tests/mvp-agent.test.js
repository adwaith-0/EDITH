require('dotenv').config({path:'.env.local',quiet:true});process.env.DEMO_MODE='true';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const prisma=require('../lib/prisma'),agent=require('../services/bookingAgent'),booking=require('../services/bookingService'),catalogue=require('../services/demoVehicleCatalogue'),rental=require('../services/rentalService');

test('one-shot MVP agent persists compatible simulations with defaults, constraints, conflicts and retry protection',async t=>{
  const prefix='mvp-'+randomUUID(),users=[],stations=[];
  const lat=-35+Math.random(),lng=130+Math.random();
  stations.push('agent-demo-'+createHash('sha256').update(`${lat.toFixed(3)},${lng.toFixed(3)}|Type 2`).digest('hex').slice(0,24));
  const driver=await prisma.user.create({data:{name:prefix,email:prefix+'@example.invalid',passwordHash:'NO_LOGIN'}});users.push(driver.id);
  const second=await prisma.user.create({data:{name:prefix+'other',email:prefix+'other@example.invalid',passwordHash:'NO_LOGIN'}});users.push(second.id);
  let parsed={},referenceMode='LIVE_REFERENCE_FETCHED',geoCount=0;
  const deps={maps:{geocode:async()=>{geoCount++;return [{lat,lng,label:'Isolated synthetic test area'}];}},ai:{understandBooking:async()=>parsed},fetchReference:async preset=>({status:referenceMode,checkedAt:new Date().toISOString(),sourceUrl:preset.sources[0].url,sourceTitle:preset.sources[0].title,note:'Isolated test reference response'})};
  const turn=(message,extra={})=>agent.turn(driver.id,{message,settings:{mvpQuickBook:true},...extra},deps);
  let first;
  try{
    await t.test('first vehicle-only request books without area, time, garage or connector questions',async()=>{
      first=await turn('Book me a charger slot for my tatanexon ev');
      assert.equal(first.stage,'BOOKING');assert.equal(first.question,null);assert.equal(first.draft,null);assert.equal(first.instantDemo,true);assert.equal(first.booking.status,'CONFIRMED');
      assert.equal(first.booking.quoteSnapshot.bookingMode,'DEMO_AUTOPILOT');assert.equal(first.booking.quoteSnapshot.compatibilityMode,'DEMO_CATALOGUE_MATCH');assert.equal(first.booking.quoteSnapshot.publicSimulation,true);
      assert.equal(first.booking.amountPaise,12000);assert.equal(first.booking.paymentState,'DEMO_NO_MONEY_COLLECTED');assert.equal(first.needs.area,'Kalamassery, Kochi');assert.equal(first.needs.durationMinutes,60);assert.equal(first.needs.budgetRupees,400);
      assert.deepEqual(first.defaultsUsed,{area:true,start:true,duration:true,budget:true,variant:true});assert.match(first.message,/Demo slot booked/);assert.match(first.message,/simulation/);
      assert.equal(first.vehicleLookup.id,'nexon-45');assert.equal(first.vehicleLookup.reference.status,'LIVE_REFERENCE_FETCHED');assert.equal(new URL(first.vehicleLookup.reference.sourceUrl).hostname,'ev.tata.cars');
      assert.equal(first.booking.vehicle.specificationsVerifiedAt,null);assert.equal(first.vehicleLookup.realVehicleVerified,false);assert.equal(await prisma.payment.count({where:{booking:{userId:driver.id}}}),0);
      assert.equal((await booking.getUserBookings(driver.id))[0].id,first.booking.id);
    });
    await t.test('fresh retries and repeated requests reuse the same persisted booking',async()=>{
      const retry=await turn('Book me a charger slot for my tatanexon ev');assert.equal(retry.booking.id,first.booking.id);
      const sameConversation=await turn('Book me a charger slot for my tatanexon ev',{stateToken:first.stateToken});assert.equal(sameConversation.booking.id,first.booking.id);
      assert.equal(await prisma.booking.count({where:{userId:driver.id}}),1);
      await assert.rejects(agent.turn(second.id,{message:'status',stateToken:first.stateToken},deps),e=>e.code==='FORBIDDEN');
    });
    await t.test('model change and stated slot, duration, area and budget override defaults',async()=>{
      parsed={vehicleName:'MG ZS EV',area:prefix+' area',slotStart:new Date(Date.now()+86400000).toISOString(),durationMinutes:90,budgetRupees:250};
      const changed=await turn('Book my MG ZS EV in this area tomorrow, 90 minutes, under 250 rupees',{stateToken:first.stateToken});
      assert.equal(changed.vehicleLookup.id,'mg-zs-50');assert.equal(changed.booking.amountPaise,18000);assert.equal(new Date(changed.booking.slotStart).toISOString(),parsed.slotStart);assert.equal(changed.needs.area,parsed.area);assert.equal(changed.defaultsUsed.area,false);assert.equal(changed.defaultsUsed.start,false);
      assert.notEqual(changed.booking.id,first.booking.id);
    });
    await t.test('manufacturer outage still yields a clearly labelled Tiago preset simulation',async()=>{
      referenceMode='REVIEWED_PRESET_FALLBACK';parsed={};
      const result=await turn('Book me a Tiago EV charger');assert.equal(result.vehicleLookup.id,'tiago-24');assert.equal(result.vehicleLookup.reference.status,referenceMode);assert.equal(result.booking.status,'CONFIRMED');assert.equal(result.booking.vehicle.specificationsVerifiedAt,null);
      assert.ok(new Date(result.booking.slotStart)>=new Date(first.booking.slotEnd));
    });
    await t.test('cancel then rebook repeatedly creates a new active simulation without reviving cancelled records',async()=>{
      await booking.action(first.booking.id,driver.id,{action:'cancel'});
      const secondBooking=await turn('Book me a charger slot for my Nexon EV');assert.notEqual(secondBooking.booking.id,first.booking.id);assert.equal(secondBooking.booking.status,'CONFIRMED');
      await booking.action(secondBooking.booking.id,driver.id,{action:'cancel'});
      const third=await turn('Book me a charger slot for my Nexon EV');assert.notEqual(third.booking.id,secondBooking.booking.id);assert.equal(third.booking.status,'CONFIRMED');assert.equal((await booking.getBooking(first.booking.id,driver.id)).status,'CANCELLED');
    });
    await t.test('parallel identical requests create one reservation even if the calendar changes during execution',async()=>{
      parsed={slotStart:new Date(Date.now()+2*86400000).toISOString()};
      const results=await Promise.all([turn('Book my Nexon EV'),turn('Book my Nexon EV'),turn('Book my Nexon EV')]);assert.equal(new Set(results.map(r=>r.booking.id)).size,1);
    });
    await t.test('unknown model, low budget, negation and non-booking question never create bookings',async()=>{
      const before=await prisma.booking.count({where:{userId:driver.id}});parsed={};
      await assert.rejects(turn('Book a charger for my unknown rocket car'),e=>e.code==='DEMO_MODEL_NOT_SUPPORTED');
      parsed={budgetRupees:50};await assert.rejects(turn('Book my Nexon for under 50 rupees'),e=>e.code==='BUDGET_EXCEEDED');
      parsed={};assert.match((await turn('Do not book my Nexon EV')).message,/No new demo booking/);
      assert.equal((await turn('Tell me about chargers')).booking,undefined);assert.equal(await prisma.booking.count({where:{userId:driver.id}}),before);
    });
    await t.test('disabled demo mode and real/private stations cannot use instant autopilot',async()=>{
      process.env.DEMO_MODE='false';await assert.rejects(turn('Book my Nexon EV'),e=>e.code==='DEMO_DISABLED');process.env.DEMO_MODE='true';
      const privateStation=await rental.create(second.id,{name:prefix,address:'Isolated private fixture',lat,lng,connectorType:'Type 2',currentType:'AC',powerKw:7.2,hourlyRatePaise:12000,published:true,availabilityWindows:[{startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+4*86400000).toISOString()}]});stations.push(privateStation.id);
      await assert.rejects(booking.quote(driver.id,{stationId:privateStation.id,vehicleId:first.booking.vehicleId,slotStart:new Date(Date.now()+3*86400000).toISOString(),durationMinutes:60,bookingMode:'DEMO_AUTOPILOT'}),e=>e.code==='DEMO_AUTOPILOT_ONLY');
      assert.ok(geoCount>0);
    });
    await t.test('AI outage cannot silently discard explicitly stated budget or location',async()=>{
      const before=await prisma.booking.count({where:{userId:driver.id}});
      const unavailable={...deps,ai:{understandBooking:async()=>{const error=Error('offline');error.code='AI_UNAVAILABLE';throw error;}}};
      await assert.rejects(agent.turn(driver.id,{message:'Book my Nexon EV in Kochi under 50 rupees',settings:{mvpQuickBook:true}},unavailable),e=>e.code==='AI_CONSTRAINTS_UNRESOLVED');
      assert.equal(await prisma.booking.count({where:{userId:driver.id}}),before);
      const simple=await agent.turn(driver.id,{message:'Book my Nexon EV',settings:{mvpQuickBook:true}},unavailable);assert.equal(simple.booking.status,'CONFIRMED');assert.equal(simple.needs.budgetRupees,400);
    });
  }finally{
    process.env.DEMO_MODE='true';
    const bs=await prisma.booking.findMany({where:{userId:{in:users}},select:{id:true}});
    await prisma.audit.deleteMany({where:{entityId:{in:[...stations,...bs.map(b=>b.id)]}}});await prisma.booking.deleteMany({where:{userId:{in:users}}});await prisma.station.deleteMany({where:{id:{in:stations}}});await prisma.vehicle.deleteMany({where:{ownerId:{in:users}}});await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.$disconnect();
  }
});

test('manufacturer reference fetch reports live retrieval versus outage without inventing verification',async()=>{
  const original=global.fetch;let fetches=0;
  try{
    // Native Response constructed in tests has no URL; simulate the trusted final URL explicitly.
    global.fetch=async url=>{fetches++;const response=new Response('manufacturer reference fixture');Object.defineProperty(response,'url',{value:url});return response;};
    const custom={...catalogue.catalogue[0],id:'isolated-'+randomUUID()};
    const result=await catalogue.fetchReference(custom);assert.equal(result.status,'LIVE_REFERENCE_FETCHED');assert.ok(result.bytesRead>0);assert.match(result.note,/reviewed demo preset/);await catalogue.fetchReference(custom);assert.equal(fetches,1);
    global.fetch=async()=>{throw Error('offline');};
    const fallback=await catalogue.fetchReference({...custom,id:randomUUID()});assert.equal(fallback.status,'REVIEWED_PRESET_FALLBACK');assert.equal(fallback.sourceUrl,custom.sources[0].url);
  }finally{global.fetch=original;}
});

test('voice text expands currency and charger abbreviations without exposing links',()=>{
  const voice=require('../services/neuralVoice');assert.equal(voice.spokenText('EV · ₹120 · CCS2 · IST https://example.com'),'E V , 120 rupees , C C S two , India time');assert.throws(()=>voice.spokenText('x'.repeat(901)),e=>e.code==='INVALID_SPEECH_TEXT');
});
