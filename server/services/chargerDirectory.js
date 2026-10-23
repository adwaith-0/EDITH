const axios = require('axios');
const crypto = require('crypto');
const { osmStation, simplify, project, distance } = require('../../shared/chargingPlanner');
const cache = new Map(), pending = new Map();
const snapshot = require('../data/charging-directory-snapshot.json');
let queue = Promise.resolve();

// One corridor query covers every segment, including the gaps between route vertices.
async function queryDirectory(filter) {
  const key = crypto.createHash('sha256').update(filter).digest('hex');
  if (cache.get(key)?.expires > Date.now()) return cache.get(key).value;
  if (pending.has(key)) return pending.get(key);
  const task = queue.catch(() => {}).then(async () => {
    const query = `[out:json][timeout:45];(nwr["amenity"="charging_station"]${filter};nwr["amenity"="fuel"]["fuel:electricity"="yes"]${filter};);out center tags;`;
    const endpoints=process.env.OVERPASS_API_URL?[process.env.OVERPASS_API_URL]:['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter'];
    let response,lastError;
    for(const endpoint of endpoints){
      try{
        response=await axios.post(endpoint,new URLSearchParams({data:query}).toString(),{timeout:55000,headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'EDITH-Charge-MVP/1.0'}});
        if(!Array.isArray(response.data.elements)||response.data.remark)throw Error('Incomplete public directory response.');
        break;
      }catch(error){lastError=error;response=null;}
    }
    if(!response)throw lastError;
    const value = response.data.elements.map(osmStation).filter(Boolean);
    cache.set(key, { expires: Date.now() + 600000, value });
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return value;
  });
  queue = task;
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
async function nearby(lat, lng, radius) {
  try {
    const pad=radius/110500,lngPad=pad/Math.cos(lat*Math.PI/180);
    return (await queryDirectory(`(${lat-pad},${lng-lngPad},${lat+pad},${lng+lngPad})`)).filter(s => distance(s.location, {lat,lng}) <= radius / 1000);
  } catch(error) {
    const cached=cachedNearby(lat,lng,radius);if(!cached.length)throw error;
    cached.coverageWarning=`Live directory unavailable. Showing a partial cached OSM snapshot from ${snapshot.queriedAt}.`;
    return cached;
  }
}
function cachedNearby(lat,lng,radius){return snapshot.stations.filter(s=>distance(s.location,{lat,lng})<=radius/1000);}
function cachedCorridor(points,radiusKm){return snapshot.stations.filter(s=>project(s.location,points).crossKm<=radiusKm);}
async function corridor(points, radiusKm) {
  // Overpass linestring proximity gets expensive on continental routes. The
  // complete bounding rectangle is an indexed query; segment filtering below
  // still limits results to the actual road corridor, without sampling gaps.
  const lats=points.map(p=>p.lat),lngs=points.map(p=>p.lng);
  const south=Math.min(...lats)-radiusKm/110.5,north=Math.max(...lats)+radiusKm/110.5;
  const pad=radiusKm/(110.5*Math.cos(Math.max(Math.abs(south),Math.abs(north))*Math.PI/180));
  if(distance(points[0],points[points.length-1])>250){
    const bounds=[Math.floor(south*10)/10,Math.floor((Math.min(...lngs)-pad)*10)/10,Math.ceil(north*10)/10,Math.ceil((Math.max(...lngs)+pad)*10)/10];
    return (await queryDirectory(`(${bounds.join(',')})`)).filter(s=>project(s.location,points).crossKm<=radiusKm);
  }
  let tolerance = .5, path = simplify(points, tolerance);
  while (path.length > 650) { tolerance *= 1.5; path = simplify(points, tolerance); }
  const filter = `(around:${Math.round((radiusKm + tolerance) * 1000)},${path.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(',')})`;
  return (await queryDirectory(filter)).filter(s => project(s.location, points).crossKm <= radiusKm);
}
module.exports = { nearby, corridor, queryDirectory, cachedNearby, cachedCorridor, snapshotAt:snapshot.queriedAt };
