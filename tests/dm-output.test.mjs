import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNarration, applyNarration } from '../.test-build/dm-output.js';
import { initialState, makeCharacter } from '../.test-build/engine.js';
import { PRESETS } from '../.test-build/types.js';
const response = (
  proposal = { kind: 'none', destination: '', enemy: '', count: 0 },
) => ({
  narrative:
    'The lighthouse stands across the harbor. Shall the party travel there?',
  location: 'Harbor',
  suggestions: ['Study the lighthouse', 'Talk to the keeper'],
  discoveryTitle: '',
  discoveryBody: '',
  proposal,
});
function state() {
  const s = initialState('Test', 'Fantasy', 'Find the letter', 'Harbor');
  s.characters.push(makeCharacter(PRESETS[0], 'one', s));
  return s;
}
await test('structured output accepts known transitions and discards forged stats', () => {
  const n = parseNarration(
    JSON.stringify({
      ...response({
        kind: 'encounter',
        enemy: 'Raider',
        count: 2,
        destination: '',
        hp: 999,
      }),
      hp: 999,
    }),
  );
  assert.deepEqual(n.proposal, {
    kind: 'encounter',
    enemy: 'Raider',
    count: 2,
  });
  assert.equal(n.hp, undefined);
});
await test('malformed output is rejected before gameplay state is touched', () => {
  for (const raw of [
    'null',
    '[]',
    '{}',
    'not json',
    JSON.stringify(
      response({
        kind: 'encounter',
        enemy: 'Raider',
        count: 999,
        destination: '',
      }),
    ),
    JSON.stringify(
      response({ kind: 'give_gold', count: 0, destination: '', enemy: '' }),
    ),
  ])
    assert.throws(() => parseNarration(raw));
});
await test('descriptive location never moves the party without a travel effect', () => {
  const s = state();
  const n = parseNarration(
    JSON.stringify({ ...response(), location: 'A forged location' }),
  );
  applyNarration(s, n);
  assert.equal(s.location, 'Harbor');
  assert.equal(s.decision, null);
});
await test('valid AI proposal becomes a persistent party decision without changing resources', () => {
  const s = state();
  const before = structuredClone(s.characters);
  const n = parseNarration(
    JSON.stringify(
      response({
        kind: 'travel',
        destination: 'Lighthouse',
        enemy: '',
        count: 0,
      }),
    ),
  );
  applyNarration(s, n);
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(restored.decision.effects[0].destination, 'Lighthouse');
  assert.equal(restored.location, 'Harbor');
  assert.deepEqual(restored.characters, before);
});
await test('conflicting AI proposal leaves no partial narration', () => {
  const s = state();
  applyNarration(
    s,
    parseNarration(
      JSON.stringify(
        response({ kind: 'rest', destination: '', enemy: '', count: 0 }),
      ),
    ),
  );
  const before = structuredClone(s);
  assert.throws(() =>
    applyNarration(
      s,
      parseNarration(
        JSON.stringify(
          response({
            kind: 'travel',
            destination: 'Lighthouse',
            enemy: '',
            count: 0,
          }),
        ),
      ),
    ),
  );
  assert.deepEqual(s, before);
});
