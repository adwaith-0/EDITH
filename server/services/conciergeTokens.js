const jwt=require('jsonwebtoken');
const {JWT_SECRET}=require('../middleware/auth');
const {fail}=require('./rentalShared');
function sign(userId,option){return jwt.sign({typ:'CONCIERGE_OPTION',sub:userId,...option},JWT_SECRET,{expiresIn:'15m'});}
function read(token,userId,body){
  let claim;try{claim=jwt.verify(token,JWT_SECRET);}catch{fail('This charging proposal expired. Refresh concierge options before booking.',409,'PROPOSAL_EXPIRED');}
  if(claim.typ!=='CONCIERGE_OPTION'||claim.sub!==userId)fail('This proposal belongs to another account.',403,'FORBIDDEN');
  if(claim.stationId!==body.stationId||claim.vehicleId!==body.vehicleId||claim.slotStart!==new Date(body.slotStart).toISOString()||claim.durationMinutes!==Number(body.durationMinutes))fail('The proposal details changed. Replan charging before requesting.',409,'PROPOSAL_CHANGED');
  return claim;
}
module.exports={sign,read};
