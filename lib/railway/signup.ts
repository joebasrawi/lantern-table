import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as derive,
} from 'node:crypto';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import {
  accountPage as page,
  accountRateLimit as allowed,
  mailConfigured,
} from './recovery';
const scrypt = promisify(derive);
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const signupEnabled = () =>
  process.env.LANTERN_SIGNUP_ENABLED === 'true' && mailConfigured();
const unavailable = () =>
  page(
    '<h1>Registration is closed</h1><p>Ask your host for an account. Existing players can still sign in.</p>',
    503,
  );
const confirmation = () =>
  page(
    '<h1>Check your email</h1><p>If this address can register, a verification link will arrive shortly. It expires in 30 minutes. If you already have an account, sign in or request a password reset.</p>',
  );
export function signupGet(request: Request) {
  if (!signupEnabled()) return unavailable();
  const params = new URL(request.url).searchParams;
  if (params.has('verify')) {
    const token = params.get('verify') || '';
    if (!/^[a-f0-9]{64}$/.test(token))
      return page(
        '<h1>Invalid verification link</h1><p>Request a new link from the registration page.</p>',
        400,
      );
    return page(
      `<h1>Create your account</h1><p>Choose a display name and a password of 12–200 characters.</p><form method="post" action="/api/auth?verify"><input type="hidden" name="token" value="${token}"><label for="name">Display name</label><input id="name" name="name" required maxlength="80" autocomplete="nickname"><label for="password">Password</label><input id="password" name="password" type="password" required minlength="12" maxlength="200" autocomplete="new-password"><label for="confirmPassword">Confirm password</label><input id="confirmPassword" name="confirmPassword" type="password" required minlength="12" maxlength="200" autocomplete="new-password"><button>Create account</button></form>`,
    );
  }
  return page(
    '<h1>Join Lantern Table</h1><p>Verify your email, then choose your name and password. Campaigns stay private and require an invitation.</p><form method="post" action="/api/auth?signup"><label for="email">Email</label><input id="email" name="email" type="email" required maxlength="254" autocomplete="email"><button>Send verification link</button></form>',
  );
}
export async function signupPost(
  db: DatabaseSync,
  request: Request,
  raw: string,
) {
  if (
    request.headers.get('origin') !==
    new URL(process.env.LANTERN_ORIGIN!).origin
  )
    return new Response('Forbidden', { status: 403 });
  if (!signupEnabled()) return unavailable();
  db.exec(`CREATE TABLE IF NOT EXISTS registrations(email TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS recovery_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL);`);
  const form = new URLSearchParams(raw);
  if (new URL(request.url).searchParams.has('signup')) {
    const email = (form.get('email') || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return confirmation();
    if (
      !allowed(db, 'signup:global', 20, 60000) ||
      !allowed(db, 'signup:' + digest(email), 3, 15 * 60000)
    )
      return confirmation();
    if (db.prepare('SELECT id FROM accounts WHERE email=?').get(email))
      return confirmation();
    const token = randomBytes(32).toString('hex'),
      tokenHash = digest(token);
    db.prepare('DELETE FROM registrations WHERE expires<=?').run(Date.now());
    db.prepare(
      'INSERT INTO registrations VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires',
    ).run(email, tokenHash, Date.now() + 30 * 60000);
    try {
      const link = new URL('/api/auth', process.env.LANTERN_ORIGIN);
      link.searchParams.set('verify', token);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'signup-' + tokenHash,
        },
        body: JSON.stringify({
          from: process.env.LANTERN_MAIL_FROM,
          to: [email],
          subject: 'Verify your Lantern Table email',
          text: `Use this link to choose your name and password:\n\n${link}\n\nThis link expires in 30 minutes and works once. If you did not request an account, ignore this email.`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Mail rejected');
    } catch {
      db.prepare('DELETE FROM registrations WHERE token_hash=?').run(tokenHash);
      console.error('Registration email could not be sent.');
    }
    return confirmation();
  }
  if (!allowed(db, 'verify:global', 100, 60000))
    return page('<h1>Please try again shortly</h1>', 429);
  const token = form.get('token') || '',
    name = (form.get('name') || '').trim(),
    password = form.get('password') || '';
  if (!/^[a-f0-9]{64}$/.test(token))
    return page('<h1>Invalid verification link</h1>', 400);
  if (
    !name ||
    name.length > 80 ||
    password.length < 12 ||
    password.length > 200 ||
    password !== form.get('confirmPassword')
  )
    return page(
      '<h1>Check your account details</h1><p>Use a display name of up to 80 characters and matching passwords of 12–200 characters. Reopen your link to try again.</p>',
      400,
    );
  const registration = db
    .prepare('SELECT email FROM registrations WHERE token_hash=? AND expires>?')
    .get(digest(token), Date.now());
  if (!registration)
    return page(
      '<h1>This link expired or was already used</h1><p>Request a new verification link.</p>',
      400,
    );
  const salt = randomBytes(16).toString('hex'),
    passwordHash = (await scrypt(password, salt, 64)) as Buffer;
  db.exec('BEGIN IMMEDIATE');
  try {
    const inserted = db
      .prepare(
        'INSERT INTO accounts(id,email,name,salt,password_hash) SELECT ?,email,?,?,? FROM registrations WHERE token_hash=? AND expires>? AND NOT EXISTS(SELECT 1 FROM accounts WHERE email=registrations.email)',
      )
      .run(
        randomUUID(),
        name,
        salt,
        passwordHash.toString('hex'),
        digest(token),
        Date.now(),
      );
    if (inserted.changes !== 1) {
      db.exec('ROLLBACK');
      return page(
        '<h1>This link is no longer available</h1><p>Sign in if you already have an account, or request a new link.</p>',
        400,
      );
    }
    db.prepare('DELETE FROM registrations WHERE email=?').run(
      String(registration.email),
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return page(
    '<h1>Your account is ready</h1><p>Sign in to create an adventure or join your friends using their campaign invitation.</p>',
  );
}
