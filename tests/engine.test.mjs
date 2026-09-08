import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  levelUp,
  makeCharacter,
  startEncounter,
  combat,
  sanitize,
  settings,
  expireTurn,
  voteResult,
} from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
function campaign(rules = 'quickplay') {
  const s = initialState('Test', 'Fantasy', 'An adventure', 'Harbor', {
    ...DEFAULT_SETTINGS,
    rules,
    dm: 'human',
  });
  s.characters = [makeCharacter(PRESETS[0], 'one', s)];
  s.characters.push(makeCharacter(PRESETS[1], 'two', s));
  return s;
}
await test('character creation validates fixed ability budget and cannot accept forged health', () => {
  const s = campaign();
  assert.throws(() =>
    makeCharacter({ ...PRESETS[0], stats: { strength: 30 } }, 'three', s),
  );
  const c = makeCharacter({ ...PRESETS[0], hp: 1000, maxHp: 1000 }, 'three', s);
  assert.equal(c.hp, 20);
});
await test('unauthorized turn cannot spend resources or damage an enemy', () => {
  const s = campaign();
  startEncounter(s, 'Enemy', 1);
  const snapshot = structuredClone(s);
  assert.throws(() => combat(s, 'two', 'power', s.encounter.enemies[0].id));
  assert.deepEqual(s, snapshot);
});
await test('power consumes energy once, uses engine dice, and advances the turn', () => {
  const s = campaign();
  startEncounter(s, 'Enemy', 1);
  combat(
    s,
    'one',
    'power',
    s.encounter.enemies[0].id,
    undefined,
    undefined,
    () => 15,
  );
  assert.equal(s.characters[0].energy, 2);
  assert.equal(s.encounter.enemies[0].hp, 4);
  assert.equal(s.encounter.index, 1);
});
await test('tactical range rejects an attack without consuming energy', () => {
  const s = campaign('tactical');
  s.characters[0].role = 'Vanguard';
  startEncounter(s, 'Enemy', 1);
  assert.throws(() => combat(s, 'one', 'power', s.encounter.enemies[0].id));
  assert.equal(s.characters[0].energy, 3);
  assert.equal(s.encounter.index, 0);
});
await test('invalid movement cannot leave board or overlap another character', () => {
  const s = campaign();
  startEncounter(s, 'Enemy', 1);
  assert.throws(() => combat(s, 'one', 'move', '', -1, 0));
  assert.throws(() =>
    combat(s, 'one', 'move', '', s.characters[1].x, s.characters[1].y),
  );
  assert.equal(s.encounter.index, 0);
});
await test('killing last enemy completes combat and awards every player', () => {
  const s = campaign();
  startEncounter(s, 'Enemy', 1);
  s.encounter.enemies[0].hp = 1;
  combat(
    s,
    'one',
    'attack',
    s.encounter.enemies[0].id,
    undefined,
    undefined,
    () => 20,
  );
  assert.equal(s.encounter, null);
  assert.deepEqual(
    s.characters.map((c) => c.xp),
    [25, 25],
  );
});
await test('defense expires after enemy round and preserves health on miss', () => {
  const s = campaign();
  startEncounter(s, 'Enemy', 1);
  combat(s, 'one', 'defend');
  combat(s, 'two', 'defend', '', undefined, undefined, () => 1);
  assert.equal(s.encounter.round, 2);
  assert.equal(s.characters[0].hp, 20);
  assert.deepEqual(s.encounter.defending, []);
});
await test('absence defense requires deadline plus player consent', () => {
  const s = campaign();
  s.settings.pace = 'deadline';
  s.settings.absence = 'defend';
  startEncounter(s, 'Enemy', 1);
  s.encounter.deadline = new Date(0).toISOString();
  assert.equal(expireTurn(s), false);
  s.characters[0].absenceConsent = true;
  assert.equal(expireTurn(s), true);
  assert.equal(s.encounter.index, 1);
});
await test('private player notes never leak to host or other players', () => {
  const s = campaign();
  s.dmNotes = 'DM secret';
  s.characters[0].notes = 'Private secret';
  s.characters[0].dmNotes = 'Shared secret';
  s.seen = { one: 'one-date', two: 'two-date' };
  const player = sanitize(s, 'two', false);
  assert.equal(player.dmNotes, '');
  assert.equal(player.characters[0].notes, '');
  assert.equal(player.characters[0].dmNotes, '');
  assert.deepEqual(player.seen, { two: 'two-date' });
  const host = sanitize(s, 'two', true);
  assert.equal(host.characters[0].notes, '');
  assert.equal(host.characters[0].dmNotes, 'Shared secret');
});
await test('unanimous vote requires matching votes from all characters', () => {
  const s = campaign();
  s.decision = {
    id: 'x',
    question: 'Go?',
    options: ['yes', 'no'],
    votes: { one: 0 },
    deadline: null,
  };
  assert.equal(voteResult(s), null);
  s.decision.votes.two = 1;
  assert.equal(voteResult(s), null);
  s.decision.votes.two = 0;
  assert.equal(voteResult(s), 0);
});
await test('server validates campaign policy options and deadline bounds', () => {
  assert.throws(() => settings({ ...DEFAULT_SETTINGS, deadlineHours: 0 }));
  assert.throws(() => settings({ ...DEFAULT_SETTINGS, dm: 'anything' }));
  assert.deepEqual(settings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
});

await test('travel proposal preserves location until party approval', async () => {
  const { proposeTransition, resolveDecision } =
    await import('../.test-build/engine.js');
  const s = campaign();
  proposeTransition(s, { kind: 'travel', destination: 'Old lighthouse' });
  assert.equal(s.location, 'Harbor');
  assert.deepEqual(s.visited, ['Harbor']);
  assert.equal(s.decision.effects[0].destination, 'Old lighthouse');
  s.decision.votes = { one: 0, two: 0 };
  resolveDecision(s, voteResult(s));
  assert.equal(s.location, 'Old lighthouse');
  assert.equal(s.decision, null);
  assert.deepEqual(s.visited, ['Harbor', 'Old lighthouse']);
});
await test('declining a proposed fight never starts combat or spends resources', async () => {
  const { proposeTransition, resolveDecision } =
    await import('../.test-build/engine.js');
  const s = campaign();
  const before = structuredClone(s.characters);
  proposeTransition(s, { kind: 'encounter', enemy: 'Raider', count: 2 });
  assert.equal(s.encounter, null);
  resolveDecision(s, 1);
  assert.equal(s.encounter, null);
  assert.deepEqual(s.characters, before);
});
await test('approved encounter uses engine-owned enemy statistics', async () => {
  const { proposeTransition, resolveDecision } =
    await import('../.test-build/engine.js');
  const s = campaign();
  proposeTransition(s, {
    kind: 'encounter',
    enemy: 'Raider',
    count: 2,
    hp: 99999,
  });
  resolveDecision(s, 0);
  assert.equal(s.encounter.enemies.length, 2);
  assert.equal(s.encounter.enemies[0].hp, 12);
  assert.equal(s.encounter.round, 1);
});
await test('rest proposal does not restore resources until approved', async () => {
  const { proposeTransition, resolveDecision } =
    await import('../.test-build/engine.js');
  const s = campaign();
  s.characters[0].hp = 2;
  s.characters[0].energy = 0;
  proposeTransition(s, { kind: 'rest' });
  assert.equal(s.characters[0].hp, 2);
  resolveDecision(s, 0);
  assert.equal(s.characters[0].hp, s.characters[0].maxHp);
  assert.equal(s.characters[0].energy, 3);
});
await test('new transitions cannot overwrite unresolved party choices', async () => {
  const { proposeTransition } = await import('../.test-build/engine.js');
  const s = campaign();
  proposeTransition(s, { kind: 'travel', destination: 'Lighthouse' });
  const before = structuredClone(s);
  assert.throws(() => proposeTransition(s, { kind: 'rest' }));
  assert.deepEqual(s, before);
});

await test('rules and DM changes queue during combat without altering the current encounter', async () => {
  const { updateSettings, applyQueuedSettings } =
    await import('../.test-build/engine.js');
  const s = campaign();
  startEncounter(s, 'Raider', 1);
  const next = {
    ...s.settings,
    dm: 'ai',
    rules: 'tactical',
    decision: 'majority',
    pace: 'deadline',
    deadlineHours: 2,
    absence: 'defend',
  };
  updateSettings(s, next);
  assert.equal(s.settings.rules, 'quickplay');
  assert.equal(s.settings.dm, 'human');
  assert.equal(s.settings.decision, 'unanimous');
  assert.equal(s.settings.pace, 'deadline');
  assert.equal(s.settings.absence, 'defend');
  assert.ok(Date.parse(s.encounter.deadline) > Date.now());
  assert.deepEqual(s.pendingSettings, {
    dm: 'ai',
    rules: 'tactical',
    decision: 'majority',
  });
  assert.equal(applyQueuedSettings(s), false);
  s.encounter = null;
  assert.equal(applyQueuedSettings(s), true);
  assert.equal(s.settings.rules, 'tactical');
  assert.equal(s.settings.dm, 'ai');
  assert.equal(s.settings.decision, 'majority');
  assert.equal(s.pendingSettings, undefined);
});
await test('shortened deadline starts fresh; unrelated edits preserve the existing timer', async () => {
  const { updateSettings } = await import('../.test-build/engine.js');
  const s = campaign();
  s.settings.pace = 'deadline';
  startEncounter(s, 'Raider', 1);
  s.encounter.deadline = new Date(0).toISOString();
  updateSettings(s, { ...s.settings, deadlineHours: 1 });
  const fresh = s.encounter.deadline;
  assert.ok(Date.parse(fresh) > Date.now() + 3500000);
  updateSettings(s, { ...s.settings, tone: 'Mystery' });
  assert.equal(s.encounter.deadline, fresh);
  updateSettings(s, { ...s.settings, pace: 'wait' });
  assert.equal(s.encounter.deadline, null);
});
await test('pending human actions delay a DM handoff and a host can withdraw queued changes', async () => {
  const { updateSettings, applyQueuedSettings } =
    await import('../.test-build/engine.js');
  const s = campaign();
  s.pending.push({
    id: 'pending',
    userId: 'one',
    author: 'Elara',
    text: 'Look around',
    roll: 'none',
    at: new Date().toISOString(),
  });
  updateSettings(s, { ...s.settings, dm: 'ai' });
  assert.equal(s.settings.dm, 'human');
  assert.equal(applyQueuedSettings(s), false);
  updateSettings(s, { ...s.settings, dm: 'human' });
  assert.equal(s.pendingSettings, undefined);
  updateSettings(s, { ...s.settings, dm: 'ai' });
  s.pending = [];
  assert.equal(applyQueuedSettings(s), true);
  assert.equal(s.settings.dm, 'ai');
});
await test('AI-led party defeat offers recovery without resurrecting players before approval', async () => {
  const { resolveDecision } = await import('../.test-build/engine.js');
  const s = campaign();
  s.settings.dm = 'ai';
  s.characters.forEach((c) => {
    c.hp = 1;
    c.energy = 0;
  });
  startEncounter(s, 'Raider', 2);
  combat(s, 'one', 'defend', '', undefined, undefined, () => 20);
  combat(s, 'two', 'defend', '', undefined, undefined, () => 20);
  assert.equal(s.encounter, null);
  assert.ok(s.characters.every((c) => c.hp === 0));
  assert.equal(s.decision.effects[0].kind, 'rest');
  assert.ok(s.characters.every((c) => c.xp === 0));
  resolveDecision(s, 0);
  assert.ok(
    s.characters.every((c) => c.hp === c.maxHp && c.energy === c.maxEnergy),
  );
  assert.equal(s.decision, null);
});
await test('human-led defeat leaves recovery to the human DM', () => {
  const s = campaign();
  s.characters.forEach((c) => (c.hp = 1));
  startEncounter(s, 'Raider', 2);
  combat(s, 'one', 'defend', '', undefined, undefined, () => 20);
  combat(s, 'two', 'defend', '', undefined, undefined, () => 20);
  assert.equal(s.encounter, null);
  assert.equal(s.decision, null);
});

await test('advancement applies the chosen capacity without refilling resources or spending cumulative XP', () => {
  const s = campaign(),
    c = s.characters[0];
  c.xp = 100;
  c.hp = 7;
  c.energy = 1;
  const hp = c.maxHp,
    energy = c.maxEnergy;
  levelUp(s, 'one', 'vitality');
  assert.equal(c.level, 2);
  assert.equal(c.maxHp, hp + 4);
  assert.equal(c.hp, 7);
  assert.equal(c.xp, 100);
  assert.throws(() => levelUp(s, 'one', 'focus'));
  c.xp = 300;
  levelUp(s, 'one', 'focus');
  assert.equal(c.level, 3);
  assert.equal(c.maxEnergy, energy + 1);
  assert.equal(c.energy, 1);
});
await test('advancement rejects missing owners, forged choices, insufficient XP, capped levels and active play atomically', () => {
  for (const alter of [
    () => {},
    (s) => {
      s.characters[0].level = 10;
      s.characters[0].xp = 99999;
    },
    (s) => {
      s.characters[0].xp = 100;
      s.characters[0].hp = 0;
    },
    (s) => {
      s.characters[0].xp = 100;
      startEncounter(s, 'Enemy', 1);
    },
    (s) => {
      s.characters[0].xp = 100;
      s.decision = { id: 'decision' };
    },
    (s) => {
      s.characters[0].xp = 100;
      s.pending = [{ id: 'action' }];
    },
  ]) {
    const s = campaign();
    alter(s);
    const before = structuredClone(s);
    assert.throws(() => levelUp(s, 'one', 'vitality'));
    assert.deepEqual(s, before);
  }
  const s = campaign();
  s.characters[0].xp = 100;
  const before = structuredClone(s);
  assert.throws(() => levelUp(s, 'outsider', 'vitality'));
  assert.throws(() => levelUp(s, 'one', 'invincible'));
  assert.deepEqual(s, before);
});

await test('skipping a downed final initiative slot still resolves one enemy phase each round', () => {
  const s = campaign();
  startEncounter(s, 'Enemy', 1);
  const [active, downed] = s.characters;
  downed.hp = 0;
  const before = active.hp;
  let rolls = 0;
  combat(s, active.userId, 'defend', undefined, undefined, undefined, () => {
    rolls++;
    return 20;
  });
  assert.equal(s.encounter.round, 2);
  assert.equal(s.encounter.index, 0);
  assert.equal(rolls, 1);
  assert.equal(active.hp, before - 4);
  assert.deepEqual(s.encounter.defending, []);
  combat(s, active.userId, 'defend', undefined, undefined, undefined, () => {
    rolls++;
    return 20;
  });
  assert.equal(s.encounter.round, 3);
  assert.equal(rolls, 2);
  assert.equal(active.hp, before - 8);
});

await test('skipping downed middle slots preserves the remaining living turn before the enemy phase', () => {
  const s = campaign();
  s.characters.push(makeCharacter(PRESETS[1], 'three', s));
  startEncounter(s, 'Enemy', 1);
  const [first, middle, last] = s.characters;
  s.encounter.order = [first.id, middle.id, last.id];
  middle.hp = 0;
  let rolls = 0;
  combat(s, first.userId, 'defend', undefined, undefined, undefined, () => {
    rolls++;
    return 20;
  });
  assert.equal(s.encounter.index, 2);
  assert.equal(s.encounter.round, 1);
  assert.equal(rolls, 0);
  combat(s, last.userId, 'defend', undefined, undefined, undefined, () => {
    rolls++;
    return 20;
  });
  assert.equal(s.encounter.index, 0);
  assert.equal(s.encounter.round, 2);
  assert.equal(rolls, 1);
});

await test('enemy phase after skipped final slots can defeat the last standing character', () => {
  const s = campaign();
  startEncounter(s, 'Enemy', 1);
  s.characters[0].hp = 1;
  s.characters[1].hp = 0;
  combat(s, 'one', 'defend', undefined, undefined, undefined, () => 20);
  assert.equal(s.encounter, null);
  assert.equal(s.characters[0].hp, 0);
  assert.ok(s.events.at(-1).text.includes('The party is down'));
});
