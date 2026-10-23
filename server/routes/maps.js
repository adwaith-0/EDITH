const express=require('express');
const router=express.Router(),maps=require('../services/mapProvider');
router.use(require('express-rate-limit').rateLimit({windowMs:60000,limit:30,standardHeaders:true,legacyHeaders:false,message:{error:'Please wait before another map search.'}}));
router.get('/search',async(req,res)=>{
  const q=typeof req.query.q==='string'?req.query.q.trim():'';
  if(q.length<2||q.length>200)return res.status(400).json({error:'Enter a place name between 2 and 200 characters.'});
  try{res.json({results:await maps.geocode(q),source:'Photon / OpenStreetMap',attribution:'OpenStreetMap contributors'});}catch(e){res.status(503).json({error:e.message});}
});
router.post('/route',async(req,res)=>{
  const points=req.body?.points;
  if(!Array.isArray(points)||points.length<2||points.length>25||points.some(p=>!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180))return res.status(400).json({error:'Provide 2–25 valid route locations.'});
  try{res.json({route:await maps.route(points),source:'OSRM / OpenStreetMap',trafficAvailable:false});}catch(e){res.status(503).json({error:e.message});}
});
module.exports=router;
