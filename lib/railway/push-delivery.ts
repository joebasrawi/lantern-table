import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { pushConfig } from './push-config';
import { validateSubscription } from './push-subscriptions';
import {
  refreshNotifications,
  claimNotification,
  settleNotification,
  type NotificationClaim,
} from './notification-queue';
const running = new WeakSet<DatabaseSync>();
type Sender = typeof webpush.sendNotification;
export async function sendPush(
  subscription: Parameters<Sender>[0],
  payload: Parameters<Sender>[1],
  options: Parameters<Sender>[2],
  transport: typeof fetch = fetch,
) {
  const details = webpush.generateRequestDetails(
    subscription,
    payload ?? undefined,
    options,
  );
  const response = await transport(details.endpoint, {
    method: details.method,
    headers: Object.fromEntries(
      Object.entries(details.headers).map(([key, value]) => [
        key,
        String(value),
      ]),
    ),
    body: details.body ? new Uint8Array(details.body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  const headers = Object.fromEntries(response.headers.entries());
  if (response.body) await response.body.cancel();
  if (!response.ok)
    throw Object.assign(new Error('Push service rejected the request.'), {
      statusCode: response.status,
      headers,
    });
  return { statusCode: response.status, headers, body: '' };
}
function discard(db: DatabaseSync, item: NotificationClaim) {
  return db
    .prepare(`DELETE FROM push_subscriptions WHERE id=? AND EXISTS(
    SELECT 1 FROM push_notifications WHERE subscription_id=? AND campaign_id=? AND claim=?)`)
    .run(item.subscriptionId, item.subscriptionId, item.campaignId, item.claim)
    .changes;
}
function retryAt(headers: unknown, now: number) {
  const value =
    headers && typeof headers === 'object'
      ? (headers as Record<string, unknown>)['retry-after']
      : null;
  if (typeof value !== 'string') return 0;
  const delay = /^\d+$/.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - now;
  return Number.isFinite(delay) && delay > 0
    ? now + Math.min(delay, 86400000)
    : 0;
}
/** Bounded sender; injected transport/clock allow failure tests without contacting players. */
export async function deliverNotifications(
  db: DatabaseSync,
  send: Sender = sendPush,
  now = Date.now,
) {
  const result = { sent: 0, retry: 0, removed: 0, failed: 0 };
  const config = pushConfig();
  if (!config || process.env.LANTERN_PUSH_PAUSED === 'true' || running.has(db))
    return result;
  // On a new installation the auth tables are created on first sign-in.
  if (
    Number(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('accounts','sessions')",
        )
        .get()?.count,
    ) !== 2
  )
    return result;
  running.add(db);
  try {
    refreshNotifications(db, now());
    const started = now();
    for (let count = 0; count < 10 && now() - started < 30000; count++) {
      if (!pushConfig() || process.env.LANTERN_PUSH_PAUSED === 'true') break;
      const item = claimNotification(db, now());
      if (!item) break;
      let subscription;
      try {
        subscription = validateSubscription(JSON.parse(item.subscription));
      } catch {
        result.removed += Number(discard(db, item));
        continue;
      }
      try {
        await send(
          subscription,
          JSON.stringify({ campaignId: item.campaignId }),
          {
            vapidDetails: config,
            contentEncoding: 'aes128gcm',
            TTL: 600,
            timeout: 8000,
            urgency: 'normal',
            topic: createHash('sha256')
              .update(item.campaignId)
              .digest('base64url')
              .slice(0, 32),
          },
        );
        result.sent += Number(settleNotification(db, item, 'sent', now()));
      } catch (error) {
        const status =
          error && typeof error === 'object'
            ? Number((error as { statusCode?: number }).statusCode)
            : 0;
        if (status === 404 || status === 410)
          result.removed += Number(discard(db, item));
        else if (!status || status === 408 || status === 429 || status >= 500) {
          const headers =
            error && typeof error === 'object'
              ? (error as { headers?: unknown }).headers
              : null;
          result.retry += Number(
            settleNotification(
              db,
              item,
              'retry',
              now(),
              retryAt(headers, now()),
            ),
          );
        } else
          result.failed += Number(
            settleNotification(db, item, 'failed', now()),
          );
      }
    }
    return result;
  } finally {
    running.delete(db);
  }
}
