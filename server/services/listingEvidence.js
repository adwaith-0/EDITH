const prisma=require('../lib/prisma');
const {fail,text}=require('./rentalShared');
const isDemo=s=>s.source==='SYNTHETIC_DEMO'||s.source==='PUBLIC_DEMO'||/synthetic/i.test(s.name||'');
function snapshot(s){return {source:s.source,lat:s.lat,lng:s.lng,address:s.address,parking:s.parking,parkingIncluded:s.parkingIncluded,connectorType:s.connectors?.[0]?.connectorType,powerKw:s.connectors?.[0]?.powerKw,currentType:s.connectors?.[0]?.currentType};}
function checkSnapshot(station,saved){const current=snapshot(station);if(!saved||Object.keys(current).some(key=>current[key]!==saved[key]))fail('Listing specifications or parking changed. Replan before requesting or accepting.',409,'PROPOSAL_CHANGED');}
function describe(station){
  const age=station.statusReportedAt?Date.now()-new Date(station.statusReportedAt).getTime():Infinity;
  return {dataMode:isDemo(station)?'DEMO':'HOST_PROVIDED',specificationsVerifiedAt:station.specificationsVerifiedAt,verificationSource:'HOST_SELF_REPORT',specificationEvidence:station.specificationEvidence,parkingIncluded:station.parkingIncluded,equipmentStatus:station.equipmentStatus||'UNKNOWN',statusReportedAt:station.statusReportedAt,statusFresh:age>=0&&age<=6*3600000,liveTelemetry:false};
}
async function verify(ownerId,id,body){
  if(body.specificationsConfirmed!==true)fail('Confirm the connector and any recorded power against your equipment label or manual.');
  if(typeof body.parkingIncluded!=='boolean')fail('Confirm whether parking is included in the hourly price.');
  if(!['WORKING','UNAVAILABLE','UNKNOWN'].includes(body.equipmentStatus))fail('Choose a valid equipment report.');
  const note=text(body.evidence,'Specification evidence',true,500);
  return prisma.$transaction(async tx=>{
    const hint=await tx.station.findUnique({where:{id}});if(!hint||hint.ownerId!==ownerId||hint.kind!=='PRIVATE_RENTAL')fail('Only the private listing owner can confirm these details.',403,'FORBIDDEN');
    await tx.$queryRaw`SELECT "id" FROM "Connector" WHERE "stationId"=${id} ORDER BY "id" FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Station" WHERE "id"=${id} FOR UPDATE`;
    const now=new Date();
    const station=await tx.station.update({where:{id},data:{specificationsVerifiedAt:now,specificationEvidence:note,parkingIncluded:body.parkingIncluded,equipmentStatus:body.equipmentStatus,statusReportedAt:now},include:{connectors:true}});
    if(body.equipmentStatus==='WORKING')await tx.chargerReport.updateMany({where:{stationId:id,kind:{in:['ISSUE','SESSION_FAILED']},resolvedAt:null},data:{resolvedAt:now}});
    await tx.audit.create({data:{entityType:'Station',entityId:id,action:'HOST_EVIDENCE_CONFIRMED',data:{actorId:ownerId,connectors:station.connectors,evidence:note,parkingIncluded:body.parkingIncluded,equipmentStatus:body.equipmentStatus,dataMode:isDemo(station)?'DEMO':'HOST_PROVIDED'}}});
    return describe(station);
  });
}
async function report(userId,bookingId,body){
  if(!['ISSUE','SESSION_SUCCESS','SESSION_FAILED'].includes(body.kind))fail('Choose an equipment issue or session outcome.');
  const notes=text(body.notes,'Report notes',body.kind!=='SESSION_SUCCESS',1000);
  return prisma.$transaction(async tx=>{
    const hint=await tx.booking.findUnique({where:{id:bookingId}});
    if(!hint||hint.userId!==userId)fail('Only the booking driver may report its outcome.',403,'FORBIDDEN');
    await tx.$queryRaw`SELECT "id" FROM "Connector" WHERE "id"=${hint.connectorId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Station" WHERE "id"=${hint.stationId} FOR UPDATE`;
    const booking=await tx.booking.findUnique({where:{id:bookingId}});
    if(!['CONFIRMED','IN_PROGRESS','COMPLETED'].includes(booking.status))fail('Reports require a confirmed or completed booking.',409,'INVALID_TRANSITION');
    if(body.kind==='SESSION_SUCCESS'&&booking.status!=='COMPLETED')fail('Record a successful outcome after the session has completed.',409,'INVALID_TRANSITION');
    const report=await tx.chargerReport.create({data:{stationId:booking.stationId,bookingId,reporterId:userId,kind:body.kind,notes}});
    if(body.kind!=='SESSION_SUCCESS')await tx.station.update({where:{id:booking.stationId},data:{equipmentStatus:'ISSUE_REPORTED',statusReportedAt:new Date()}});
    await tx.audit.create({data:{entityType:'Booking',entityId:bookingId,action:'DRIVER_REPORTED_OUTCOME',data:{actorId:userId,kind:body.kind,reportId:report.id}}});
    return report;
  });
}
function eligible(station,allowDemo=false){
  if(isDemo(station)&&!allowDemo)return 'Demo listing is excluded from verified host results.';
  if(!isDemo(station)&&!station.specificationsVerifiedAt)return 'The host has not confirmed the specifications.';
  if(!isDemo(station)&&station.parkingIncluded!==true)return 'Included parking price is not confirmed.';
  if(['UNAVAILABLE','ISSUE_REPORTED'].includes(station.equipmentStatus))return 'An equipment problem is unresolved.';
  if(!station.connectors?.[0]?.powerKw)return 'Rated charger power is unknown; a charging duration cannot be prepared.';
  return null;
}
module.exports={isDemo,describe,verify,report,eligible,snapshot,checkSnapshot};
