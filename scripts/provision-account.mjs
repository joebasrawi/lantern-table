import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const [email, name, output] = process.argv.slice(2);
if (!email?.includes('@') || !name || !output)
  throw new Error(
    'Usage: provision-account EMAIL NAME PRIVATE_OUTPUT_DIRECTORY',
  );
const folder = resolve(output);
mkdirSync(folder, { recursive: true, mode: 0o700 });
const password = randomBytes(24).toString('base64url'),
  salt = randomBytes(16).toString('hex');
const account = {
  id: randomUUID(),
  email: email.toLowerCase(),
  name,
  salt,
  passwordHash: scryptSync(password, salt, 64).toString('hex'),
};
writeFileSync(join(folder, 'account.json'), JSON.stringify([account]), {
  mode: 0o600,
  flag: 'wx',
});
writeFileSync(
  join(folder, 'login.txt'),
  `Lantern Table Railway login\nEmail: ${email}\nPassword: ${password}\n`,
  { mode: 0o600, flag: 'wx' },
);
console.log(
  'Private account files created. Upload only account.json to LANTERN_ACCOUNTS.',
);
