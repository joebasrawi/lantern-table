import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  makeCharacter,
  startEncounter,
  combat,
} from '../.test-build/engine.js';
import {
  PRESETS,
  DEFAULT_SETTINGS,
  DEFAULT_ENEMY_STATS,
} from '../.test-build/types.js';
const setup = () => {
  const s = initialState('Test', 'Any era', 'A fight', 'Harbor', {
    ...DEFAULT_SETTINGS,
    dm: 'human',
  });
  s.characters = [makeCharacter(PRESETS[0], 'one', s)];
  return s;
};
await test('custom enemy values set capacity and drive hit and damage resolution', () => {
  const s = setup();
  startEncounter(s, 'Clockwork guard', 2, {
    hp: 37,
    armor: 17,
    attackBonus: 8,
    damage: 9,
    x: 99,
  });
  for (const e of s.encounter.enemies) {
    assert.equal(e.hp, 37);
    assert.equal(e.maxHp, 37);
    assert.equal(e.armor, 17);
    assert.equal(e.attackBonus, 8);
    assert.equal(e.damage, 9);
    assert.ok(e.x < 8);
  }
  combat(s, 'one', 'defend', undefined, undefined, undefined, () => 10);
  assert.equal(s.characters[0].hp, 2);
  assert.match(s.events.at(-1).text, /takes 9 damage/);
});
await test('negative attack bonuses can miss and legacy encounters retain default damage', () => {
  const s = setup();
  startEncounter(s, 'Guard', 1, { attackBonus: -5, damage: 50 });
  combat(s, 'one', 'defend', undefined, undefined, undefined, () => 19);
  assert.equal(s.characters[0].hp, 20);
  assert.match(s.events.at(-1).text, /19 − 5/);
  delete s.encounter.enemies[0].attackBonus;
  delete s.encounter.enemies[0].damage;
  combat(s, 'one', 'defend', undefined, undefined, undefined, () => 20);
  assert.equal(s.characters[0].hp, 16);
});
await test('invalid enemy values or counts cannot partially start combat', () => {
  for (const values of [
    { hp: 0 },
    { hp: 501 },
    { armor: 31 },
    { attackBonus: -6 },
    { attackBonus: 16 },
    { damage: 0 },
    { damage: 51 },
    { damage: 2.5 },
    { hp: '37' },
    [],
    null,
  ]) {
    const s = setup(),
      before = structuredClone(s);
    assert.throws(() => startEncounter(s, 'Guard', 1, values));
    assert.deepEqual(s, before);
  }
  for (const count of [0, 7, 1.5]) {
    const s = setup(),
      before = structuredClone(s);
    assert.throws(() => startEncounter(s, 'Guard', count));
    assert.deepEqual(s, before);
  }
  const s = setup();
  startEncounter(s, 'Guard', 1);
  const e = s.encounter.enemies[0];
  for (const [key, value] of Object.entries(DEFAULT_ENEMY_STATS))
    assert.equal(e[key], value);
});
