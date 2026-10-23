const cache=new Map(),inflight=new Map();let queue=Promise.resolve(),nextAt=0,queued=0;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function providerJson(url,lifetime){
  const key=url.toString(),saved=cache.get(key);if(saved?.until>Date.now())return saved.value;if(inflight.has(key))return inflight.get(key);
  if(queued>=20)throw Error('Map services are busy. Retry shortly.');queued++;
  const pending=queue.catch(()=>{}).then(async()=>{
    await pause(Math.max(0,nextAt-Date.now()));nextAt=Date.now()+1200;
    const res=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'EDITH-Charge-MVP/1.0',Accept:'application/json'}});
    if(!res.ok)throw Error('The map provider is temporarily unavailable.');const value=await res.json();
    if(cache.size>=300)cache.delete(cache.keys().next().value);cache.set(key,{value,until:Date.now()+lifetime});return value;
  }).finally(()=>{inflight.delete(key);queued--;});queue=pending;inflight.set(key,pending);return pending;
}
async function geocode(query){
  const coordinate=String(query).trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if(coordinate){const lat=Number(coordinate[1]),lng=Number(coordinate[2]);if(Math.abs(lat)>90||Math.abs(lng)>180)throw Error('Invalid coordinates.');return [{lat,lng,label:`${lat}, ${lng}`}];}
  const url=new URL(process.env.MAP_GEOCODER_URL||'https://photon.komoot.io/api/');url.searchParams.set('q',query);url.searchParams.set('limit','5');url.searchParams.set('lang','en');
  const data=await providerJson(url,86400000);
  return (data.features||[]).filter(f=>f.geometry?.type==='Point').map(f=>{const p=f.properties||{},[lng,lat]=f.geometry.coordinates;return {lat,lng,label:[...new Set([p.name,p.street,p.city||p.county,p.state,p.country].filter(Boolean))].join(', ')};}).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
}
async function route(points){
  const base=process.env.MAP_ROUTER_URL||'https://router.project-osrm.org/route/v1/driving/';
  const url=new URL(points.map(p=>`${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';'),base.endsWith('/')?base:base+'/');
  for(const [key,value]of Object.entries({overview:'full',geometries:'polyline',steps:'true',alternatives:'false',radiuses:points.map(()=>'1000').join(';')}))url.searchParams.set(key,value);
  const data=await providerJson(url,600000),r=data.routes?.[0];
  if(data.code!=='Ok'||!r||data.waypoints?.length!==points.length||data.waypoints.some(p=>!Number.isFinite(p.distance)||p.distance>1000)||r.legs?.length!==points.length-1||r.legs.some(l=>!Number.isFinite(l.distance)||l.distance<0||!Number.isFinite(l.duration)||l.duration<0)||typeof r.geometry!=='string'||!Number.isFinite(r.distance)||!Number.isFinite(r.duration))throw Error('A complete driving route could not be verified. Try another location.');
  return r;
}
module.exports={geocode,route};
