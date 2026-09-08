import assert from 'node:assert/strict';
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
async function call(data) {
  const r = await fetch(`${origin}/api/game`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'lantern_local=local_1',
    },
    body: JSON.stringify(data),
  });
  return { status: r.status, data: await r.json() };
}
const made = await call({
  op: 'create',
  title: 'The Lantern Coast',
  setting: 'A rain-soaked fantasy coast of harbor towns and old magic.',
  premise: 'A sealed letter bears your family crest. Find who sent it.',
  location: 'The Wreck & Lantern',
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
assert.equal(made.status, 200);
let c = made.data;
const result = await call({
  op: 'character',
  id: c.id,
  version: c.version,
  requestId: crypto.randomUUID(),
  name: 'Elara',
  ancestry: 'Human',
  role: 'Wayfinder',
  concept: 'A ranger searching for her missing brother.',
  portrait: 0,
});
assert.equal(result.status, 200);
c = result.data;
const turn = await call({
  op: 'action',
  id: c.id,
  version: c.version,
  requestId: crypto.randomUUID(),
  text: 'I ask the innkeeper who delivered the letter.',
  roll: false,
});
if (turn.status !== 200) {
  console.log(
    JSON.stringify({
      status: turn.status,
      message: turn.data.error,
      campaign: c.id,
    }),
  );
  process.exitCode = 1;
} else {
  assert.equal(turn.data.state.characters[0].hp, c.state.characters[0].hp);
  assert.ok(
    turn.data.state.events.filter((e) => e.kind === 'narration').length >= 2,
  );
  console.log(
    JSON.stringify({
      status: 'PASS',
      campaign: c.id,
      narrativeLength: turn.data.state.events.at(-1).text.length,
      healthUnchanged: true,
    }),
  );
}
