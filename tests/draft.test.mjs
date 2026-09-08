import test from 'node:test';
import assert from 'node:assert/strict';
import { draftIsCurrent } from '../.test-build/draft.js';
import {
  initialState,
  addEvent,
  makeCharacter,
} from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
function game() {
  const s = initialState('Draft', 'Fantasy', 'Explore', 'Harbor', {
    ...DEFAULT_SETTINGS,
    dm: 'assisted',
  });
  s.characters.push(makeCharacter(PRESETS[0], 'one', s));
  s.pending = [
    {
      id: 'pending',
      userId: 'one',
      author: 'Elara',
      text: 'Inspect the seal.',
      roll: 'No check',
      at: new Date().toISOString(),
    },
  ];
  return s;
}
await test('draft freshness tolerates unrelated chat and private-note updates', () => {
  const a = game(),
    b = structuredClone(a);
  addEvent(b, 'chat', 'Elara', 'Back in five minutes.');
  b.characters[0].notes = 'Private';
  b.dmNotes = 'Private';
  b.seen.one = 'now';
  assert.equal(draftIsCurrent(a, b, 'pending'), true);
});
await test('draft freshness rejects a changed story, resources, selected action or DM mode', () => {
  for (const change of [
    (s) => addEvent(s, 'narration', 'DM', 'The seal breaks.'),
    (s) => {
      s.location = 'Tower';
    },
    (s) => {
      s.characters[0].hp--;
    },
    (s) => {
      s.pending = [];
    },
    (s) => {
      s.pending[0].roll = 'Different result';
    },
    (s) => {
      s.settings.dm = 'human';
    },
  ]) {
    const a = game(),
      b = structuredClone(a);
    change(b);
    assert.equal(draftIsCurrent(a, b, 'pending'), false);
  }
});
