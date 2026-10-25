import { spawnSync } from 'node:child_process';

// Build hosts receive the real database secret through Vercel's Environment settings.
// Migrations must succeed before publishing new code. No demo data or bypasses run.
if (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview') {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for deployment migrations');
  const result = spawnSync(process.execPath, ['services/scripts/migrate.js'], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
} else {
  console.log('Local build: deployment migrations skipped. Use npm run migrate against the intended database.');
}
const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
  stdio: 'inherit', env: process.env, shell: process.platform === 'win32'
});
process.exit(build.status || (build.error ? 1 : 0));
