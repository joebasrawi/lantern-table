import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  hostHandoff,
  makeCharacter,
  sanitize,
} from '../.test-build/engine.js';
import { campaignAttention } from '../.test-build/attention.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
const members = [
  { userId: 'host', name: 'Original host' },
  { userId: 'next', name: 'Next host' },
  { userId: 'other', name: 'Other player' },
];
const setup = () =>
  initialState(
    'Handoff',
    'Any era',
    'Continue together',
    'Harbor',
    DEFAULT_SETTINGS,
  );
await test('host handoff requires an offer and nominee acceptance; personal notes stay private', () => {
  const s = setup();
  s.characters = [makeCharacter(PRESETS[0], 'host', s)];
  s.characters[0].notes = 'Personal secret';
  s.characters[0].dmNotes = 'Shared with DM';
  s.dmNotes = 'Campaign secret';
  assert.equal(
    hostHandoff(s, 'host', 'host', members, {
      kind: 'offer',
      targetId: 'next',
    }),
    null,
  );
  assert.equal(
    campaignAttention(s, 'next', false).label,
    'Host handoff awaiting your reply',
  );
  assert.equal(sanitize(s, 'next', false).dmNotes, '');
  assert.equal(
    hostHandoff(s, 'next', 'host', members, { kind: 'accept' }),
    'next',
  );
  assert.equal(s.hostOffer, undefined);
  assert.equal(sanitize(s, 'host', false).dmNotes, '');
  assert.equal(
    sanitize(s, 'host', false).characters[0].notes,
    'Personal secret',
  );
  assert.equal(sanitize(s, 'next', true).dmNotes, 'Campaign secret');
  assert.equal(
    sanitize(s, 'next', true).characters[0].dmNotes,
    'Shared with DM',
  );
  assert.equal(sanitize(s, 'next', true).characters[0].notes, '');
});
await test('invalid and unauthorized handoffs do not partially change state', () => {
  for (const [actor, v, offered] of [
    ['next', { kind: 'offer', targetId: 'other' }, false],
    ['host', { kind: 'offer', targetId: 'host' }, false],
    ['host', { kind: 'offer', targetId: 'outsider' }, false],
    ['next', { kind: 'accept' }, false],
    ['other', { kind: 'accept' }, true],
    ['other', { kind: 'cancel' }, true],
    ['host', { kind: 'offer', targetId: 'other' }, true],
  ]) {
    const s = setup();
    if (offered)
      hostHandoff(s, 'host', 'host', members, {
        kind: 'offer',
        targetId: 'next',
      });
    const before = structuredClone(s);
    assert.throws(() => hostHandoff(s, actor, 'host', members, v));
    assert.deepEqual(s, before);
  }
});
await test('host or nominee can cancel, even while shared play prevents acceptance', () => {
  for (const actor of ['host', 'next'])
    for (const block of ['encounter', 'decision', 'pending']) {
      const s = setup();
      hostHandoff(s, 'host', 'host', members, {
        kind: 'offer',
        targetId: 'next',
      });
      if (block === 'pending') s.pending.push({ id: 'pending' });
      else s[block] = { id: 'active' };
      const before = structuredClone(s);
      assert.throws(
        () => hostHandoff(s, 'next', 'host', members, { kind: 'accept' }),
        /after the current/,
      );
      assert.deepEqual(s, before);
      hostHandoff(s, actor, 'host', members, { kind: 'cancel' });
      assert.equal(s.hostOffer, undefined);
    }
});
