import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  makeCharacter,
  startEncounter,
  hostDefend,
} from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
function game() {
  const s = initialState('Host turns', 'Fantasy', 'Explore', 'Harbor', {
    ...DEFAULT_SETTINGS,
    pace: 'host',
    absence: 'defend',
  });
  s.characters.push(
    makeCharacter({ ...PRESETS[0], absenceConsent: true }, 'one', s),
  );
  s.characters.push(makeCharacter(PRESETS[1], 'two', s));
  startEncounter(s, 'Guardian', 1);
  return s;
}
await test('timed consent does not authorize manual host defense', () => {
  const s = game(),
    before = structuredClone(s);
  assert.throws(() => hostDefend(s));
  assert.deepEqual(s, before);
});
await test('host defense applies one normal defensive turn and records its source', () => {
  const s = game(),
    c = s.characters[0];
  c.hostDefenseConsent = true;
  hostDefend(s);
  assert.equal(s.encounter.index, 1);
  assert.ok(s.encounter.defending.includes(c.id));
  assert.equal(s.encounter.deadline, null);
  assert.match(s.events.at(-1).text, /host resolves/i);
});
await test('host defense requires both pacing and absence policy, even with player permission', () => {
  for (const [pace, absence] of [
    ['wait', 'defend'],
    ['deadline', 'defend'],
    ['host', 'wait'],
  ]) {
    const s = game();
    s.characters[0].hostDefenseConsent = true;
    s.settings.pace = pace;
    s.settings.absence = absence;
    const before = structuredClone(s);
    assert.throws(() => hostDefend(s));
    assert.deepEqual(s, before);
  }
});
