import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { processDeadlines } from '../.test-build/scheduler.js';
import {
  initialState,
  makeCharacter,
  startEncounter,
  expireTurn,
} from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
function state() {
  const s = initialState('Deadlines', 'Fantasy', 'Explore', 'Harbor', {
    ...DEFAULT_SETTINGS,
    pace: 'deadline',
    absence: 'defend',
  });
  s.characters.push(
    makeCharacter({ ...PRESETS[0], absenceConsent: true }, 'one', s),
  );
  s.characters.push(
    makeCharacter({ ...PRESETS[1], absenceConsent: true }, 'two', s),
  );
  startEncounter(s, 'Guardian', 1);
  s.encounter.deadline = new Date(0).toISOString();
  return s;
}
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('drizzle/0000_high_rhodey.sql', 'utf8'));
  const db = {
    beforeAcquire: null,
    prepare(query) {
      let values = [];
      const statement = {
        bind(...v) {
          values = v;
          return statement;
        },
        async all() {
          return { results: sql.prepare(query).all(...values) };
        },
        async run() {
          if (
            query.startsWith('UPDATE campaigns SET lock=?,') &&
            db.beforeAcquire
          ) {
            const hook = db.beforeAcquire;
            db.beforeAcquire = null;
            hook();
          }
          const r = sql.prepare(query).run(...values);
          return { meta: { changes: Number(r.changes) } };
        },
      };
      return statement;
    },
  };
  return {
    db,
    sql,
    add(id, s = state(), lock = null, lockUntil = 0) {
      sql
        .prepare(
          'INSERT INTO campaigns(id,host_id,invite,state,updated_at,lock,lock_until) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          id,
          'one',
          id,
          JSON.stringify(s),
          new Date().toISOString(),
          lock,
          lockUntil,
        );
    },
    get(id) {
      const r = sql.prepare('SELECT * FROM campaigns WHERE id=?').get(id);
      return { ...r, state: JSON.parse(r.state) };
    },
  };
}
await test('deadline SQL selects consented expired turns and preserves everyone else', async () => {
  const d = database();
  d.add('due');
  const no = state();
  no.characters.forEach((c) => (c.absenceConsent = false));
  d.add('no-consent', no);
  const future = state();
  future.encounter.deadline = new Date(Date.now() + 86400000).toISOString();
  d.add('future', future);
  const wait = state();
  wait.settings.pace = 'wait';
  d.add('wait', wait);
  d.add('busy', state(), 'player-lock', Date.now() + 90000);
  assert.deepEqual(await processDeadlines(d.db), {
    processed: 1,
    skipped: 0,
    failed: 0,
  });
  assert.equal(d.get('due').version, 1);
  assert.equal(d.get('due').state.encounter.index, 1);
  assert.equal(d.get('due').lock, null);
  for (const id of ['no-consent', 'future', 'wait', 'busy'])
    assert.equal(d.get(id).version, 0);
  assert.equal((await processDeadlines(d.db)).processed, 0);
  d.sql.close();
});
await test('a player write winning the race prevents the scheduler from applying a stale turn', async () => {
  const d = database();
  d.add('race');
  d.db.beforeAcquire = () =>
    d.sql.prepare('UPDATE campaigns SET version=1 WHERE id=?').run('race');
  assert.equal((await processDeadlines(d.db)).skipped, 1);
  assert.equal(d.get('race').state.encounter.index, 0);
  assert.equal(d.get('race').version, 1);
  d.sql.close();
});
await test('overlapping scheduler runs save each expired turn once', async () => {
  const d = database();
  d.add('race');
  const result = await Promise.all([
    processDeadlines(d.db),
    processDeadlines(d.db),
  ]);
  assert.equal(
    result.reduce((n, r) => n + r.processed, 0),
    1,
  );
  assert.equal(d.get('race').version, 1);
  d.sql.close();
});
await test('bounded batches eventually reach all eligible campaigns, excluding old unconsented turns', async () => {
  const d = database();
  for (let i = 0; i < 12; i++) d.add(`due-${i}`);
  assert.equal((await processDeadlines(d.db)).processed, 10);
  assert.equal((await processDeadlines(d.db)).processed, 2);
  d.sql.close();
});
await test('failed saves release only their own lease and preserve the previous state', async () => {
  const d = database();
  const s = state();
  s.dmNotes = 'x'.repeat(800001);
  d.add('large', s);
  assert.equal((await processDeadlines(d.db)).failed, 1);
  assert.equal(d.get('large').lock, null);
  assert.equal(d.get('large').version, 0);
  assert.equal(d.get('large').state.encounter.index, 0);
  d.sql.close();
});
await test('invalid deadlines and disabled pace cannot trigger a defensive action', () => {
  const s = state();
  s.encounter.deadline = 'invalid';
  assert.equal(expireTurn(s), false);
  s.encounter.deadline = new Date(0).toISOString();
  s.settings.pace = 'wait';
  assert.equal(expireTurn(s), false);
});
