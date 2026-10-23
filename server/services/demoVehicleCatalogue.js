const {createHash}=require('node:crypto');
const prisma=require('../lib/prisma');
const {fail}=require('./rentalShared');
// Reviewed manufacturer references. These are demo presets, never verification
// of the particular car a driver owns. Variant choice is returned to the driver.
const catalogue=[
  {id:'nexon-45',name:'Tata Nexon EV 45',aliases:['nexon','nexonev','tatanexon'],batteryCapacityKwh:46.08,rangeKm:350,acChargeKw:7.2,connectorTypes:['Type 2','CCS2'],sources:[{title:'Tata Nexon EV manufacturer specifications',url:'https://ev.tata.cars/nexon/ev/specifications.html'},{title:'Tata Nexon EV 45 manufacturer brochure',url:'https://ev.tatamotors.com/content/dam/tml/ev/products/nexon/year-2023/ev/promoting-vc/brochure/nexon-ev-45-brochure.pdf'}]},
  {id:'tiago-24',name:'Tata Tiago EV 24 kWh',aliases:['tiago','tiagoev','tatatiago'],batteryCapacityKwh:24,rangeKm:205,acChargeKw:7.2,connectorTypes:['Type 2','CCS2'],sources:[{title:'Tata Tiago EV manufacturer FAQ',url:'https://ev.tata.cars/tiago/ev/next-gen/faqs.html'},{title:'Tata Tiago EV manufacturer owner manual',url:'https://cars.tatamotors.com.np/images/Tiago%20EV%20Manual%202.pdf'}]},
  {id:'mg-zs-50',name:'MG ZS EV 50.3 kWh',aliases:['mgzs','zsev','mgzsev'],batteryCapacityKwh:50.3,rangeKm:350,acChargeKw:7.4,connectorTypes:['Type 2','CCS2'],sources:[{title:'MG ZS EV manufacturer specifications',url:'https://www.mgmotor.co.in/vehicles/mgzsev-electric-car-in-india'}]},
];
const normal=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function match(value){const key=normal(value);if(/petrol|diesel/.test(key))return null;return catalogue.find(p=>p.id===value||p.aliases.some(a=>key.includes(a)))||null;}
const references=new Map(),pending=new Map();
async function fetchReference(preset){
  const saved=references.get(preset.id);if(saved&&Date.now()-Date.parse(saved.checkedAt)<(saved.status==='LIVE_REFERENCE_FETCHED'?6*3600000:60000))return saved;
  if(pending.has(preset.id))return pending.get(preset.id);
  const promise=(async()=>{
    for(const source of preset.sources){
      try{
        const response=await fetch(source.url,{signal:AbortSignal.timeout(5000),headers:{'User-Agent':'EDITH-Charge-MVP/1.0','Range':'bytes=0-65535'},redirect:'follow'});
        const host=new URL(response.url).hostname;
        if(!response.ok||!['ev.tatamotors.com','ev.tata.cars','cars.tatamotors.com.np','www.mgmotor.co.in'].includes(host))throw Error();
        // Fetch the real reference, with bounded size. Presets remain explicitly
        // curated: successful HTTP retrieval does not validate every spec field.
        const reader=response.body.getReader();let bytes=0;try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>3*1024*1024)break;}}finally{await reader.cancel().catch(()=>{});}
        const result={status:'LIVE_REFERENCE_FETCHED',checkedAt:new Date().toISOString(),sourceUrl:source.url,sourceTitle:source.title,bytesRead:bytes,note:'Manufacturer reference fetched. Connector/variant values use the reviewed demo preset, not inspection of your car.'};references.set(preset.id,result);return result;
      }catch{/* A manufacturer outage must not block a synthetic rehearsal. */}
    }
    const result={status:'REVIEWED_PRESET_FALLBACK',checkedAt:new Date().toISOString(),sourceUrl:preset.sources[0].url,sourceTitle:preset.sources[0].title,note:'Live manufacturer reference is unavailable. Using the labelled, previously reviewed demo preset.'};references.set(preset.id,result);return result;
  })().finally(()=>pending.delete(preset.id));pending.set(preset.id,promise);return promise;
}
async function vehicleFor(userId,preset){
  const id='demo-agent-car-'+createHash('sha256').update(userId+'|'+preset.id).digest('hex').slice(0,28);
  return prisma.vehicle.upsert({where:{id},update:{},create:{id,ownerId:userId,model:preset.name+' · demo preset',vehicleType:'CAR',connectorTypes:preset.connectorTypes,batteryCapacityKwh:preset.batteryCapacityKwh,rangeKm:preset.rangeKm,metadata:{synthetic:true,demoCatalogueId:preset.id,sources:preset.sources,specificationBasis:'REVIEWED_MANUFACTURER_REFERENCE',variantAssumption:true,realVehicleVerified:false}}});
}
function requirePreset(value){const p=match(value);if(!p)fail('This demo supports Tata Nexon EV, Tata Tiago EV and MG ZS EV. Choose one of these models for an instant demo booking.',400,'DEMO_MODEL_NOT_SUPPORTED');return p;}
module.exports={catalogue,match,requirePreset,fetchReference,vehicleFor};
