import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  lstatSync,
} from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
const root = process.cwd(),
  target = resolve(process.argv[2] || '');
if (
  !process.argv[2] ||
  target === root ||
  !relative(root, target).startsWith(`..${sep}`)
)
  throw new Error('Choose a new export directory outside this checkout.');
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const deny =
  /^(?:\.git\/|\.wrangler\/|dist\/|node_modules\/|\.test-build\/|\.env(?!\.example$)|\.dev\.vars|wrangler\.standalone\.json$)/;
const secret =
  /sk-(?:proj-)?[A-Za-z0-9_-]{25,}|gh[pousr]_[A-Za-z0-9_]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
for (const file of files) {
  if (deny.test(file))
    throw new Error(`Private or generated file tracked: ${file}`);
  if (!lstatSync(file).isFile())
    throw new Error(`Only regular files may be exported: ${file}`);
  if (secret.test(readFileSync(file).toString('utf8')))
    throw new Error(`Credential-like content in ${file}`);
}
mkdirSync(target);
for (const file of files) {
  const output = resolve(target, file);
  mkdirSync(dirname(output), { recursive: true });
  if (file === '.openai/hosting.json') {
    const { d1, r2 } = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(output, JSON.stringify({ d1, r2 }, null, 2) + '\n');
  } else copyFileSync(file, output);
}
console.log(
  `Exported ${files.length} source files without Git history or private Site identity.`,
);
