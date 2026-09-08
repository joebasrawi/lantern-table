import { currentUser } from '../../../lib/auth';
import { readPortrait, uploadPortrait } from '../../../lib/game/service';
import { GameError, text } from '../../../lib/game/engine';
import { MAX_PORTRAIT_BYTES } from '../../../lib/game/portrait';
export const dynamic = 'force-dynamic';
function fail(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof GameError
          ? e.message
          : 'Portrait storage is temporarily unavailable.',
    },
    {
      status: e instanceof GameError ? e.status : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user) throw new GameError('Sign in to view portraits.', 401);
    const u = new URL(request.url);
    const object = await readPortrait(
      user,
      text(u.searchParams.get('campaign'), 'Campaign', 100),
      text(u.searchParams.get('asset'), 'Portrait', 100),
    );
    return new Response(object.body, {
      headers: {
        'Content-Type':
          object.httpMetadata?.contentType || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return fail(e);
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
      throw new GameError('Request origin is not allowed.', 403);
    const user = await currentUser();
    if (!user) throw new GameError('Sign in to upload a portrait.', 401);
    const id = text(
      new URL(request.url).searchParams.get('campaign'),
      'Campaign',
      100,
    );
    if (Number(request.headers.get('Content-Length')) > MAX_PORTRAIT_BYTES)
      throw new GameError('Portraits must be smaller than 512 KB.', 413);
    if (!request.body) throw new GameError('Choose an image.');
    const reader = request.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PORTRAIT_BYTES) {
        await reader.cancel();
        throw new GameError('Portraits must be smaller than 512 KB.', 413);
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    const result = await uploadPortrait(
      user,
      id,
      bytes.buffer,
      request.headers.get('Content-Type')?.split(';')[0] || '',
    );
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
}
