import { currentUser } from '../../../../lib/auth';
import { generateSceneArtwork } from '../../../../lib/game/service';
import { GameError, text } from '../../../../lib/game/engine';
export const dynamic = 'force-dynamic';
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
    if (!user) throw new GameError('Sign in to generate scene artwork.', 401);
    const id = text(
      new URL(request.url).searchParams.get('campaign'),
      'Campaign',
      100,
    );
    const data = await generateSceneArtwork(user, id);
    return new Response(data, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof GameError
            ? error.message
            : 'The scene could not be generated. Your current artwork is unchanged.',
      },
      {
        status: error instanceof GameError ? error.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
