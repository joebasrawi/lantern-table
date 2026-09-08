import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const origin = process.env.TEST_ORIGIN || 'http://localhost:3002';
const credentials = readFileSync(
  process.env.TEST_CREDENTIALS || '../.lantern-railway-owner/login.txt',
  'utf8',
);
const email = credentials.match(/^Email: (.+)$/m)[1],
  password = credentials.match(/^Password: (.+)$/m)[1];
assert.equal((await fetch(origin + '/api/health')).status, 200);
assert.equal(
  (
    await fetch(origin + '/api/game', {
      headers: {
        Cookie: 'lantern_local=local_1',
        'x-chatgpt-user-id': 'forged',
      },
    })
  ).status,
  401,
);
const login = await fetch(origin + '/api/auth', {
  method: 'POST',
  headers: {
    Origin: origin,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ email, password }),
  redirect: 'manual',
});
assert.equal(login.status, 303, await login.text());
const cookie = login.headers.get('set-cookie').split(';')[0];
async function api(body, query = '') {
  const r = await fetch(origin + '/api/game' + query, {
    method: body ? 'POST' : 'GET',
    headers: {
      Cookie: cookie,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return data;
}
let campaign;
if (process.env.TEST_SAVED_ID) {
  campaign = await api(null, '?id=' + process.env.TEST_SAVED_ID);
  assert.equal(campaign.state.characters[0].name, 'Railway Scout');
} else {
  campaign = await api({
    op: 'create',
    title: 'Railway verification',
    setting: 'A coastal fantasy realm',
    premise: 'Find the harbor seal.',
    location: 'Harbor',
    settings: {
      dm: 'human',
      rules: 'quickplay',
      pace: 'wait',
      absence: 'wait',
      decision: 'unanimous',
      customization: 'reskin',
      tone: 'Adventurous',
      boundaries: '',
      deadlineHours: 24,
    },
  });
  campaign = await api({
    op: 'character',
    id: campaign.id,
    version: campaign.version,
    requestId: crypto.randomUUID(),
    name: 'Railway Scout',
    ancestry: 'Human',
    role: 'Wayfinder',
    concept: 'A patient explorer',
    portrait: 0,
  });
  const image = readFileSync('public/art/portraits.webp');
  const upload = await fetch(origin + '/api/portrait?campaign=' + campaign.id, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'image/webp' },
    body: image,
  });
  assert.equal(upload.status, 200, await upload.text());
  campaign = await api(null, '?id=' + campaign.id);
  const picture = await fetch(
    origin + campaign.state.characters[0].portraitUrl,
    { headers: { Cookie: cookie } },
  );
  assert.equal(picture.status, 200);
  assert.deepEqual(Buffer.from(await picture.arrayBuffer()), image);
  assert.equal(
    (await fetch(origin + campaign.state.characters[0].portraitUrl)).status,
    401,
  );
}
assert.equal(campaign.state.characters[0].name, 'Railway Scout');
if (process.env.TEST_SAVED_ID && campaign.state.characters[0].portraitUrl) {
  const image = await fetch(origin + campaign.state.characters[0].portraitUrl, {
    headers: { Cookie: cookie },
  });
  assert.equal(image.status, 200);
  assert.deepEqual(
    Buffer.from(await image.arrayBuffer()),
    readFileSync('public/art/portraits.webp'),
  );
}
const bad = await fetch(origin + '/api/game', {
  method: 'POST',
  headers: {
    Cookie: cookie,
    Origin: 'https://evil.example',
    'Content-Type': 'application/json',
  },
  body: '{}',
});
assert.equal(bad.status, 403);
if (process.env.TEST_AI === 'true') {
  campaign = await api({
    op: 'settings',
    id: campaign.id,
    version: campaign.version,
    requestId: crypto.randomUUID(),
    settings: { ...campaign.state.settings, dm: 'ai' },
  });
  const before = campaign.state.characters[0].hp;
  campaign = await api({
    op: 'action',
    id: campaign.id,
    version: campaign.version,
    requestId: crypto.randomUUID(),
    text: 'I look around the harbor for a clue to the seal.',
    roll: false,
  });
  assert.equal(campaign.state.characters[0].hp, before);
  assert.ok(
    campaign.state.events.filter((e) => e.kind === 'narration').length >= 2,
  );
  console.log('PASS Railway live AI narration; health unchanged.');
}
await fetch(origin + '/api/auth?logout', {
  headers: { Cookie: cookie },
  redirect: 'manual',
});
assert.equal(
  (await fetch(origin + '/api/game', { headers: { Cookie: cookie } })).status,
  401,
);
if (process.env.TEST_ID_FILE)
  writeFileSync(process.env.TEST_ID_FILE, campaign.id);
console.log(
  'PASS Railway: login, campaign/character persistence, private portrait, origin protection, local-auth rejection, logout. Campaign: ' +
    campaign.id,
);
