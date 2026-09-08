import { createHash, ECDH } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { notificationTables } from './notification-queue';

export class SubscriptionError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export type BrowserSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
export function subscriptionEndpoint(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048)
    throw new SubscriptionError('Invalid browser subscription.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SubscriptionError('Invalid browser subscription.');
  }
  const allowed =
    url.hostname === 'fcm.googleapis.com' ||
    url.hostname === 'updates.push.services.mozilla.com' ||
    /^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname);
  if (
    !allowed ||
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname === '/'
  )
    throw new SubscriptionError(
      'This browser’s push service is not supported.',
    );
  return url.href;
}
export function validateSubscription(value: unknown): BrowserSubscription {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SubscriptionError('Invalid browser subscription.');
  const input = value as Record<string, unknown>;
  const endpoint = subscriptionEndpoint(input.endpoint);
  const keys = input.keys as Record<string, unknown> | undefined;
  function key(name: string, length: number) {
    const v = keys?.[name];
    if (typeof v !== 'string' || !/^[A-Za-z0-9_-]+$/.test(v) || v.length > 100)
      throw new SubscriptionError('Invalid browser encryption keys.');
    const decoded = Buffer.from(v, 'base64url');
    if (decoded.length !== length || decoded.toString('base64url') !== v)
      throw new SubscriptionError('Invalid browser encryption keys.');
    return v;
  }
  const p256dh = key('p256dh', 65),
    auth = key('auth', 16);
  try {
    const point = Buffer.from(p256dh, 'base64url');
    if (point[0] !== 4) throw new Error();
    ECDH.convertKey(point, 'prime256v1');
  } catch {
    throw new SubscriptionError('Invalid browser encryption keys.');
  }
  return { endpoint, keys: { p256dh, auth } };
}
const identity = (endpoint: string) =>
  createHash('sha256').update(endpoint).digest('hex');
export function saveSubscription(
  db: DatabaseSync,
  userId: string,
  input: unknown,
  sessionHash: string,
  now = Date.now(),
) {
  const subscription = validateSubscription(input);
  const id = identity(subscription.endpoint);
  notificationTables(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (
      !db
        .prepare(
          'SELECT token_hash FROM sessions WHERE token_hash=? AND user_id=? AND expires>?',
        )
        .get(sessionHash, userId, now)
    )
      throw new SubscriptionError('Sign in to manage notifications.', 401);
    const prior = db
      .prepare('SELECT user_id,subscription FROM push_subscriptions WHERE id=?')
      .get(id);
    if (prior && prior.user_id !== userId)
      throw new SubscriptionError(
        'Remove this browser’s previous subscription and try again.',
        409,
      );
    if (
      !prior &&
      Number(
        db
          .prepare(
            'SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id=?',
          )
          .get(userId)?.count,
      ) >= 8
    )
      throw new SubscriptionError(
        'Remove a registered browser before adding another.',
        409,
      );
    const serialized = JSON.stringify(subscription);
    if (prior && prior.subscription !== serialized)
      throw new SubscriptionError(
        'Renew this browser’s subscription before registering it again.',
        409,
      );
    db.prepare(
      'INSERT INTO push_subscriptions(id,user_id,subscription,created_at,session_hash) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET session_hash=excluded.session_hash',
    ).run(id, userId, serialized, now, sessionHash);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
export function subscriptionActive(
  db: DatabaseSync,
  userId: string,
  endpoint: unknown,
) {
  const id = identity(subscriptionEndpoint(endpoint));
  notificationTables(db);
  return !!db
    .prepare('SELECT id FROM push_subscriptions WHERE id=? AND user_id=?')
    .get(id, userId);
}
export function removeSubscription(
  db: DatabaseSync,
  userId: string,
  endpoint: unknown,
) {
  const id = identity(subscriptionEndpoint(endpoint));
  notificationTables(db);
  db.prepare('DELETE FROM push_subscriptions WHERE id=? AND user_id=?').run(
    id,
    userId,
  );
}
