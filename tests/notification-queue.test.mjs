import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { notificationCue } from '../.test-build/notification-cue.js';
import {
  notificationTables,
  refreshNotifications,
  claimNotification,
  settleNotification,
} from '../.test-build/railway/notification-queue.js';
import {
  initialState,
  makeCharacter,
  startEncounter,
} from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
function setup(t, path = ':memory:') {
  const db = new DatabaseSync(path);
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE accounts(id TEXT PRIMARY KEY);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);
    CREATE TABLE campaigns(id TEXT PRIMARY KEY,host_id TEXT,state TEXT);
    CREATE TABLE members(campaign_id TEXT,user_id TEXT,PRIMARY KEY(campaign_id,user_id),
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE);
    INSERT INTO accounts VALUES('one'),('two'),('host'),('outsider');
    INSERT INTO sessions SELECT id,id,9999999999999 FROM accounts;`);
  notificationTables(db);
  const state = initialState(
    'SECRET TITLE',
    'SECRET WORLD',
    'SECRET PREMISE',
    'SECRET LOCATION',
    { ...DEFAULT_SETTINGS, dm: 'human' },
  );
  state.dmNotes = 'SECRET DM NOTES';
  state.characters = [
    makeCharacter(PRESETS[0], 'one', state),
    makeCharacter(PRESETS[1], 'two', state),
  ];
  state.decision = {
    id: 'vote-a',
    question: 'SECRET QUESTION',
    options: ['SECRET OPTION'],
    votes: {},
    deadline: null,
  };
  db.prepare('INSERT INTO campaigns VALUES(?,?,?)').run(
    'campaign',
    'host',
    JSON.stringify(state),
  );
  for (const user of ['one', 'two', 'host'])
    db.prepare('INSERT INTO members VALUES(?,?)').run('campaign', user);
  for (const user of ['one', 'two', 'host', 'outsider'])
    db.prepare(
      'INSERT INTO push_subscriptions(id,user_id,subscription,created_at,session_hash) VALUES(?,?,?,?,?)',
    ).run(user + '-browser', user, '{}', 0, user);
  const save = () =>
    db.prepare('UPDATE campaigns SET state=?').run(JSON.stringify(state));
  const rows = () =>
    db
      .prepare('SELECT * FROM push_notifications ORDER BY subscription_id')
      .all();
  return { db, state, save, rows };
}
await test('cue identities follow actual turns and decisions, excluding authored text and onboarding', (t) => {
  const { state } = setup(t);
  const before = structuredClone(state);
  const first = notificationCue(state, 'one', false);
  assert.deepEqual(state, before);
  assert.doesNotMatch(JSON.stringify(first), /SECRET/);
  state.events.push({
    id: 'chat',
    kind: 'chat',
    text: 'SECRET CHAT',
    at: 'later',
    author: 'Someone',
  });
  state.seen.one = 'later';
  state.decision.deadline = 'changed';
  state.decision.votes.two = 0;
  assert.deepEqual(notificationCue(state, 'one', false), first);
  state.decision.votes.one = 0;
  assert.equal(notificationCue(state, 'one', false), null);
  state.decision = null;
  assert.equal(notificationCue(state, 'outsider', false), null);
  startEncounter(state, 'SECRET ENEMY', 1);
  const current = state.characters.find(
    (c) => c.id === state.encounter.order[0],
  );
  const combat = notificationCue(state, current.userId, false);
  state.encounter.enemies[0].hp--;
  assert.deepEqual(notificationCue(state, current.userId, false), combat);
  state.encounter.round++;
  assert.notEqual(
    notificationCue(state, current.userId, false).key,
    combat.key,
  );
  const priorEncounter = notificationCue(state, current.userId, false).key;
  state.encounter = null;
  startEncounter(state, 'SECRET ENEMY', 1);
  assert.notEqual(
    notificationCue(state, current.userId, false).key,
    priorEncounter,
  );
});
await test('human and assisted DM cues group additional unresolved actions; host roles are enforced', (t) => {
  const { state } = setup(t);
  state.decision = null;
  state.pending = [{ id: 'pending-a', userId: 'one', text: 'SECRET ACTION' }];
  const first = notificationCue(state, 'host', true);
  assert.equal(first.label, 'Resolve player actions');
  state.pending.push({ id: 'pending-b', userId: 'two', text: 'SECRET SECOND' });
  state.settings.dm = 'assisted';
  assert.deepEqual(notificationCue(state, 'host', true), first);
  assert.equal(notificationCue(state, 'host', false), null);
  state.pending.shift();
  assert.notEqual(notificationCue(state, 'host', true).key, first.key);
  state.settings.dm = 'ai';
  assert.equal(notificationCue(state, 'host', true), null);
  state.characters[0].abilities = [
    { id: 'ability-a', name: 'SECRET', approved: false },
  ];
  assert.equal(
    notificationCue(state, 'host', true).label,
    'Review proposed abilities',
  );
  state.characters[0].abilities[0].approved = true;
  state.hostOffer = { from: 'host', to: 'two' };
  assert.equal(
    notificationCue(state, 'two', false).label,
    'Host handoff awaiting your reply',
  );
});
await test('only subscribed members with unfinished work are queued, with stable deduplication', (t) => {
  const { db, state, save, rows } = setup(t);
  refreshNotifications(db, 0);
  assert.equal(rows().length, 2);
  assert.deepEqual(
    rows().map((r) => r.user_id),
    ['one', 'two'],
  );
  assert.doesNotMatch(JSON.stringify(rows()), /SECRET/);
  const item = claimNotification(db, 0);
  assert.equal(item.subscriptionId, 'one-browser');
  settleNotification(db, item, 'sent', 0);
  state.seen.one = 'read';
  save();
  refreshNotifications(db, 1);
  assert.equal(rows()[0].status, 'sent');
  const second = claimNotification(db, 1);
  assert.equal(second.subscriptionId, 'two-browser');
  settleNotification(db, second, 'sent', 1);
  assert.equal(claimNotification(db, 2), null);
  state.decision.id = 'vote-b';
  save();
  refreshNotifications(db, 3);
  assert.equal(rows()[0].status, 'pending');
  assert.equal(rows()[0].attempts, 0);
});
await test('claim rechecks committed votes and host changes even before the next reconciliation', (t) => {
  const { db, state, save } = setup(t);
  refreshNotifications(db, 0);
  state.decision.votes.one = 0;
  save();
  assert.equal(claimNotification(db, 0).subscriptionId, 'two-browser');
  assert.equal(claimNotification(db, 1), null);
  state.settings.decision = 'host';
  save();
  refreshNotifications(db, 2);
  db.prepare('UPDATE campaigns SET host_id=?').run('two');
  assert.equal(claimNotification(db, 2), null);
  refreshNotifications(db, 3);
  assert.equal(claimNotification(db, 3).subscriptionId, 'two-browser');
});
await test('leaving, unsubscribing and account deletion cascade queued work', (t) => {
  const { db, rows } = setup(t);
  refreshNotifications(db, 0);
  db.prepare('DELETE FROM members WHERE user_id=?').run('one');
  assert.equal(rows().length, 1);
  db.prepare('DELETE FROM accounts WHERE id=?').run('two');
  assert.equal(rows().length, 0);
  assert.equal(
    db.prepare('SELECT id FROM push_subscriptions WHERE user_id=?').get('two'),
    undefined,
  );
  db.prepare('INSERT INTO members VALUES(?,?)').run('campaign', 'one');
  refreshNotifications(db, 1);
  db.prepare('DELETE FROM push_subscriptions WHERE id=?').run('one-browser');
  assert.equal(rows().length, 0);
  assert.equal(claimNotification(db, 2), null);
});
await test('leased work retries after a crash, and obsolete responses cannot settle replacement claims or turns', (t) => {
  const { db, state, save, rows } = setup(t);
  db.prepare('DELETE FROM push_subscriptions WHERE id!=?').run('one-browser');
  refreshNotifications(db, 0);
  const first = claimNotification(db, 0);
  assert.equal(claimNotification(db, 119999), null);
  const retry = claimNotification(db, 120000);
  assert.notEqual(retry.claim, first.claim);
  assert.equal(settleNotification(db, first, 'sent', 120001), 0);
  state.decision.id = 'vote-b';
  save();
  refreshNotifications(db, 120002);
  assert.equal(settleNotification(db, retry, 'sent', 120003), 0);
  assert.equal(rows()[0].status, 'pending');
  const next = claimNotification(db, 120004);
  assert.equal(settleNotification(db, next, 'retry', 120005), 1);
  assert.equal(claimNotification(db, 120006), null);
  assert.equal(rows()[0].next_attempt, 240005);
  assert.ok(claimNotification(db, 240005));
});
await test('delivery failures and crashed senders stop after five attempts rather than buzzing forever', (t) => {
  const { db, rows } = setup(t);
  db.prepare('DELETE FROM push_subscriptions WHERE id!=?').run('one-browser');
  refreshNotifications(db, 0);
  for (let i = 0; i < 5; i++) {
    const at = i * 4000000;
    const item = claimNotification(db, at);
    assert.ok(item);
    settleNotification(db, item, 'retry', at);
  }
  refreshNotifications(db, 20000000);
  assert.equal(rows()[0].status, 'failed');
  assert.equal(claimNotification(db, 20000000), null);
  db.prepare(
    "UPDATE push_notifications SET status='inflight',claim='crashed',next_attempt=0",
  ).run();
  assert.equal(claimNotification(db, 20000000), null);
  assert.equal(rows()[0].status, 'failed');
});
await test('a malformed campaign cannot queue an alert or block healthy campaigns', (t) => {
  const { db, rows } = setup(t);
  db.prepare('INSERT INTO campaigns VALUES(?,?,?)').run(
    'broken',
    'host',
    '{broken',
  );
  db.prepare('INSERT INTO members VALUES(?,?)').run('broken', 'one');
  refreshNotifications(db, 0);
  assert.equal(rows().length, 2);
  db.prepare('DELETE FROM campaigns WHERE id=?').run('broken');
  refreshNotifications(db, 1);
  assert.equal(rows().length, 2);
});

await test('claims and acknowledgements persist across independent database connections', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'lantern-notifications-'));
  const file = join(directory, 'queue.sqlite');
  const { db } = setup(t, file);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  db.prepare('DELETE FROM push_subscriptions WHERE id!=?').run('one-browser');
  refreshNotifications(db, 0);
  let other = new DatabaseSync(file);
  other.exec('PRAGMA foreign_keys=ON');
  const first = claimNotification(other, 0);
  other.close();
  refreshNotifications(db, 1);
  assert.equal(claimNotification(db, 1), null);
  assert.equal(settleNotification(db, first, 'sent', 2), 1);
  other = new DatabaseSync(file);
  try {
    other.exec('PRAGMA foreign_keys=ON');
    refreshNotifications(other, 200000);
    assert.equal(claimNotification(other, 200000), null);
  } finally {
    other.close();
  }
});

await test('session sign-out cascades subscriptions and expiration is checked before claim', (t) => {
  const { db, rows } = setup(t);
  refreshNotifications(db, 0);
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run('one');
  assert.equal(rows().length, 1);
  db.prepare('UPDATE sessions SET expires=? WHERE token_hash=?').run(1, 'two');
  assert.equal(claimNotification(db, 1), null);
  assert.equal(rows().length, 0);
});
