import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
function run(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: { ...process.env, LANTERN_HOSTING: 'standalone' },
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`Build exited with ${code}`)),
    );
  });
}
await run(['node_modules/vinext/dist/cli.js', 'build']);
const source = JSON.parse(
  readFileSync(
    process.env.LANTERN_STANDALONE_CONFIG || 'wrangler.standalone.json',
    'utf8',
  ),
);
const config = {
  name: `${source.name}-deadlines`,
  compatibility_date: source.compatibility_date,
  compatibility_flags: ['nodejs_compat'],
  workers_dev: false,
  preview_urls: false,
  triggers: { crons: ['* * * * *'] },
  d1_databases: source.d1_databases,
};
mkdirSync('.wrangler', { recursive: true });
mkdirSync('dist/scheduler', { recursive: true });
writeFileSync(
  '.wrangler/scheduler-build.json',
  JSON.stringify({ ...config, main: resolve('worker.scheduler.ts') }),
);
await run([
  'node_modules/wrangler/bin/wrangler.js',
  'deploy',
  '--dry-run',
  '--config',
  '.wrangler/scheduler-build.json',
  '--outdir',
  resolve('dist/scheduler'),
]);
writeFileSync(
  'dist/scheduler/wrangler.json',
  JSON.stringify({ ...config, main: 'worker.scheduler.js', no_bundle: true }),
);
