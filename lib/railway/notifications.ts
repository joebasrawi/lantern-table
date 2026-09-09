import { pushConfig } from './push-config';
import { createHash } from 'node:crypto';
import { sqlite } from './storage';
import {
  SubscriptionError,
  saveSubscription,
  subscriptionActive,
  removeSubscription,
} from './push-subscriptions';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function notifications(request: Request, userId: string | null) {
  if (!userId) return json({ error: 'Sign in to manage notifications.' }, 401);
  const config = pushConfig();
  const enabled = !!config;
  if (request.method === 'GET')
    return json({
      enabled,
      publicKey: config?.publicKey ?? null,
    });
  if (request.method !== 'POST')
    return json({ error: 'Method not allowed.' }, 405);
  if (
    !process.env.LANTERN_ORIGIN ||
    request.headers.get('origin') !== process.env.LANTERN_ORIGIN
  )
    return json({ error: 'Request origin is not allowed.' }, 403);
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    return json({ error: 'Send a JSON request.' }, 415);
  if (Number(request.headers.get('content-length')) > 4096)
    return json({ error: 'That request is too large.' }, 413);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Invalid request.' }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return json({ error: 'That request is too large.' }, 413);
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return json({ error: 'Invalid request.' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return json({ error: 'Invalid request.' }, 400);
    const db = sqlite();
    // Revocation remains available while delivery is disabled.
    if (body.op === 'remove') {
      removeSubscription(db, userId, body.endpoint);
      return json({ active: false });
    }
    if (body.op === 'status')
      return json({ active: subscriptionActive(db, userId, body.endpoint) });
    if (body.op !== 'subscribe')
      return json({ error: 'Unknown notification action.' }, 400);
    if (body.userId !== userId)
      return json(
        {
          error:
            'Your sign-in changed. Reload the game before enabling notifications.',
        },
        409,
      );
    if (!enabled)
      return json(
        { error: 'Browser notifications are not available yet.' },
        503,
      );
    const token = request.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)lantern_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (!token) return json({ error: 'Sign in to manage notifications.' }, 401);
    saveSubscription(
      db,
      userId,
      body.subscription,
      createHash('sha256').update(token).digest('hex'),
    );
    return json({ active: true });
  } catch (e) {
    if (e instanceof SubscriptionError)
      return json({ error: e.message }, e.status);
    return json({ error: 'Notifications are temporarily unavailable.' }, 500);
  }
}
