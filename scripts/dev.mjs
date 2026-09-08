import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
// Load only in the server process; nothing is written or exposed to the client.
for (const path of ['../.env.local', '.env.local'])
  if (existsSync(path)) process.loadEnvFile(path);
const p = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev'], {
  stdio: 'inherit',
  env: process.env,
});
p.on('exit', (code) => process.exit(code ?? 1));
