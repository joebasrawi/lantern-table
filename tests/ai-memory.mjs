import assert from 'node:assert/strict';
const base = process.env.TEST_ORIGIN || 'http://localhost:3000';
async function call(body) {
  const r = await fetch(`${base}/api/game`, {
    method: 'POST',
    headers: {
      Cookie: 'lantern_local=local_1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return data;
}
const settings = {
  dm: 'human',
  rules: 'quickplay',
  pace: 'wait',
  deadlineHours: 24,
  absence: 'wait',
  decision: 'unanimous',
  customization: 'reskin',
  tone: 'Adventurous',
  boundaries: '',
};
let c = await call({
  op: 'create',
  title: 'Older memory verification',
  setting: 'A coastal fantasy town',
  premise: 'Reach the old observatory',
  location: 'Harbor',
  settings,
});
async function post(body) {
  c = await call({
    id: c.id,
    version: c.version,
    requestId: crypto.randomUUID(),
    ...body,
  });
  return c;
}
await post({
  op: 'character',
  name: 'Elara',
  ancestry: 'Human',
  role: 'Wayfinder',
  concept: 'A harbor scout',
  portrait: 0,
});
await post({
  op: 'dm',
  kind: 'narrate',
  text: 'Alda tells Elara that the gatekeeper’s exact passphrase is "silver swallows". Elara writes it down. This is a confirmed discovery.',
});
for (let i = 0; i < 36; i++)
  await post({
    op: 'dm',
    kind: 'narrate',
    text: `Quiet moment ${i + 1}: rain taps on the tavern windows. Nothing else changes.`,
  });
await post({ op: 'settings', settings: { ...settings, dm: 'ai' } });
await post({
  op: 'action',
  text: 'I check my written note: what exact passphrase did Alda give us for the gatekeeper?',
  roll: false,
});
const reply = c.state.events.filter((e) => e.kind === 'narration').at(-1).text;
assert.match(reply, /silver swallows/i);
console.log(
  'PASS: live AI recalled an established phrase from beyond the 32-event recent window.',
);
