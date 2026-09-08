import { currentUser, localNames } from '../../../lib/auth';
import {
  create,
  draft,
  join,
  leave,
  list,
  mutate,
  view,
} from '../../../lib/game/service';
import { GameError } from '../../../lib/game/engine';
export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function error(e: unknown) {
  if (e instanceof GameError) return json({ error: e.message }, e.status);
  console.error(
    'Campaign request failed:',
    e instanceof Error ? e.name : 'Unknown',
  );
  return json(
    { error: 'The campaign could not be loaded or saved. Please try again.' },
    500,
  );
}
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const url = new URL(request.url);
    if (url.searchParams.get('op') === 'session')
      return json({
        user,
        local:
          import.meta.env.DEV &&
          !__LANTERN_STANDALONE__ &&
          !__LANTERN_RAILWAY__,
      });
    if (!user) return json({ error: 'Sign in to play.' }, 401);
    const id = url.searchParams.get('id');
    return json(id ? await view(id, user) : await list(user));
  } catch (e) {
    return error(e);
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('Origin');
    if (
      origin &&
      origin !==
        (__LANTERN_RAILWAY__
          ? process.env.LANTERN_ORIGIN
          : new URL(request.url).origin)
    )
      return json({ error: 'Request origin is not allowed.' }, 403);
    if (Number(request.headers.get('content-length')) > 24000)
      return json({ error: 'That request is too large.' }, 413);
    const raw = await request.text();
    if (raw.length > 24000)
      return json({ error: 'That request is too large.' }, 413);
    let v: Record<string, unknown>;
    try {
      v = JSON.parse(raw);
    } catch {
      return json({ error: 'Invalid request.' }, 400);
    }
    if (!v || typeof v !== 'object' || Array.isArray(v))
      return json({ error: 'Invalid request.' }, 400);
    if (
      v.op === 'localLogin' &&
      import.meta.env.DEV &&
      !__LANTERN_STANDALONE__ &&
      !__LANTERN_RAILWAY__
    ) {
      if (typeof v.id !== 'string' || !localNames[v.id])
        return json({ error: 'Choose a local player.' }, 400);
      return Response.json(
        { ok: true },
        {
          headers: {
            'Set-Cookie': `lantern_local=${v.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
          },
        },
      );
    }
    const user = await currentUser();
    if (!user) return json({ error: 'Sign in to play.' }, 401);
    if (v.op === 'create') return json(await create(user, v));
    if (v.op === 'join') return json(await join(user, v.invite));
    if (v.op === 'leave') return json(await leave(user, v));
    if (v.op === 'draft') return json(await draft(user, v));
    return json(await mutate(user, v));
  } catch (e) {
    return error(e);
  }
}
