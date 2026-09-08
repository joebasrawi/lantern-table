import { applyQueuedSettings, expireTurn, now, uid } from './engine';
import type { CampaignState } from './types';
/** A small batch keeps memory and D1 requests bounded for each cron invocation. */
export async function processDeadlines(db: D1Database) {
  const cutoff = now();
  const rows = await db
    .prepare(`
    SELECT id,state,version FROM campaigns
    WHERE (lock IS NULL OR lock_until < ?)
      AND json_extract(state,'$.settings.pace') = 'deadline'
      AND json_extract(state,'$.settings.absence') = 'defend'
      AND json_extract(state,'$.encounter.deadline') <= ?
      AND EXISTS (
        SELECT 1 FROM json_each(campaigns.state,'$.characters') AS c
        WHERE json_extract(c.value,'$.id') = json_extract(campaigns.state,
          '$.encounter.order[' || json_extract(campaigns.state,'$.encounter.index') || ']')
          AND json_extract(c.value,'$.absenceConsent') = 1
          AND json_extract(c.value,'$.hp') > 0
      )
    ORDER BY json_extract(state,'$.encounter.deadline'), id LIMIT 10
  `)
    .bind(Date.now(), cutoff)
    .all<{ id: string; state: string; version: number }>();
  const result = { processed: 0, skipped: 0, failed: 0 };
  for (const row of rows.results) {
    const lock = uid();
    try {
      const acquired = await db
        .prepare(
          'UPDATE campaigns SET lock=?,lock_until=? WHERE id=? AND version=? AND (lock IS NULL OR lock_until<?)',
        )
        .bind(lock, Date.now() + 90000, row.id, row.version, Date.now())
        .run();
      if (acquired.meta.changes !== 1) {
        result.skipped++;
        continue;
      }
      const state = JSON.parse(row.state) as CampaignState;
      if (!expireTurn(state)) {
        result.skipped++;
        continue;
      }
      applyQueuedSettings(state);
      const serialized = JSON.stringify(state);
      if (serialized.length > 800000)
        throw new Error('Campaign storage limit reached.');
      const saved = await db
        .prepare(
          'UPDATE campaigns SET state=?,version=version+1,updated_at=?,lock=NULL,lock_until=0 WHERE id=? AND version=? AND lock=?',
        )
        .bind(serialized, now(), row.id, row.version, lock)
        .run();
      if (saved.meta.changes === 1) result.processed++;
      else result.skipped++;
    } catch {
      result.failed++;
    } finally {
      await db
        .prepare(
          'UPDATE campaigns SET lock=NULL,lock_until=0 WHERE id=? AND lock=?',
        )
        .bind(row.id, lock)
        .run();
    }
  }
  return result;
}
