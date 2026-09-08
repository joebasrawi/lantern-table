import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  makeCharacter,
  departCampaign,
  restoreDepartedCharacter,
  sanitize,
  voteResult,
} from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
const setup = () => {
  const s = initialState(
    'Departure',
    'Any era',
    'Find the signal',
    'Station',
    DEFAULT_SETTINGS,
  );
  s.characters = [makeCharacter(PRESETS[0], 'one', s)];
  s.characters.push(makeCharacter(PRESETS[1], 'two', s));
  return s;
};
await test('departed characters leave active play, stay hidden, and return without resource resets', () => {
  const s = setup(),
    c = s.characters[0];
  c.hp = 3;
  c.energy = 1;
  c.xp = 75;
  c.notes = 'Only mine';
  c.dmNotes = 'For DM';
  c.inventory.push('Compass');
  const before = structuredClone(c);
  s.hostOffer = { from: 'host', to: 'one' };
  departCampaign(s, 'one', 'Player one', false);
  assert.equal(s.characters.length, 1);
  assert.equal(s.hostOffer, undefined);
  assert.equal(sanitize(s, 'two', false).retiredCharacters, undefined);
  assert.equal(sanitize(s, 'host', true).retiredCharacters, undefined);
  s.decision = {
    id: 'vote',
    question: 'Go?',
    options: ['Yes', 'No'],
    votes: { two: 0 },
    deadline: null,
  };
  assert.equal(voteResult(s), 0);
  s.decision = null;
  assert.equal(restoreDepartedCharacter(s, 'one'), true);
  assert.deepEqual(
    s.characters.find((c) => c.userId === 'one'),
    before,
  );
  assert.equal(s.retiredCharacters.length, 0);
  assert.equal(restoreDepartedCharacter(s, 'one'), false);
});
await test('departure and restoration reject active shared play without partial changes', () => {
  for (const blocker of ['encounter', 'decision', 'pending']) {
    const s = setup();
    const saved = structuredClone(s);
    if (blocker === 'pending') s.pending.push({ id: 'p' });
    else s[blocker] = { id: 'active' };
    const before = structuredClone(s);
    assert.throws(() => departCampaign(s, 'one', 'One', false), /resolved/);
    assert.deepEqual(s, before);
    departCampaign(saved, 'one', 'One', false);
    if (blocker === 'pending') saved.pending.push({ id: 'p' });
    else saved[blocker] = { id: 'active' };
    const retired = structuredClone(saved);
    assert.throws(() => restoreDepartedCharacter(saved, 'one'), /Rejoin after/);
    assert.deepEqual(saved, retired);
  }
  const s = setup(),
    before = structuredClone(s);
  assert.throws(() => departCampaign(s, 'one', 'One', true), /Hand off/);
  assert.deepEqual(s, before);
});
await test('new and returning characters take free positions after a departure', () => {
  const s = setup();
  departCampaign(s, 'one', 'One', false);
  s.characters.push(makeCharacter(PRESETS[2], 'three', s));
  assert.equal(restoreDepartedCharacter(s, 'one'), true);
  assert.equal(new Set(s.characters.map((c) => `${c.x},${c.y}`)).size, 3);
});
