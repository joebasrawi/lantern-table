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
await test('notification click ignores remote destinations and focuses only this origin', async () => {
  let focused = 0,
    closed = 0,
    pending = Promise.resolve();
  const w = worker([
    { url: 'https://evil.example', focus: () => assert.fail('foreign window') },
    {
      url: 'https://game.example/?campaign=a',
      focus: async () => {
        focused++;
      },
    },
  ]);
  w.handlers.notificationclick({
    notification: {
      data: { url: 'https://evil.example' },
      close: () => {
        closed++;
      },
    },
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  assert.equal(focused, 1);
  assert.equal(closed, 1);
  assert.deepEqual(w.opened, []);
  const empty = worker();
  empty.handlers.notificationclick({
    notification: { close: () => {} },
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  assert.deepEqual(empty.opened, ['/']);
});
