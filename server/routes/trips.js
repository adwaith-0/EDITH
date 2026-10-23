const router = require('express').Router();
const rateLimit = require('express-rate-limit').rateLimit;
const prisma = require('../lib/prisma');
const directory = require('../services/chargerDirectory');
const { project } = require('../../shared/chargingPlanner');
const { publicRental, include } = require('../services/rentalService');
router.use(rateLimit({windowMs:60000,limit:10}));
router.post('/chargers', async (req,res) => {
  const { points, corridorKm = 10 } = req.body || {};
  if (!Array.isArray(points) || points.length < 2 || points.length > 1500 || points.some(p => !p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat)>90 || Math.abs(p.lng)>180) || !Number.isFinite(corridorKm) || corridorKm<1 || corridorKm>25) return res.status(400).json({error:'Provide 2–1500 route points and a corridor of 1–25 km.'});
  try {
    const lat = points.map(p=>p.lat), lng = points.map(p=>p.lng);
    const rentals = await prisma.station.findMany({where:{kind:'PRIVATE_RENTAL',published:true,lat:{gte:Math.min(...lat)-.3,lte:Math.max(...lat)+.3},lng:{gte:Math.min(...lng)-.3,lte:Math.max(...lng)+.3}},include});
    const filtered = rentals.filter(s=>project({lat:s.lat,lng:s.lng},points).crossKm<=corridorKm);
    const reserved = await prisma.booking.findMany({where:{stationId:{in:filtered.map(s=>s.id)},status:{in:['CONFIRMED','IN_PROGRESS']},slotEnd:{gt:new Date()}},select:{stationId:true,slotStart:true,slotEnd:true}});
    let stations = [], warning = '';
    if(req.body.preferCache===true)stations=directory.cachedCorridor(points,corridorKm);
    if(stations.length)warning=`Cached OSM snapshot from ${new Date(directory.snapshotAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} IST. Coverage may be incomplete. Use live refresh for newer mapped records.`;
    else try { stations = await directory.corridor(points,corridorKm); } catch(error) { console.warn('Route directory:',error.message); stations=directory.cachedCorridor(points,corridorKm); warning = 'Live public directory unavailable. Showing cached records if present; coverage may be incomplete.'; }
    res.json({stations,rentals:filtered.map(s=>({...publicRental(s),reservedWindows:reserved.filter(b=>b.stationId===s.id).map(b=>({startsAt:b.slotStart,endsAt:b.slotEnd}))})),queryComplete:!warning,warning,queriedAt:new Date().toISOString()});
  } catch { res.status(503).json({error:'Charger discovery is temporarily unavailable.'}); }
});
module.exports = router;
