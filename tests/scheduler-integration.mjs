import assert from 'node:assert/strict';
import { getPlatformProxy } from 'wrangler';
import {
  initialState,
  makeCharacter,
  startEncounter,
} from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
const base = process.env.TEST_ORIGIN || 'http://localhost:3001';
const proxy = await getPlatformProxy({
  configPath: 'wrangler.standalone.example.json',
  envFiles: [],
  remoteBindings: false,
  persist: { path: '.wrangler/scheduler-test/v3' },
});
const db = proxy.env.DB,
  id = crypto.randomUUID();
try {
  const s = initialState(
    'Scheduled integration',
    'Fantasy',
    'Explore',
    'Harbor',
    { ...DEFAULT_SETTINGS, pace: 'deadline', absence: 'defend' },
  );
  s.characters.push(
    makeCharacter({ ...PRESETS[0], absenceConsent: true }, 'one', s),
  );
  s.characters.push(
    makeCharacter({ ...PRESETS[1], absenceConsent: true }, 'two', s),
  );
  startEncounter(s, 'Guardian', 1);
  s.encounter.deadline = new Date(0).toISOString();
  await db
    .prepare(
      'INSERT INTO campaigns(id,host_id,invite,state,updated_at) VALUES(?,?,?,?,?)',
    )
    .bind(id, 'one', id, JSON.stringify(s), new Date().toISOString())
    .run();
  const trigger = async () => {
    const r = await fetch(`${base}/cdn-cgi/handler/scheduled`);
    assert.equal(r.status, 200, `Scheduled handler returned ${r.status}`);
  };
  await trigger();
  const row = await db
    .prepare('SELECT state,version,lock FROM campaigns WHERE id=?')
    .bind(id)
    .first();
  assert.equal(row.version, 1);
  assert.equal(row.lock, null);
  assert.equal(JSON.parse(row.state).encounter.index, 1);
  await trigger();
  assert.equal(
    (
      await db
        .prepare('SELECT version FROM campaigns WHERE id=?')
        .bind(id)
        .first()
    ).version,
    1,
  );
  console.log(
    'PASS: actual scheduled Worker persists one consented defensive turn with no logged-in browser.',
  );
} finally {
  await db.prepare('DELETE FROM campaigns WHERE id=?').bind(id).run();
  await proxy.dispose();
}
