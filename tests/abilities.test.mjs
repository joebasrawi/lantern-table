import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  makeCharacter,
  startEncounter,
  combat,
  proposeAbility,
  reviewAbility,
  removeAbility,
} from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
function game() {
  const s = initialState('Custom', 'Future', 'Explore', 'Station', {
    ...DEFAULT_SETTINGS,
    customization: 'custom',
  });
  s.characters.push(makeCharacter(PRESETS[0], 'one', s));
  s.characters.push(makeCharacter(PRESETS[1], 'two', s));
  return s;
}
const proposal = {
  name: 'Repair nanites',
  description: 'Silver dust seals wounds.',
  effect: 'mend',
  approved: true,
  energy: 0,
  hp: 999,
};
await test('ability proposals accept fixed templates and require a separate review', () => {
  const s = game();
  proposeAbility(s, 'one', proposal);
  const a = s.characters[0].abilities[0];
  assert.equal(a.approved, false);
  assert.equal(a.energy, undefined);
  startEncounter(s, 'Guardian', 1);
  const before = structuredClone(s);
  assert.throws(() =>
    combat(
      s,
      'one',
      'ability',
      undefined,
      undefined,
      undefined,
      () => 15,
      a.id,
    ),
  );
  assert.deepEqual(s, before);
});
await test('mend spends energy, heals within capacity and advances one turn', () => {
  const s = game(),
    c = s.characters[0];
  proposeAbility(s, 'one', proposal);
  const a = c.abilities[0];
  reviewAbility(s, c.id, a.id, true);
  startEncounter(s, 'Guardian', 1);
  c.hp = c.maxHp - 2;
  combat(s, 'one', 'ability', undefined, undefined, undefined, () => 15, a.id);
  assert.equal(c.hp, c.maxHp);
  assert.equal(c.energy, 2);
  assert.equal(s.encounter.index, 1);
});
await test('ability use rejects another owner, missing energy and full health without changes', () => {
  for (const mode of ['owner', 'energy', 'full']) {
    const s = game(),
      c = s.characters[mode === 'owner' ? 1 : 0];
    proposeAbility(s, c.userId, proposal);
    const a = c.abilities[0];
    reviewAbility(s, c.id, a.id, true);
    startEncounter(s, 'Guardian', 1);
    if (mode === 'energy') {
      c.energy = 0;
      c.hp = 1;
    }
    const before = structuredClone(s);
    assert.throws(() =>
      combat(
        s,
        'one',
        'ability',
        undefined,
        undefined,
        undefined,
        () => 15,
        a.id,
      ),
    );
    assert.deepEqual(s, before);
  }
});
await test('custom strike uses normal power range, attack dice and energy', () => {
  const s = game(),
    c = s.characters[0];
  c.role = 'Vanguard';
  s.settings.rules = 'tactical';
  proposeAbility(s, 'one', {
    ...proposal,
    effect: 'strike',
    name: 'Plasma arc',
  });
  const a = c.abilities[0];
  reviewAbility(s, c.id, a.id, true);
  startEncounter(s, 'Guardian', 1);
  const e = s.encounter.enemies[0];
  const before = structuredClone(s);
  assert.throws(() =>
    combat(s, 'one', 'ability', e.id, undefined, undefined, () => 15, a.id),
  );
  assert.deepEqual(s, before);
  e.x = c.x;
  e.y = c.y - 1;
  combat(s, 'one', 'ability', e.id, undefined, undefined, () => 15, a.id);
  assert.equal(e.hp, 4);
  assert.equal(c.energy, 2);
  assert.ok(s.events.at(-1).text.includes('Plasma arc'));
});
await test('creation policy, three-slot limit, editing locks and removal preserve resources', () => {
  const s = game(),
    c = s.characters[0];
  s.settings.customization = 'reskin';
  assert.throws(() => proposeAbility(s, 'one', proposal));
  s.settings.customization = 'custom';
  assert.throws(() =>
    proposeAbility(s, 'one', { ...proposal, effect: 'kill everyone' }),
  );
  for (let i = 0; i < 3; i++)
    proposeAbility(s, 'one', { ...proposal, name: `Ability ${i}` });
  assert.throws(() =>
    proposeAbility(s, 'one', { ...proposal, name: 'Fourth' }),
  );
  const a = c.abilities[0];
  startEncounter(s, 'Guardian', 1);
  assert.throws(() => reviewAbility(s, c.id, a.id, true));
  assert.throws(() => removeAbility(s, 'one', a.id));
  s.encounter = null;
  assert.throws(() => removeAbility(s, 'two', a.id));
  removeAbility(s, 'one', a.id);
  assert.equal(c.abilities.length, 2);
  assert.equal(c.hp, c.maxHp);
  assert.equal(c.energy, 3);
});
