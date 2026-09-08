import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.env.TEST_ORIGIN || 'http://localhost:3000';
const credentials = process.env.TEST_ACCOUNTS_FILE
  ? JSON.parse(readFileSync(process.env.TEST_ACCOUNTS_FILE, 'utf8'))
  : null;
const cookies = {},
  identities = {};
async function signIn(user) {
  if (!credentials) return;
  const response = await fetch(base + '/api/auth', {
    method: 'POST',
    headers: {
      Origin: base,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(credentials[user]),
    redirect: 'manual',
  });
  assert.equal(response.status, 303, 'Provisioned account login failed');
  cookies[user] = response.headers.get('set-cookie').split(';')[0];
  identities[user] = (await api(user, null, '?op=session')).data.user.id;
}
async function api(user, data, query = '') {
  const r = await fetch(`${base}/api/game${query}`, {
    method: data ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Origin: base,
      ...(user ? { Cookie: cookies[user] || `lantern_local=${user}` } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
for (const user of ['local_1', 'local_2', 'local_3']) await signIn(user);
const opts = {
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
assert.equal((await api(null, null)).status, 401);
let a = (
  await api('local_1', {
    op: 'create',
    title: 'Integration test',
    setting: 'Fantasy test world',
    premise: 'Find the lost letter',
    location: 'Harbor',
    settings: opts,
  })
).data;
assert.ok(a.id, JSON.stringify(a));
const id = a.id;
const get = async (user) => (await api(user, null, `?id=${id}`)).data;
async function post(user, body) {
  const c = await get(user);
  return api(user, {
    id,
    version: c.version,
    requestId: crypto.randomUUID(),
    ...body,
  });
}
assert.equal((await api('local_3', null, `?id=${id}`)).status, 404);
assert.equal(
  (await api('local_2', { op: 'join', invite: a.invite })).status,
  200,
);
const p = {
  name: 'Elara',
  ancestry: 'Human',
  role: 'Wayfinder',
  concept: 'A harbor scout.',
  portrait: 0,
};
assert.equal((await post('local_1', { op: 'character', ...p })).status, 200);
assert.equal(
  (await post('local_2', { op: 'character', ...p, name: 'Mara', portrait: 1 }))
    .status,
  200,
);
assert.equal(
  (await post('local_2', { op: 'settings', settings: opts })).status,
  403,
);
await post('local_1', {
  op: 'notes',
  notes: 'HOST PLAYER PRIVATE',
  dmNotes: 'HOST DM SHARE',
  absenceConsent: false,
});
await post('local_1', { op: 'dm', kind: 'notes', text: 'DM SECRET' });
const b = await get('local_2');
assert.equal(b.state.dmNotes, '');
assert.equal(b.state.characters[0].notes, '');
assert.equal(b.state.characters[0].dmNotes, '');
assert.equal(b.invite, undefined);
const before = await get('local_1');
const requestId = crypto.randomUUID();
const payload = {
  op: 'action',
  id,
  version: before.version,
  requestId,
  text: 'Inspect the letter',
  roll: true,
  skill: 'wisdom',
};
const first = await api('local_1', payload);
assert.equal(first.status, 200);
assert.equal(first.data.state.pending.length, 1);
const repeat = await api('local_1', payload);
assert.equal(repeat.status, 200);
assert.equal(repeat.data.state.events.length, first.data.state.events.length);
const stale = await api('local_2', {
  ...payload,
  requestId: crypto.randomUUID(),
});
assert.equal(stale.status, 409);
assert.equal(
  (await post('local_1', { op: 'action', text: 'Again' })).status,
  400,
);
const pending = first.data.state.pending[0].id;
await post('local_1', {
  op: 'dm',
  kind: 'narrate',
  pendingId: pending,
  text: 'The seal points to the old lighthouse.',
});
assert.equal((await get('local_1')).state.pending.length, 0);
await post('local_1', {
  op: 'decision',
  question: 'Follow the lead?',
  options: ['Go', 'Wait'],
});
const d = (await get('local_1')).state.decision;
await post('local_1', { op: 'vote', decisionId: d.id, option: 0 });
assert.ok((await get('local_2')).state.decision);
await post('local_2', { op: 'vote', decisionId: d.id, option: 0 });
assert.equal((await get('local_1')).state.decision, null);
await post('local_1', {
  op: 'dm',
  kind: 'encounter',
  name: 'Raider',
  count: 1,
});
a = await get('local_1');
const actingId = a.state.characters.find(
  (c) => c.id === a.state.encounter.order[0],
).userId;
const acting = credentials
  ? Object.keys(identities).find((user) => identities[user] === actingId)
  : actingId;
const other = acting === 'local_1' ? 'local_2' : 'local_1';
assert.equal(
  (await post(other, { op: 'combat', action: 'defend' })).status,
  409,
);
assert.equal(
  (await post(acting, { op: 'combat', action: 'defend' })).status,
  200,
);
if (credentials) {
  const departedCookie = cookies.local_2;
  await fetch(base + '/api/auth?logout', {
    headers: { Cookie: departedCookie },
    redirect: 'manual',
  });
  assert.equal((await api('local_2', null)).status, 401);
  await signIn('local_2');
  assert.notEqual(cookies.local_2, departedCookie);
}
const saved = await get('local_2');
assert.equal(saved.state.encounter.index, 1);
assert.ok(saved.state.events.some((e) => e.text.includes('lighthouse')));
await post('local_2', { op: 'chat', text: 'I will be back tomorrow.' });
assert.ok(
  (await get('local_1')).state.events.some(
    (e) => e.kind === 'chat' && e.text.includes('tomorrow'),
  ),
);
const current = await get('local_1');
const results = await Promise.all([
  api('local_1', {
    op: 'dm',
    kind: 'notes',
    text: 'A',
    id,
    version: current.version,
    requestId: crypto.randomUUID(),
  }),
  api('local_1', {
    op: 'dm',
    kind: 'notes',
    text: 'B',
    id,
    version: current.version,
    requestId: crypto.randomUUID(),
  }),
]);
assert.deepEqual(
  results.map((r) => r.status).sort((a, b) => a - b),
  [200, 409],
);
console.log(
  'PASS: membership, privacy, human DM, idempotency, stale actions, voting, combat ownership, persistent reload, shared chat, concurrent updates',
);
console.log(`Test campaign: ${id}`);

const profileBefore = (await get('local_2')).state.characters.find(
  (c) => c.userId === (identities.local_2 || 'local_2'),
);
const edited = await post('local_2', {
  op: 'profile',
  name: 'Mara Vale',
  ancestry: 'Clockwork traveler',
  concept: 'A detective in a borrowed body.',
  portrait: 2,
  hp: 999,
  energy: 999,
  role: 'Vanguard',
});
assert.equal(edited.status, 200);
const profileAfter = edited.data.state.characters.find(
  (c) => c.userId === (identities.local_2 || 'local_2'),
);
assert.equal(profileAfter.name, 'Mara Vale');
assert.equal(profileAfter.ancestry, 'Clockwork traveler');
assert.equal(profileAfter.hp, profileBefore.hp);
assert.equal(profileAfter.energy, profileBefore.energy);
assert.equal(profileAfter.role, profileBefore.role);
const hostCampaign = (
  await api('local_1', {
    op: 'create',
    title: 'Host without character test',
    setting: 'Fantasy',
    premise: 'Decide the route',
    location: 'Harbor',
    settings: { ...opts, decision: 'host' },
  })
).data;
await api('local_2', { op: 'join', invite: hostCampaign.invite });
async function hostPost(user, body) {
  const current = (await api(user, null, `?id=${hostCampaign.id}`)).data;
  return api(user, {
    id: hostCampaign.id,
    version: current.version,
    requestId: crypto.randomUUID(),
    ...body,
  });
}
await hostPost('local_2', { op: 'character', ...p });
let decision = (
  await hostPost('local_2', {
    op: 'decision',
    question: 'Take the north road?',
    options: ['Yes', 'No'],
  })
).data.state.decision;
const resolved = await hostPost('local_1', {
  op: 'vote',
  decisionId: decision.id,
  option: 0,
});
assert.equal(resolved.status, 200);
assert.equal(resolved.data.state.decision, null);
decision = (
  await hostPost('local_2', {
    op: 'decision',
    question: 'Wait for the ferry?',
    options: ['Yes', 'No'],
  })
).data.state.decision;
assert.equal(
  (await hostPost('local_2', { op: 'dm', kind: 'cancelDecision' })).status,
  403,
);
const cancelled = await hostPost('local_1', {
  op: 'dm',
  kind: 'cancelDecision',
});
assert.equal(cancelled.status, 200);
assert.equal(cancelled.data.state.decision, null);
console.log(
  'PASS: profile editing preserves resources, human host can decide without a character, only host can cancel decisions',
);

const buildBefore = cancelled.data.state.characters[0];
assert.equal(
  (
    await hostPost('local_1', {
      op: 'rebuild',
      role: 'Vanguard',
      stats: buildBefore.stats,
      characterId: buildBefore.id,
    })
  ).status,
  400,
);
const rebuildRequest = {
  id: hostCampaign.id,
  version: (await api('local_2', null, `?id=${hostCampaign.id}`)).data.version,
  requestId: crypto.randomUUID(),
  op: 'rebuild',
  role: buildBefore.role === 'Arcanist' ? 'Vanguard' : 'Arcanist',
  stats: buildBefore.stats,
  hp: 999,
  xp: 9999,
};
const rebuilt = await api('local_2', rebuildRequest);
assert.equal(rebuilt.status, 200);
const buildAfter = rebuilt.data.state.characters[0];
assert.equal(buildAfter.role, rebuildRequest.role);
assert.equal(buildAfter.hp, Math.min(buildBefore.hp, buildAfter.maxHp));
assert.equal(buildAfter.xp, buildBefore.xp);
assert.deepEqual(buildAfter.inventory, buildBefore.inventory);
const retryBuild = await api('local_2', rebuildRequest);
assert.equal(retryBuild.status, 200);
assert.equal(retryBuild.data.version, rebuilt.data.version);
const savedBuild = (await api('local_2', null, `?id=${hostCampaign.id}`)).data
  .state.characters[0];
assert.deepEqual(savedBuild, buildAfter);
console.log(
  'PASS: own-character rebuild, forged resources ignored, idempotent retry and saved build',
);

const queuedDecision = (
  await hostPost('local_2', {
    op: 'decision',
    question: 'Cross the bridge?',
    options: ['Cross', 'Wait'],
  })
).data.state.decision;
assert.equal(
  (
    await hostPost('local_2', {
      op: 'rebuild',
      role: 'Envoy',
      stats: buildAfter.stats,
    })
  ).status,
  400,
);
const queued = await hostPost('local_1', {
  op: 'settings',
  settings: {
    ...opts,
    dm: 'ai',
    rules: 'tactical',
    decision: 'majority',
    pace: 'deadline',
    deadlineHours: 2,
    absence: 'defend',
  },
});
assert.equal(queued.status, 200);
assert.equal(queued.data.state.settings.dm, 'human');
assert.equal(queued.data.state.settings.decision, 'host');
assert.equal(queued.data.state.settings.pace, 'deadline');
assert.equal(queued.data.state.pendingSettings.rules, 'tactical');
assert.ok(Date.parse(queued.data.state.decision.deadline) > Date.now());
const applied = await hostPost('local_1', {
  op: 'vote',
  decisionId: queuedDecision.id,
  option: 0,
});
assert.equal(applied.status, 200);
assert.equal(applied.data.state.settings.dm, 'ai');
assert.equal(applied.data.state.settings.rules, 'tactical');
assert.equal(applied.data.state.settings.decision, 'majority');
assert.equal(applied.data.state.pendingSettings, undefined);
const reloaded = (await api('local_2', null, `?id=${hostCampaign.id}`)).data;
assert.equal(reloaded.state.settings.rules, 'tactical');
console.log(
  'PASS: scheduling edits apply during a decision, rule handoff waits and persists after resolution',
);

if (credentials) {
  const nextPassword = 'test-only-' + crypto.randomUUID();
  const changed = await fetch(base + '/api/auth?password', {
    method: 'POST',
    headers: { Origin: base, Cookie: cookies.local_1 },
    body: new URLSearchParams({
      password: credentials.local_1.password,
      newPassword: nextPassword,
      confirmPassword: nextPassword,
    }),
    redirect: 'manual',
  });
  assert.equal(changed.status, 303);
  assert.equal(changed.headers.get('location'), '/api/auth?changed');
  assert.equal((await api('local_1', null)).status, 401);
  credentials.local_1.password = nextPassword;
  await signIn('local_1');
  assert.equal((await get('local_1')).id, id);
  console.log(
    'PASS: password change routes correctly, revokes session and preserves campaign access',
  );
  for (const user of Object.keys(cookies)) {
    await fetch(base + '/api/auth?logout', {
      headers: { Cookie: cookies[user] },
      redirect: 'manual',
    });
    assert.equal((await api(user, null)).status, 401);
  }
  console.log(
    'PASS: independent password sessions, logout, fresh login and saved multiplayer turn recovery',
  );
}
