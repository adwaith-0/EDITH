// Non-destructive repair for an older Windows development database.
import 'dotenv/config';
import {Client} from 'pg';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const sourceUrl=new URL(process.env.DATABASE_URL);
if(sourceUrl.hostname!=='127.0.0.1'||sourceUrl.port!=='54329')throw Error('This helper is restricted to the local EDITH development PostgreSQL.');
const source=new Client({connectionString:sourceUrl.toString()});await source.connect();
const encoding=(await source.query('SHOW server_encoding')).rows[0].server_encoding;
if(encoding==='UTF8'){console.log('Database already uses UTF-8.');await source.end();process.exit(0);}
const targetUrl=new URL(sourceUrl);targetUrl.pathname='/edith_charge_utf8';
const exists=await source.query("SELECT 1 FROM pg_database WHERE datname='edith_charge_utf8'");
if(exists.rows.length)throw Error('UTF-8 target already exists. Inspect it before retrying; no data was changed.');
await source.query("CREATE DATABASE edith_charge_utf8 WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'");
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:targetUrl.toString()},stdio:'pipe',encoding:'utf8'});
if(result.status!==0)throw Error(result.stderr||result.stdout);
const target=new Client({connectionString:targetUrl.toString()});await target.connect();
const tables=['User','Station','Connector','Vehicle','AvailabilityWindow','Booking','Audit'];
const quote=s=>'"'+s.replaceAll('"','""')+'"';
await target.query('BEGIN');
try{
  for(const table of tables){const rows=(await source.query(`SELECT * FROM ${quote(table)}`)).rows;for(const row of rows){const keys=Object.keys(row);await target.query(`INSERT INTO ${quote(table)} (${keys.map(quote).join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>row[k]));}const count=Number((await target.query(`SELECT count(*) FROM ${quote(table)}`)).rows[0].count);if(count!==rows.length)throw Error(`Count mismatch for ${table}`);console.log(`${table}: ${count} copied and verified`);}
  await target.query('COMMIT');
}catch(error){await target.query('ROLLBACK');throw error;}
await source.end();await target.end();
for(const file of ['.env','.env.local']){const content=readFileSync(file,'utf8');writeFileSync(file,content.replace(/^DATABASE_URL=.*$/m,`DATABASE_URL=${targetUrl.toString()}`));}
console.log('Local configuration now uses UTF-8. Original database retained unchanged.');
