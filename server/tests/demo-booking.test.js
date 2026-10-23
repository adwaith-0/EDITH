require('dotenv').config({path:'.env.local'});
process.env.DEMO_MODE='true';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const prisma=require('../lib/prisma'),booking=require('../services/bookingService'),demo=require('../services/demoMode'),rental=require('../services/rentalService');
test('public demo persists an arbitrary car, confirms only simulated capacity, and enforces conflicts/ownership',async()=>{
  const label=randomUUID(),users=[],stations=[];
  try{
    const driver=await prisma.user.create({data:{name:'Demo test',email:`${label}@example.invalid`,passwordHash:'LOGIN_DISABLED'}});users.push(driver.id);
    const stranger=await prisma.user.create({data:{name:'Other',email:`other-${label}@example.invalid`,passwordHash:'LOGIN_DISABLED'}});users.push(stranger.id);
    const id=await demo.preparePublic({id:label,name:'Synthetic public test',address:'Test only',location:{lat:10,lng:76}});stations.push(id);
    const listing=await rental.get(id);assert.equal(listing.bookingCapability,'PUBLIC_SIMULATION');
    const slotStart=new Date(Date.now()+86400000).toISOString();
    const quote=await booking.quote(driver.id,{stationId:id,vehicleModel:'എന്റെ EV '+label,slotStart,durationMinutes:73});
    assert.equal(quote.totalPaise,14600);assert.ok(quote.vehicleId);
    const body={stationId:id,vehicleId:quote.vehicleId,slotStart,durationMinutes:73,expectedTotalPaise:quote.totalPaise,expectedHourlyRatePaise:quote.hourlyRatePaise,idempotencyKey:label};
    const result=await booking.request(driver.id,body);assert.equal(result.status,'CONFIRMED');assert.equal(result.quoteSnapshot.publicSimulation,true);assert.equal(result.quoteSnapshot.compatibilityMode,'DEMO_SKIPPED');assert.equal(result.paymentState,'DEMO_NO_MONEY_COLLECTED');
    assert.equal((await booking.request(driver.id,body)).id,result.id);
    await assert.rejects(booking.quote(driver.id,{...body,slotStart:new Date(Date.parse(slotStart)+60000).toISOString()}),e=>e.code==='BOOKING_CONFLICT');
    await assert.rejects(booking.getBooking(result.id,stranger.id),e=>e.code==='FORBIDDEN');
    assert.equal((await booking.getUserBookings(driver.id))[0].id,result.id);
    await booking.action(result.id,driver.id,{action:'cancel'});assert.equal((await booking.getBooking(result.id,driver.id)).status,'CANCELLED');
    const race=await Promise.allSettled([booking.request(driver.id,{...body,idempotencyKey:randomUUID()}),booking.request(driver.id,{...body,idempotencyKey:randomUUID()})]);
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(race.find(r=>r.status==='rejected').reason.code,'BOOKING_CONFLICT');
    const privateListing=await rental.create(stranger.id,{name:'Demo private connector bypass',address:'Synthetic test only',lat:10,lng:76,connectorType:'CHAdeMO',currentType:'DC',powerKw:25,hourlyRatePaise:12000,published:true,availabilityWindows:[{startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+3*86400000).toISOString()}]});stations.push(privateListing.id);
    const privateQuote=await booking.quote(driver.id,{stationId:privateListing.id,vehicleId:quote.vehicleId,slotStart,durationMinutes:60});
    const privateBooking=await booking.request(driver.id,{stationId:privateListing.id,vehicleId:quote.vehicleId,slotStart,durationMinutes:60,expectedTotalPaise:privateQuote.totalPaise,expectedHourlyRatePaise:privateQuote.hourlyRatePaise,idempotencyKey:randomUUID()});
    assert.equal(privateBooking.status,'REQUESTED');
    assert.equal((await booking.action(privateBooking.id,stranger.id,{action:'accept'})).status,'CONFIRMED');
  }finally{
    const records=await prisma.booking.findMany({where:{stationId:{in:stations}},select:{id:true}});
    await prisma.audit.deleteMany({where:{entityId:{in:records.map(r=>r.id)}}});await prisma.booking.deleteMany({where:{stationId:{in:stations}}});await prisma.station.deleteMany({where:{id:{in:stations}}});await prisma.vehicle.deleteMany({where:{ownerId:{in:users}}});await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.$disconnect();
  }
});
