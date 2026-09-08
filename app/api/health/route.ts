import { database } from '../../../db';
export async function GET() {
  try {
    await database().prepare('SELECT 1 AS ok').first();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
