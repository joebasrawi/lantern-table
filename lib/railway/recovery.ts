import { randomBytes, createHash, scrypt as derive } from 'node:crypto';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
const scrypt = promisify(derive);
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
const configured = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.LANTERN_MAIL_FROM);
function tables(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS password_resets(user_id TEXT PRIMARY KEY REFERENCES accounts(id),token_hash TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS recovery_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL);`);
}
function allowed(
  db: DatabaseSync,
  key: string,
  limit: number,
  duration: number,
) {
  db.prepare('DELETE FROM recovery_attempts WHERE expires<=?').run(Date.now());
  const row = db
    .prepare(
      'INSERT INTO recovery_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts',
    )
    .get(key, Date.now() + duration);
  return Number(row?.attempts) <= limit;
}
function page(content: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account · Lantern Table</title><style>body{margin:0;background:#0c0e0d;color:#eeeade;font:16px system-ui;min-height:100vh;display:grid;place-items:center}main{width:min(340px,calc(100% - 48px));padding:32px 0}h1{font-size:28px}p{line-height:1.6;color:#b7b9b0}label{display:block;margin:20px 0 8px}input,button{box-sizing:border-box;width:100%;padding:13px;border-radius:5px;font:inherit}input{border:1px solid #45483d;background:#161915;color:inherit}button{margin-top:24px;border:0;background:#cebd8d;color:#171910;cursor:pointer}a{color:#cebd8d}</style><main><a href="/api/auth">Back to sign in</a>${content}</main></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  );
}
const confirmation = () =>
  page(
    '<h1>Check your email</h1><p>If an account matches that email, a reset link will arrive shortly. The link expires in 30 minutes. Check your spam folder too.</p>',
  );
export function recoveryGet(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has('reset')) {
    const token = url.searchParams.get('reset') || '';
    if (!/^[a-f0-9]{64}$/.test(token))
      return page(
        '<h1>Invalid reset link</h1><p>Request a new password reset from the sign-in page.</p>',
        400,
      );
    // Only a validated hex token is interpolated. Merely opening a link never consumes it.
    return page(
      `<h1>Reset your password</h1><p>Choose a password of 12–200 characters. You will be signed out on all devices.</p><form method="post" action="/api/auth?reset"><input type="hidden" name="token" value="${token}"><label for="newPassword">New password</label><input id="newPassword" name="newPassword" type="password" required minlength="12" maxlength="200" autocomplete="new-password"><label for="confirmPassword">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" required minlength="12" maxlength="200" autocomplete="new-password"><button>Reset password</button></form>`,
    );
  }
  if (!configured())
    return page(
      '<h1>Password recovery</h1><p>Email recovery is not available yet. Contact your host for help with your account.</p>',
      503,
    );
  return page(
    '<h1>Forgot your password?</h1><p>Enter the email address you use to play.</p><form method="post" action="/api/auth?forgot"><label for="email">Email</label><input id="email" name="email" type="email" required maxlength="254" autocomplete="username"><button>Send reset link</button></form>',
  );
}
export async function recoveryPost(
  db: DatabaseSync,
  request: Request,
  raw: string,
) {
  if (
    request.headers.get('origin') !==
    new URL(process.env.LANTERN_ORIGIN!).origin
  )
    return new Response('Forbidden', { status: 403 });
  tables(db);
  const form = new URLSearchParams(raw);
  if (new URL(request.url).searchParams.has('forgot')) {
    if (!configured()) return recoveryGet(request);
    const email = (form.get('email') || '').trim().toLowerCase();
    if (!email || email.length > 254) return confirmation();
    if (
      !allowed(db, 'send:global', 20, 60000) ||
      !allowed(db, 'send:' + digest(email), 3, 15 * 60000)
    )
      return confirmation();
    const account = db
      .prepare('SELECT id,password_hash FROM accounts WHERE email=?')
      .get(email);
    if (!account) return confirmation();
    const token = randomBytes(32).toString('hex'),
      tokenHash = digest(token);
    db.prepare('DELETE FROM password_resets WHERE expires<=?').run(Date.now());
    db.prepare(
      'INSERT INTO password_resets VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,password_hash=excluded.password_hash,expires=excluded.expires',
    ).run(
      String(account.id),
      tokenHash,
      String(account.password_hash),
      Date.now() + 30 * 60000,
    );
    try {
      const link = new URL('/api/auth', process.env.LANTERN_ORIGIN);
      link.searchParams.set('reset', token);
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'password-reset-' + tokenHash,
        },
        body: JSON.stringify({
          from: process.env.LANTERN_MAIL_FROM,
          to: [email],
          subject: 'Reset your Lantern Table password',
          text: `Use this link to choose a new password:\n\n${link}\n\nThis link expires in 30 minutes and works once. If you did not request this, you can ignore this email.`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!sent.ok) throw new Error('Mail rejected');
    } catch {
      db.prepare('DELETE FROM password_resets WHERE token_hash=?').run(
        tokenHash,
      );
      console.error('Password recovery email could not be sent.');
    }
    return confirmation();
  }
  if (!allowed(db, 'reset:global', 100, 60000))
    return page('<h1>Please try again shortly</h1>', 429);
  const token = form.get('token') || '',
    password = form.get('newPassword') || '';
  if (!/^[a-f0-9]{64}$/.test(token))
    return page('<h1>Invalid reset link</h1><p>Request a new link.</p>', 400);
  if (
    password.length < 12 ||
    password.length > 200 ||
    password !== form.get('confirmPassword')
  )
    return page(
      '<h1>Passwords do not match</h1><p>Use matching passwords of 12–200 characters. Reopen your reset link to try again.</p>',
      400,
    );
  const row = db
    .prepare(
      'SELECT r.user_id,r.password_hash FROM password_resets r JOIN accounts a ON a.id=r.user_id AND a.password_hash=r.password_hash WHERE r.token_hash=? AND r.expires>?',
    )
    .get(digest(token), Date.now());
  if (!row)
    return page(
      '<h1>This link has expired or was already used</h1><p>Request a new reset link.</p>',
      400,
    );
  const salt = randomBytes(16).toString('hex'),
    replacement = (await scrypt(password, salt, 64)) as Buffer;
  db.exec('BEGIN IMMEDIATE');
  try {
    const updated = db
      .prepare(
        'UPDATE accounts SET salt=?,password_hash=? WHERE id=? AND password_hash=? AND EXISTS(SELECT 1 FROM password_resets WHERE user_id=? AND token_hash=? AND expires>?)',
      )
      .run(
        salt,
        replacement.toString('hex'),
        String(row.user_id),
        String(row.password_hash),
        String(row.user_id),
        digest(token),
        Date.now(),
      );
    if (updated.changes !== 1) {
      db.exec('ROLLBACK');
      return page(
        '<h1>This link is no longer valid</h1><p>Request a new link.</p>',
        400,
      );
    }
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(String(row.user_id));
    db.prepare(
      'DELETE FROM login_attempts WHERE email=(SELECT email FROM accounts WHERE id=?)',
    ).run(String(row.user_id));
    db.prepare('DELETE FROM password_resets WHERE user_id=?').run(
      String(row.user_id),
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/api/auth?changed',
      'Cache-Control': 'no-store',
      'Set-Cookie': `lantern_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${new URL(process.env.LANTERN_ORIGIN!).protocol === 'https:' ? '; Secure' : ''}`,
    },
  });
}

export {
  page as accountPage,
  allowed as accountRateLimit,
  configured as mailConfigured,
};
