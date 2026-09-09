import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync('public/lantern-push.js', 'utf8');
function worker(windows = []) {
  const handlers = {},
    shown = [],
    opened = [];
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: 'https://game.example' },
      addEventListener: (name, fn) => {
        handlers[name] = fn;
      },
      registration: {
        showNotification: async (title, options) => {
          shown.push({ title, ...options });
        },
      },
      clients: {
        matchAll: async () => windows,
        openWindow: async (url) => {
          opened.push(url);
        },
      },
    },
  });
  return { handlers, shown, opened };
}
await test('push worker displays only generic text with stable replacement tags and never caches requests', async () => {
  const w = worker();
  let pending = Promise.resolve();
  for (const input of [
    {
      campaignId: 'campaign-a',
      body: 'SECRET STORY',
      url: 'https://evil.example',
    },
    { campaignId: 'campaign-a' },
    { campaignId: '../evil' },
    null,
  ]) {
    w.handlers.push({
      data: { json: () => input },
      waitUntil: (p) => {
        pending = p;
      },
    });
    await pending;
  }
  assert.equal(w.shown.length, 4);
  assert.equal(w.shown[0].tag, w.shown[1].tag);
  assert.equal(w.shown[2].tag, 'lantern-turn');
  assert.doesNotMatch(JSON.stringify(w.shown), /SECRET|evil/);
  assert.equal(w.shown[0].renotify, false);
  assert.equal(w.handlers.fetch, undefined);
});

async function click(w, data) {
  let pending = Promise.resolve(),
    closed = false;
  w.handlers.notificationclick({
    notification: {
      data,
      close: () => {
        closed = true;
      },
    },
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  assert.equal(closed, true);
}
await test('click navigates to the alerted campaign and reloads saved state instead of focusing an unrelated campaign', async () => {
  const navigations = [];
  let focused = 0;
  const current = {
    url: 'https://game.example/?campaign=other',
    navigate: async (url) => {
      navigations.push(url);
      return {
        focus: async () => {
          focused++;
        },
      };
    },
  };
  const w = worker([
    {
      url: 'https://evil.example',
      navigate: () => assert.fail('foreign window'),
    },
    current,
  ]);
  await click(w, { campaignId: 'campaign-a', url: 'https://evil.example' });
  assert.deepEqual(navigations, ['https://game.example/?campaign=campaign-a']);
  assert.equal(focused, 1);
  assert.deepEqual(w.opened, []);
});
await test('click prefers an already-open matching campaign and still reloads it', async () => {
  let refreshed = false;
  const w = worker([
    {
      url: 'https://game.example/?campaign=other',
      navigate: () => assert.fail('wrong tab'),
    },
    {
      url: 'https://game.example/?campaign=campaign-a',
      navigate: async (url) => {
        assert.equal(url, 'https://game.example/?campaign=campaign-a');
        refreshed = true;
        return { focus: async () => {} };
      },
    },
  ]);
  await click(w, { campaignId: 'campaign-a' });
  assert.equal(refreshed, true);
});
await test('click opens a new campaign tab when none exists or an old tab disappears', async () => {
  for (const windows of [
    [],
    [{ url: 'https://game.example/', navigate: async () => null }],
    [
      {
        url: 'https://game.example/',
        navigate: async () => {
          throw Error('closed');
        },
      },
    ],
  ]) {
    const w = worker(windows);
    await click(w, { campaignId: 'campaign-a' });
    assert.deepEqual(w.opened, ['https://game.example/?campaign=campaign-a']);
  }
});
await test('malformed and legacy alert data can only open the local lobby', async () => {
  for (const data of [
    undefined,
    { url: 'https://evil.example' },
    { campaignId: '../evil' },
    { campaignId: 'a&invite=secret' },
    { campaignId: 'https://evil.example' },
    { campaignId: 'a'.repeat(81) },
  ]) {
    const w = worker([{ url: 'not a URL' }]);
    await click(w, data);
    assert.deepEqual(w.opened, ['https://game.example/']);
  }
});
