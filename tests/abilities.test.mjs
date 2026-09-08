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

await test('guard protects an ally during the enemy phase, then expires without changing base armor', () => {
  const s = game(),
    [ally, caster] = s.characters;
  proposeAbility(s, caster.userId, {
    name: 'Drone barrier',
    description: 'A drone projects cover.',
    effect: 'guard',
  });
  const ability = caster.abilities[0];
  reviewAbility(s, caster.id, ability.id, true);
  startEncounter(s, 'Guardian', 1);
  const armor = ally.armor,
    health = ally.hp;
  const enemyRoll = () => armor - 3;
  combat(s, ally.userId, 'move', undefined, ally.x, ally.y, enemyRoll);
  combat(
    s,
    caster.userId,
    'ability',
    ally.id,
    undefined,
    undefined,
    enemyRoll,
    ability.id,
  );
  assert.equal(caster.energy, 2);
  assert.equal(ally.hp, health, 'Guard converts a base-armor hit into a miss');
  assert.equal(ally.armor, armor);
  assert.equal(s.encounter.round, 2);
  assert.deepEqual(s.encounter.defending, []);
  assert.ok(s.events.some((e) => e.text.includes(`protects ${ally.name}`)));
  combat(s, ally.userId, 'move', undefined, ally.x, ally.y, enemyRoll);
  combat(s, caster.userId, 'move', undefined, caster.x, caster.y, enemyRoll);
  assert.equal(
    ally.hp,
    health - 4,
    'Protection expires before the following enemy phase',
  );
});

await test('guard rejects invalid targets, range, energy and stacked protection without spending the turn', () => {
  for (const mode of [
    'self',
    'enemy',
    'down',
    'range',
    'energy',
    'stack',
    'unapproved',
  ]) {
    const s = game(),
      [caster, ally] = s.characters;
    s.settings.rules = 'tactical';
    proposeAbility(s, caster.userId, {
      name: 'Ward',
      description: 'A shield.',
      effect: 'guard',
    });
    const ability = caster.abilities[0];
    if (mode !== 'unapproved') reviewAbility(s, caster.id, ability.id, true);
    startEncounter(s, 'Guardian', 1);
    let target = ally.id;
    if (mode === 'self') target = caster.id;
    if (mode === 'enemy') target = s.encounter.enemies[0].id;
    if (mode === 'down') ally.hp = 0;
    if (mode === 'range') {
      ally.x = 7;
      ally.y = 0;
    }
    if (mode === 'energy') caster.energy = 0;
    if (mode === 'stack') s.encounter.defending.push(ally.id);
    const before = structuredClone(s);
    assert.throws(
      () =>
        combat(
          s,
          caster.userId,
          'ability',
          target,
          undefined,
          undefined,
          () => 10,
          ability.id,
        ),
      undefined,
      mode,
    );
    assert.deepEqual(s, before, mode);
  }
});

await test('guard supports Tactical range boundary and Quickplay distance; Defend does not stack', () => {
  for (const rules of ['tactical', 'quickplay']) {
    const s = game(),
      [caster, ally] = s.characters;
    s.settings.rules = rules;
    proposeAbility(s, caster.userId, {
      name: 'Ward',
      description: 'A shield.',
      effect: 'guard',
    });
    const ability = caster.abilities[0];
    reviewAbility(s, caster.id, ability.id, true);
    startEncounter(s, 'Guardian', 1);
    caster.x = 0;
    caster.y = 7;
    ally.x = rules === 'tactical' ? 3 : 7;
    ally.y = 7;
    combat(
      s,
      caster.userId,
      'ability',
      ally.id,
      undefined,
      undefined,
      () => 1,
      ability.id,
    );
    assert.deepEqual(s.encounter.defending, [ally.id]);
    assert.equal(s.encounter.index, 1);
    assert.equal(caster.energy, 2);
    combat(s, ally.userId, 'defend', undefined, undefined, undefined, () => 1);
    assert.deepEqual(s.encounter.defending, []);
    assert.equal(ally.energy, 3);
  }
});
