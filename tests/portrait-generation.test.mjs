import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  portraitPrompt,
  imageDailyLimit,
  reservePortrait,
  generatePortraitImage,
} from '../.test-build/portrait-generation.js';
import { initialState, makeCharacter } from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
const root = mkdtempSync(join(tmpdir(), 'lantern-portrait-generation-'));
process.env.LANTERN_DATA_DIR = root;
const { db, sqlite } = await import('../.test-build/railway/storage.js');
await test('portrait prompts use public character appearance and exclude private notes', () => {
  const s = initialState(
      'Test',
      'A moon colony',
      'Story',
      'Harbor',
      DEFAULT_SETTINGS,
    ),
    c = makeCharacter(PRESETS[0], 'one', s);
  c.notes = 'PRIVATE SELF';
  c.dmNotes = 'PRIVATE DM';
  c.concept = 'Silver-haired space explorer';
  const prompt = portraitPrompt(c, s.setting);
  assert.match(prompt, /Silver-haired space explorer/);
  assert.match(prompt, /moon colony/);
  assert.ok(!prompt.includes('PRIVATE'));
  assert.equal(imageDailyLimit(undefined), 10);
  assert.equal(imageDailyLimit('0'), 0);
  assert.throws(() => imageDailyLimit('-1'));
});
await test('portrait generation uses one compressed image and rejects failed or invalid responses', async () => {
  // A bounded JPEG header fixture exercises the existing metadata validator;
  // full image rendering is checked separately using real provider output.
  const header = Uint8Array.from([
    255, 216, 255, 192, 0, 17, 8, 0, 32, 0, 32, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0,
    255, 217, 0,
  ]);
  let calls = 0;
  const data = await generatePortraitImage(
    'test-placeholder',
    'gpt-image-1-mini',
    'Portrait',
    async (url, opts) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/images/generations');
      const body = JSON.parse(opts.body);
      assert.equal(body.n, 1);
      assert.equal(body.output_format, 'jpeg');
      assert.equal(body.output_compression, 65);
      return Response.json({
        data: [{ b64_json: Buffer.from(header).toString('base64') }],
      });
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(new Uint8Array(data), header);
  await assert.rejects(
    generatePortraitImage(
      'test',
      'test',
      'test',
      async () => new Response('', { status: 400 }),
    ),
    /could not create/,
  );
  await assert.rejects(
    generatePortraitImage('test', 'test', 'test', async () =>
      Response.json({ data: [{ b64_json: 'invalid' }] }),
    ),
  );
  await assert.rejects(
    generatePortraitImage(
      'test',
      'test',
      'test',
      async () => new Response('x'.repeat(1000001)),
    ),
    /too large/,
  );
});
await test('portrait locks prevent simultaneous account requests and persistent daily reservations count failures', async () => {
  try {
    const day = Date.parse('2026-09-08T12:00:00Z');
    await assert.rejects(reservePortrait(db, 'one', 0, day), /paused/);
    const release = await reservePortrait(db, 'one', 2, day);
    await assert.rejects(reservePortrait(db, 'one', 2, day), /already being/);
    await release(); // A failed provider attempt still consumes its reservation.
    const next = await reservePortrait(db, 'two', 2, day);
    await next();
    await assert.rejects(reservePortrait(db, 'three', 2, day), /used up/);
    const tomorrow = await reservePortrait(db, 'one', 2, day + 86400000);
    await tomorrow();
    assert.equal(
      sqlite().prepare('SELECT requests FROM portrait_daily_usage').get()
        .requests,
      1,
    );
    const stale = await reservePortrait(db, 'two', 10, day + 86400000);
    const replacement = await reservePortrait(
      db,
      'two',
      10,
      day + 86400000 + 120001,
    );
    await stale();
    await assert.rejects(
      reservePortrait(db, 'two', 10, day + 86400000 + 120002),
      /already being/,
    );
    await replacement();
  } finally {
    sqlite().close();
    rmSync(root, { recursive: true, force: true });
  }
});
