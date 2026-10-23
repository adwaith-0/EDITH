// Shared deterministic planning mathematics. Estimates never represent charger telemetry.
const rad = x => x * Math.PI / 180;
function distance(a, b) { const x = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2; return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); }
function decodePolyline(encoded) {
  let i=0,lat=0,lng=0;const out=[];
  while(i<encoded.length){const read=()=>{let n=0,s=0,b;do{if(i>=encoded.length||s>30)throw Error('Invalid route geometry');b=encoded.charCodeAt(i++)-63;n|=(b&31)<<s;s+=5;}while(b>=32);return n&1?~(n>>1):n>>1;};lat+=read();lng+=read();out.push({lat:lat/1e5,lng:lng/1e5});}return out;
}
function project(point, path) {
  let total=0,best=Infinity,along=0;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],scale=Math.cos(rad((a.lat+b.lat+point.lat)/3));
    const ax=(a.lng-point.lng)*111.32*scale,ay=(a.lat-point.lat)*111.32;
    const bx=(b.lng-point.lng)*111.32*scale,by=(b.lat-point.lat)*111.32,dx=bx-ax,dy=by-ay;
    const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
    const cross=Math.hypot(ax+t*dx,ay+t*dy),segment=distance(a,b);
    if(cross<best){best=cross;along=total+t*segment;}total+=segment;
  }
  return {crossKm:best,alongKm:along,totalKm:total};
}
function simplify(path, toleranceKm=1) {
  if(path.length<=2)return path;
  const keep=new Set([0,path.length-1]),stack=[[0,path.length-1]];
  while(stack.length){const [a,b]=stack.pop();let max=toleranceKm,at=-1;for(let i=a+1;i<b;i++){const d=project(path[i],[path[a],path[b]]).crossKm;if(d>max){max=d;at=i;}}if(at>=0){keep.add(at);stack.push([a,at],[at,b]);}}
  return [...keep].sort((a,b)=>a-b).map(i=>path[i]);
}
function connectorKey(value) {
  const s=String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(s.includes('ccs')||s.includes('type2combo')||s.includes('combo2'))return 'CCS2';
  if(s.includes('chademo'))return 'CHAdeMO';if(s.includes('type2')||s.includes('mennekes'))return 'Type 2';
  if(s.includes('bharatdc'))return 'Bharat DC001';if(s.includes('bharatac'))return 'Bharat AC001';return s||'unknown';
}
function power(value) {const m=String(value||'').match(/([\d.]+)\s*(kW|W|MW)?/i);if(!m)return null;const n=Number(m[1])/(m[2]?.toLowerCase()==='w'?1000:1)*(m[2]?.toLowerCase()==='mw'?1000:1);return n>0&&n<=1000?n:null;}
function osmStation(el) {
  const t=el.tags||{},lat=el.lat??el.center?.lat,lng=el.lon??el.center?.lon;if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  const types=[['type2_combo','CCS2'],['chademo','CHAdeMO'],['type2','Type 2'],['type1','Type 1'],['tesla_supercharger','Tesla']];
  const connectors=types.filter(([tag])=>t[`socket:${tag}`]&& !['0','no'].includes(t[`socket:${tag}`])).map(([tag,type])=>({type,powerKW:power(t[`socket:${tag}:output`])}));
  // Overall output can only supplement an explicitly tagged single connector.
  if(connectors.length===1&&!connectors[0].powerKW)connectors[0].powerKW=power(t['charging_station:output']||t['capacity:charging']);
  const unavailable=['no','private'].includes(t.access)||t['operational_status']==='out_of_order'||t.disused==='yes';
  return {id:`osm-${el.type}-${el.id}`,source:'osm',name:t.name||t.operator||t.brand||'Mapped EV charging station',location:{lat,lng},address:t['addr:full']||[t['addr:street'],t['addr:suburb'],t['addr:city'],t['addr:state']].filter(Boolean).join(', ')||'Address not recorded in map data',connectors,status:'unknown',discoveryOnly:true,operator:t.operator||t.brand||'Operator not recorded',openingHours:t.opening_hours||null,access:t.access||null,unavailable,sourceUrl:`https://www.openstreetmap.org/${el.type}/${el.id}`};
}
function contains(windows,start,end){let until=start;for(const w of [...windows].sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))){const a=Date.parse(w.startsAt),b=Date.parse(w.endsAt);if(a>until)break;if(b>until)until=b;if(until>=end)return true;}return false;}
function planCharging(input) {
  const {route,stations,profile,departureAt}=input;
  const fullRange=Number(profile.rangeKm),initial=Number(profile.startPercent),reserve=Number(profile.reservePercent??15),target=Number(profile.targetPercent??80);
  const empty={status:'needs-input',stops:[],warnings:[],distanceKm:route.distanceMeters/1000,estimatedArrival:null,totalChargingMinutes:null};
  if(!Number.isFinite(fullRange)||fullRange<=0||!Number.isFinite(initial)||initial<=0||initial>100||!Number.isFinite(reserve)||!Number.isFinite(target)||reserve<5||reserve>=target||target>100)return {...empty,warnings:['Choose a vehicle, a positive full-charge planning range, starting battery and reserve below the target.']};
  const path=simplify(decodePolyline(route.polyline),.15),total=route.distanceMeters/1000;
  const points=stations.map(s=>{const p=project(s.location,path);const available=s.connectors.filter(c=>profile.connectorTypes.some(type=>connectorKey(type)===connectorKey(c.type)));const compatibility=!s.connectors.length?'unknown':available.length?'compatible':'incompatible';return {...s,progressKm:p.totalKm?p.alongKm/p.totalKm*total:0,crossKm:p.crossKm,compatibility,matched:available};}).filter(s=>s.crossKm<=Number(input.corridorKm||10)&&!s.unavailable).sort((a,b)=>a.progressKm-b.progressKm);
  const eligible=points.filter(s=>s.compatibility==='compatible'||(s.compatibility==='unknown'&&profile.allowUnknown));
  let position=0,soc=initial,time=Date.parse(departureAt),spent=0,allTimes=true;const stops=[],used=new Set(),warnings=[];let gap=null;
  if(initial<=reserve)return {...empty,status:'incomplete',warnings:['Starting battery is at or below the reserve. Charge before departure.'],gap:{fromKm:0,toKm:0,reachableKm:0}};
  for(let step=0;step<23;step++){
    const reachable=fullRange*(soc-reserve)/100;
    if(total-position<=reachable+.001){time+=(total-position)/total*route.durationSeconds*1000;break;}
    const choices=eligible.filter(s=>!used.has(s.id)&&s.progressKm>position+.5&&s.progressKm-position+2*s.crossKm*1.3<=reachable);
    if(!choices.length){gap={fromKm:position,toKm:Math.min(total,position+reachable),reachableKm:reachable,nextKnownKm:eligible.find(s=>s.progressKm>position+reachable)?.progressKm??null};warnings.push(`No eligible mapped charger can be reached after kilometre ${Math.round(position)} before the ${reserve}% reserve. Coverage/connector data may be missing.`);break;}
    // Progress dominates; modest preference for known connectors / useful rated power.
    choices.sort((a,b)=>(b.progressKm+Math.min(10,(Math.max(...b.matched.map(c=>c.powerKW||0),0))/20)+(b.compatibility==='compatible'?4:0))-(a.progressKm+Math.min(10,(Math.max(...a.matched.map(c=>c.powerKW||0),0))/20)+(a.compatibility==='compatible'?4:0)));
    let chosen=null;
    for(const s of choices){
      const driveKm=s.progressKm-position+2*s.crossKm*1.3,arrivalSoc=soc-driveKm/fullRange*100;
      const desired=Math.max(arrivalSoc,Math.min(target,reserve+(total-s.progressKm+2*s.crossKm*1.3)/fullRange*100));
      const energy=Number(profile.batteryKwh)>0?Number(profile.batteryKwh)*(desired-arrivalSoc)/100:null;
      const rated=Math.max(...s.matched.map(c=>Number(c.powerKW)||0),0)||null;
      const effective=Number(profile.averageChargeKw)>0?Math.min(rated||Number(profile.averageChargeKw),Number(profile.averageChargeKw))*.9:null;
      const duration=energy!==null&&effective?Math.max(5,Math.ceil(energy/effective*60)+5):null;
      let arrival=time+(driveKm/total*route.durationSeconds)*1000,wait=0;
      if(s.kind==='private'&&duration){const window=s.availabilityWindows?.find(w=>Date.parse(w.endsAt)>=arrival+duration*60000&&Date.parse(w.startsAt)<=arrival+12*3600000);if(!window)continue;wait=Math.max(0,(Date.parse(window.startsAt)-arrival)/60000);const end=arrival+(wait+duration)*60000;if(!contains(s.availabilityWindows,arrival+wait*60000,end)||s.reservedWindows?.some(w=>Date.parse(w.startsAt)<end&&Date.parse(w.endsAt)>arrival+wait*60000))continue;}
      chosen={...s,arrivalPercent:arrivalSoc,departurePercent:desired,energyKwh:energy,chargeMinutes:duration,waitMinutes:wait,arrivalAt:allTimes?new Date(arrival).toISOString():null,startAt:allTimes?new Date(arrival+wait*60000).toISOString():null,endAt:allTimes&&duration?new Date(arrival+(wait+duration)*60000).toISOString():null,legDistanceKm:driveKm,estimatedPowerKw:effective,ratedPowerKw:rated};break;
    }
    if(!chosen){gap={fromKm:position,toKm:Math.min(total,position+reachable),reachableKm:reachable};warnings.push('Reachable private chargers do not have a calendar window for the complete estimated session.');break;}
    stops.push(chosen);used.add(chosen.id);position=chosen.progressKm;soc=chosen.departurePercent;
    if(chosen.chargeMinutes===null)allTimes=false;else spent+=chosen.chargeMinutes;
    time=Date.parse(chosen.endAt||chosen.arrivalAt||departureAt);
    if(step===22){gap={fromKm:position,toKm:total,reachableKm:0};warnings.push('This preview supports at most 23 charging stops. Split a longer journey.');}
  }
  if(stops.some(s=>s.compatibility==='unknown'))warnings.push('Some suggested stations have unrecorded connector details. These are provisional stops; verify them with the operator.');
  warnings.push('Battery, charge duration and arrival figures are estimates. Traffic, weather, elevation, queues and battery taper can change them. Public live availability is unknown.');
  return {status:gap?'incomplete':'complete',stops,warnings,gap,distanceKm:total,estimatedArrival:!gap&&allTimes?new Date(time).toISOString():null,totalChargingMinutes:allTimes?spent:null,arrivalPercent:!gap?soc-(total-position)/fullRange*100:null,provisional:stops.some(s=>s.compatibility==='unknown'),model:profile.name};
}
// Replace corridor approximations with the road legs through each selected charger.
function refinePlan(plan,route,profile,departureAt,offsetLegs=0) {
  if(route.legs.length!==plan.stops.length+1+offsetLegs)return {...plan,status:'incomplete',roadVerified:false,warnings:[...plan.warnings,'Road legs could not be verified.']};
  let soc=profile.startPercent,time=Date.parse(departureAt),known=true,spent=0,progress=0,gap=plan.gap;
  const warnings=[...plan.warnings];
  const stops=plan.stops.map((s,i)=>{
    const legs= i===0 ? route.legs.slice(0,1+offsetLegs) : [route.legs[i+offsetLegs]];
    const km=legs.reduce((n,l)=>n+l.distance/1000,0),seconds=legs.reduce((n,l)=>n+l.duration,0);
    soc-=km/profile.rangeKm*100;progress+=km;time+=seconds*1000;
    if(soc<profile.reservePercent-.1){gap={fromKm:progress-km,toKm:progress,reachableKm:Math.max(0,km+(soc-profile.reservePercent)*profile.rangeKm/100)};warnings.push(`Road access to ${s.name} goes below your reserve. Choose a nearer station or increase departure charge.`);}
    const desired=Math.max(soc,s.departurePercent),energy=profile.batteryKwh>0?profile.batteryKwh*(desired-soc)/100:null;
    const duration=energy!==null&&s.estimatedPowerKw?Math.max(5,Math.ceil(energy/s.estimatedPowerKw*60)+5):null;
    const arrivalAt=known?new Date(time).toISOString():null;
    let wait=0;
    if(s.kind==='private'&&duration){const window=s.availabilityWindows?.find(w=>Date.parse(w.endsAt)>=time+duration*60000&&Date.parse(w.startsAt)<=time+12*3600000);if(window)wait=Math.max(0,(Date.parse(window.startsAt)-time)/60000);if(!window||!contains(s.availabilityWindows,time+wait*60000,time+(wait+duration)*60000)||s.reservedWindows?.some(w=>Date.parse(w.startsAt)<time+(wait+duration)*60000&&Date.parse(w.endsAt)>time+wait*60000)){gap={fromKm:progress,toKm:progress,reachableKm:0};warnings.push(`${s.name} has no open private calendar interval at the revised road ETA.`);}}
    const startAt=known?new Date(time+wait*60000).toISOString():null;
    if(duration===null)known=false;else {spent+=duration;time+=(wait+duration)*60000;}
    const endAt=known?new Date(time).toISOString():null;
    const arrivalPercent=soc;soc=desired;
    return {...s,arrivalPercent,departurePercent:desired,energyKwh:energy,chargeMinutes:duration,waitMinutes:wait,arrivalAt,startAt,endAt,legDistanceKm:km};
  });
  const last=route.legs[route.legs.length-1];soc-=last.distance/1000/profile.rangeKm*100;time+=last.duration*1000;
  if(soc<profile.reservePercent-.1){gap={fromKm:progress,toKm:route.distanceMeters/1000,reachableKm:Math.max(0,last.distance/1000+(soc-profile.reservePercent)*profile.rangeKm/100)};warnings.push('The final road leg goes below your reserve. Add a charging stop.');}
  return {...plan,stops,status:gap?'incomplete':'complete',gap,warnings,distanceKm:route.distanceMeters/1000,arrivalPercent:gap?null:soc,estimatedArrival:!gap&&known?new Date(time).toISOString():null,totalChargingMinutes:known?spent:null,roadVerified:true};
}
function demoGapStations(route,stations,profile,departureAt) {
  const added=[],path=decodePolyline(route.polyline),cumulative=[0];
  for(let i=1;i<path.length;i++)cumulative.push(cumulative[i-1]+distance(path[i-1],path[i]));
  for(let i=0;i<23;i++){
    const plan=planCharging({route,stations:[...stations,...added],profile:{...profile,allowUnknown:true},departureAt});
    if(plan.status!=='incomplete'||!plan.gap||plan.gap.reachableKm<=1)break;
    const at=Math.min(route.distanceMeters/1000-.5,plan.gap.fromKm+plan.gap.reachableKm*.82);
    const target=at/(route.distanceMeters/1000)*cumulative[cumulative.length-1];
    let index=cumulative.findIndex(v=>v>=target);if(index<1)index=1;
    const a=path[index-1],b=path[index],t=(target-cumulative[index-1])/(cumulative[index]-cumulative[index-1]||1);
    const location={lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};
    added.push({id:`route-demo-${location.lat.toFixed(4)}-${location.lng.toFixed(4)}`,name:`Demo charging point · km ${Math.round(at)}`,address:'Synthetic route point for MVP simulation. No physical charging station is verified here.',location,connectors:[],kind:'public',source:'simulated',synthetic:true});
  }
  return added;
}
module.exports={distance,decodePolyline,project,simplify,connectorKey,power,osmStation,planCharging,refinePlan,demoGapStations};
