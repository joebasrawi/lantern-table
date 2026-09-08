import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  makeCharacter,
  rebuildCharacter,
  levelUp,
  startEncounter,
} from '../.test-build/engine.js';
import { PRESETS } from '../.test-build/types.js';
const setup = () => {
  const s = initialState('Test', 'Any era', 'Find the signal', 'Station');
  s.characters = [
    makeCharacter(PRESETS[0], 'owner', s),
    makeCharacter(PRESETS[1], 'other', s),
  ];
  return s;
};
const input = (s, role = 'Vanguard') => ({
  role,
  stats: { ...s.characters[0].stats },
});

await test('build changes retain earned progression, possessions, identity and injury without accepting forged resources', () => {
  const s = setup(),
    c = s.characters[0];
  c.xp = 1000;
  levelUp(s, 'owner', 'vitality');
  levelUp(s, 'owner', 'focus');
  levelUp(s, 'owner', 'vitality');
  c.hp = 7;
  c.energy = 1;
  c.abilities = [
    {
      id: 'custom',
      name: 'Signal pulse',
      description: 'A radio burst',
      effect: 'strike',
      approved: true,
    },
  ];
  c.portraitAsset = 'private-art';
  c.notes = 'Private';
  const before = structuredClone(c),
    other = structuredClone(s.characters[1]);
  const stats = {
    ...c.stats,
    strength: c.stats.charisma,
    charisma: c.stats.strength,
  };
  rebuildCharacter(s, 'owner', {
    role: 'Vanguard',
    stats,
    hp: 999,
    maxHp: 999,
    armor: 999,
    energy: 999,
    xp: 9999,
    userId: 'other',
    characterId: s.characters[1].id,
  });
  assert.deepEqual(c, {
    ...before,
    role: 'Vanguard',
    maxHp: 32,
    armor: 15,
    stats,
  });
  assert.deepEqual(s.characters[1], other);
  assert.match(s.events.at(-1).text, /changed their build to Vanguard/);
  assert.equal(s.events.at(-1).userId, 'owner');
});

await test('lowering health capacity clamps current health and changing back cannot refill it', () => {
  const s = setup(),
    c = s.characters[0];
  rebuildCharacter(s, 'owner', input(s, 'Arcanist'));
  assert.equal(c.maxHp, 16);
  assert.equal(c.hp, 16);
  rebuildCharacter(s, 'owner', input(s, 'Vanguard'));
  assert.equal(c.maxHp, 24);
  assert.equal(c.hp, 16);
  rebuildCharacter(s, 'owner', input(s, 'Wayfinder'));
  assert.equal(c.maxHp, 20);
  assert.equal(c.hp, 16);
});

await test('build changes reject invalid budgets, unknown roles, unchanged builds and missing players atomically', () => {
  const s = setup();
  for (const value of [
    input(s, 'Unknown'),
    { role: 'Vanguard' },
    { ...input(s), stats: { strength: 30 } },
    { ...input(s), stats: { ...s.characters[0].stats, strength: 15 } },
    input(s, 'Wayfinder'),
  ]) {
    const before = structuredClone(s);
    assert.throws(() => rebuildCharacter(s, 'owner', value));
    assert.deepEqual(s, before);
  }
  assert.throws(() => rebuildCharacter(s, 'outsider', input(s)));
});

await test('combat, decisions, pending actions and unconscious characters block rebuilding', () => {
  for (const block of [
    (s) => startEncounter(s, 'Guard', 1),
    (s) => {
      s.decision = { id: 'decision' };
    },
    (s) => {
      s.pending = [{ id: 'pending' }];
    },
    (s) => {
      s.characters[0].hp = 0;
    },
  ]) {
    const s = setup();
    block(s);
    const before = structuredClone(s);
    assert.throws(() => rebuildCharacter(s, 'owner', input(s)));
    assert.deepEqual(s, before);
  }
});
