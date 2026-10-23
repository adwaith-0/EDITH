const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { fail, text } = require('./rentalShared');
const enabled = () => process.env.DEMO_MODE === 'true';
const publicDemo = station => station?.kind === 'PUBLIC' && station?.source === 'PUBLIC_DEMO';
async function preparePublic(body) {
  if (!enabled()) fail('Public demo booking is disabled.',403,'DEMO_DISABLED');
  const externalId = text(body.id,'Directory station ID',true,180);
  const name = text(body.name,'Station name',true,120), address = text(body.address,'Address',true,500);
  const lat=Number(body.location?.lat),lng=Number(body.location?.lng);
  if (!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) fail('Invalid station coordinates.');
  // These records are an EDITH simulation. No credentials or real operator identity are implied.
  const owner = await prisma.user.upsert({where:{email:'public-simulation@edith.invalid'},update:{},create:{name:'EDITH demo operator',email:'public-simulation@edith.invalid',passwordHash:'LOGIN_DISABLED'}});
  const id='public-demo-'+crypto.createHash('sha256').update(externalId).digest('hex').slice(0,32);
  const station = await prisma.station.upsert({where:{id},update:{},create:{id,name,address,lat,lng,kind:'PUBLIC',source:'PUBLIC_DEMO',ownerId:owner.id,published:true,hourlyRatePaise:12000,parking:'Simulation only. Confirm real parking and access with the operator.',accessInstructions:'This booking exists only in EDITH. It has not been sent to the station operator.',terms:'Public booking simulation. ₹120/hour is a demo tariff, not the operator tariff. No money is collected and no physical capacity is reserved.',connectors:{create:{connectorType:'Any connector (demo)',powerKw:null,slotCount:1}},availabilityWindows:{create:{startsAt:new Date(),endsAt:new Date(Date.now()+30*86400000)}}}});
  // Renew the demo calendar without changing existing reservations or source identity.
  await prisma.availabilityWindow.updateMany({where:{stationId:id},data:{endsAt:new Date(Date.now()+30*86400000)}});
  return station.id;
}
async function vehicleForName(userId,model) {
  if (!enabled()) fail('Choose a saved vehicle.');
  const name=text(model,'Vehicle model',true,120);
  return await prisma.vehicle.findFirst({where:{ownerId:userId,model:name}}) || prisma.vehicle.create({data:{ownerId:userId,model:name,vehicleType:'CAR',connectorTypes:[],metadata:{demoUnverified:true}}});
}
module.exports={enabled,publicDemo,preparePublic,vehicleForName};
