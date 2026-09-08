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
  const enabled =
    process.env.LANTERN_PUSH_ENABLED === 'true' &&
    !!process.env.LANTERN_VAPID_PUBLIC_KEY &&
    !!process.env.LANTERN_VAPID_PRIVATE_KEY;
  if (request.method === 'GET')
    return json({
      enabled,
      publicKey: enabled ? process.env.LANTERN_VAPID_PUBLIC_KEY : null,
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
    if (!enabled)
      return json(
        { error: 'Browser notifications are not available yet.' },
        503,
      );
    saveSubscription(db, userId, body.subscription);
    return json({ active: true });
  } catch (e) {
    if (e instanceof SubscriptionError)
      return json({ error: e.message }, e.status);
    return json({ error: 'Notifications are temporarily unavailable.' }, 500);
  }
}
