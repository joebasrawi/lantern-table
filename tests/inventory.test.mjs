import test from 'node:test';
import { narrationContext } from '../.test-build/context.js';
import assert from 'node:assert/strict';
import {
  initialState,
  makeCharacter,
  changeInventory,
  startEncounter,
  combat,
} from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
const setup = () => {
  const s = initialState(
    'Test',
    'Any era',
    'Find the signal',
    'Station',
    DEFAULT_SETTINGS,
  );
  s.characters = [
    makeCharacter(PRESETS[0], 'one', s),
    makeCharacter(PRESETS[1], 'two', s),
  ];
  return s;
};
await test('DM grants custom gear, transfers conserve individual items, and healing kits remain usable', () => {
  const s = setup(),
    [a, b] = s.characters;
  changeInventory(s, 'dm-without-character', true, {
    kind: 'grant',
    characterId: a.id,
    item: 'Signal scanner',
  });
  assert.equal(a.inventory.at(-1), 'Signal scanner');
  assert.ok(
    narrationContext(s, 'Use the scanner').party[0].inventory.includes(
      'Signal scanner',
    ),
  );
  const before = [...a.inventory, ...b.inventory].sort((a, b) =>
    a.localeCompare(b),
  );
  changeInventory(s, 'one', false, {
    kind: 'give',
    characterId: a.id,
    index: 1,
    item: 'Healing kit',
    targetId: b.id,
  });
  assert.deepEqual(
    [...a.inventory, ...b.inventory].sort((a, b) => a.localeCompare(b)),
    before,
  );
  assert.equal(b.inventory.filter((i) => i === 'Healing kit').length, 2);
  changeInventory(s, 'dm', true, {
    kind: 'remove',
    characterId: a.id,
    index: 3 - 1,
    item: 'Signal scanner',
  });
  assert.ok(!a.inventory.includes('Signal scanner'));
  startEncounter(s, 'Guard', 1);
  s.encounter.index = s.encounter.order.indexOf(b.id);
  b.hp = 5;
  combat(s, 'two', 'heal', undefined, undefined, undefined, () => 1);
  assert.equal(b.inventory.filter((i) => i === 'Healing kit').length, 1);
  assert.equal(b.hp, 13);
});
await test('inventory validation rejects unauthorized, stale, full and invalid changes atomically', () => {
  for (const scenario of [
    'grant',
    'remove',
    'foreign',
    'self',
    'missing',
    'stale',
    'index',
    'name',
    'full',
    'unconscious',
  ]) {
    const s = setup(),
      [a, b] = s.characters;
    const v = {
      kind: 'give',
      characterId: a.id,
      index: 1,
      item: 'Healing kit',
      targetId: b.id,
    };
    let actor = 'one',
      host = false;
    if (scenario === 'grant' || scenario === 'remove') v.kind = scenario;
    if (scenario === 'foreign') actor = 'two';
    if (scenario === 'self') v.targetId = a.id;
    if (scenario === 'missing') v.targetId = 'missing';
    if (scenario === 'stale') v.item = 'Different item';
    if (scenario === 'index') v.index = 1.5;
    if (scenario === 'name') {
      v.kind = 'grant';
      v.item = 'a'.repeat(81);
      host = true;
    }
    if (scenario === 'full') b.inventory = Array(24).fill('Stone');
    if (scenario === 'unconscious') b.hp = 0;
    const before = structuredClone(s);
    assert.throws(
      () => changeInventory(s, actor, host, v),
      undefined,
      scenario,
    );
    assert.deepEqual(s, before, scenario);
  }
});
await test('equipment waits for unresolved shared play, including host grants', () => {
  for (const state of ['encounter', 'decision', 'pending']) {
    const s = setup();
    if (state === 'encounter') startEncounter(s, 'Guard', 1);
    if (state === 'decision') s.decision = { id: 'vote' };
    if (state === 'pending') s.pending.push({ id: 'action' });
    const before = structuredClone(s);
    assert.throws(
      () =>
        changeInventory(s, 'dm', true, {
          kind: 'grant',
          characterId: s.characters[0].id,
          item: 'Healing kit',
        }),
      /after the current/,
    );
    assert.deepEqual(s, before);
  }
});
