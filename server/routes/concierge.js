const router=require('express').Router();
const {verifyToken}=require('../middleware/auth');
const {apiError}=require('../services/rentalShared');
const ai=require('../services/conciergeAI'),service=require('../services/chargingConcierge');
const rateLimit=require('express-rate-limit').rateLimit;
const handler=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){apiError(res,e);}};
router.get('/status',(req,res)=>res.json(ai.configuration()));
router.get('/vehicles',(req,res)=>res.json({vehicles:require('../services/demoVehicleCatalogue').catalogue,defaults:require('../services/mvpBookingAgent').DEFAULTS,demoEnabled:require('../services/demoMode').enabled()}));
router.use(verifyToken);
router.use(rateLimit({windowMs:60000,limit:10,message:{error:'Please wait before another concierge request.'}}));
router.get('/speech/status',(req,res)=>res.json(require('../services/neuralVoice').status()));
router.post('/speech',handler(async(req,res)=>{
  const wav=await require('../services/neuralVoice').speak(req.body.text);
  res.set({'Content-Type':'audio/wav','Cache-Control':'no-store','X-Voice-Engine':'Kokoro-af_heart'}).send(wav);
}));
router.post('/understand',handler(async(req,res)=>res.json(await ai.understand(req.body.message))));
router.post('/search',handler(async(req,res)=>res.json(await service.search(req.user.id,req.body))));
router.post('/agent/turn',handler(async(req,res)=>{
  const result=await require('../services/bookingAgent').turn(req.user.id,req.body);
  if(result.booking){const b=result.booking;req.app.get('io')?.to(`user:${b.userId}`).to(`user:${b.station.ownerId}`).to('admin').emit('booking.updated',{id:b.id,status:b.status});}
  res.json(result);
}));
router.get('/agent/recovery/:id',handler(async(req,res)=>res.json(await require('../services/bookingAgent').recover(req.user.id,req.params.id))));
router.get('/recovery/:id',handler(async(req,res)=>res.json(await service.recovery(req.user.id,req.params.id))));
module.exports=router;
