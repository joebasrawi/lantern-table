import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  makeCharacter,
  updateWorld,
  startEncounter,
} from '../.test-build/engine.js';
import { narrationContext } from '../.test-build/context.js';
import { PRESETS } from '../.test-build/types.js';
const setup = () => {
  const s = initialState('Harbor', 'Fantasy', 'Find the seal', 'Tavern');
  s.characters = [makeCharacter(PRESETS[0], 'player', s)];
  return s;
};
const world = {
  title: 'The last signal',
  setting: 'A science fiction frontier',
  premise: 'Find the missing transmission',
};
await test('world edits preserve saved play and reach future narration context', () => {
  const s = setup(),
    before = structuredClone(s);
  updateWorld(s, {
    ...world,
    location: 'FORGED',
    characters: [],
    settings: { dm: 'human' },
  });
  assert.deepEqual(
    {
      ...s,
      title: before.title,
      setting: before.setting,
      premise: before.premise,
      events: before.events,
    },
    before,
  );
  assert.deepEqual(s.events.slice(0, -1), before.events);
  assert.match(s.events.at(-1).text, /science fiction frontier/);
  const context = narrationContext(s, 'Explore');
  assert.equal(context.setting, world.setting);
  assert.equal(context.premise, world.premise);
});
await test('invalid world edits and unchanged values leave the aggregate untouched', () => {
  const s = setup();
  for (const input of [
    { ...world, title: '' },
    { ...world, setting: 'x'.repeat(1501) },
    { ...world, premise: 42 },
    { title: s.title, setting: s.setting, premise: s.premise },
  ]) {
    const before = structuredClone(s);
    assert.throws(() => updateWorld(s, input));
    assert.deepEqual(s, before);
  }
});
await test('world edits wait for encounters, decisions and pending actions', () => {
  for (const block of [
    (s) => startEncounter(s, 'Guard', 1),
    (s) => {
      s.decision = { id: 'vote' };
    },
    (s) => {
      s.pending = [{ id: 'action' }];
    },
  ]) {
    const s = setup();
    block(s);
    const before = structuredClone(s);
    assert.throws(() => updateWorld(s, world));
    assert.deepEqual(s, before);
  }
});
