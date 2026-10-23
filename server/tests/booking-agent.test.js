require('dotenv').config({path:'.env.local',quiet:true});require('dotenv').config({path:'.env',quiet:true});process.env.DEMO_MODE='true';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const prisma=require('../lib/prisma'),agent=require('../services/bookingAgent'),rental=require('../services/rentalService'),evidence=require('../services/listingEvidence'),booking=require('../services/bookingService'),ai=require('../services/conciergeAI');
const empty=()=>({area:null,slotStart:null,durationMinutes:null,budgetRupees:null,vehicleName:null,optionNumber:null,command:'SEARCH'});

test('booking extraction validates follow-up fields and has no booking action tool',async()=>{
  const axios=require('axios'),post=axios.post,key=process.env.OLLAMA_API_KEY;process.env.OLLAMA_API_KEY='test-only';
  try{
    let sent;
    axios.post=async(_url,body)=>{sent=body;return {data:{message:{tool_calls:[{function:{name:'capture_booking_request',arguments:{...empty(),area:'Kochi',durationMinutes:60,budgetRupees:400}}}]}}};};
    const result=await ai.understandBooking('Kochi, one hour, under 400','Which area?');assert.equal(result.area,'Kochi');assert.equal(result.durationMinutes,60);assert.equal(result.slotStart,null);assert.deepEqual(sent.tools.map(t=>t.function.name),['capture_booking_request']);
    assert.match(sent.messages[0].content,/Asia\/Kolkata/);assert.match(sent.messages[0].content,/Which area/);
    assert.equal(ai.validateBooking({...empty(),command:'book'}).command,'SEARCH');
    assert.equal(ai.validateBooking({...empty(),command:'CONFIRM'}).command,'SEARCH');
    for(const invalid of [{...empty(),confirmed:true},{...empty(),command:{}},{...empty(),budgetRupees:'400'},{...empty(),durationMinutes:.5},{...empty(),slotStart:'tomorrow'},{...empty(),slotStart:'2026-12-01T10:00:00'}])assert.throws(()=>ai.validateBooking(invalid),e=>e.code==='INVALID_AI_OUTPUT');
  }finally{axios.post=post;if(key===undefined)delete process.env.OLLAMA_API_KEY;else process.env.OLLAMA_API_KEY=key;}
});

