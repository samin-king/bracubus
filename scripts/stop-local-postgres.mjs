import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const executable = fileURLToPath(new URL('../.local/postgresql17/pgsql/bin/pg_ctl.exe', import.meta.url));
const data = fileURLToPath(new URL('../.local/postgres-data', import.meta.url));
const result = spawnSync(executable, ['-D', data, '-m', 'fast', '-w', 'stop'], { windowsHide: true, encoding: 'utf8' });
if (result.status !== 0) { console.error('Could not stop project-local PostgreSQL. Check whether it is running.'); process.exitCode = 1; }
else console.log('Project-local PostgreSQL stopped.');
