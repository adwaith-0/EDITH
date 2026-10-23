import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Development-only real PostgreSQL. Existing installations may use DATABASE_URL instead.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseDir = path.join(root, '.local', 'postgres');
mkdirSync(path.dirname(databaseDir), { recursive: true });
const postgres = new EmbeddedPostgres({
  databaseDir, user: 'edith', password: 'edith_local_only', port: 54329,
  persistent: true, postgresFlags: ['-h', '127.0.0.1'],
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: message => { if (/ready to accept connections/.test(message)) console.log(message.trim()); },
  onError: message => console.error(message.trim()),
});
if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) await postgres.initialise();
await postgres.start();
const client = postgres.getPgClient();
await client.connect();
const { rows } = await client.query("SELECT 1 FROM pg_database WHERE datname = 'edith_charge'");
if (!rows.length) await client.query("CREATE DATABASE edith_charge WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'");
await client.end();
console.log('EDITH development PostgreSQL ready on 127.0.0.1:54329 (persistent .local/postgres).');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await postgres.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 60_000);
