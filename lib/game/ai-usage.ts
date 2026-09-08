import { GameError } from './engine';

export function dailyAILimit(value: string | undefined): number {
  if (value === undefined || value === '') return 100;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new GameError(
      'The AI request limit is not configured correctly. The host can use a human DM.',
      503,
    );
  return Number(value);
}

// Reserve before contacting the provider. Failed or interrupted requests still
// count because the provider may have performed billable work.
export async function reserveAIRequest(
  db: D1Database,
  limit: number,
  timestamp = Date.now(),
): Promise<void> {
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new Error('Invalid AI limit');
  if (limit === 0)
    throw new GameError(
      'AI turns are paused by the server owner. No game resources were spent. The host can switch to a human DM.',
      429,
    );
  const day = new Date(timestamp).toISOString().slice(0, 10);
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS ai_daily_usage (id INTEGER PRIMARY KEY CHECK (id = 1), day TEXT NOT NULL, requests INTEGER NOT NULL)',
    )
    .run();
  const reserved = await db
    .prepare(`INSERT INTO ai_daily_usage(id, day, requests) VALUES(1, ?, 1)
    ON CONFLICT(id) DO UPDATE SET day = excluded.day,
      requests = CASE WHEN ai_daily_usage.day < excluded.day THEN 1 ELSE ai_daily_usage.requests + 1 END
    WHERE ai_daily_usage.day < excluded.day OR (ai_daily_usage.day = excluded.day AND ai_daily_usage.requests < ?)`)
    .bind(day, limit)
    .run();
  if (reserved.meta.changes !== 1)
    throw new GameError(
      'The game has reached its daily AI request limit. No game resources were spent. Try after midnight UTC or ask the host to switch to a human DM.',
      429,
    );
}
