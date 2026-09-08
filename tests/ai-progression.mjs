import assert from 'node:assert/strict';
const base = process.env.TEST_ORIGIN || 'http://localhost:3000';
async function api(user, data, query = '') {
  const r = await fetch(`${base}/api/game${query}`, {
    method: data ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `lantern_local=${user}`,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await r.json();
  assert.equal(r.status, 200, JSON.stringify(value));
  return value;
}
let c = await api('local_1', {
  op: 'create',
  title: 'AI progression verification',
  setting: 'Fantasy harbor coast.',
  premise:
    'The party must travel from the inn to the old lighthouse. Two hostile raiders block the lighthouse door.',
  location: 'Harbor inn',
  settings: {
    dm: 'ai',
    rules: 'quickplay',
    pace: 'wait',
    deadlineHours: 24,
    absence: 'wait',
    decision: 'unanimous',
    customization: 'reskin',
    tone: 'Adventurous',
    boundaries: '',
  },
});
const id = c.id;
const get = (user) => api(user, null, `?id=${id}`);
const post = async (user, body) => {
  const current = await get(user);
  return api(user, {
    id,
    version: current.version,
    requestId: crypto.randomUUID(),
    ...body,
  });
};
await api('local_2', { op: 'join', invite: c.invite });
for (const [user, name, portrait] of [
  ['local_1', 'Elara', 0],
  ['local_2', 'Mara', 1],
])
  await post(user, {
    op: 'character',
    name,
    ancestry: 'Human',
    role: 'Wayfinder',
    concept: 'A traveler looking for the missing letter.',
    portrait,
  });
c = await post('local_1', {
  op: 'action',
  text: 'I propose that our party travels together to the old lighthouse. Put this to a party vote.',
  roll: false,
});
assert.equal(c.state.location, 'Harbor inn');
assert.equal(c.state.decision?.effects?.[0]?.kind, 'travel');
const travel = c.state.decision;
await post('local_1', { op: 'vote', decisionId: travel.id, option: 0 });
assert.equal((await get('local_2')).state.location, 'Harbor inn');
c = await post('local_2', { op: 'vote', decisionId: travel.id, option: 0 });
assert.equal(c.state.location, travel.effects[0].destination);
assert.equal(c.state.decision, null);
c = await post('local_1', {
  op: 'action',
  text: 'The raiders block our path. I propose our party confronts them in combat. Put the encounter to a vote.',
  roll: false,
});
assert.equal(c.state.encounter, null);
assert.equal(c.state.decision?.effects?.[0]?.kind, 'encounter');
const fight = c.state.decision;
await post('local_1', { op: 'vote', decisionId: fight.id, option: 0 });
assert.equal((await get('local_2')).state.encounter, null);
c = await post('local_2', { op: 'vote', decisionId: fight.id, option: 0 });
assert.ok(c.state.encounter);
assert.equal(c.state.encounter.enemies.length, fight.effects[0].count);
const active = c.state.characters.find(
  (x) => x.id === c.state.encounter.order[0],
);
c = await post(active.userId, { op: 'combat', action: 'defend' });
assert.equal(c.state.encounter.index, 1);
console.log(
  JSON.stringify({
    status: 'PASS',
    campaign: id,
    travelWaitedForParty: true,
    encounterWaitedForParty: true,
    combatTurnPersisted: true,
  }),
);
