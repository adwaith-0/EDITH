// Compatibility entrypoint for the retired prototype test.
// Uses the authenticated, real-PostgreSQL rental integration suite.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['--test', path.join(__dirname, 'tests/rental.test.js')], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
