import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { dailyAILimit, reserveAIRequest } from '../.test-build/ai-usage.js';
const root = mkdtempSync(join(tmpdir(), 'lantern-ai-usage-'));
process.env.LANTERN_DATA_DIR = root;
const { db, sqlite } = await import('../.test-build/railway/storage.js');
const day = Date.parse('2026-09-08T12:00:00Z');

await test('AI request limits reject invalid configuration and allow explicit pause', async () => {
  assert.equal(dailyAILimit(undefined), 100);
  assert.equal(dailyAILimit('0'), 0);
  assert.equal(dailyAILimit('250'), 250);
  for (const value of ['-1', '1.5', 'Infinity', 'abc', '9007199254740992'])
    assert.throws(() => dailyAILimit(value), /not configured/);
  await assert.rejects(reserveAIRequest(db, 0, day), /paused/);
});

await test('AI reservations cap competing requests, survive process restart, and reset only on a later UTC day', async () => {
  try {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => reserveAIRequest(db, 5, day)),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 15);
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { db } from './.test-build/railway/storage.js';
      import { reserveAIRequest } from './.test-build/ai-usage.js';
      try { await reserveAIRequest(db, 5, ${day}); process.exit(1); }
      catch (e) { if (e.status !== 429) throw e; }
    `,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result, '');
    await reserveAIRequest(db, 6, day); // Owner can increase today's allowance.
    await assert.rejects(
      reserveAIRequest(db, 3, day),
      /daily AI request limit/,
    );
    await reserveAIRequest(db, 5, Date.parse('2026-09-09T00:00:00Z'));
    await assert.rejects(
      reserveAIRequest(db, 5, day),
      /daily AI request limit/,
    );
    assert.deepEqual(
      { ...sqlite().prepare('SELECT day, requests FROM ai_daily_usage').get() },
      { day: '2026-09-09', requests: 1 },
    );
  } finally {
    sqlite().close();
    rmSync(root, { recursive: true, force: true });
  }
});
