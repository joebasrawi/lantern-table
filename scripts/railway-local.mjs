import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
process.env.LANTERN_ACCOUNTS = readFileSync(process.argv[2], 'utf8');
process.env.LANTERN_DATA_DIR = '.railway-data';
process.env.LANTERN_ORIGIN = 'http://localhost:3002';
process.env.PORT = '3002';
process.env.LANTERN_BACKGROUND_TURNS = 'true';
const child = spawn(
  process.execPath,
  ['node_modules/vinext/dist/cli.js', 'start'],
  { env: process.env, stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code ?? 1));