test('conversation executes search, quote, explicit submission and recovery using real PostgreSQL',async t=>{
  const prefix='agent-test-'+randomUUID(),users=[],stations=[],vehicles=[];
  let host,driver,other,car,station,state,proposal,record,geoCalls=0;
  const slotStart=new Date(Math.ceil((Date.now()+86400000)/60000)*60000).toISOString();
  const maps={geocode:async()=>{geoCalls++;return [{lat:-40,lng:150,label:'Isolated test area'}];},route:async()=>({distance:200,duration:30,legs:[{distance:200,duration:30}],geometry:'??'})};
  let extraction=empty();const dependencies={maps,ai:{understandBooking:async()=>({...extraction})}};
  const turn=(message,extra={})=>agent.turn(driver.id,{message,stateToken:state?.stateToken,settings:{vehicleId:car.id,confirmVehicleSpecs:true,allowDemo:false},...extra},dependencies);
  const createUser=async name=>{const u=await prisma.user.create({data:{name:prefix+name,email:prefix+name+'@example.invalid',passwordHash:'NO_LOGIN'}});users.push(u.id);return u;};
  const confirm={specificationsConfirmed:true,evidence:'Isolated test fixture label, no actual equipment',parkingIncluded:true,equipmentStatus:'WORKING'};
  try{
    host=await createUser('host');driver=await createUser('driver');other=await createUser('other');
    car=await rental.createVehicle(driver.id,{model:'Fixture Nexon',connectorTypes:['Type 2']});vehicles.push(car.id);
    station=await rental.create(host.id,{name:prefix,address:'Isolated fixture only',lat:-40,lng:150.001,connectorType:'Type 2',currentType:'AC',powerKw:7.4,hourlyRatePaise:12000,published:true,parking:'Included fixture bay',availabilityWindows:[{startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+3*86400000).toISOString()}]});stations.push(station.id);
    await t.test('general booking request asks for missing details and cannot confirm an unseen quote',async()=>{
      state=await turn('Find me a charger and book a slot');assert.match(state.message,/area or address/);assert.equal(state.stage,'NEEDS');assert.equal(geoCalls,0);
      const noDraft=await agent.turn(driver.id,{message:'confirm booking',stateToken:state.stateToken},dependencies);assert.equal(noDraft.draft,null);assert.match(noDraft.message,/prepare and show/);
      assert.equal(await prisma.booking.count({where:{userId:driver.id}}),0);
      extraction={...empty(),area:'Fixture area'};state=await turn('Fixture area');assert.match(state.message,/date and time/);
      extraction={...empty(),slotStart,durationMinutes:60};state=await turn('Tomorrow at this time, for an hour');assert.match(state.message,/budget/);
      extraction={...empty(),budgetRupees:400};state=await turn('Four hundred rupees');assert.match(state.message,/evidence requirements/);assert.equal(geoCalls,0);
    });
    await t.test('search and quotation run automatically after clarification, with evidence and no commitment',async()=>{
      await evidence.verify(host.id,station.id,confirm);extraction=empty();state=await turn('Search again');proposal=state;
      assert.equal(state.stage,'AWAITING_CONFIRMATION');assert.equal(state.draft.quote.totalPaise,12000);assert.equal(state.draft.quote.durationMinutes,60);assert.equal(state.options[0].station.id,station.id);assert.equal(state.options[0].evidence.liveTelemetry,false);
      assert.ok(state.steps.some(s=>s.tool==='CHECK_ROUTES_AND_SLOTS'));assert.ok(state.steps.some(s=>s.tool==='PREPARE_QUOTE'));
      assert.equal(await prisma.booking.count({where:{userId:driver.id}}),0);assert.equal(await prisma.payment.count({where:{booking:{userId:driver.id}}}),0);
      await assert.rejects(agent.turn(other.id,{message:'confirm booking',stateToken:state.stateToken},dependencies),e=>e.code==='FORBIDDEN');
      await assert.rejects(agent.turn(driver.id,{action:'confirm',stateToken:state.stateToken},dependencies),e=>e.code==='CONFIRMATION_REQUIRED');
      await assert.rejects(agent.turn(driver.id,{action:'select',stationId:'not-an-option',stateToken:state.stateToken},dependencies),e=>e.code==='PROPOSAL_CHANGED');
      const pieces=state.stateToken.split('.');pieces[1]=(pieces[1][0]==='A'?'B':'A')+pieces[1].slice(1);await assert.rejects(agent.turn(driver.id,{message:'confirm booking',stateToken:pieces.join('.')},dependencies),e=>e.code==='AGENT_SESSION_EXPIRED');
    });
    await t.test('changed settings and changed prices invalidate approval; negative speech never commits',async()=>{
      const changed=await agent.turn(driver.id,{message:'confirm booking',stateToken:state.stateToken,settings:{allowDemo:true}},dependencies);assert.equal(changed.draft,null);assert.equal(await prisma.booking.count({where:{userId:driver.id}}),0);
      const refused=await turn('Do not confirm booking');assert.equal(refused.stage,'AWAITING_CONFIRMATION');assert.equal(await prisma.booking.count({where:{userId:driver.id}}),0);
      await rental.update(host.id,station.id,{hourlyRatePaise:13000});
      const stale=await agent.turn(driver.id,{action:'confirm',confirmed:true,stateToken:proposal.stateToken},dependencies);assert.equal(stale.draft,null);assert.match(stale.message,/changed or expired/);assert.equal(await prisma.booking.count({where:{userId:driver.id}}),0);
      await rental.update(host.id,station.id,{hourlyRatePaise:12000});state=await turn('Search again');
    });
    await t.test('voice-style confirmation submits once; concurrent retries are idempotent; only host confirms capacity',async()=>{
      const token=state.stateToken;
      const results=await Promise.all([agent.turn(driver.id,{message:'Confirm booking.',stateToken:token},dependencies),agent.turn(driver.id,{action:'confirm',confirmed:true,stateToken:token},dependencies)]);
      assert.equal(results[0].booking.id,results[1].booking.id);record=results[0].booking;state=results[0];assert.equal(record.status,'REQUESTED');assert.match(state.message,/awaiting host approval/);
      assert.equal(await prisma.booking.count({where:{userId:driver.id}}),1);assert.equal(await prisma.payment.count({where:{booking:{userId:driver.id}}}),0);
      await assert.rejects(booking.action(record.id,driver.id,{action:'accept'}),e=>e.code==='FORBIDDEN');
      await booking.action(record.id,host.id,{action:'accept'});const status=await turn('What is the status?');assert.equal(status.booking.status,'CONFIRMED');
    });
    await t.test('accepted conflicts produce a clearly changed later slot, never overwrite a reservation',async()=>{
      extraction={...empty(),area:'Fixture area',slotStart,durationMinutes:60,budgetRupees:400};
      const next=await agent.turn(driver.id,{message:'Find another slot',settings:{vehicleId:car.id}},dependencies);assert.equal(next.stage,'AWAITING_CONFIRMATION');assert.equal(next.draft.option.delayMinutes,60);assert.match(next.message,/60 minutes after/);assert.equal(new Date((await booking.getBooking(record.id,driver.id)).slotStart).toISOString(),slotStart);
    });
    await t.test('cancellation recovery excludes original station and asks for a new time without rebooking',async()=>{
      await booking.action(record.id,driver.id,{action:'cancel'});const replacement=await agent.recover(driver.id,record.id);assert.equal(replacement.needs.area,'Fixture area');assert.match(replacement.message,/original reservation is unchanged/);assert.equal(replacement.draft,null);assert.equal(replacement.needs.slotStart,undefined);
      assert.deepEqual(agent.read(driver.id,replacement.stateToken).excludeStationIds,[station.id]);assert.equal(await prisma.booking.count({where:{userId:driver.id}}),1);
      extraction={...empty(),command:'STATUS'};const restored=await agent.turn(driver.id,{message:'Check my latest booking status'},dependencies);assert.equal(restored.booking.id,record.id);assert.equal(restored.booking.status,'CANCELLED');assert.match(restored.message,/most recent agent booking/);
      const noOther=await agent.turn(other.id,{message:'Check booking status'},dependencies);assert.equal(noOther.booking,undefined);
    });
  }finally{
    const bs=await prisma.booking.findMany({where:{userId:{in:users}},select:{id:true}});await prisma.audit.deleteMany({where:{entityId:{in:[...stations,...vehicles,...bs.map(b=>b.id)]}}});await prisma.booking.deleteMany({where:{userId:{in:users}}});await prisma.station.deleteMany({where:{id:{in:stations}}});await prisma.vehicle.deleteMany({where:{ownerId:{in:users}}});await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.$disconnect();
  }
});
