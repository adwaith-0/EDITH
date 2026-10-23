import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,openSync,closeSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
dotenv.config({path:path.join(root,'.env.local'),quiet:true});
dotenv.config({path:path.join(root,'.env'),quiet:true});
const logs=path.join(root,'.local','runtime');
mkdirSync(logs,{recursive:true});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function listening(port,host='127.0.0.1'){
  return new Promise(resolve=>{const socket=net.createConnection({port,host});const finish=value=>{socket.destroy();resolve(value);};socket.setTimeout(1000);socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.once('timeout',()=>finish(false));});
}
async function launch(name,args){
  const out=openSync(path.join(logs,name+'.log'),'a'),err=openSync(path.join(logs,name+'.error.log'),'a');
  try{
    const child=spawn(process.execPath,args,{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,err]});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(new Error(`Could not start ${name}. Check ${logs}.`)));});
    child.unref();console.log(`Started ${name} (PID ${child.pid}).`);
  }finally{closeSync(out);closeSync(err);}
}
async function waitFor(check,message,timeout=45000){
  const until=Date.now()+timeout;
  while(Date.now()<until){if(await check())return;await pause(300);}
  throw new Error(`${message} See logs in ${logs}.`);
}
async function databaseReady(){
  const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:1200});
  try{await client.connect();await client.query('SELECT 1');return true;}catch{return false;}finally{await client.end().catch(()=>{});}
}
async function apiReady(url){
  try{const result=await fetch(url+'/api/rentals',{signal:AbortSignal.timeout(2000)});return result.ok&&Array.isArray((await result.json()).rentals);}catch{return false;}
}
async function webReady(){try{const result=await fetch('http://localhost:3000/',{signal:AbortSignal.timeout(2000)});return result.ok&&(await result.text()).includes('EDITH');}catch{return false;}}

async function start(){
  if(!process.env.DATABASE_URL)throw new Error('Configure private .env.local first; see README.md.');
  const database=new URL(process.env.DATABASE_URL),dbPort=Number(database.port||5432);
  if(!await listening(dbPort,database.hostname)){
    if(!['127.0.0.1','localhost'].includes(database.hostname)||dbPort!==54329)throw new Error('The configured PostgreSQL server is offline. Start that server, then retry.');
    await launch('postgres',['scripts/local-postgres.mjs']);
  }else console.log('Reusing PostgreSQL.');
  await waitFor(databaseReady,'PostgreSQL did not become ready for the configured database.');
  const apiPort=Number(process.env.PORT||3001),apiUrl=`http://localhost:${apiPort}`;
  if(await listening(apiPort)){
    if(!await apiReady(apiUrl))throw new Error(`Port ${apiPort} is occupied but the EDITH API/database check failed.`);
    console.log('Reusing EDITH API.');
  }else await launch('api',['server/index.js']);
  await waitFor(()=>apiReady(apiUrl),'The EDITH API did not become ready.');
  if(await listening(3000)){
    if(!await webReady())throw new Error('Port 3000 is occupied by a different or unhealthy application.');
    console.log('Reusing EDITH web app.');
  }else{
    if(!existsSync(path.join(root,'.next','BUILD_ID')))throw new Error('Create the production web build with npm run build, then rerun npm run local. The API and database are ready.');
    await launch('web',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000']);
  }
  await waitFor(webReady,'The EDITH web app did not become ready.');
  console.log('EDITH is ready: http://localhost:3000/');
  console.log('Services run in the background. Rerun npm run local after a restart; existing services and data are reused.');
  console.log(`Logs: ${logs}`);
}
start().catch(error=>{console.error(error.message);process.exitCode=1;});
