import { signupGet, signupPost, signupEnabled } from './signup';
import { recoveryGet, recoveryPost } from './recovery';
import {
  randomBytes,
  scrypt as derive,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import { sqlite } from './storage';
const scrypt = promisify(derive);
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const cookieName = 'lantern_session';
let initialized = false;
function authDb() {
  const db = sqlite();
  if (!initialized) {
    db.exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS login_attempts(email TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL);`);
    const accounts = JSON.parse(process.env.LANTERN_ACCOUNTS || '[]') as {
      id: string;
      email: string;
      name: string;
      salt: string;
      passwordHash: string;
    }[];
    for (const a of accounts) {
      if (
        !a.id ||
        !a.email ||
        !a.name ||
        !/^[a-f0-9]{32}$/.test(a.salt) ||
        !/^[a-f0-9]{128}$/.test(a.passwordHash)
      )
        throw new Error('Invalid account provisioning');
      db.prepare(
        'INSERT INTO accounts(id,email,name,salt,password_hash) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name',
      ).run(a.id, a.email.toLowerCase(), a.name, a.salt, a.passwordHash);
    }
    initialized = true;
  }
  return db;
}
export async function railwayUser(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = authDb()
    .prepare(
      'SELECT a.id,a.name FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=? AND s.expires>?',
    )
    .get(hash(token), Date.now());
  return row ? { id: String(row.id), name: String(row.name) } : null;
}
function configuredOrigin() {
  const origin = process.env.LANTERN_ORIGIN;
  if (!origin || !/^https?:\/\//.test(origin))
    throw new Error('LANTERN_ORIGIN is required');
  return new URL(origin).origin;
}
function cookie(value: string, age: number) {
  return `${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${configuredOrigin().startsWith('https:') ? '; Secure' : ''}`;
}
function sessionToken(request: Request) {
  return request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)lantern_session=([a-f0-9]{64})(?:;|$)/)?.[1];
}
function page(error = '', status = 200, change = false) {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${change ? 'Change password' : 'Sign in'} · Lantern Table</title><style>body{margin:0;background:#0c0e0d;color:#eeeade;font:16px system-ui;min-height:100vh;display:grid;place-items:center}main{width:min(340px,calc(100% - 48px));padding:40px 0}h1{font:32px Georgia}p{color:#b7b9b0;line-height:1.6}label{display:block;margin:20px 0 8px}input,button{box-sizing:border-box;width:100%;padding:13px;border-radius:5px;font:inherit}input{border:1px solid #45483d;background:#161915;color:inherit}button{margin-top:24px;border:0;background:#cebd8d;color:#171910;cursor:pointer}a{color:#cebd8d}.error{color:#efb2a8}</style><main><a href="/">Lantern Table</a><h1>${change ? 'Change password' : 'Welcome back.'}</h1><p>${change ? 'Choose a password of 12–200 characters. You will be signed out on all devices afterward.' : 'Sign in to return to your adventures.'}</p>${error ? '<p role="alert" class="error">' + error + '</p>' : ''}<form method="post" action="/api/auth${change ? '?password' : ''}">${change ? '' : '<label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="username" maxlength="254">'}<label for="password">${change ? 'Current password' : 'Password'}</label><input id="password" name="password" type="password" required autocomplete="current-password" maxlength="200">${change ? '<label for="newPassword">New password</label><input id="newPassword" name="newPassword" type="password" required autocomplete="new-password" minlength="12" maxlength="200"><label for="confirmPassword">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" required autocomplete="new-password" minlength="12" maxlength="200">' : ''}<button>${change ? 'Change password' : 'Sign in'}</button></form>${change ? '' : '<p><a href=/api/auth?forgot>Forgot your password?</a></p><p>This is a private table. Ask your host for an account.</p>'}${!change && signupEnabled() ? '<p><a href=/api/auth?signup>Create an account</a></p>' : ''}</main></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  );
}
export async function authGet(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.has('signup') || params.has('verify')) return signupGet(request);
  if (params.has('forgot') || params.has('reset')) return recoveryGet(request);
  if (new URL(request.url).searchParams.has('password')) {
    if (!(await railwayUser(sessionToken(request))))
      return new Response(null, {
        status: 303,
        headers: { Location: '/api/auth', 'Cache-Control': 'no-store' },
      });
    return page('', 200, true);
  }
  if (new URL(request.url).searchParams.has('logout')) {
    const token = request.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)lantern_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (token)
      authDb()
        .prepare('DELETE FROM sessions WHERE token_hash=?')
        .run(hash(token));
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/',
        'Set-Cookie': cookie('', 0),
        'Cache-Control': 'no-store',
      },
    });
  }
  return page(
    new URL(request.url).searchParams.has('changed')
      ? 'Password changed. Sign in with your new password.'
      : '',
  );
}
export async function authPost(request: Request) {
  if (request.headers.get('origin') !== configuredOrigin())
    return new Response('Forbidden', { status: 403 });
  if (Number(request.headers.get('content-length')) > 4096)
    return new Response('Too large', { status: 413 });
  let raw = '';
  if (!request.body) return page('Check your email and password.', 401);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > 4096) {
      await reader.cancel();
      return new Response('Too large', { status: 413 });
    }
    raw += decoder.decode(next.value, { stream: true });
  }
  raw += decoder.decode();
  if (raw.length > 4096) return new Response('Too large', { status: 413 });
  const params = new URL(request.url).searchParams;
  if (params.has('signup') || params.has('verify'))
    return signupPost(authDb(), request, raw);
  if (params.has('forgot') || params.has('reset'))
    return recoveryPost(authDb(), request, raw);
  const change = params.has('password');
  const user = change ? await railwayUser(sessionToken(request)) : null;
  if (change && !user) return page('Sign in to change your password.', 401);
  const form = new URLSearchParams(raw),
    email = change
      ? String(
          authDb()
            .prepare('SELECT email FROM accounts WHERE id=?')
            .get(user!.id)?.email || '',
        )
      : (form.get('email') || '').trim().toLowerCase(),
    password = form.get('password') || '';
  const respond = (message: string, status: number) =>
    page(message, status, change);
  const newPassword = form.get('newPassword') || '';
  if (
    change &&
    (newPassword.length < 12 ||
      newPassword.length > 200 ||
      newPassword !== form.get('confirmPassword') ||
      newPassword === password)
  )
    return respond(
      'Use a different password of 12–200 characters and make sure both new passwords match.',
      400,
    );
  if (email.length > 254 || password.length > 200 || !email || !password)
    return respond('Check your email and password.', 401);
  const db = authDb(),
    now = Date.now();
  db.prepare('DELETE FROM login_attempts WHERE expires<?').run(now);
  const total = db
    .prepare(
      'INSERT INTO login_attempts(email,attempts,expires) VALUES(?,1,?) ON CONFLICT(email) DO UPDATE SET attempts=attempts+1 RETURNING attempts',
    )
    .get('*global*', now + 60000);
  if (Number(total?.attempts) > 100)
    return respond('Sign-in is busy. Please try again shortly.', 429);
  const attempt = db
    .prepare(
      'INSERT INTO login_attempts(email,attempts,expires) VALUES(?,1,?) ON CONFLICT(email) DO UPDATE SET attempts=attempts+1 RETURNING attempts',
    )
    .get(email, now + 15 * 60 * 1000);
  if (Number(attempt?.attempts) > 5)
    return respond('Too many attempts. Try again in 15 minutes.', 429);
  const a = db.prepare('SELECT * FROM accounts WHERE email=?').get(email);
  const derived = (await scrypt(
    password,
    a ? String(a.salt) : '00000000000000000000000000000000',
    64,
  )) as Buffer;
  if (
    !a ||
    !timingSafeEqual(derived, Buffer.from(String(a.password_hash), 'hex'))
  )
    return respond('Check your email and password.', 401);
  if (change) {
    const salt = randomBytes(16).toString('hex');
    const replacement = (await scrypt(newPassword, salt, 64)) as Buffer;
    db.exec('BEGIN IMMEDIATE');
    try {
      const updated = db
        .prepare(
          'UPDATE accounts SET salt=?,password_hash=? WHERE id=? AND password_hash=? AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND expires>?)',
        )
        .run(
          salt,
          replacement.toString('hex'),
          String(a.id),
          String(a.password_hash),
          hash(sessionToken(request)!),
          String(a.id),
          Date.now(),
        );
      if (updated.changes !== 1) {
        db.exec('ROLLBACK');
        return respond('Your session changed. Sign in and try again.', 409);
      }
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(String(a.id));
      db.prepare('DELETE FROM login_attempts WHERE email=?').run(email);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/api/auth?changed',
        'Set-Cookie': cookie('', 0),
        'Cache-Control': 'no-store',
      },
    });
  }
  // A password may have changed while scrypt was running; never mint a stale session.
  if (
    db
      .prepare('SELECT password_hash FROM accounts WHERE id=?')
      .get(String(a.id))?.password_hash !== a.password_hash
  )
    return respond('Check your email and password.', 401);
  db.prepare('DELETE FROM login_attempts WHERE email=?').run(email);
  db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
    hash(token),
    String(a.id),
    now + 30 * 86400000,
  );
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/',
      'Set-Cookie': cookie(token, 30 * 86400),
      'Cache-Control': 'no-store',
    },
  });
}
