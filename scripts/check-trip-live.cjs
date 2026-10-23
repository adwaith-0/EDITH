// Explicit live-provider check; stores public route/directory data only in ignored .local.
const axios=require('axios'),fs=require('fs');
const {decodePolyline,simplify,planCharging,refinePlan,demoGapStations}=require('../shared/chargingPlanner');
const api=axios.create({baseURL:'http://localhost:3001/api',timeout:180000});
(async()=>{
 const {data}=await api.post('/maps/route',{points:[{lat:9.9816,lng:76.2999},{lat:28.6139,lng:77.2090}]});
 const r=data.route,route={polyline:r.geometry,distanceMeters:r.distance,durationSeconds:r.duration,legs:r.legs};
 console.log('Kochi–Delhi route',Math.round(r.distance/1000),'km');
 const directory=(await api.post('/trips/chargers',{points:simplify(decodePolyline(r.geometry),.4),corridorKm:10})).data;
 const stations=[...directory.stations.map(s=>({...s,kind:'public'})),...directory.rentals.map(s=>({...s,location:{lat:s.lat,lng:s.lng},kind:'private',connectors:s.connectors.map(c=>({type:c.connectorType,powerKW:c.powerKw}))}))];
 console.log('Directory',JSON.stringify({stations:directory.stations.length,rentals:directory.rentals.length,queryComplete:directory.queryComplete,warning:directory.warning}));
 const results=[];
 for(const rangeKm of [220,340]){
   const profile={name:rangeKm===220?'Nexon 30.2 planning assumptions':'MG 50.3 planning assumptions',rangeKm,startPercent:80,reservePercent:15,targetPercent:80,batteryKwh:rangeKm===220?30.2:50.3,averageChargeKw:rangeKm===220?25:40,connectorTypes:['CCS2','Type 2'],allowUnknown:true,fillDemoGaps:true};
   const augmented=[...stations,...demoGapStations(route,stations,profile,'2026-10-24T00:30:00Z')];
   let energy=planCharging({route,stations:augmented,profile,departureAt:'2026-10-24T00:30:00Z'});
   if(energy.stops.length){const road=(await api.post('/maps/route',{points:[{lat:9.9816,lng:76.2999},...energy.stops.map(s=>s.location),{lat:28.6139,lng:77.2090}]})).data.route;energy=refinePlan(energy,{polyline:road.geometry,distanceMeters:road.distance,durationSeconds:road.duration,legs:road.legs},profile,'2026-10-24T00:30:00Z');}
   results.push({rangeKm,energy});console.log(JSON.stringify({rangeKm,status:energy.status,stops:energy.stops.length,arrival:energy.estimatedArrival,gap:energy.gap,warnings:energy.warnings.slice(0,3)}));
 }
 fs.writeFileSync('.local/live-route-validation.json',JSON.stringify({route,directory,results},null,2));
})().catch(e=>{console.error(e.message,e.response?.data?.error||'');process.exitCode=1;});
